import { Router, Response } from "express";
import multer from "multer";
import { v4 as uuid } from "uuid";
import { verifyAuth, AuthRequest } from "../middleware/auth";
import { prisma } from "../utils/prisma";
import {
  uploadFile,
  getFileViewUrl,
  deleteFile,
} from "../services/storage.service";

const router = Router();

// Store in memory — upload directly to storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
});

// ─── UUID validation helper ───────────────────────────────────────────────────
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isValidUUID = (val: unknown): val is string =>
  typeof val === "string" && UUID_REGEX.test(val);

// ─── GET /api/files ───────────────────────────────────────────────────────────
router.get("/", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { folderId } = req.query;

    const files = await prisma.file.findMany({
      where: {
        tenantId: req.user!.tenantId,
        folderId: isValidUUID(folderId) ? folderId : null,
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
    });

    res.json({ files });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch files" });
  }
});

// ─── GET /api/files/:id/download ──────────────────────────────────────────────
router.get(
  "/:id/download",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const file = await prisma.file.findFirst({
        where: {
          id: req.params.id,
          tenantId: req.user!.tenantId,
          isDeleted: false,
        },
      });

      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      // Get download URL from storage (local or R2)
      const downloadUrl = await getFileViewUrl(file.storageKey, 300);

      res.json({
        downloadUrl,
        name: file.name,
        mimeType: file.mimeType,
      });
    } catch (err) {
      res.status(500).json({ error: "Download failed" });
    }
  },
);

// ─── POST /api/files/upload ───────────────────────────────────────────────────
router.post(
  "/upload",
  verifyAuth,
  upload.array("file", 20),
  async (req: AuthRequest, res: Response) => {
    try {
      const files = req.files as Express.Multer.File[];
      const { folderId, categoryId } = req.body;

      if (!files || files.length === 0) {
        res.status(400).json({ error: "No files provided" });
        return;
      }

      // ── Validate folderId ─────────────────────────────────────────────────
      let resolvedFolderId: string | null = null;
      if (isValidUUID(folderId)) {
        const folder = await prisma.folder.findFirst({
          where: {
            id: folderId,
            tenantId: req.user!.tenantId,
            isDeleted: false,
          },
          select: { id: true },
        });
        if (!folder) {
          res.status(400).json({ error: "Folder not found" });
          return;
        }
        resolvedFolderId = folder.id;
      }

      // ── Validate categoryId ───────────────────────────────────────────────
      let resolvedCategoryId: string | null = null;
      if (isValidUUID(categoryId)) {
        const cat = await prisma.category.findFirst({
          where: { id: categoryId, tenantId: req.user!.tenantId },
          select: { id: true },
        });
        if (cat) resolvedCategoryId = cat.id;
      }

      const savedFiles = [];

      for (const file of files) {
        const fileUuid = uuid();
        const storageKey = `${req.user!.tenantId}/${resolvedFolderId || "root"}/${fileUuid}_${file.originalname}`;

        // ── Upload to local disk or R2 (handled by storage service) ──────────
        await uploadFile(storageKey, file.buffer, file.mimetype);

        const saved = await prisma.file.create({
          data: {
            name: file.originalname,
            storageKey,
            mimeType: file.mimetype,
            size: file.size,
            tenantId: req.user!.tenantId,
            folderId: resolvedFolderId,
            categoryId: resolvedCategoryId,
            uploadedById: req.user!.userId,
          },
        });

        savedFiles.push({
          id: saved.id,
          name: saved.name,
          mimeType: saved.mimeType,
          size: saved.size,
          createdAt: saved.createdAt,
        });
      }

      res.json({ files: savedFiles, message: "Files uploaded successfully" });
    } catch (err: any) {
      console.error("Upload error:", err);
      res.status(500).json({ error: err.message || "Upload failed" });
    }
  },
);

// ─── GET /api/files/:id ───────────────────────────────────────────────────────
router.get("/:id", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const file = await prisma.file.findFirst({
      where: {
        id: req.params.id,
        tenantId: req.user!.tenantId,
        isDeleted: false,
      },
    });

    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    // Get view URL — local path in dev, signed R2 URL in production
    const viewUrl = await getFileViewUrl(file.storageKey, 3600);

    res.json({
      file: {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
        storageKey: file.storageKey,
        createdAt: file.createdAt,
        viewUrl,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch file" });
  }
});

// ─── DELETE /api/files/:id ────────────────────────────────────────────────────
router.delete("/:id", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const file = await prisma.file.findFirst({
      where: {
        id: req.params.id,
        tenantId: req.user!.tenantId,
      },
    });

    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    // Soft delete in DB first
    await prisma.file.update({
      where: { id: req.params.id },
      data: { isDeleted: true },
    });

    // Delete from storage (local or R2)
    try {
      await deleteFile(file.storageKey);
    } catch (storageErr) {
      // Log but don't fail — DB record is already soft deleted
      console.error("Storage delete error:", storageErr);
    }

    res.json({ message: "File deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete file" });
  }
});

export default router;
