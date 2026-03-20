import { Router, Response } from "express";
import { z } from "zod";
import { verifyAuth, AuthRequest } from "../middleware/auth";
import { prisma } from "../utils/prisma";
import { createAuditLog } from "../services/audit.service";

const router = Router();

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

    const folders = await prisma.folder.findMany({
      where: {
        tenantId: req.user!.tenantId,
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

    res.json({ folders });
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

    if (parentId) {
      const parent = await prisma.folder.findFirst({
        where: { id: parentId, tenantId: req.user!.tenantId, isDeleted: false },
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

// ─── DELETE /api/folders/:id — soft delete folder + ALL descendants ───────────
router.delete("/:id", verifyAuth, async (req: AuthRequest, res: Response) => {
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

    // FIX #1: recursively collect all descendants, delete everything in one tx
    const descendantIds = await getAllDescendantFolderIds(
      req.params.id,
      req.user!.tenantId,
    );
    const allFolderIds = [req.params.id, ...descendantIds];

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
      const ancestors: { id: string; name: string }[] = [];
      let currentId: string | null = req.params.id;

      // Walk up the tree — max 20 levels to prevent infinite loops
      let depth = 0;
      while (currentId && depth < 20) {
        const currentFolder: { id: string; name: string; parentId: string | null } | null = await prisma.folder.findFirst({
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
