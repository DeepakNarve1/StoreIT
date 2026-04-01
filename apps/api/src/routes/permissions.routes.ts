import { Router, Response, Request } from "express";
import { z, ZodError } from "zod";
import { verifyAuth, AuthRequest, requireRole } from "../middleware/auth";
import { prisma } from "../utils/prisma";
import { v4 as uuid } from "uuid";
import { getFileViewUrl } from "../services/storage.service";
import { createAuditLog } from "../services/audit.service";
import {
  FILE_CAPABILITIES,
  FOLDER_CAPABILITIES,
  getEffectiveRoleProfileForUser,
  mergeCapabilities,
  normalizeCapabilities,
} from "../services/role-profiles.service";
import {
  userCanAccessFile,
  userHasFilePermission,
} from "../services/file-access.service";

const router = Router();

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (val: unknown): val is string =>
  typeof val === "string" && UUID_REGEX.test(val);

const grantSchema = z.object({
  resourceType: z.enum(["file", "folder"]),
  resourceId: z.string().uuid(),
  grantedTo: z.enum(["all", "user", "department"]),
  departmentId: z.string().uuid().optional().nullable(),
  userId: z.string().uuid().optional().nullable(),
  action: z.enum(["read", "write", "delete", "admin"]),
  expiresAt: z.string().datetime().optional().nullable(),
  capabilities: z.record(z.string(), z.boolean()).optional().nullable(),
});

function actionToFileCapabilities(action: string): Record<string, boolean> {
  if (action === "admin") {
    return normalizeCapabilities(
      Object.fromEntries(FILE_CAPABILITIES.map((key) => [key, true])),
    );
  }
  if (action === "delete") {
    return normalizeCapabilities({
      see_files: true,
      preview_files: true,
      download_files: true,
      edit_file_attrs: true,
      view_metadata: true,
      edit_metadata: true,
      update_versions: true,
      edit_online: true,
      move_files: true,
      delete_files: true,
      duplicate_files: true,
    });
  }
  if (action === "write") {
    return normalizeCapabilities({
      add_files: true,
      see_files: true,
      preview_files: true,
      download_files: true,
      edit_file_attrs: true,
      view_metadata: true,
      edit_metadata: true,
      update_versions: true,
      edit_online: true,
      move_files: true,
      duplicate_files: true,
    });
  }
  return normalizeCapabilities({
    see_files: true,
    preview_files: true,
  });
}

function actionToFolderCapabilities(action: string): Record<string, boolean> {
  if (action === "admin") {
    return normalizeCapabilities(
      Object.fromEntries(FOLDER_CAPABILITIES.map((key) => [key, true])),
    );
  }
  if (action === "delete") {
    return normalizeCapabilities({
      create_folders: true,
      see_folders: true,
      download_folders: true,
      edit_folders: true,
      move_folders: true,
      delete_folders: true,
      duplicate_folders: true,
      view_metadata: true,
      edit_metadata: true,
    });
  }
  if (action === "write") {
    return normalizeCapabilities({
      create_folders: true,
      see_folders: true,
      download_folders: true,
      edit_folders: true,
      move_folders: true,
      duplicate_folders: true,
      view_metadata: true,
      edit_metadata: true,
    });
  }
  return normalizeCapabilities({
    see_folders: true,
  });
}

// ─── Helper: check a specific granular capability ─────────────────────────────
export async function userHasCapability(
  userId: string,
  tenantId: string,
  role: string,
  resourceType: "file" | "folder",
  resourceId: string,
  capability: string,
): Promise<boolean> {
  const roleContext = await getEffectiveRoleProfileForUser(userId);
  if (!roleContext || roleContext.tenantId !== tenantId) return false;

  if (
    roleContext.baseRole !== "VIEWER" &&
    roleContext.capabilities[capability] === true
  ) {
    return true;
  }

  const orClauses: any[] = [
    { grantedTo: "all" },
    { grantedTo: "user", userId },
  ];
  if (roleContext.departmentId) {
    orClauses.push({
      grantedTo: "department",
      departmentId: roleContext.departmentId,
    });
  }

  const perm = await prisma.permission.findFirst({
    where: {
      resourceType,
      resourceId,
      OR: orClauses,
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
    },
  });

  if (!perm) return false;
  const capabilities = (perm as any).capabilities;
  if (capabilities && typeof capabilities === "object") {
    return (capabilities as Record<string, boolean>)[capability] === true;
  }
  const coarseCaps =
    resourceType === "file"
      ? actionToFileCapabilities(perm.action)
      : actionToFolderCapabilities(perm.action);
  return coarseCaps[capability] === true;
}

// ─── POST /api/permissions/my-capabilities ────────────────────────────────────
// Accepts { fileIds: string[] }, returns { capabilities: { [fileId]: Record<string,boolean> } }
// For privileged roles all capabilities default to true.
// For VIEWERs, reads the DB permissions and returns the exact capability map.
router.post(
  "/my-capabilities",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const { fileIds } = z
        .object({ fileIds: z.array(z.string().uuid()).max(100) })
        .parse(req.body);

      const { userId, tenantId } = req.user!;
      const roleContext = await getEffectiveRoleProfileForUser(userId);
      if (!roleContext) {
        res.status(401).json({ error: "User not found" });
        return;
      }

      const orClauses: any[] = [
        { grantedTo: "all" },
        { grantedTo: "user", userId },
      ];
      if (roleContext.departmentId) {
        orClauses.push({
          grantedTo: "department",
          departmentId: roleContext.departmentId,
        });
      }

      // Fetch all relevant file-level permissions in one query
      const filePerms = await prisma.permission.findMany({
        where: {
          resourceType: "file",
          resourceId: { in: fileIds },
          OR: orClauses,
          AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
        },
      });

      // Also fetch folder-level permissions so we can propagate to files
      const files = await prisma.file.findMany({
        where: { id: { in: fileIds }, tenantId, isDeleted: false },
        select: { id: true, folderId: true, uploadedById: true },
      });

      const folderIds = [
        ...new Set(files.map((f) => f.folderId).filter(Boolean) as string[]),
      ];

      const folderPerms =
        folderIds.length > 0
          ? await prisma.permission.findMany({
              where: {
                resourceType: "folder",
                resourceId: { in: folderIds },
                OR: orClauses,
                AND: [
                  { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
                ],
              },
            })
          : [];

      // Build result map
      const result: Record<string, Record<string, boolean>> = {};
      const baseCaps = normalizeCapabilities(roleContext.capabilities);
      const ALL_CAPS = [...FILE_CAPABILITIES, "see_folders", "share_folders"] as const;

      for (const fileId of fileIds) {
        const file = files.find((f) => f.id === fileId);
        const isOwner = file?.uploadedById === userId;

        // Direct file perm takes priority
        const directPerm = filePerms.find((p) => p.resourceId === fileId);
        // Folder perm as fallback
        const folderPerm = file?.folderId
          ? folderPerms.find((p) => p.resourceId === file.folderId)
          : null;

        const activePerm = directPerm ?? folderPerm;

        const caps = (activePerm as any)?.capabilities as
          | Record<string, boolean>
          | null
          | undefined;

        const hasExplicitCaps =
          !!caps && typeof caps === "object" && Object.keys(caps).length > 0;
        const sharedCaps =
          hasExplicitCaps
            ? normalizeCapabilities(caps as Record<string, boolean>)
            : activePerm
              ? actionToFileCapabilities(activePerm.action)
              : normalizeCapabilities({});
        const seededCaps =
          roleContext.baseRole === "VIEWER" && !activePerm && !isOwner
            ? normalizeCapabilities({})
            : baseCaps;
        // Final capability map for this file:
        // - seed with role profile caps (or empty for unshared VIEWERs),
        // - merge in the shared capabilities from the active permission row (direct file or folder).
        result[fileId] = mergeCapabilities(seededCaps, sharedCaps);

        // File owner always gets full self-access
        if (isOwner) {
          result[fileId]["preview_files"] = true;
          result[fileId]["download_files"] = true;
          result[fileId]["edit_file_attrs"] = true;
          result[fileId]["view_metadata"] = true;
          result[fileId]["edit_metadata"] = true;
          result[fileId]["delete_files"] = true;
          result[fileId]["update_versions"] = true;
        }
      }

      res.json({ capabilities: result });
    } catch (err: any) {
      if (err.name === "ZodError") {
        res.status(400).json({ error: "Invalid input" });
        return;
      }
      console.error("my-capabilities error:", err);
      res.status(500).json({ error: "Failed to resolve capabilities" });
    }
  },
);

// ─── POST /api/permissions/my-folder-capabilities ────────────────────────────
// Accepts { folderIds: string[] }, returns { capabilities: { [folderId]: Record<string,boolean> } }
router.post(
  "/my-folder-capabilities",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const { folderIds } = z
        .object({ folderIds: z.array(z.string().uuid()).max(200) })
        .parse(req.body);

      const { userId } = req.user!;
      const roleContext = await getEffectiveRoleProfileForUser(userId);
      if (!roleContext) {
        res.status(401).json({ error: "User not found" });
        return;
      }
      const ALL_FOLDER_CAPS = [
        "create_folders",
        "see_folders",
        "download_folders",
        "edit_folders",
        "move_folders",
        "delete_folders",
        "duplicate_folders",
        "share_folders",
        "share_public_link_folder",
        "see_audit_trails",
        "view_metadata",
        "edit_metadata",
      ] as const;

      if (false) {
        const fullCaps = ALL_FOLDER_CAPS.reduce(
          (acc, k) => ({ ...acc, [k]: true }),
          {} as Record<string, boolean>,
        );
        const result: Record<string, Record<string, boolean>> = {};
        folderIds.forEach((id) => (result[id] = fullCaps));
        res.json({ capabilities: result });
        return;
      }

      const orClauses: any[] = [
        { grantedTo: "all" },
        { grantedTo: "user", userId },
      ];
      if (roleContext.departmentId) {
        orClauses.push({
          grantedTo: "department",
          departmentId: roleContext.departmentId,
        });
      }

      const folderPerms = await prisma.permission.findMany({
        where: {
          resourceType: "folder",
          resourceId: { in: folderIds },
          OR: orClauses,
          AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
        },
      });

      const result: Record<string, Record<string, boolean>> = {};
      const baseCaps = normalizeCapabilities(roleContext.capabilities);
      for (const folderId of folderIds) {
        const perm = folderPerms.find((p) => p.resourceId === folderId);
        const caps = (perm as any)?.capabilities as
          | Record<string, boolean>
          | null
          | undefined;
        const sharedCaps =
          caps && typeof caps === "object" && Object.keys(caps).length > 0
            ? normalizeCapabilities(caps)
            : perm
              ? actionToFolderCapabilities(perm.action)
              : normalizeCapabilities({});
        const seededCaps =
          roleContext.baseRole === "VIEWER" && !perm
            ? normalizeCapabilities({})
            : baseCaps;
        result[folderId] = mergeCapabilities(seededCaps, sharedCaps);
      }

      res.json({ capabilities: result });
    } catch (err: any) {
      if (err.name === "ZodError") {
        res.status(400).json({ error: "Invalid input" });
        return;
      }
      console.error("my-folder-capabilities error:", err);
      res.status(500).json({ error: "Failed to resolve folder capabilities" });
    }
  },
);

// ─── GET /api/permissions/view/:token ─────────────────────────────────────────
router.get("/view/:token", async (req: Request, res: Response) => {
  try {
    const record = await prisma.oneTimeLink.findUnique({
      where: { token: req.params.token },
      include: { file: true },
    });

    if (!record) {
      res.status(404).json({ error: "Link not found" });
      return;
    }
    if (record.isUsed) {
      res.status(403).json({ error: "This link has already been used" });
      return;
    }
    if (record.expiresAt < new Date()) {
      res.status(403).json({ error: "This link has expired" });
      return;
    }

    await prisma.oneTimeLink.update({
      where: { token: req.params.token },
      data: { isUsed: true },
    });

    const viewUrl = await getFileViewUrl(record.file.storageKey, 300);

    res.json({
      file: {
        id: record.file.id,
        name: record.file.name,
        mimeType: record.file.mimeType,
        size: record.file.size,
        viewUrl,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to access file" });
  }
});

// ─── GET /api/permissions/all ─────────────────────────────────────────────────
router.get(
  "/all",
  verifyAuth,
  requireRole("ORG_ADMIN", "MANAGER", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const permissions = await prisma.permission.findMany({
        where: {
          OR: [
            { file: { tenantId: req.user!.tenantId } },
            { folder: { tenantId: req.user!.tenantId } },
          ],
        },
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
          file: { select: { id: true, name: true, mimeType: true } },
          folder: { select: { id: true, name: true } },
          department: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      // Also include implicit owner access (files uploaded by users who are not privileged roles)
      const ownedFiles = await prisma.file.findMany({
        where: {
          tenantId: req.user!.tenantId,
          isDeleted: false,
          uploadedBy: {
            role: "VIEWER",
          },
        },
        select: {
          id: true,
          name: true,
          mimeType: true,
          createdAt: true,
          uploadedBy: { select: { id: true, name: true, email: true, role: true } },
        },
      });

      // Shape owned files as synthetic "owner" permission records
      const ownerGrants = ownedFiles.map((f) => ({
        id: `owner:${f.id}`,
        resourceType: "file" as const,
        resourceId: f.id,
        grantedTo: "owner" as const,
        action: "admin" as const,
        capabilities: null,
        expiresAt: null,
        createdAt: f.createdAt.toISOString(),
        isImplicit: true,
        user: f.uploadedBy,
        department: null,
        file: { id: f.id, name: f.name, mimeType: f.mimeType },
        folder: null,
      }));

      res.json({ permissions, ownerGrants });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch permissions" });
    }
  },
);

// ─── GET /api/permissions/shared-links ───────────────────────────────────────
router.get(
  "/shared-links",
  verifyAuth,
  requireRole("ORG_ADMIN", "MANAGER", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const links = await prisma.oneTimeLink.findMany({
        where: { tenantId: req.user!.tenantId },
        orderBy: { createdAt: "desc" },
        include: { file: { select: { id: true, name: true, mimeType: true } } },
      });
      res.json({ links });
    } catch {
      res.status(500).json({ error: "Failed to fetch shared links" });
    }
  },
);

// ─── DELETE /api/permissions/shared-links/:id ─────────────────────────────────
router.delete(
  "/shared-links/:id",
  verifyAuth,
  requireRole("ORG_ADMIN", "MANAGER", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const link = await prisma.oneTimeLink.findFirst({
        where: { id: req.params.id, tenantId: req.user!.tenantId },
      });
      if (!link) {
        res.status(404).json({ error: "Link not found" });
        return;
      }

      await prisma.oneTimeLink.update({
        where: { id: req.params.id },
        data: { isUsed: true },
      });
      res.json({ message: "Link revoked" });
    } catch {
      res.status(500).json({ error: "Failed to revoke link" });
    }
  },
);

// ─── POST /api/permissions/one-time-link ──────────────────────────────────────
router.post(
  "/one-time-link",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const { fileId, expiresInHours = 24 } = z
        .object({
          fileId: z.string().uuid(),
          expiresInHours: z.number().min(1).max(168).default(24),
        })
        .parse(req.body);

      const file = await prisma.file.findFirst({
        where: { id: fileId, tenantId: req.user!.tenantId, isDeleted: false },
        select: {
          id: true,
          name: true,
          uploadedById: true,
          folderId: true,
        },
      });

      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      const canAccess = await userCanAccessFile(
        file.id,
        req.user!.userId,
        req.user!.tenantId,
        req.user!.role,
        file.uploadedById,
        file.folderId,
      );
      if (!canAccess) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const canShareLink =
        (await userHasFilePermission(
          fileId,
          req.user!.userId,
          file.uploadedById,
          req.user!.role,
          "admin",
        )) ||
        (await userHasCapability(
          req.user!.userId,
          req.user!.tenantId,
          req.user!.role,
          "file",
          fileId,
          "share_public_link_file",
        ));
      if (!canShareLink) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const token = uuid();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + expiresInHours);

      await prisma.oneTimeLink.create({
        data: { token, fileId, expiresAt, tenantId: req.user!.tenantId },
      });

      await createAuditLog({
        action: "link.generate",
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        resourceType: "file",
        resourceId: fileId,
        resourceName: file.name,
        metadata: { expiresInHours },
        req,
      });

      const base = process.env.FRONTEND_URL || process.env.APP_URL || "http://localhost:5173";
      // Ensure no trailing slash
      const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
      const link = `${cleanBase}/view/${token}`;
      res.json({ link, expiresAt });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "ZodError") {
        res.status(400).json({ error: "Invalid input" });
        return;
      }
      res.status(500).json({ error: "Failed to create link" });
    }
  },
);

// ─── GET /api/permissions/:resourceType/:resourceId ───────────────────────────
// Tenant-scoped + same roles as grant — prevents cross-tenant enumeration of grants.
router.get(
  "/:resourceType/:resourceId",
  verifyAuth,
  requireRole("ORG_ADMIN", "MANAGER", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { resourceType, resourceId } = req.params;

      if (!isValidUUID(resourceId)) {
        res.status(400).json({ error: "Invalid resource ID" });
        return;
      }

      if (resourceType === "file") {
        const file = await prisma.file.findFirst({
          where: {
            id: resourceId,
            tenantId: req.user!.tenantId,
            isDeleted: false,
          },
          select: { id: true },
        });
        if (!file) {
          res.status(404).json({ error: "Not found" });
          return;
        }
      } else if (resourceType === "folder") {
        const folder = await prisma.folder.findFirst({
          where: { id: resourceId, tenantId: req.user!.tenantId },
          select: { id: true },
        });
        if (!folder) {
          res.status(404).json({ error: "Not found" });
          return;
        }
      } else {
        res.status(400).json({ error: "Invalid resource type" });
        return;
      }

      const permissions = await prisma.permission.findMany({
        where: { resourceType, resourceId },
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
          department: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      res.json({ permissions });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch permissions" });
    }
  },
);

// ─── POST /api/permissions ────────────────────────────────────────────────────
router.post(
  "/",
  verifyAuth,
  requireRole("ORG_ADMIN", "MANAGER", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
  try {
    const data = grantSchema.parse(req.body);

    if (data.resourceType === "file") {
      const file = await prisma.file.findFirst({
        where: { id: data.resourceId, tenantId: req.user!.tenantId },
      });
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }
    } else {
      const folder = await prisma.folder.findFirst({
        where: { id: data.resourceId, tenantId: req.user!.tenantId },
      });
      if (!folder) {
        res.status(404).json({ error: "Folder not found" });
        return;
      }
    }

    // Upsert: update existing rather than creating duplicate
    const existing = await prisma.permission.findFirst({
      where: {
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        grantedTo: data.grantedTo,
        departmentId: data.departmentId ?? null,
        userId: data.userId ?? null,
      },
    });

    if (existing) {
      const permission = await prisma.permission.update({
        where: { id: existing.id },
        data: {
          action: data.action,
          capabilities: data.capabilities as any,
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });

      await createAuditLog({
        action: "permission.grant",
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        metadata: {
          grantedTo: data.grantedTo,
          action: data.action,
          updated: true,
        },
        req,
      });

      res.status(200).json({ permission });
      return;
    }

    const permission = await prisma.permission.create({
      data: {
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        grantedTo: data.grantedTo,
        departmentId: data.departmentId ?? null,
        userId: data.userId ?? null,
        action: data.action,
        capabilities: data.capabilities as any,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        folderId: data.resourceType === "folder" ? data.resourceId : null,
        fileId: data.resourceType === "file" ? data.resourceId : null,
      },
    });

    await createAuditLog({
      action: "permission.grant",
      userId: req.user!.userId,
      tenantId: req.user!.tenantId,
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      metadata: { grantedTo: data.grantedTo, action: data.action },
      req,
    });

    res.status(201).json({ permission });
  } catch (err: any) {
    if (err.name === "ZodError") {
      console.error("Zod validation error:", err.errors);
      res.status(400).json({ error: "Invalid input", details: err.errors });
      return;
    }
    console.error("Permission grant error:", err);
    res.status(500).json({ error: "Failed to grant permission" });
  }
});

// ─── DELETE /api/permissions/:id ──────────────────────────────────────────────
router.delete(
  "/:id",
  verifyAuth,
  requireRole("ORG_ADMIN", "MANAGER", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
  try {
    if (!isValidUUID(req.params.id)) {
      res.status(400).json({ error: "Invalid permission ID" });
      return;
    }

    const permission = await prisma.permission.findUnique({
      where: { id: req.params.id },
    });

    if (!permission) {
      res.status(404).json({ error: "Permission not found" });
      return;
    }

    if (permission.fileId) {
      const file = await prisma.file.findFirst({
        where: { id: permission.fileId, tenantId: req.user!.tenantId },
        select: { id: true },
      });
      if (!file) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
    } else if (permission.folderId) {
      const folder = await prisma.folder.findFirst({
        where: { id: permission.folderId, tenantId: req.user!.tenantId },
        select: { id: true },
      });
      if (!folder) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
    } else {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    await prisma.permission.delete({ where: { id: req.params.id } });

    await createAuditLog({
      action: "permission.revoke",
      userId: req.user!.userId,
      tenantId: req.user!.tenantId,
      resourceType: permission.resourceType as "file" | "folder",
      resourceId: permission.resourceId,
      metadata: { grantedTo: permission.grantedTo, action: permission.action },
      req,
    });

    res.json({ message: "Permission removed" });
  } catch (err) {
    res.status(500).json({ error: "Failed to remove permission" });
  }
});

export default router;
