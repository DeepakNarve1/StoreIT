import { Router, Response } from "express";
import { z } from "zod";
import { verifyAuth, AuthRequest } from "../middleware/auth";
import { prisma } from "../utils/prisma";
import { createAuditLog } from "../services/audit.service";

const router = Router();

// ─── All routes require auth ─────────────────────────────────────────────────

// ─── GET /api/folders — list folders (optionally by parentId) ─────────────────
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

// ─── POST /api/folders — create folder ───────────────────────────────────────
const createFolderSchema = z.object({
  name: z.string().min(1).max(255),
  parentId: z.string().uuid().optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
});

router.post("/", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { name, parentId, categoryId } = createFolderSchema.parse(req.body);

    // If parentId provided, verify it belongs to this tenant
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

// ─── PATCH /api/folders/:id — rename folder ───────────────────────────────────
router.patch("/:id", verifyAuth, async (req: AuthRequest, res: Response) => {
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
      resourceName: name,
      metadata: { oldName: folder.name, newName: name },
      req,
    });

    res.json({ folder: updated });
  } catch (err: any) {
    if (err.name === "ZodError") {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    res.status(500).json({ error: "Failed to rename folder" });
  }
});

// ─── DELETE /api/folders/:id — soft delete folder ─────────────────────────────
router.delete("/:id", verifyAuth, async (req: AuthRequest, res: Response) => {
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

    // Soft delete folder and its files
    await prisma.$transaction([
      prisma.folder.update({
        where: { id: req.params.id },
        data: { isDeleted: true },
      }),
      prisma.file.updateMany({
        where: { folderId: req.params.id, tenantId: req.user!.tenantId },
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
      req,
    });

    res.json({ message: "Folder deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete folder" });
  }
});

export default router;
