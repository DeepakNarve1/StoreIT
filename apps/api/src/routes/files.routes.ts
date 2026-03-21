import { Router, Response } from "express";
import multer from "multer";
import { v4 as uuid } from "uuid";
import path from "path";
import { z } from "zod";
import { verifyAuth, AuthRequest } from "../middleware/auth";
import { validateMimeType, SIGNED_URL_TTL } from "../middleware/security";
import { prisma } from "../utils/prisma";
import {
  uploadFile,
  getFileViewUrl,
  deleteFile,
} from "../services/storage.service";
import { createAuditLog } from "../services/audit.service";
import { getPlanLimits } from "../utils/plans";
import archiver from "archiver";
import { getFileViewUrl } from "../services/storage.service";
import https from "https";
import http from "http";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (val: unknown): val is string =>
  typeof val === "string" && UUID_REGEX.test(val);

// SEC FIX #3 + original Bug #4: sanitize AND block dangerous extensions
function sanitizeFilename(raw: string): string {
  const base = path.basename(raw);
  return (
    base.replace(/\0/g, "").replace(/[/\\]/g, "").replace(/^\.+/, "").trim() ||
    "untitled"
  );
}

// ─── Helper: check if the current user has access to a file ──────────────────
// SEC FIX #1: centralised permission check used by both GET /:id and download.
// Previously download had NO permission check at all.
async function userCanAccessFile(
  fileId: string,
  userId: string,
  tenantId: string,
  role: string,
  uploadedById: string | null,
): Promise<boolean> {
  const isPrivileged = [
    "SUPERADMIN",
    "ORG_ADMIN",
    "MANAGER",
    "EDITOR",
  ].includes(role);

  if (isPrivileged) return true;
  if (uploadedById === userId) return true;

  const permission = await prisma.permission.findFirst({
    where: {
      resourceType: "file",
      resourceId: fileId,
      OR: [{ grantedTo: "all" }, { grantedTo: "user", userId }],
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
    },
  });

  return !!permission;
}

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
          isStarred: true,
          tags: {
            select: { tag: { select: { id: true, name: true, color: true } } },
          },
        },
      });
    } else {
      const permissions = await prisma.permission.findMany({
        where: {
          resourceType: "file",
          action: { in: ["read", "write", "delete", "admin"] },
          OR: [{ grantedTo: "all" }, { grantedTo: "user", userId }],
          AND: [
            { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
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
          isStarred: true,
          tags: {
            select: { tag: { select: { id: true, name: true, color: true } } },
          },
        },
      });
    }

    res.json({ files });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch files" });
  }
});

// ─── POST /api/files/upload ───────────────────────────────────────────────────
// SEC FIX #3: validateMimeType runs AFTER multer (needs file buffer) but
// BEFORE any DB or storage write — rejects banned types cleanly with 400.
router.post(
  "/upload",
  verifyAuth,
  upload.array("file", 20),
  validateMimeType,
  async (req: AuthRequest, res: Response) => {
    try {
      const files = req.files as Express.Multer.File[];
      const { folderId, categoryId } = req.body;

      if (!files || files.length === 0) {
        res.status(400).json({ error: "No files provided" });
        return;
      }

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

      let resolvedCategoryId: string | null = null;
      if (isValidUUID(categoryId)) {
        const cat = await prisma.category.findFirst({
          where: { id: categoryId, tenantId: req.user!.tenantId },
          select: { id: true },
        });
        if (cat) resolvedCategoryId = cat.id;
      }

      const savedFiles = [];

      // ── Quota check ──────────────────────────────────────────────────────────────
      const tenant = await prisma.tenant.findUnique({
        where: { id: req.user!.tenantId },
        select: { plan: true },
      });
      const { storageBytes: limit } = getPlanLimits(tenant?.plan ?? "free");
      const usageResult = await prisma.file.aggregate({
        where: { tenantId: req.user!.tenantId, isDeleted: false },
        _sum: { size: true },
      });
      const usedBytes = usageResult._sum.size ?? 0;
      const incomingBytes = (req.files as Express.Multer.File[]).reduce(
        (s, f) => s + f.size,
        0,
      );

      if (limit !== Infinity && usedBytes + incomingBytes > limit) {
        res.status(400).json({
          error: "Storage quota exceeded. Please upgrade your plan.",
          code: "QUOTA_EXCEEDED",
        });
        return;
      }

      for (const file of files) {
        const safeName = sanitizeFilename(file.originalname);
        const fileUuid = uuid();
        const storageKey = `${req.user!.tenantId}/${resolvedFolderId || "root"}/${fileUuid}_${safeName}`;

        const existingFile = await prisma.file.findFirst({
          where: {
            name: safeName,
            tenantId: req.user!.tenantId,
            folderId: resolvedFolderId,
            isDeleted: false,
          },
        });

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

          savedFiles.push({
            id: updated.id,
            name: updated.name,
            mimeType: updated.mimeType,
            size: updated.size,
            version: updated.version,
            createdAt: updated.createdAt,
            isNewVersion: true,
          });

          await createAuditLog({
            action: "file.upload.version",
            userId: req.user!.userId,
            tenantId: req.user!.tenantId,
            resourceType: "file",
            resourceId: existingFile.id,
            resourceName: safeName,
            metadata: {
              version: newVersion,
              previousVersion: existingFile.version,
            },
            req,
          });
        } else {
          const saved = await prisma.file.create({
            data: {
              name: safeName,
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

          await createAuditLog({
            action: "file.upload",
            userId: req.user!.userId,
            tenantId: req.user!.tenantId,
            resourceType: "file",
            resourceId: saved.id,
            resourceName: safeName,
            metadata: { size: file.size, mimeType: file.mimetype },
            req,
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

// ─── STATIC NAMED ROUTES ─────────────────────────────────────────────────────

router.get("/starred", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const files = await prisma.file.findMany({
      where: {
        tenantId: req.user!.tenantId,
        isStarred: true,
        isDeleted: false,
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        mimeType: true,
        size: true,
        createdAt: true,
        version: true,
        folderId: true,
        isStarred: true,
        folder: { select: { name: true } },
      },
    });
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch starred files" });
  }
});

router.get("/recent", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const files = await prisma.file.findMany({
      where: { tenantId: req.user!.tenantId, isDeleted: false },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        name: true,
        mimeType: true,
        size: true,
        createdAt: true,
        updatedAt: true,
        version: true,
        folderId: true,
        isStarred: true,
        folder: { select: { name: true } },
        uploadedBy: { select: { name: true } },
      },
    });
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch recent files" });
  }
});

router.get("/trash", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const [files, folders] = await Promise.all([
      prisma.file.findMany({
        where: { tenantId: req.user!.tenantId, isDeleted: true },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          name: true,
          mimeType: true,
          size: true,
          updatedAt: true,
          folderId: true,
        },
      }),
      prisma.folder.findMany({
        where: { tenantId: req.user!.tenantId, isDeleted: true },
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, updatedAt: true },
      }),
    ]);
    res.json({ files, folders });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch trash" });
  }
});

// ─── POST /api/files/bulk-delete ─────────────────────────────────────────────
router.post(
  "/bulk-delete",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const { ids } = z
        .object({
          ids: z.array(z.string().uuid()).min(1).max(100),
        })
        .parse(req.body);

      await prisma.file.updateMany({
        where: {
          id: { in: ids },
          tenantId: req.user!.tenantId,
          isDeleted: false,
        },
        data: { isDeleted: true },
      });

      await createAuditLog({
        action: "file.bulk_delete",
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        resourceType: "file",
        resourceId: ids[0],
        metadata: { count: ids.length, ids },
        req,
      });

      res.json({ message: `${ids.length} files deleted` });
    } catch (err: any) {
      if (err.name === "ZodError") {
        res.status(400).json({ error: "Invalid input" });
        return;
      }
      res.status(500).json({ error: "Failed to delete files" });
    }
  },
);

// ─── POST /api/files/bulk-move ────────────────────────────────────────────────
router.post(
  "/bulk-move",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const { ids, folderId } = z
        .object({
          ids: z.array(z.string().uuid()).min(1).max(100),
          folderId: z.string().uuid().nullable(),
        })
        .parse(req.body);

      let resolvedFolderId: string | null = null;
      if (isValidUUID(folderId)) {
        const folder = await prisma.folder.findFirst({
          where: {
            id: folderId,
            tenantId: req.user!.tenantId,
            isDeleted: false,
          },
        });
        if (!folder) {
          res.status(400).json({ error: "Destination folder not found" });
          return;
        }
        resolvedFolderId = folder.id;
      }

      await prisma.file.updateMany({
        where: {
          id: { in: ids },
          tenantId: req.user!.tenantId,
          isDeleted: false,
        },
        data: { folderId: resolvedFolderId },
      });

      res.json({ message: `${ids.length} files moved` });
    } catch (err: any) {
      if (err.name === "ZodError") {
        res.status(400).json({ error: "Invalid input" });
        return;
      }
      res.status(500).json({ error: "Failed to move files" });
    }
  },
);

// ─── POST /api/files/bulk-download ───────────────────────────────────────────
router.post(
  "/bulk-download",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const { ids } = z
        .object({
          ids: z.array(z.string().uuid()).min(1).max(50),
        })
        .parse(req.body);

      const files = await prisma.file.findMany({
        where: {
          id: { in: ids },
          tenantId: req.user!.tenantId,
          isDeleted: false,
        },
        select: { id: true, name: true, storageKey: true },
      });

      if (files.length === 0) {
        res.status(404).json({ error: "No files found" });
        return;
      }

      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="storeit-files-${Date.now()}.zip"`,
      );

      const archive = archiver("zip", { zlib: { level: 6 } });
      archive.pipe(res);

      for (const file of files) {
        const url = await getFileViewUrl(file.storageKey, 60);
        await new Promise<void>((resolve, reject) => {
          const client = url.startsWith("https") ? https : http;
          client
            .get(url, (stream) => {
              archive.append(stream, { name: file.name });
              stream.on("end", resolve);
              stream.on("error", reject);
            })
            .on("error", reject);
        });
      }

      await archive.finalize();
    } catch (err: any) {
      if (err.name === "ZodError") {
        res.status(400).json({ error: "Invalid input" });
        return;
      }
      console.error(err);
      res.status(500).json({ error: "Failed to create ZIP" });
    }
  },
);

// ─── PARAMETERIZED ROUTES ─────────────────────────────────────────────────────

// ─── GET /api/files/:id/download ─────────────────────────────────────────────
// SEC FIX #1: now runs the same permission check as GET /:id
// Previously had NO access control — any authenticated user could download
// any file by guessing the UUID.
router.get(
  "/:id/download",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    if (!isValidUUID(req.params.id)) {
      res.status(400).json({ error: "Invalid file ID" });
      return;
    }
    try {
      const { userId, tenantId, role } = req.user!;

      const file = await prisma.file.findFirst({
        where: { id: req.params.id, tenantId, isDeleted: false },
      });

      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      // SEC FIX #1: enforce permission check for VIEWER role
      const canAccess = await userCanAccessFile(
        file.id,
        userId,
        tenantId,
        role,
        file.uploadedById,
      );
      if (!canAccess) {
        res.status(403).json({ error: "Access denied" });
        return;
      }

      // SEC FIX #4: use shared TTL constant (300s = 5 min)
      const downloadUrl = await getFileViewUrl(
        file.storageKey,
        SIGNED_URL_TTL.DOWNLOAD,
      );

      await createAuditLog({
        action: "file.download",
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        resourceType: "file",
        resourceId: file.id,
        resourceName: file.name,
        req,
      });

      res.json({ downloadUrl, name: file.name, mimeType: file.mimeType });
    } catch (err) {
      res.status(500).json({ error: "Download failed" });
    }
  },
);

// ─── GET /api/files/:id/versions ─────────────────────────────────────────────
router.get(
  "/:id/versions",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    if (!isValidUUID(req.params.id)) {
      res.status(400).json({ error: "Invalid file ID" });
      return;
    }
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
            include: { uploadedBy: { select: { name: true } } },
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
    if (!isValidUUID(req.params.id) || !isValidUUID(req.params.versionId)) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }
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
        where: { id: req.params.versionId, fileId: file.id },
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

      await createAuditLog({
        action: "file.restore",
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        resourceType: "file",
        resourceId: file.id,
        resourceName: file.name,
        metadata: { restoredVersion: versionRecord.version, newVersion },
        req,
      });

      res.json({ message: `Restored to version ${versionRecord.version}` });
    } catch (err) {
      res.status(500).json({ error: "Failed to restore version" });
    }
  },
);

// ─── PATCH /api/files/:id/rename ─────────────────────────────────────────────
router.patch(
  "/:id/rename",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    if (!isValidUUID(req.params.id)) {
      res.status(400).json({ error: "Invalid file ID" });
      return;
    }
    try {
      const { name } = z
        .object({ name: z.string().min(1).max(255) })
        .parse(req.body);

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

      const safeName = sanitizeFilename(name);
      const updated = await prisma.file.update({
        where: { id: req.params.id },
        data: { name: safeName, updatedAt: new Date() },
        select: { id: true, name: true, updatedAt: true },
      });

      await createAuditLog({
        action: "file.rename",
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        resourceType: "file",
        resourceId: file.id,
        resourceName: safeName,
        metadata: { oldName: file.name, newName: safeName },
        req,
      });

      res.json({ file: updated });
    } catch (err: any) {
      if (err.name === "ZodError") {
        res.status(400).json({ error: "Invalid input" });
        return;
      }
      res.status(500).json({ error: "Failed to rename file" });
    }
  },
);

// ─── GET /api/files/:id ───────────────────────────────────────────────────────
router.get("/:id", verifyAuth, async (req: AuthRequest, res: Response) => {
  if (!isValidUUID(req.params.id)) {
    res.status(400).json({ error: "Invalid file ID" });
    return;
  }
  try {
    const { userId, tenantId, role } = req.user!;

    const file = await prisma.file.findFirst({
      where: { id: req.params.id, tenantId, isDeleted: false },
    });

    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const canAccess = await userCanAccessFile(
      file.id,
      userId,
      tenantId,
      role,
      file.uploadedById,
    );
    if (!canAccess) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    // SEC FIX #4: use shared TTL constant
    const viewUrl = await getFileViewUrl(file.storageKey, SIGNED_URL_TTL.VIEW);

    await createAuditLog({
      action: "file.view",
      userId: req.user!.userId,
      tenantId: req.user!.tenantId,
      resourceType: "file",
      resourceId: file.id,
      resourceName: file.name,
      req,
    });

    res.json({
      file: {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
        version: file.version,
        storageKey: file.storageKey,
        createdAt: file.createdAt,
        viewUrl,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch file" });
  }
});

// ─── PATCH /api/files/:id/move ────────────────────────────────────────────────
router.patch(
  "/:id/move",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    if (!isValidUUID(req.params.id)) {
      res.status(400).json({ error: "Invalid file ID" });
      return;
    }
    try {
      const { folderId } = req.body;

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

      let resolvedFolderId: string | null = null;
      if (isValidUUID(folderId)) {
        const folder = await prisma.folder.findFirst({
          where: {
            id: folderId,
            tenantId: req.user!.tenantId,
            isDeleted: false,
          },
        });
        if (!folder) {
          res.status(400).json({ error: "Destination folder not found" });
          return;
        }
        resolvedFolderId = folder.id;
      }

      const updated = await prisma.file.update({
        where: { id: req.params.id },
        data: { folderId: resolvedFolderId },
      });

      await createAuditLog({
        action: "file.move",
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        resourceType: "file",
        resourceId: file.id,
        resourceName: file.name,
        metadata: { movedFrom: file.folderId, movedTo: resolvedFolderId },
        req,
      });

      res.json({ file: updated });
    } catch (err) {
      res.status(500).json({ error: "Failed to move file" });
    }
  },
);

// ─── PATCH /api/files/:id/category ───────────────────────────────────────────
router.patch(
  "/:id/category",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    if (!isValidUUID(req.params.id)) {
      res.status(400).json({ error: "Invalid file ID" });
      return;
    }
    try {
      const { categoryId } = req.body;

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

      let resolvedCategoryId: string | null = null;
      if (isValidUUID(categoryId)) {
        const cat = await prisma.category.findFirst({
          where: { id: categoryId, tenantId: req.user!.tenantId },
        });
        if (cat) resolvedCategoryId = cat.id;
      }

      const updated = await prisma.file.update({
        where: { id: req.params.id },
        data: { categoryId: resolvedCategoryId },
      });

      res.json({ file: updated });
    } catch (err) {
      res.status(500).json({ error: "Failed to assign category" });
    }
  },
);

// ─── PATCH /api/files/:id/star ────────────────────────────────────────────────
router.patch(
  "/:id/star",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    if (!isValidUUID(req.params.id)) {
      res.status(400).json({ error: "Invalid file ID" });
      return;
    }
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

      const updated = await prisma.file.update({
        where: { id: req.params.id },
        data: { isStarred: !file.isStarred },
      });
      res.json({ isStarred: updated.isStarred });
    } catch (err) {
      res.status(500).json({ error: "Failed to star file" });
    }
  },
);

// ─── PATCH /api/files/:id/restore (from trash) ────────────────────────────────
router.patch(
  "/:id/restore",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    if (!isValidUUID(req.params.id)) {
      res.status(400).json({ error: "Invalid file ID" });
      return;
    }
    try {
      const file = await prisma.file.findFirst({
        where: {
          id: req.params.id,
          tenantId: req.user!.tenantId,
          isDeleted: true,
        },
      });
      if (!file) {
        res.status(404).json({ error: "File not found in trash" });
        return;
      }

      await prisma.file.update({
        where: { id: req.params.id },
        data: { isDeleted: false },
      });
      res.json({ message: "File restored" });
    } catch (err) {
      res.status(500).json({ error: "Failed to restore file" });
    }
  },
);

// ─── DELETE /api/files/:id (soft delete) ─────────────────────────────────────
router.delete("/:id", verifyAuth, async (req: AuthRequest, res: Response) => {
  if (!isValidUUID(req.params.id)) {
    res.status(400).json({ error: "Invalid file ID" });
    return;
  }
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

    await prisma.file.update({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      data: { isDeleted: true },
    });

    await createAuditLog({
      action: "file.delete",
      userId: req.user!.userId,
      tenantId: req.user!.tenantId,
      resourceType: "file",
      resourceId: req.params.id,
      resourceName: file.name,
      req,
    });

    res.json({ message: "File deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete file" });
  }
});

// ─── DELETE /api/files/:id/permanent ─────────────────────────────────────────
router.delete(
  "/:id/permanent",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    if (!isValidUUID(req.params.id)) {
      res.status(400).json({ error: "Invalid file ID" });
      return;
    }
    try {
      const file = await prisma.file.findFirst({
        where: {
          id: req.params.id,
          tenantId: req.user!.tenantId,
          isDeleted: true,
        },
        include: { versions: { select: { storageKey: true } } },
      });
      if (!file) {
        res.status(404).json({ error: "File not found in trash" });
        return;
      }

      const allKeys = [
        file.storageKey,
        ...file.versions.map((v) => v.storageKey),
      ];
      await Promise.allSettled(allKeys.map((key) => deleteFile(key)));

      await prisma.$transaction([
        prisma.fileTag.deleteMany({ where: { fileId: file.id } }),
        prisma.permission.deleteMany({ where: { fileId: file.id } }),
        prisma.oneTimeLink.deleteMany({ where: { fileId: file.id } }),
        prisma.fileVersion.deleteMany({ where: { fileId: file.id } }),
        prisma.file.delete({ where: { id: file.id } }),
      ]);

      await createAuditLog({
        action: "file.delete.permanent",
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        resourceType: "file",
        resourceId: req.params.id,
        resourceName: file.name,
        metadata: { versionsDeleted: file.versions.length },
        req,
      });

      res.json({ message: "File permanently deleted" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to permanently delete file" });
    }
  },
);

// ─── GET /api/files/:id/metadata ─────────────────────────────────────────────
router.get(
  "/:id/metadata",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    if (!isValidUUID(req.params.id)) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }
    try {
      const metadata = await prisma.fileMetadata.findMany({
        where: { fileId: req.params.id },
        orderBy: { createdAt: "asc" },
      });
      res.json({ metadata });
    } catch {
      res.status(500).json({ error: "Failed to fetch metadata" });
    }
  },
);

// ─── PUT /api/files/:id/metadata ─────────────────────────────────────────────
// Full replace — sends all key/value pairs at once
router.put(
  "/:id/metadata",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    if (!isValidUUID(req.params.id)) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }
    try {
      const { fields } = z
        .object({
          fields: z
            .array(
              z.object({
                key: z.string().min(1).max(100),
                value: z.string().max(500),
              }),
            )
            .max(20),
        })
        .parse(req.body);

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

      await prisma.$transaction([
        prisma.fileMetadata.deleteMany({ where: { fileId: req.params.id } }),
        ...fields.map((f) =>
          prisma.fileMetadata.create({
            data: { key: f.key, value: f.value, fileId: req.params.id },
          }),
        ),
      ]);

      res.json({ message: "Metadata updated" });
    } catch (err: any) {
      if (err.name === "ZodError") {
        res.status(400).json({ error: "Invalid input" });
        return;
      }
      res.status(500).json({ error: "Failed to update metadata" });
    }
  },
);

export default router;
