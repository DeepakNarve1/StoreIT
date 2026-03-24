import { Router, Response, Request } from "express";
import { z, ZodError } from "zod";
import { verifyAuth, AuthRequest, requireRole } from "../middleware/auth";
import { prisma } from "../utils/prisma";
import { v4 as uuid } from "uuid";
import { getFileViewUrl } from "../services/storage.service";
import { createAuditLog } from "../services/audit.service";

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

// ─── Helper: check a specific granular capability ─────────────────────────────
export async function userHasCapability(
  userId: string,
  tenantId: string,
  role: string,
  resourceType: "file" | "folder",
  resourceId: string,
  capability: string,
): Promise<boolean> {
  const privileged = ["SUPERADMIN", "ORG_ADMIN", "MANAGER", "EDITOR"];
  if (privileged.includes(role)) return true;

  const userRecord = await prisma.user.findUnique({
    where: { id: userId },
    select: { departmentId: true },
  });

  const orClauses: any[] = [
    { grantedTo: "all" },
    { grantedTo: "user", userId },
  ];
  if (userRecord?.departmentId) {
    orClauses.push({
      grantedTo: "department",
      departmentId: userRecord.departmentId,
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
  if (!capabilities || typeof capabilities !== "object") return false;
  return (capabilities as Record<string, boolean>)[capability] === true;
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

      const { userId, tenantId, role } = req.user!;

      const ALL_CAPS = [
        "preview_files",
        "download_files",
        "add_files",
        "delete_files",
        "edit_file_attrs",
        "see_files",
        "see_folders",
        "share_files",
        "share_folders",
      ] as const;

      const privileged = ["SUPERADMIN", "ORG_ADMIN", "MANAGER", "EDITOR"];
      if (privileged.includes(role)) {
        // All capabilities are true for privileged roles
        const fullCaps = ALL_CAPS.reduce(
          (acc, k) => ({ ...acc, [k]: true }),
          {} as Record<string, boolean>,
        );
        const result: Record<string, Record<string, boolean>> = {};
        fileIds.forEach((id) => (result[id] = fullCaps));
        res.json({ capabilities: result });
        return;
      }

      // Fetch current user's department
      const userRecord = await prisma.user.findUnique({
        where: { id: userId },
        select: { departmentId: true },
      });

      const orClauses: any[] = [
        { grantedTo: "all" },
        { grantedTo: "user", userId },
      ];
      if (userRecord?.departmentId) {
        orClauses.push({
          grantedTo: "department",
          departmentId: userRecord.departmentId,
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

        if (!activePerm && !isOwner) {
          // No grant at all — only preview allowed
          result[fileId] = ALL_CAPS.reduce(
            (acc, k) => ({ ...acc, [k]: k === "preview_files" }),
            {} as Record<string, boolean>,
          );
        } else if (caps && typeof caps === "object" && Object.keys(caps).length > 0) {
          // Explicit granular capabilities from the permission record
          result[fileId] = ALL_CAPS.reduce(
            (acc, k) => ({ ...acc, [k]: caps[k] === true }),
            {} as Record<string, boolean>,
          );
          // Always allow preview
          result[fileId]["preview_files"] = true;
        } else {
          // Coarse action — map to capabilities
          const action = activePerm?.action ?? "read";
          const coarseWrite = ["write", "delete", "admin"].includes(action);
          const coarseDelete = ["delete", "admin"].includes(action);
          result[fileId] = {
            preview_files: true,
            see_files: true,
            see_folders: coarseWrite,
            download_files: coarseWrite || isOwner,
            add_files: coarseWrite,
            delete_files: coarseDelete || isOwner,
            edit_file_attrs: coarseWrite || isOwner,
            share_files: action === "admin",
            share_folders: action === "admin",
          };
        }

        // File owner always gets full self-access
        if (isOwner) {
          result[fileId]["preview_files"] = true;
          result[fileId]["download_files"] = true;
          result[fileId]["edit_file_attrs"] = true;
          result[fileId]["delete_files"] = true;
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
      });

      if (!file) {
        res.status(404).json({ error: "File not found" });
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

      const link = `${process.env.APP_URL}/view/${token}`;
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
router.get(
  "/:resourceType/:resourceId",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const { resourceType, resourceId } = req.params;

      if (!isValidUUID(resourceId)) {
        res.status(400).json({ error: "Invalid resource ID" });
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
