import { Router, Response } from "express";
import { z } from "zod";
import { verifyAuth, AuthRequest, requireRole } from "../middleware/auth";
import { prisma } from "../utils/prisma";
import { createAuditLog } from "../services/audit.service";
import archiver from "archiver";
import https from "https";
import http from "http";
import { getFileViewUrl } from "../services/storage.service";
import { userHasCapability } from "./permissions.routes";
import { getEffectiveRoleProfileForUser } from "../services/role-profiles.service";

const router = Router();

const PRIVILEGED = ["SUPERADMIN", "ORG_ADMIN", "MANAGER", "EDITOR"];

type FolderRow = { id: string; name: string; parentId: string | null };

async function getVisibleFolderIdSetForUser(opts: {
  userId: string;
  tenantId: string;
  role: string;
}): Promise<Set<string>> {
  const { userId, tenantId, role } = opts;
  const roleContext = await getEffectiveRoleProfileForUser(userId);
  if (
    roleContext &&
    roleContext.tenantId === tenantId &&
    roleContext.baseRole !== "VIEWER" &&
    roleContext.capabilities.see_folders
  ) {
    return new Set<string>();
  }

  const orClauses: any[] = [
    { grantedTo: "all" },
    { grantedTo: "user", userId },
  ];
  if (roleContext?.departmentId) {
    orClauses.push({
      grantedTo: "department",
      departmentId: roleContext.departmentId,
    });
  }

  const perms = await prisma.permission.findMany({
    where: {
      resourceType: "folder",
      OR: orClauses,
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        { folder: { tenantId, isDeleted: false } },
      ],
    },
    select: { resourceId: true, action: true, capabilities: true },
  });

  const directlyVisible = new Set<string>();
  const expandToDescendants = new Set<string>();
  for (const p of perms) {
    const caps = (p as any).capabilities as Record<string, boolean> | null;
    const hasSeeFolders =
      caps?.see_folders === true || caps?.see_files === true;
    // Treat any folder permission action as visibility, even if caps are missing
    const hasAnyFolderAccess = ["read", "write", "delete", "admin"].includes(
      p.action,
    );
    if (hasSeeFolders || hasAnyFolderAccess) directlyVisible.add(p.resourceId);
    if (caps?.apply_subfolders === true) expandToDescendants.add(p.resourceId);
  }

  if (directlyVisible.size === 0) return new Set<string>();

  // Add ancestors so navigation + breadcrumb works.
  const allFolders = (await prisma.folder.findMany({
    where: { tenantId, isDeleted: false },
    select: { id: true, name: true, parentId: true },
  })) as FolderRow[];

  const byId = new Map<string, FolderRow>();
  allFolders.forEach((f) => byId.set(f.id, f));

  const visible = new Set<string>(directlyVisible);

  // If the grant is marked "apply_subfolders", include all descendants too.
  if (expandToDescendants.size > 0) {
    const childrenByParent = new Map<string | null, string[]>();
    for (const f of allFolders) {
      const arr = childrenByParent.get(f.parentId ?? null) ?? [];
      arr.push(f.id);
      childrenByParent.set(f.parentId ?? null, arr);
    }

    const queue: string[] = Array.from(expandToDescendants);
    const seen = new Set(queue);
    while (queue.length > 0) {
      const current = queue.shift()!;
      const children = childrenByParent.get(current) ?? [];
      for (const childId of children) {
        if (seen.has(childId)) continue;
        seen.add(childId);
        visible.add(childId);
        queue.push(childId);
      }
    }
  }

  for (const id of directlyVisible) {
    let current = byId.get(id)?.parentId ?? null;
    let depth = 0;
    while (current && depth < 50) {
      visible.add(current);
      current = byId.get(current)?.parentId ?? null;
      depth++;
    }
  }

  return visible;
}

const METADATA_TYPE_ALLOWED = [
  "text",
  "boolean",
  "date",
  "datetime",
  "number",
  "integer",
  "decimal",
  "longText",
  "email",
  "list",
];

// ─── GET /api/folders/:id/metadata-fields — folder default schema ─────────
router.get(
  "/:id/metadata-fields",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    if (!isValidUUID(req.params.id)) {
      res.status(400).json({ error: "Invalid folder ID" });
      return;
    }
    try {
      const { userId, tenantId, role } = req.user!;
      const folder = await prisma.folder.findFirst({
        where: {
          id: req.params.id,
          tenantId,
          isDeleted: false,
        },
        select: { id: true },
      });
      if (!folder) {
        res.status(404).json({ error: "Folder not found" });
        return;
      }

      const isPrivileged = PRIVILEGED.includes(role);
      if (!isPrivileged) {
        const canViewMetadata = await userHasCapability(
          userId,
          tenantId,
          role,
          "folder",
          folder.id,
          "view_metadata",
        );
        if (!canViewMetadata) {
          const canSeeFolder = await userHasCapability(
            userId,
            tenantId,
            role,
            "folder",
            folder.id,
            "see_folders",
          );
          if (!canSeeFolder) {
            res.status(403).json({ error: "Permission denied" });
            return;
          }
        }
      }

      const fields = await prisma.folderMetadataField.findMany({
        where: { folderId: req.params.id, tenantId: req.user!.tenantId },
        orderBy: { createdAt: "asc" },
        select: {
          key: true,
          type: true,
          required: true,
          recursive: true,
          options: true,
        },
      });
      res.json({
        fields: fields.map((f) => ({
          ...f,
          options: Array.isArray(f.options)
            ? (f.options as unknown[]).filter(
                (o): o is string => typeof o === "string",
              )
            : [],
        })),
      });
    } catch {
      res.status(500).json({ error: "Failed to fetch metadata fields" });
    }
  },
);

// ─── PUT /api/folders/:id/metadata-fields — replace folder schema ──────
router.put(
  "/:id/metadata-fields",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    if (!isValidUUID(req.params.id)) {
      res.status(400).json({ error: "Invalid folder ID" });
      return;
    }

    const schema = z.object({
      fields: z
        .array(
          z.object({
            key: z.string().min(1).max(100),
            type: z.string().refine((t) => METADATA_TYPE_ALLOWED.includes(t), {
              message: "Unsupported metadata type",
            }),
            required: z.boolean(),
            recursive: z.boolean(),
            options: z.array(z.string().min(1).max(100)).max(100).optional(),
          }),
        )
        .max(50),
    });

    try {
      const { fields } = schema.parse(req.body);

      // Ensure folder belongs to tenant
      const folder = await prisma.folder.findFirst({
        where: {
          id: req.params.id,
          tenantId: req.user!.tenantId,
          isDeleted: false,
        },
        select: { id: true },
      });
      if (!folder) {
        res.status(404).json({ error: "Folder not found" });
        return;
      }

      const isPrivileged = PRIVILEGED.includes(req.user!.role);
      if (!isPrivileged) {
        const canEditMetadata = await userHasCapability(
          req.user!.userId,
          req.user!.tenantId,
          req.user!.role,
          "folder",
          folder.id,
          "edit_metadata",
        );
        if (!canEditMetadata) {
          const canEditFolder = await userHasCapability(
            req.user!.userId,
            req.user!.tenantId,
            req.user!.role,
            "folder",
            folder.id,
            "edit_folders",
          );
          if (!canEditFolder) {
            res.status(403).json({ error: "Permission denied" });
            return;
          }
        }
      }

      await prisma.$transaction([
        prisma.folderMetadataField.deleteMany({
          where: { folderId: req.params.id, tenantId: req.user!.tenantId },
        }),
        ...fields.map((f) =>
          prisma.folderMetadataField.create({
            data: {
              tenantId: req.user!.tenantId,
              folderId: req.params.id,
              key: f.key,
              type: f.type,
              required: f.required,
              recursive: f.recursive,
              options: f.type === "list" ? (f.options ?? []) : [],
            },
          }),
        ),
      ]);

      res.json({ message: "Folder metadata fields updated" });
    } catch (err: any) {
      if (err.name === "ZodError") {
        res.status(400).json({ error: "Invalid metadata fields" });
        return;
      }
      res.status(500).json({ error: "Failed to update metadata fields" });
    }
  },
);

// ─── UUID validation ──────────────────────────────────────────────────────────
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (val: unknown): val is string =>
  typeof val === "string" && UUID_REGEX.test(val);

// ─── Helper: collect all descendant folder IDs recursively ───────────────────
// FIX #1 & #2: cascade delete/restore was only handling direct files,
// not child folders or their files.
async function getAllDescendantFolderIds(
  folderId: string,
  tenantId: string,
): Promise<string[]> {
  const children = await prisma.folder.findMany({
    where: { parentId: folderId, tenantId },
    select: { id: true },
  });

  const ids: string[] = [];
  for (const child of children) {
    ids.push(child.id);
    const nested = await getAllDescendantFolderIds(child.id, tenantId);
    ids.push(...nested);
  }
  return ids;
}

// ─── GET /api/folders ─────────────────────────────────────────────────────────
router.get("/", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { parentId } = req.query;
    const { userId, tenantId, role } = req.user!;
    const roleContext = await getEffectiveRoleProfileForUser(userId);
    const visibleSet = await getVisibleFolderIdSetForUser({
      userId,
      tenantId,
      role,
    });

    const folders = await prisma.folder.findMany({
      where: {
        tenantId,
        isDeleted: false,
        parentId:
          parentId && parentId !== "null" && parentId !== "undefined"
            ? String(parentId)
            : null,
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        parentId: true,
        createdAt: true,
        isStarred: true,
        _count: {
          select: {
            files: { where: { isDeleted: false } },
            children: { where: { isDeleted: false } },
          },
        },
      },
    });

    const hasTenantWideFolderAccess =
      roleContext?.baseRole === "SUPERADMIN" ||
      (roleContext?.baseRole !== "VIEWER" && roleContext?.capabilities.see_folders);
    const filtered =
      hasTenantWideFolderAccess || visibleSet.size === 0
        ? hasTenantWideFolderAccess
          ? folders
          : []
        : folders.filter((f) => visibleSet.has(f.id));

    // Recursive file count (include descendant folders).
    const allTenantFolders = await prisma.folder.findMany({
      where: { tenantId, isDeleted: false },
      select: { id: true, parentId: true },
    });
    const allowedFolderIds = new Set(
      hasTenantWideFolderAccess
        ? allTenantFolders.map((f) => f.id)
        : allTenantFolders.filter((f) => visibleSet.has(f.id)).map((f) => f.id),
    );

    const childrenByParent = new Map<string | null, string[]>();
    for (const f of allTenantFolders) {
      if (!allowedFolderIds.has(f.id)) continue;
      const arr = childrenByParent.get(f.parentId ?? null) ?? [];
      arr.push(f.id);
      childrenByParent.set(f.parentId ?? null, arr);
    }

    const perFolderFileCounts = await prisma.file.groupBy({
      by: ["folderId"],
      where: {
        tenantId,
        isDeleted: false,
        folderId: { in: Array.from(allowedFolderIds) },
      },
      _count: { _all: true },
    });
    const directFileCountByFolder = new Map<string, number>();
    for (const row of perFolderFileCounts) {
      const folderId = row.folderId ?? "";
      if (!folderId) continue;
      directFileCountByFolder.set(folderId, row._count._all);
    }

    const totalMemo = new Map<string, number>();
    const computeTotalFiles = (id: string): number => {
      const memo = totalMemo.get(id);
      if (memo !== undefined) return memo;
      const direct = directFileCountByFolder.get(id) ?? 0;
      const childIds = childrenByParent.get(id) ?? [];
      const childSum = childIds.reduce(
        (sum, cid) => sum + computeTotalFiles(cid),
        0,
      );
      const total = direct + childSum;
      totalMemo.set(id, total);
      return total;
    };

    // Compute direct "files missing required metadata" per folder.
    const allFiles = await prisma.file.findMany({
      where: {
        tenantId,
        isDeleted: false,
        folderId: { in: Array.from(allowedFolderIds) },
      },
      select: {
        id: true,
        folderId: true,
        metadata: { select: { key: true } },
      },
    });

    const defs = await prisma.folderMetadataField.findMany({
      where: {
        tenantId,
        folderId: { in: Array.from(allowedFolderIds) },
      },
      select: { folderId: true, key: true, required: true, recursive: true },
    });
    const defsByFolder = new Map<string, typeof defs>();
    for (const d of defs) {
      const arr = defsByFolder.get(d.folderId) ?? [];
      arr.push(d);
      defsByFolder.set(d.folderId, arr);
    }

    const parentById = new Map(allTenantFolders.map((f) => [f.id, f.parentId]));
    const requiredKeysMemo = new Map<string, Set<string>>();
    const getRequiredKeysForFolder = (folderId: string) => {
      const memo = requiredKeysMemo.get(folderId);
      if (memo) return memo;
      const refs: Array<{ id: string; isSelf: boolean }> = [];
      let cur: string | null = folderId;
      let depth = 0;
      while (cur && depth < 80) {
        refs.push({ id: cur, isSelf: depth === 0 });
        cur = parentById.get(cur) ?? null;
        depth++;
      }
      const keySet = new Set<string>();
      for (const ref of refs) {
        const list = defsByFolder.get(ref.id) ?? [];
        for (const d of list) {
          if (!d.required) continue;
          if (!ref.isSelf && !d.recursive) continue;
          const lk = d.key.toLowerCase();
          if (!keySet.has(lk)) keySet.add(lk);
        }
      }
      requiredKeysMemo.set(folderId, keySet);
      return keySet;
    };

    const directMissingByFolder = new Map<string, number>();
    for (const file of allFiles) {
      if (!file.folderId) continue;
      const reqKeys = getRequiredKeysForFolder(file.folderId);
      if (reqKeys.size === 0) continue;
      const have = new Set(
        (file.metadata ?? []).map((m) => m.key.toLowerCase()),
      );
      let missing = false;
      for (const k of reqKeys) {
        if (!have.has(k)) {
          missing = true;
          break;
        }
      }
      if (!missing) continue;
      directMissingByFolder.set(
        file.folderId,
        (directMissingByFolder.get(file.folderId) ?? 0) + 1,
      );
    }

    const missingMemo = new Map<string, number>();
    const computeTotalMissingMeta = (id: string): number => {
      const memo = missingMemo.get(id);
      if (memo !== undefined) return memo;
      const direct = directMissingByFolder.get(id) ?? 0;
      const childIds = childrenByParent.get(id) ?? [];
      const childSum = childIds.reduce(
        (sum, cid) => sum + computeTotalMissingMeta(cid),
        0,
      );
      const total = direct + childSum;
      missingMemo.set(id, total);
      return total;
    };

    const withRecursiveCounts = filtered.map((f) => ({
      ...f,
      totalFiles: computeTotalFiles(f.id),
      totalMissingMeta: computeTotalMissingMeta(f.id),
    }));

    res.json({ folders: withRecursiveCounts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch folders" });
  }
});
// ─── GET /api/folders/all — flat list for sidebar tree ───────────────────────
router.get("/all", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, tenantId, role } = req.user!;
    const roleContext = await getEffectiveRoleProfileForUser(userId);
    const visibleSet = await getVisibleFolderIdSetForUser({
      userId,
      tenantId,
      role,
    });
    const folders = await prisma.folder.findMany({
      where: { tenantId, isDeleted: false },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        parentId: true,
        createdAt: true,
        isStarred: true,
        _count: {
          select: {
            files: { where: { isDeleted: false } },
            children: { where: { isDeleted: false } },
          },
        },
      },
    });
    const hasTenantWideFolderAccess =
      roleContext?.baseRole === "SUPERADMIN" ||
      (roleContext?.baseRole !== "VIEWER" && roleContext?.capabilities.see_folders);
    const filtered =
      hasTenantWideFolderAccess || visibleSet.size === 0
        ? hasTenantWideFolderAccess
          ? folders
          : []
        : folders.filter((f) => visibleSet.has(f.id));
    res.json({ folders: filtered });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch folders" });
  }
});

// ─── POST /api/folders ────────────────────────────────────────────────────────
const createFolderSchema = z.object({
  name: z.string().min(1).max(255),
  parentId: z.string().uuid().optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
});

router.post("/", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { name, parentId, categoryId } = createFolderSchema.parse(req.body);
    const { userId, tenantId, role } = req.user!;
    const roleContext = await getEffectiveRoleProfileForUser(userId);
    const isPrivileged =
      roleContext?.baseRole === "SUPERADMIN" ||
      (roleContext?.baseRole !== "VIEWER" &&
        roleContext?.capabilities.create_folders);

    // VIEWERs can only create folders inside a folder they have write access to
    if (!isPrivileged) {
      if (!parentId) {
        res
          .status(403)
          .json({ error: "You don't have permission to create folders here." });
        return;
      }
      const perm = await prisma.permission.findFirst({
        where: {
          resourceType: "folder",
          resourceId: parentId,
          OR: [{ grantedTo: "all" }, { grantedTo: "user", userId }],
          AND: [
            { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          ],
        },
      });
      if (!perm || !["write", "delete", "admin"].includes(perm.action)) {
        res
          .status(403)
          .json({ error: "You don't have permission to create folders here." });
        return;
      }
    }

    if (parentId) {
      const parent = await prisma.folder.findFirst({
        where: { id: parentId, tenantId, isDeleted: false },
      });
      if (!parent) {
        res.status(400).json({ error: "Parent folder not found" });
        return;
      }
    }

    const folder = await prisma.folder.create({
      data: {
        name,
        parentId: parentId ?? null,
        categoryId: categoryId ?? null,
        tenantId: req.user!.tenantId,
      },
      select: {
        id: true,
        name: true,
        parentId: true,
        categoryId: true,
        createdAt: true,
      },
    });

    await createAuditLog({
      action: "folder.create",
      userId: req.user!.userId,
      tenantId: req.user!.tenantId,
      resourceType: "folder",
      resourceId: folder.id,
      resourceName: folder.name,
      req,
    });

    res.status(201).json({ folder });
  } catch (err: any) {
    if (err.name === "ZodError") {
      res.status(400).json({ error: "Invalid input", details: err.errors });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Failed to create folder" });
  }
});

// ─── STATIC ROUTES — must be before /:id ─────────────────────────────────────

// ─── PATCH /api/folders/:id/restore ──────────────────────────────────────────
router.patch(
  "/:id/restore",
  verifyAuth,
  requireRole("ORG_ADMIN", "MANAGER", "SUPERADMIN", "EDITOR"),
  async (req: AuthRequest, res: Response) => {
    if (!isValidUUID(req.params.id)) {
      res.status(400).json({ error: "Invalid folder ID" });
      return;
    }
    try {
      const folder = await prisma.folder.findFirst({
        where: {
          id: req.params.id,
          tenantId: req.user!.tenantId,
          isDeleted: true,
        },
      });
      if (!folder) {
        res.status(404).json({ error: "Folder not found in trash" });
        return;
      }

      // FIX #2: recursively restore all descendants
      const descendantIds = await getAllDescendantFolderIds(
        req.params.id,
        req.user!.tenantId,
      );
      const allFolderIds = [req.params.id, ...descendantIds];

      await prisma.$transaction([
        prisma.folder.updateMany({
          where: { id: { in: allFolderIds }, tenantId: req.user!.tenantId },
          data: { isDeleted: false },
        }),
        prisma.file.updateMany({
          where: {
            folderId: { in: allFolderIds },
            tenantId: req.user!.tenantId,
          },
          data: { isDeleted: false },
        }),
      ]);

      res.json({ message: "Folder and all contents restored" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to restore folder" });
    }
  },
);

// ─── PATCH /api/folders/:id/star ─────────────────────────────────────────────
router.patch(
  "/:id/star",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    if (!isValidUUID(req.params.id)) {
      res.status(400).json({ error: "Invalid folder ID" });
      return;
    }
    try {
      const folder = await prisma.folder.findFirst({
        where: {
          id: req.params.id,
          tenantId: req.user!.tenantId,
          isDeleted: false,
        },
      });
      if (!folder) {
        res.status(404).json({ error: "Folder not found" });
        return;
      }

      const updated = await prisma.folder.update({
        where: { id: req.params.id },
        data: { isStarred: !folder.isStarred },
      });
      res.json({ isStarred: updated.isStarred });
    } catch (err) {
      res.status(500).json({ error: "Failed to star folder" });
    }
  },
);

// ─── PATCH /api/folders/:id — rename / update ────────────────────────────────
router.patch("/:id", verifyAuth, async (req: AuthRequest, res: Response) => {
  if (!isValidUUID(req.params.id)) {
    res.status(400).json({ error: "Invalid folder ID" });
    return;
  }
  const { role } = req.user!;
  const isPrivileged = [
    "SUPERADMIN",
    "ORG_ADMIN",
    "MANAGER",
    "EDITOR",
  ].includes(role);
  if (!isPrivileged) {
    res
      .status(403)
      .json({ error: "You don't have permission to modify folders." });
    return;
  }
  try {
    const { name, categoryId } = z
      .object({
        name: z.string().min(1).max(255).optional(),
        categoryId: z.string().uuid().optional().nullable(),
      })
      .parse(req.body);

    const folder = await prisma.folder.findFirst({
      where: {
        id: req.params.id,
        tenantId: req.user!.tenantId,
        isDeleted: false,
      },
    });

    if (!folder) {
      res.status(404).json({ error: "Folder not found" });
      return;
    }

    const updated = await prisma.folder.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(categoryId !== undefined && { categoryId }),
      },
      select: {
        id: true,
        name: true,
        parentId: true,
        categoryId: true,
        updatedAt: true,
      },
    });

    await createAuditLog({
      action: "folder.rename",
      userId: req.user!.userId,
      tenantId: req.user!.tenantId,
      resourceType: "folder",
      resourceId: req.params.id,
      resourceName: name ?? folder.name,
      metadata: { oldName: folder.name, newName: name },
      req,
    });

    res.json({ folder: updated });
  } catch (err: any) {
    if (err.name === "ZodError") {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    res.status(500).json({ error: "Failed to update folder" });
  }
});
// ─── DELETE /api/folders/:id/permanent ───────────────────────────────────────
router.delete(
  "/:id/permanent",
  verifyAuth,
  requireRole("ORG_ADMIN", "MANAGER", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    if (!isValidUUID(req.params.id)) {
      res.status(400).json({ error: "Invalid folder ID" });
      return;
    }
    try {
      const folder = await prisma.folder.findFirst({
        where: {
          id: req.params.id,
          tenantId: req.user!.tenantId,
          isDeleted: true,
        },
      });
      if (!folder) {
        res.status(404).json({ error: "Folder not found in trash" });
        return;
      }

      // Collect all descendant folder IDs so we delete the whole tree
      const descendantIds = await getAllDescendantFolderIds(
        req.params.id,
        req.user!.tenantId,
      );
      const allFolderIds = [req.params.id, ...descendantIds];

      // Delete all files inside these folders first, then the folders
      await prisma.$transaction([
        prisma.fileTag.deleteMany({
          where: { file: { folderId: { in: allFolderIds } } },
        }),
        prisma.permission.deleteMany({
          where: { folder: { id: { in: allFolderIds } } },
        }),
        prisma.oneTimeLink.deleteMany({
          where: { file: { folderId: { in: allFolderIds } } },
        }),
        prisma.fileVersion.deleteMany({
          where: { file: { folderId: { in: allFolderIds } } },
        }),
        prisma.fileMetadata.deleteMany({
          where: { file: { folderId: { in: allFolderIds } } },
        }),
        prisma.fileComment.deleteMany({
          where: { file: { folderId: { in: allFolderIds } } },
        }),
        prisma.file.deleteMany({
          where: {
            folderId: { in: allFolderIds },
            tenantId: req.user!.tenantId,
          },
        }),
        prisma.folder.deleteMany({
          where: { id: { in: allFolderIds }, tenantId: req.user!.tenantId },
        }),
      ]);

      await createAuditLog({
        action: "folder.delete.permanent",
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        resourceType: "folder",
        resourceId: req.params.id,
        resourceName: folder.name,
        metadata: { deletedSubfolders: descendantIds.length },
        req,
      });

      res.json({ message: "Folder permanently deleted" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to permanently delete folder" });
    }
  },
);

// ─── DELETE /api/folders/:id — soft delete folder + ALL descendants ───────────
router.delete("/:id", verifyAuth, async (req: AuthRequest, res: Response) => {
  if (!isValidUUID(req.params.id)) {
    res.status(400).json({ error: "Invalid folder ID" });
    return;
  }
  const { role } = req.user!;
  const isPrivileged = [
    "SUPERADMIN",
    "ORG_ADMIN",
    "MANAGER",
    "EDITOR",
  ].includes(role);
  if (!isPrivileged) {
    res
      .status(403)
      .json({ error: "You don't have permission to delete folders." });
    return;
  }
  try {
    const folder = await prisma.folder.findFirst({
      where: {
        id: req.params.id,
        tenantId: req.user!.tenantId,
        isDeleted: false,
      },
    });

    if (!folder) {
      res.status(404).json({ error: "Folder not found" });
      return;
    }

    const descendantIds = await getAllDescendantFolderIds(
      req.params.id,
      req.user!.tenantId,
    );
    const allFolderIds = [req.params.id, ...descendantIds];

    // Check if any file in these folders is locked and the user is not privileged to bypass
    const isLockPrivileged = ["SUPERADMIN", "ORG_ADMIN", "MANAGER"].includes(
      role,
    );
    if (!isLockPrivileged) {
      const lockedFiles = await prisma.file.findFirst({
        where: {
          folderId: { in: allFolderIds },
          tenantId: req.user!.tenantId,
          isLocked: true,
          isDeleted: false,
        },
      });

      if (lockedFiles) {
        res.status(423).json({
          error: "Cannot delete folder because it contains locked files.",
        });
        return;
      }
    }

    await prisma.$transaction([
      prisma.folder.updateMany({
        where: { id: { in: allFolderIds }, tenantId: req.user!.tenantId },
        data: { isDeleted: true },
      }),
      prisma.file.updateMany({
        where: { folderId: { in: allFolderIds }, tenantId: req.user!.tenantId },
        data: { isDeleted: true },
      }),
    ]);

    await createAuditLog({
      action: "folder.delete",
      userId: req.user!.userId,
      tenantId: req.user!.tenantId,
      resourceType: "folder",
      resourceId: req.params.id,
      resourceName: folder.name,
      metadata: {
        deletedSubfolders: descendantIds.length,
        totalFoldersAffected: allFolderIds.length,
      },
      req,
    });

    res.json({ message: "Folder and all contents deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete folder" });
  }
});

// ─── GET /api/folders/:id/download — zip folder contents ────────────────────
router.get(
  "/:id/download",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    if (!isValidUUID(req.params.id)) {
      res.status(400).json({ error: "Invalid folder ID" });
      return;
    }
    try {
      const { userId, tenantId, role } = req.user!;
      const isPrivileged = PRIVILEGED.includes(role);

      if (!isPrivileged) {
        const canSeeFolder = await userHasCapability(
          userId,
          tenantId,
          role,
          "folder",
          req.params.id,
          "see_folders",
        );
        if (!canSeeFolder) {
          res.status(403).json({ error: "Access denied" });
          return;
        }
      }

      const rootFolder = await prisma.folder.findFirst({
        where: { id: req.params.id, tenantId, isDeleted: false },
        select: { id: true, name: true, parentId: true },
      });
      if (!rootFolder) {
        res.status(404).json({ error: "Folder not found" });
        return;
      }

      const descendantIds = await getAllDescendantFolderIds(
        rootFolder.id,
        tenantId,
      );
      const allFolderIds = [rootFolder.id, ...descendantIds];

      const folderRows = await prisma.folder.findMany({
        where: { id: { in: allFolderIds }, tenantId, isDeleted: false },
        select: { id: true, name: true, parentId: true },
      });

      const folderById = new Map(
        folderRows.map((f) => [
          f.id,
          { id: f.id, name: f.name, parentId: f.parentId },
        ]),
      );

      const getRelativeFolderPath = (folderId: string) => {
        if (folderId === rootFolder.id) return "";
        const segments: string[] = [];
        let currentId: string | null | undefined = folderId;
        let depth = 0;
        while (currentId && currentId !== rootFolder.id && depth < 40) {
          const f = folderById.get(currentId);
          if (!f) break;
          if (f.parentId === rootFolder.id) {
            segments.unshift(f.name);
            break;
          }
          segments.unshift(f.name);
          currentId = f.parentId;
          depth++;
        }
        return segments.join("/");
      };

      const files = await prisma.file.findMany({
        where: { tenantId, isDeleted: false, folderId: { in: allFolderIds } },
        select: { id: true, name: true, storageKey: true, folderId: true },
      });

      const MAX_FILES_TO_ZIP = 5000;
      if (files.length > MAX_FILES_TO_ZIP) {
        res.status(400).json({
          error: `Too many files to download at once (max ${MAX_FILES_TO_ZIP}).`,
        });
        return;
      }

      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${rootFolder.name}-storeit-${Date.now()}.zip"`,
      );

      const archive = archiver("zip", { zlib: { level: 6 } });
      archive.pipe(res);

      for (const file of files) {
        if (!isPrivileged) {
          const canDownload = await userHasCapability(
            userId,
            tenantId,
            role,
            "file",
            file.id,
            "download_files",
          );
          if (!canDownload) {
            res.status(403).json({
              error: `You don't have permission to download "${file.name}".`,
            });
            return;
          }
        }

        const url = await getFileViewUrl(file.storageKey, 60);
        const relativeFolderPath = file.folderId
          ? getRelativeFolderPath(file.folderId)
          : "";
        const entryName = [
          rootFolder.name,
          relativeFolderPath ? relativeFolderPath : null,
          file.name,
        ]
          .filter(Boolean)
          .join("/");

        await new Promise<void>((resolve, reject) => {
          const client = url.startsWith("https") ? https : http;
          client
            .get(url, (stream) => {
              archive.append(stream, { name: entryName });
              stream.on("end", resolve);
              stream.on("error", reject);
            })
            .on("error", reject);
        });
      }

      await archive.finalize();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to create folder ZIP" });
    }
  },
);

// ─── POST /api/folders/bulk-download — zip multiple folders ───────────────
router.post(
  "/bulk-download",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const { ids } = z
        .object({ ids: z.array(z.string().uuid()).min(1).max(20) })
        .parse(req.body);

      const { userId, tenantId, role } = req.user!;
      const isPrivileged = PRIVILEGED.includes(role);

      const rootFolders = await prisma.folder.findMany({
        where: { id: { in: ids }, tenantId, isDeleted: false },
        select: { id: true, name: true },
      });
      if (rootFolders.length === 0) {
        res.status(404).json({ error: "No folders found" });
        return;
      }

      const rootById = new Map(rootFolders.map((f) => [f.id, f]));

      if (!isPrivileged) {
        for (const rootId of ids) {
          const canSeeFolder = await userHasCapability(
            userId,
            tenantId,
            role,
            "folder",
            rootId,
            "see_folders",
          );
          if (!canSeeFolder) {
            res.status(403).json({ error: "Access denied" });
            return;
          }
        }
      }

      // Collect all folders + files for all requested roots.
      // Note: duplicates are possible if folders overlap, which is acceptable for now.
      const allFolderIds = new Set<string>();
      for (const rootId of ids) {
        const rootExists = rootById.has(rootId);
        if (!rootExists) continue;
        allFolderIds.add(rootId);
        const descendantIds = await getAllDescendantFolderIds(rootId, tenantId);
        descendantIds.forEach((id) => allFolderIds.add(id));
      }

      const folderRows = await prisma.folder.findMany({
        where: {
          id: { in: Array.from(allFolderIds) },
          tenantId,
          isDeleted: false,
        },
        select: { id: true, name: true, parentId: true },
      });
      const folderById = new Map(
        folderRows.map((f) => [
          f.id,
          { id: f.id, name: f.name, parentId: f.parentId },
        ]),
      );

      const files = await prisma.file.findMany({
        where: {
          tenantId,
          isDeleted: false,
          folderId: { in: Array.from(allFolderIds) },
        },
        select: { id: true, name: true, storageKey: true, folderId: true },
      });

      const MAX_FILES_TO_ZIP = 5000;
      if (files.length > MAX_FILES_TO_ZIP) {
        res.status(400).json({
          error: `Too many files to download at once (max ${MAX_FILES_TO_ZIP}).`,
        });
        return;
      }

      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="storeit-folders-${Date.now()}.zip"`,
      );

      const archive = archiver("zip", { zlib: { level: 6 } });
      archive.pipe(res);

      const getRelativeFolderPath = (rootId: string, folderId: string) => {
        if (folderId === rootId) return "";
        const segments: string[] = [];
        let currentId: string | null | undefined = folderId;
        let depth = 0;
        while (currentId && currentId !== rootId && depth < 40) {
          const f = folderById.get(currentId);
          if (!f) break;
          if (f.parentId === rootId) {
            segments.unshift(f.name);
            break;
          }
          segments.unshift(f.name);
          currentId = f.parentId;
          depth++;
        }
        return segments.join("/");
      };

      for (const file of files) {
        if (!isPrivileged) {
          const canDownload = await userHasCapability(
            userId,
            tenantId,
            role,
            "file",
            file.id,
            "download_files",
          );
          if (!canDownload) {
            res.status(403).json({
              error: `You don't have permission to download "${file.name}".`,
            });
            return;
          }
        }

        const url = await getFileViewUrl(file.storageKey, 60);

        // Find which of the requested roots is an ancestor of this file's folder.
        // If none match (shouldn't happen), fall back to first requested root.
        let assignedRootId =
          ids.find((id) => id === (file.folderId ?? "")) ?? ids[0];
        const folderId = file.folderId;
        if (folderId) {
          // Walk upwards to find a root we requested
          let current: string | null = folderId;
          let depth = 0;
          while (current && depth < 40) {
            if (rootById.has(current)) {
              assignedRootId = current;
              break;
            }
            const f = folderById.get(current);
            current = f?.parentId ?? null;
            depth++;
          }
        }

        const rootName = rootById.get(assignedRootId)?.name ?? "folder";
        const relativePath = folderId
          ? getRelativeFolderPath(assignedRootId, folderId)
          : "";

        const entryName = [
          rootName,
          relativePath ? relativePath : null,
          file.name,
        ]
          .filter(Boolean)
          .join("/");

        await new Promise<void>((resolve, reject) => {
          const client = url.startsWith("https") ? https : http;
          client
            .get(url, (stream) => {
              archive.append(stream, { name: entryName });
              stream.on("end", resolve);
              stream.on("error", reject);
            })
            .on("error", reject);
        });
      }

      await archive.finalize();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to create folders ZIP" });
    }
  },
);

// ─── GET /api/folders/:id/ancestors ──────────────────────────────────────────
// Returns the full path from root to this folder as an ordered array
router.get(
  "/:id/ancestors",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    if (!isValidUUID(req.params.id)) {
      res.status(400).json({ error: "Invalid folder ID" });
      return;
    }
    try {
      const { userId, tenantId, role } = req.user!;
      const isPrivileged = PRIVILEGED.includes(role);
      if (!isPrivileged) {
        const canSeeFolder = await userHasCapability(
          userId,
          tenantId,
          role,
          "folder",
          req.params.id,
          "see_folders",
        );
        if (!canSeeFolder) {
          res.status(403).json({ error: "Access denied" });
          return;
        }
      }
      const ancestors: { id: string; name: string }[] = [];
      let currentId: string | null = req.params.id;

      // Walk up the tree — max 20 levels to prevent infinite loops
      let depth = 0;
      while (currentId && depth < 20) {
        const currentFolder: {
          id: string;
          name: string;
          parentId: string | null;
        } | null = await prisma.folder.findFirst({
          where: {
            id: currentId as string,
            tenantId: req.user!.tenantId,
            isDeleted: false,
          },
          select: { id: true, name: true, parentId: true },
        });
        if (!currentFolder) break;
        ancestors.unshift({ id: currentFolder.id, name: currentFolder.name });
        currentId = currentFolder.parentId;
        depth++;
      }

      res.json({ ancestors });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch folder path" });
    }
  },
);

export default router;
