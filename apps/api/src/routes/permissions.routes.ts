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
      view_file_metadata: true,
      edit_file_metadata: true,
      update_versions: true,
      move_files: true,
      delete_files: true,
      request_signatures: true,
    });
  }
  if (action === "write") {
    return normalizeCapabilities({
      add_files: true,
      see_files: true,
      preview_files: true,
      download_files: true,
      edit_file_attrs: true,
      view_file_metadata: true,
      edit_file_metadata: true,
      update_versions: true,
      move_files: true,
      request_signatures: true,
    });
  }
  return normalizeCapabilities({
    see_files: true,
    preview_files: true,
  });
}

/**
 * Folder capability flags stored on a **file** permission row (Share panel includes
 * both FILE and FOLDER sections). Used so "create folders" etc. apply to the file's parent folder.
 */
function folderCapsFromFilePermissionRow(perm: {
  capabilities: unknown;
}): Record<string, boolean> {
  const caps = normalizeCapabilities(
    perm.capabilities as Record<string, boolean> | null | undefined,
  );
  const slice: Record<string, boolean> = {};
  for (const key of FOLDER_CAPABILITIES) {
    if (caps[key] === true) slice[key] = true;
  }
  return normalizeCapabilities(slice);
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
      view_folder_metadata: true,
      edit_folder_metadata: true,
    });
  }
  if (action === "write") {
    return normalizeCapabilities({
      create_folders: true,
      see_folders: true,
      download_folders: true,
      edit_folders: true,
      move_folders: true,
      view_folder_metadata: true,
      edit_folder_metadata: true,
    });
  }
  return normalizeCapabilities({
    see_folders: true,
  });
}

function permissionPriority(grantedTo: string): number {
  if (grantedTo === "user") return 3;
  if (grantedTo === "department") return 2;
  if (grantedTo === "all") return 1;
  return 0;
}

function pickHighestPriorityPermission<T extends { grantedTo: string }>(
  permissions: T[],
): T | null {
  if (permissions.length === 0) return null;
  return permissions.reduce((best, current) => {
    if (!best) return current;
    const bestPriority = permissionPriority(best.grantedTo);
    const currentPriority = permissionPriority(current.grantedTo);
    if (currentPriority > bestPriority) return current;
    return best;
  }, permissions[0] as T | null);
}

async function getAncestorChainForFolder(
  tenantId: string,
  startFolderId: string,
  maxDepth = 80,
): Promise<string[]> {
  const rows = await prisma.folder.findMany({
    where: { tenantId, isDeleted: false },
    select: { id: true, parentId: true },
  });
  const parentById = new Map<string, string | null>(
    rows.map((row) => [row.id, row.parentId]),
  );
  const chain: string[] = [];
  let current: string | null = startFolderId;
  let depth = 0;
  while (current && depth < maxDepth) {
    chain.push(current);
    current = parentById.get(current) ?? null;
    depth++;
  }
  return chain;
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
    normalizeCapabilities(roleContext.capabilities)[capability] === true
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

  const perms = await prisma.permission.findMany({
    where: {
      resourceType,
      resourceId,
      OR: orClauses,
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
    },
    orderBy: { createdAt: "desc" },
  });
  const perm = pickHighestPriorityPermission(perms);

  if (!perm) {
    if (resourceType === "folder" && FOLDER_CAPABILITIES.includes(capability as any)) {
      const filePerms = await prisma.permission.findMany({
        where: {
          resourceType: "file",
          OR: orClauses,
          AND: [
            { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
            {
              file: {
                tenantId,
                isDeleted: false,
                folderId: resourceId,
              },
            },
          ],
        },
        select: { capabilities: true },
      });
      for (const fp of filePerms) {
        const slice = folderCapsFromFilePermissionRow(fp);
        if (slice[capability] === true) return true;
      }
    }
    if (resourceType === "file" && FILE_CAPABILITIES.includes(capability as any)) {
      const file = await prisma.file.findFirst({
        where: { id: resourceId, tenantId, isDeleted: false },
        select: { folderId: true },
      });
      if (!file?.folderId) return false;

      const chain = await getAncestorChainForFolder(tenantId, file.folderId, 80);
      const folderPerms = await prisma.permission.findMany({
        where: {
          resourceType: "folder",
          resourceId: { in: chain },
          OR: orClauses,
          AND: [
            { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
            { folder: { tenantId } },
          ],
        },
        select: { resourceId: true, capabilities: true, action: true },
      });

      for (const p of folderPerms) {
        const isSelf = p.resourceId === file.folderId;
        const caps = (p as any).capabilities as Record<string, boolean> | null;
        const canInherit = isSelf || caps?.apply_subfolders === true;
        if (!canInherit) continue;

        const hasExplicitCaps =
          !!caps && typeof caps === "object" && Object.keys(caps).length > 0;
        const fileCaps = hasExplicitCaps
          ? normalizeCapabilities(caps as Record<string, boolean>)
          : actionToFileCapabilities(p.action);
        if (fileCaps[capability] === true) return true;
      }
    }
    return false;
  }
  const rawCaps = (perm as { capabilities?: unknown; action: string })
    .capabilities as Record<string, boolean> | null | undefined;
  const hasExplicitCaps =
    !!rawCaps &&
    typeof rawCaps === "object" &&
    Object.keys(rawCaps).length > 0;
  if (hasExplicitCaps) {
    return normalizeCapabilities(rawCaps)[capability] === true;
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

      // Also fetch folder-level permissions so we can propagate to files.
      // Walk the full ancestor chain for each file's folder so that
      // apply_subfolders grants on parent folders are respected.
      const files = await prisma.file.findMany({
        where: { id: { in: fileIds }, tenantId, isDeleted: false },
        select: { id: true, folderId: true, uploadedById: true },
      });

      const folderIds = [
        ...new Set(files.map((f) => f.folderId).filter(Boolean) as string[]),
      ];

      // Build full ancestor chains for all distinct folder IDs in one query
      let folderPerms: typeof filePerms = [];
      if (folderIds.length > 0) {
        // Fetch all folders for the tenant to walk chains in memory
        const allFolders = await prisma.folder.findMany({
          where: { tenantId, isDeleted: false },
          select: { id: true, parentId: true },
        });
        const parentById = new Map(allFolders.map((f) => [f.id, f.parentId]));

        // Collect all ancestor folder IDs across all file folders
        const allAncestorIds = new Set<string>();
        for (const fId of folderIds) {
          let current: string | null = fId;
          let depth = 0;
          while (current && depth < 80) {
            allAncestorIds.add(current);
            current = parentById.get(current) ?? null;
            depth++;
          }
        }

        folderPerms = await prisma.permission.findMany({
          where: {
            resourceType: "folder",
            resourceId: { in: Array.from(allAncestorIds) },
            OR: orClauses,
            AND: [
              { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
            ],
          },
        });
      }

      // Build result map
      const result: Record<string, Record<string, boolean>> = {};
      const baseCaps = normalizeCapabilities(roleContext.capabilities);

      // Build parentById map once (already fetched above if folderIds.length > 0)
      const allFoldersForChain = folderIds.length > 0
        ? await prisma.folder.findMany({
            where: { tenantId, isDeleted: false },
            select: { id: true, parentId: true },
          })
        : [];
      const parentByIdForFiles = new Map(allFoldersForChain.map((f) => [f.id, f.parentId]));

      for (const fileId of fileIds) {
        const file = files.find((f) => f.id === fileId);
        const isOwner = file?.uploadedById === userId;

        // Direct file perm takes priority
        const directPerm = filePerms.find((p) => p.resourceId === fileId);

        // Folder perm: prefer direct folder match, then nearest ancestor with apply_subfolders
        let folderPerm: (typeof folderPerms)[number] | null = null;
        if (!directPerm && file?.folderId) {
          let current: string | null = file.folderId;
          let depth = 0;
          while (current && depth < 80) {
            const perm = folderPerms.find((p) => p.resourceId === current);
            if (perm) {
              if (current === file.folderId) {
                folderPerm = perm;
                break;
              }
              const caps = (perm as any).capabilities as Record<string, boolean> | null;
              if (caps?.apply_subfolders === true) {
                folderPerm = perm;
                break;
              }
            }
            current = parentByIdForFiles.get(current) ?? null;
            depth++;
          }
        }

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
          result[fileId]["view_file_metadata"] = true;
          result[fileId]["edit_file_metadata"] = true;
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
        "share_folders",
        "view_folder_metadata",
        "edit_folder_metadata",
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

      // Also fetch ancestor permissions for apply_subfolders support
      const allFolders = await prisma.folder.findMany({
        where: { tenantId: roleContext.tenantId, isDeleted: false },
        select: { id: true, parentId: true },
      });
      const parentById = new Map(allFolders.map((f) => [f.id, f.parentId]));

      // Collect all ancestor IDs beyond the direct folders
      const ancestorIds = new Set<string>();
      for (const fId of folderIds) {
        let current: string | null = parentById.get(fId) ?? null;
        let depth = 0;
        while (current && depth < 80) {
          ancestorIds.add(current);
          current = parentById.get(current) ?? null;
          depth++;
        }
      }

      const ancestorPerms = ancestorIds.size > 0
        ? await prisma.permission.findMany({
            where: {
              resourceType: "folder",
              resourceId: { in: Array.from(ancestorIds) },
              OR: orClauses,
              AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
            },
          })
        : [];

      // File shares can include folder-section capabilities (e.g. create_folders) on resourceType=file.
      const filePermsInListedFolders =
        folderIds.length > 0
          ? await prisma.permission.findMany({
              where: {
                resourceType: "file",
                OR: orClauses,
                AND: [
                  { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
                  {
                    file: {
                      tenantId: roleContext.tenantId,
                      isDeleted: false,
                      folderId: { in: folderIds },
                    },
                  },
                ],
              },
              select: {
                capabilities: true,
                file: { select: { folderId: true } },
              },
            })
          : [];

      const result: Record<string, Record<string, boolean>> = {};
      const baseCaps = normalizeCapabilities(roleContext.capabilities);
      for (const folderId of folderIds) {
        // Direct permission on this folder
        const perm = folderPerms.find((p) => p.resourceId === folderId);

        // If no direct perm, check ancestors with apply_subfolders
        let activePerm = perm ?? null;
        if (!activePerm) {
          let current: string | null = parentById.get(folderId) ?? null;
          let depth = 0;
          while (current && depth < 80) {
            const ancestorPerm = ancestorPerms.find((p) => p.resourceId === current);
            if (ancestorPerm) {
              const caps = (ancestorPerm as any).capabilities as Record<string, boolean> | null;
              if (caps?.apply_subfolders === true) {
                activePerm = ancestorPerm;
                break;
              }
            }
            current = parentById.get(current) ?? null;
            depth++;
          }
        }

        const caps = (activePerm as any)?.capabilities as
          | Record<string, boolean>
          | null
          | undefined;
        const sharedCaps =
          caps && typeof caps === "object" && Object.keys(caps).length > 0
            ? normalizeCapabilities(caps)
            : activePerm
              ? actionToFolderCapabilities(activePerm.action)
              : normalizeCapabilities({});
        const seededCaps =
          roleContext.baseRole === "VIEWER" && !activePerm
            ? normalizeCapabilities({})
            : baseCaps;
        let merged = mergeCapabilities(seededCaps, sharedCaps);
        for (const fp of filePermsInListedFolders) {
          if (fp.file?.folderId !== folderId) continue;
          merged = mergeCapabilities(
            merged,
            folderCapsFromFilePermissionRow(fp),
          );
        }
        result[folderId] = merged;
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
