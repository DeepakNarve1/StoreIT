import { Router, Response } from "express";
import { z } from "zod";
import { verifyAuth, AuthRequest } from "../middleware/auth";
import { prisma } from "../utils/prisma";

const router = Router();

// ─── GET /api/tags ────────────────────────────────────────────────────────────
router.get("/", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const tags = await prisma.tag.findMany({
      where: { tenantId: req.user!.tenantId },
      orderBy: { name: "asc" },
      include: { _count: { select: { files: true } } },
    });
    res.json({ tags });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch tags" });
  }
});

// ─── POST /api/tags ───────────────────────────────────────────────────────────
router.post("/", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { name, color } = z
      .object({
        name: z.string().min(1).max(50),
        color: z.string().default("#3B8BD4"),
      })
      .parse(req.body);

    const tag = await prisma.tag.upsert({
      where: { name_tenantId: { name, tenantId: req.user!.tenantId } },
      update: {},
      create: { name, color, tenantId: req.user!.tenantId },
    });
    res.status(201).json({ tag });
  } catch (err: any) {
    if (err.name === "ZodError") {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    res.status(500).json({ error: "Failed to create tag" });
  }
});

// ─── POST /api/tags/:id/files/:fileId ─────────────────────────────────────────
router.post(
  "/:id/files/:fileId",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const file = await prisma.file.findFirst({
        where: {
          id: req.params.fileId,
          tenantId: req.user!.tenantId,
          isDeleted: false,
        },
      });
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      const tag = await prisma.tag.findFirst({
        where: { id: req.params.id, tenantId: req.user!.tenantId },
      });
      if (!tag) {
        res.status(404).json({ error: "Tag not found" });
        return;
      }

      await prisma.fileTag.upsert({
        where: { fileId_tagId: { fileId: file.id, tagId: tag.id } },
        update: {},
        create: { fileId: file.id, tagId: tag.id },
      });
      res.json({ message: "Tag assigned" });
    } catch (err) {
      res.status(500).json({ error: "Failed to assign tag" });
    }
  },
);

// ─── DELETE /api/tags/:id/files/:fileId ───────────────────────────────────────
router.delete(
  "/:id/files/:fileId",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      await prisma.fileTag.delete({
        where: {
          fileId_tagId: { fileId: req.params.fileId, tagId: req.params.id },
        },
      });
      res.json({ message: "Tag removed" });
    } catch (err) {
      res.status(500).json({ error: "Failed to remove tag" });
    }
  },
);

// ─── GET /api/tags/:id/files ──────────────────────────────────────────────────
router.get(
  "/:id/files",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const tag = await prisma.tag.findFirst({
        where: { id: req.params.id, tenantId: req.user!.tenantId },
      });
      if (!tag) {
        res.status(404).json({ error: "Tag not found" });
        return;
      }

      const files = await prisma.file.findMany({
        where: {
          tenantId: req.user!.tenantId,
          isDeleted: false,
          tags: { some: { tagId: req.params.id } },
        },
        select: {
          id: true,
          name: true,
          mimeType: true,
          size: true,
          createdAt: true,
          version: true,
          folder: { select: { name: true } },
        },
      });
      res.json({ tag, files });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch tag files" });
    }
  },
);

// ─── DELETE /api/tags/:id ─────────────────────────────────────────────────────
router.delete("/:id", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const tag = await prisma.tag.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!tag) {
      res.status(404).json({ error: "Tag not found" });
      return;
    }

    await prisma.fileTag.deleteMany({ where: { tagId: req.params.id } });
    await prisma.tag.delete({ where: { id: req.params.id } });
    res.json({ message: "Tag deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete tag" });
  }
});

export default router;
