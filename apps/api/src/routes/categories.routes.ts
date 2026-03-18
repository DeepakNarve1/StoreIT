import { Router, Response } from "express";
import { z } from "zod";
import { verifyAuth, AuthRequest } from "../middleware/auth";
import { prisma } from "../utils/prisma";

const router = Router();

const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  parentId: z.string().uuid().optional().nullable(),
});

// ─── GET /api/categories ──────────────────────────────────────────────────────
router.get("/", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      where: { tenantId: req.user!.tenantId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        parentId: true,
        createdAt: true,
        _count: {
          select: {
            folders: { where: { isDeleted: false } },
            files: { where: { isDeleted: false } },
            children: true,
          },
        },
      },
    });
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

// ─── POST /api/categories ─────────────────────────────────────────────────────
router.post("/", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { name, parentId } = createCategorySchema.parse(req.body);

    // Validate parent belongs to this tenant
    if (parentId) {
      const parent = await prisma.category.findFirst({
        where: { id: parentId, tenantId: req.user!.tenantId },
      });
      if (!parent) {
        res.status(400).json({ error: "Parent category not found" });
        return;
      }
    }

    const category = await prisma.category.create({
      data: {
        name,
        parentId: parentId ?? null,
        tenantId: req.user!.tenantId,
      },
      select: {
        id: true,
        name: true,
        parentId: true,
        createdAt: true,
      },
    });

    res.status(201).json({ category });
  } catch (err: any) {
    if (err.name === "ZodError") {
      res.status(400).json({ error: "Invalid input", details: err.errors });
      return;
    }
    res.status(500).json({ error: "Failed to create category" });
  }
});

// ─── PATCH /api/categories/:id ────────────────────────────────────────────────
router.patch("/:id", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { name } = z
      .object({ name: z.string().min(1).max(100) })
      .parse(req.body);

    const category = await prisma.category.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });

    if (!category) {
      res.status(404).json({ error: "Category not found" });
      return;
    }

    const updated = await prisma.category.update({
      where: { id: req.params.id },
      data: { name },
      select: { id: true, name: true, parentId: true },
    });

    res.json({ category: updated });
  } catch (err: any) {
    if (err.name === "ZodError") {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    res.status(500).json({ error: "Failed to update category" });
  }
});

// ─── DELETE /api/categories/:id ───────────────────────────────────────────────
router.delete("/:id", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const category = await prisma.category.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });

    if (!category) {
      res.status(404).json({ error: "Category not found" });
      return;
    }

    // Remove category from files and folders, then delete
    await prisma.$transaction([
      prisma.file.updateMany({
        where: { categoryId: req.params.id, tenantId: req.user!.tenantId },
        data: { categoryId: null },
      }),
      prisma.folder.updateMany({
        where: { categoryId: req.params.id, tenantId: req.user!.tenantId },
        data: { categoryId: null },
      }),
      prisma.category.delete({
        where: { id: req.params.id },
      }),
    ]);

    res.json({ message: "Category deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete category" });
  }
});

// ─── GET /api/categories/:id/files ────────────────────────────────────────────
// Get all files belonging to a category
router.get(
  "/:id/files",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const category = await prisma.category.findFirst({
        where: { id: req.params.id, tenantId: req.user!.tenantId },
      });

      if (!category) {
        res.status(404).json({ error: "Category not found" });
        return;
      }

      const [files, folders] = await Promise.all([
        prisma.file.findMany({
          where: {
            categoryId: req.params.id,
            tenantId: req.user!.tenantId,
            isDeleted: false,
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            mimeType: true,
            size: true,
            storageKey: true,
            createdAt: true,
            folderId: true,
          },
        }),
        prisma.folder.findMany({
          where: {
            categoryId: req.params.id,
            tenantId: req.user!.tenantId,
            isDeleted: false,
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
        }),
      ]);

      res.json({ category, files, folders });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch category contents" });
    }
  },
);

export default router;
