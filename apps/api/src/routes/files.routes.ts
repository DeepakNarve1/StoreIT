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
    const { userId, tenantId, role } = req.user!;

    const isPrivileged = [
      "SUPERADMIN",
      "ORG_ADMIN",
      "MANAGER",
      "EDITOR",
    ].includes(role);

    let files;

    if (isPrivileged) {
      files = await prisma.file.findMany({
        where: {
          tenantId,
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
          version: true,
        },
      });
    } else {
      // VIEWER — only files with explicit permission or uploaded by them
      const permissions = await prisma.permission.findMany({
        where: {
          resourceType: "file",
          action: { in: ["read", "write", "delete", "admin"] },
          OR: [{ grantedTo: "all" }, { grantedTo: "user", userId }],
          AND: [
            {
              OR: [
                { expiresAt: null }, // ✅ fixed
                { expiresAt: { gt: new Date() } },
              ],
            },
          ],
        },
        select: { resourceId: true },
      });

      const allowedFileIds = permissions.map((p) => p.resourceId);

      files = await prisma.file.findMany({
        where: {
          tenantId,
          folderId: isValidUUID(folderId) ? folderId : null,
          isDeleted: false,
          OR: [{ id: { in: allowedFileIds } }, { uploadedById: userId }],
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
          version: true,
        },
      });
    }

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

        const existingFile = await prisma.file.findFirst({
          where: {
            name: file.originalname,
            tenantId: req.user!.tenantId,
            folderId: resolvedFolderId,
            isDeleted: false,
          },
        });

        // Upload to storage
        await uploadFile(storageKey, file.buffer, file.mimetype);

        if (existingFile) {
          const newVersion = existingFile.version + 1;

          await prisma.fileVersion.create({
            data: {
              version: existingFile.version,
              storageKey: existingFile.storageKey,
              size: existingFile.size,
              fileId: existingFile.id,
              uploadedById: existingFile.uploadedById,
            },
          });

          const updated = await prisma.file.update({
            where: { id: existingFile.id },
            data: {
              storageKey,
              size: file.size,
              version: newVersion,
              uploadedById: req.user!.userId,
              updatedAt: new Date(),
            },
          });

          console.log(
            `📝 New version v${newVersion} for: ${file.originalname}`,
          );

          savedFiles.push({
            id: updated.id,
            name: updated.name,
            mimeType: updated.mimeType,
            size: updated.size,
            version: updated.version,
            createdAt: updated.createdAt,
            isNewVersion: true,
          });
        } else {
          const saved = await prisma.file.create({
            data: {
              name: file.originalname,
              storageKey,
              mimeType: file.mimetype,
              size: file.size,
              version: 1,
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
            version: saved.version,
            createdAt: saved.createdAt,
            isNewVersion: false,
          });
        }
      }

      res.json({ files: savedFiles, message: "Files uploaded successfully" });
    } catch (err: unknown) {
      console.error("Upload error:", err);
      const message = err instanceof Error ? err.message : "Upload failed";
      res.status(500).json({ error: message });
    }
  },
);

// ─── GET /api/files/:id ───────────────────────────────────────────────────────
router.get("/:id", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, tenantId, role } = req.user!;

    const file = await prisma.file.findFirst({
      where: {
        id: req.params.id,
        tenantId,
        isDeleted: false,
      },
    });

    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const isPrivileged = [
      "SUPERADMIN",
      "ORG_ADMIN",
      "MANAGER",
      "EDITOR",
    ].includes(role);

    if (!isPrivileged && file.uploadedById !== userId) {
      const permission = await prisma.permission.findFirst({
        where: {
          resourceType: "file",
          resourceId: file.id,
          OR: [{ grantedTo: "all" }, { grantedTo: "user", userId }],
          AND: [
            {
              OR: [
                { expiresAt: null }, // ✅ fixed
                { expiresAt: { gt: new Date() } },
              ],
            },
          ],
        },
      });

      if (!permission) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
    }

    const viewUrl = await getFileViewUrl(file.storageKey, 3600);

    res.json({
      file: {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
        version: file.version, // ✅ added
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

    await prisma.file.update({
      where: {
        id: req.params.id,
        tenantId: req.user!.tenantId, // ✅ tenant isolation added
      },
      data: { isDeleted: true },
    });

    try {
      await deleteFile(file.storageKey);
    } catch (storageErr) {
      console.error("Storage delete error:", storageErr);
    }

    res.json({ message: "File deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete file" });
  }
});

// ─── GET /api/files/:id/versions ─────────────────────────────────────────────
router.get(
  "/:id/versions",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const file = await prisma.file.findFirst({
        where: {
          id: req.params.id,
          tenantId: req.user!.tenantId,
          isDeleted: false,
        },
        include: {
          uploadedBy: { select: { name: true } },
          versions: {
            orderBy: { version: "desc" },
            include: {
              uploadedBy: { select: { name: true } },
            },
          },
        },
      });

      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      const allVersions = [
        {
          id: "current",
          version: file.version,
          storageKey: file.storageKey,
          size: file.size,
          createdAt: file.updatedAt,
          uploadedBy: file.uploadedBy,
          isCurrent: true,
        },
        ...file.versions.map((v) => ({ ...v, isCurrent: false })),
      ];

      res.json({ versions: allVersions, currentVersion: file.version });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch versions" });
    }
  },
);

// ─── POST /api/files/:id/versions/:versionId/restore ─────────────────────────
router.post(
  "/:id/versions/:versionId/restore",
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

      const versionRecord = await prisma.fileVersion.findFirst({
        where: {
          id: req.params.versionId,
          fileId: file.id,
        },
      });

      if (!versionRecord) {
        res.status(404).json({ error: "Version not found" });
        return;
      }

      await prisma.fileVersion.create({
        data: {
          version: file.version,
          storageKey: file.storageKey,
          size: file.size,
          fileId: file.id,
          uploadedById: file.uploadedById,
        },
      });

      const newVersion = file.version + 1;
      await prisma.file.update({
        where: { id: file.id },
        data: {
          storageKey: versionRecord.storageKey,
          size: versionRecord.size,
          version: newVersion,
          updatedAt: new Date(),
        },
      });

      res.json({ message: `Restored to version ${versionRecord.version}` });
    } catch (err) {
      res.status(500).json({ error: "Failed to restore version" });
    }
  },
);

export default router;
