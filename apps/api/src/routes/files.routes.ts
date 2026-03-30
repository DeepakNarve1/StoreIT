import { Router, Response } from "express";
import multer from "multer";
import { v4 as uuid } from "uuid";
import path from "path";
import { z } from "zod";
import { validateMimeType, SIGNED_URL_TTL } from "../middleware/security";
import { prisma } from "../utils/prisma";
import {
  uploadFile,
  getFileViewUrl,
  deleteFile,
} from "../services/storage.service";
import { createAuditLog } from "../services/audit.service";
import { cancelActiveWorkflowForFile } from "../services/workflow.service";
import { getPlanLimits } from "../utils/plans";
import { getEffectiveRoleProfileForUser } from "../services/role-profiles.service";
import archiver from "archiver";
import https from "https";
import http from "http";
import { verifyAuth, AuthRequest, requireRole } from "../middleware/auth";
import { userHasCapability } from "./permissions.routes";
import {
  userCanAccessFile,
  userHasFilePermission,
} from "../services/file-access.service";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (val: unknown): val is string =>
  typeof val === "string" && UUID_REGEX.test(val);

function sanitizeFilename(raw: string): string {
  const base = path.basename(raw);
  return (
    base.replace(/\0/g, "").replace(/[/\\]/g, "").replace(/^\.+/, "").trim() ||
    "untitled"
  );
}

// ─── Helper: enforce lock — returns true if the request should be blocked ────
// Managers and above can always bypass locks.
// The locker themselves can also bypass (so they can unlock or edit their own lock).
function isBlockedByLock(
  file: { isLocked: boolean; lockedById: string | null },
  userId: string,
  role: string,
  action?: "delete" | "edit",
): boolean {
  if (!file.isLocked) return false;
  const isPrivileged = ["SUPERADMIN", "ORG_ADMIN", "MANAGER"].includes(role);
  if (isPrivileged) return false;

  if (action === "delete") return true; // Locker cannot bypass lock for delete.

  if (file.lockedById === userId) return false;
  return true;
}

// ─── Shared file select fields ────────────────────────────────────────────────
const fileSelect = {
  id: true,
  name: true,
  mimeType: true,
  size: true,
  storageKey: true,
  createdAt: true,
  folderId: true,
  version: true,
  isStarred: true,
  isLocked: true,
  lockedById: true,
  approvalStatus: true,
  approvalNote: true,
  approvedAt: true,
  approvedBy: { select: { name: true } },
  activeWorkflowId: true,
  currentStepOrder: true,
  tags: {
    select: { tag: { select: { id: true, name: true, color: true } } },
  },
} as const;

// ─── GET /api/files ───────────────────────────────────────────────────────────
router.get("/", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { folderId, includeAll } = req.query;
    const { userId, tenantId, role } = req.user!;
    const roleContext = await getEffectiveRoleProfileForUser(userId);
    const includeAllRaw = String(includeAll ?? "").toLowerCase();
    const includeAllFiles =
      includeAllRaw === "1" || includeAllRaw === "true";
    const folderFilter = includeAllFiles
      ? undefined
      : isValidUUID(folderId)
        ? folderId
        : null;

    const isPrivileged =
      roleContext?.baseRole === "SUPERADMIN" ||
      (roleContext?.baseRole !== "VIEWER" && roleContext?.capabilities.see_files);

    let files;

    if (isPrivileged) {
      files = await prisma.file.findMany({
        where: {
          tenantId,
          folderId: folderFilter,
          isDeleted: false,
        },
        orderBy: { createdAt: "desc" },
        select: fileSelect,
      });
    } else {
      // Collect file IDs the user can access:
      // 1. Direct file-level permissions
      const filePerms = await prisma.permission.findMany({
        where: {
          resourceType: "file",
          action: { in: ["read", "write", "delete", "admin"] },
          OR: [
            { grantedTo: "all" },
            { grantedTo: "user", userId },
            ...(await prisma.user
              .findUnique({
                where: { id: userId },
                select: { departmentId: true },
              })
              .then((u) =>
                u?.departmentId
                  ? [{ grantedTo: "department", departmentId: u.departmentId }]
                  : [],
              )),
          ],
          AND: [
            { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
            { file: { tenantId } },
          ],
        },
        select: { resourceId: true },
      });

      // 2. Folder-level permissions → include all files inside those folders
      const folderPerms = await prisma.permission.findMany({
        where: {
          resourceType: "folder",
          action: { in: ["read", "write", "delete", "admin"] },
          OR: [
            { grantedTo: "all" },
            { grantedTo: "user", userId },
            ...(await prisma.user
              .findUnique({
                where: { id: userId },
                select: { departmentId: true },
              })
              .then((u) =>
                u?.departmentId
                  ? [{ grantedTo: "department", departmentId: u.departmentId }]
                  : [],
              )),
          ],
          AND: [
            { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
            { folder: { tenantId } },
          ],
        },
        select: { resourceId: true },
      });

      const allowedFileIds = filePerms.map((p) => p.resourceId);
      const allowedFolderIds = folderPerms.map((p) => p.resourceId);

      files = await prisma.file.findMany({
        where: {
          tenantId,
          folderId: folderFilter,
          isDeleted: false,
          OR: [
            { id: { in: allowedFileIds } },
            { uploadedById: userId },
            ...(allowedFolderIds.length > 0
              ? [{ folderId: { in: allowedFolderIds } }]
              : []),
          ],
        },
        orderBy: { createdAt: "desc" },
        select: fileSelect,
      });
    }

    // ─── FolderIT-style "missing required metadata" indicator ─────────────
    // For each returned file, compute how many required default metadata
    // fields are missing (recursive fields apply to descendants).
    const fileIds = files.map((f) => f.id);
    const distinctFolderIds = Array.from(
      new Set(files.map((f) => f.folderId).filter((id): id is string => !!id)),
    );

    if (fileIds.length > 0 && distinctFolderIds.length > 0) {
      const folderChainCache = new Map<
        string,
        { id: string; isSelf: boolean }[]
      >();

      const getFolderChain = async (folderId: string) => {
        const cached = folderChainCache.get(folderId);
        if (cached) return cached;
        const chain: { id: string; isSelf: boolean }[] = [];
        let current: string | null = folderId;
        let depth = 0;
        while (current && depth < 50) {
          chain.push({ id: current, isSelf: depth === 0 });
          const parentFolder: { parentId: string | null } | null =
            await prisma.folder.findFirst({
              where: { id: current, tenantId },
              select: { parentId: true },
            });
          current = parentFolder?.parentId ?? null;
          depth++;
        }
        folderChainCache.set(folderId, chain);
        return chain;
      };

      const chains = await Promise.all(
        distinctFolderIds.map((id) => getFolderChain(id)),
      );

      const allFolderIds = Array.from(new Set(chains.flat().map((c) => c.id)));

      let defs: Array<{
        folderId: string;
        key: string;
        type: string;
        required: boolean;
        recursive: boolean;
      }> = [];
      try {
        defs = await prisma.folderMetadataField.findMany({
          where: { tenantId, folderId: { in: allFolderIds } },
          select: {
            folderId: true,
            key: true,
            type: true,
            required: true,
            recursive: true,
          },
        });
      } catch {
        // Safety fallback: if DB migration for folder_metadata_fields
        // hasn't been applied yet, don't block file listing.
        defs = [];
      }

      const defsByFolder = new Map<string, typeof defs>();
      for (const d of defs) {
        const arr = defsByFolder.get(d.folderId) ?? [];
        arr.push(d);
        defsByFolder.set(d.folderId, arr);
      }

      const metaRecords = await prisma.fileMetadata.findMany({
        where: { fileId: { in: fileIds } },
        select: { fileId: true, key: true, value: true },
      });

      const metaByFileKey = new Map<string, Map<string, string>>();
      for (const m of metaRecords) {
        const fId = m.fileId;
        const keyLower = m.key.toLowerCase();
        if (!metaByFileKey.has(fId)) metaByFileKey.set(fId, new Map());
        metaByFileKey.get(fId)!.set(keyLower, m.value);
      }

      const requiredForFolder = new Map<
        string,
        Map<string, { required: boolean; type: string; key: string }>
      >();

      // Precompute required key sets per folderId (so files in same folder reuse).
      for (const folderId of distinctFolderIds) {
        const chain = await getFolderChain(folderId);
        const keyToField = new Map<
          string,
          { required: boolean; type: string; key: string }
        >();

        for (const ref of chain) {
          const folderDefs = defsByFolder.get(ref.id) ?? [];
          for (const fd of folderDefs) {
            if (!fd.required) continue;
            if (!ref.isSelf && !fd.recursive) continue;
            const lk = fd.key.toLowerCase();
            if (keyToField.has(lk)) continue; // nearest wins
            keyToField.set(lk, { required: true, type: fd.type, key: fd.key });
          }
        }
        requiredForFolder.set(folderId, keyToField);
      }

      // Attach missing info into each file object.
      for (const file of files) {
        const folderId = file.folderId;
        if (!folderId) {
          (file as any).metaRequiredMissingCount = 0;
          (file as any).metaRequiredMissingKeys = [];
          continue;
        }

        const requiredKeyToField = requiredForFolder.get(folderId);
        const requiredKeys = Array.from(requiredKeyToField?.keys() ?? []);
        const metaForFile =
          metaByFileKey.get(file.id) ?? new Map<string, string>();
        const missingKeys = requiredKeys.filter((k) => {
          const v = metaForFile.get(k);
          return !v || !String(v).trim();
        });

        (file as any).metaRequiredMissingCount = missingKeys.length;
        (file as any).metaRequiredMissingKeys = missingKeys;
      }
    }

    res.json({ files });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch files" });
  }
});

// ─── POST /api/files/upload ───────────────────────────────────────────────────
router.post(
  "/upload",
  verifyAuth,
  upload.array("file", 20),
  validateMimeType,
  async (req: AuthRequest, res: Response) => {
    try {
      const files = req.files as Express.Multer.File[];
      const { folderId, categoryId } = req.body;
      const { userId, role } = req.user!;
      const roleContext = await getEffectiveRoleProfileForUser(userId);
      const isPrivileged =
        roleContext?.baseRole === "SUPERADMIN" ||
        (roleContext?.baseRole !== "VIEWER" &&
          roleContext?.capabilities.add_files);

      // VIEWERs can only upload into folders they have write permission on
      if (!isPrivileged) {
        if (!isValidUUID(folderId)) {
          res
            .status(403)
            .json({ error: "You don't have permission to upload files here." });
          return;
        }
        const canDropFiles = await userHasCapability(
          userId,
          req.user!.tenantId,
          role,
          "folder",
          folderId,
          "add_files",
        );
        const perm = await prisma.permission.findFirst({
          where: {
            resourceType: "folder",
            resourceId: folderId,
            OR: [{ grantedTo: "all" }, { grantedTo: "user", userId }],
            AND: [
              { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
            ],
          },
        });
        const hasCoarseWrite =
          perm && ["write", "delete", "admin"].includes(perm.action);

        if (!canDropFiles && !hasCoarseWrite) {
          res
            .status(403)
            .json({ error: "You don't have permission to upload files here." });
          return;
        }
      }

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

      // ── Quota check ───────────────────────────────────────────────────────
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

        // ── LOCK GUARD: block uploading a new version over a locked file ──
        if (
          existingFile &&
          isBlockedByLock(existingFile, req.user!.userId, req.user!.role)
        ) {
          res.status(423).json({
            error: `"${safeName}" is locked and cannot be overwritten.`,
            code: "FILE_LOCKED",
          });
          return;
        }

        // Version safety guard: keep file type consistent across versions.
        // Prevents cases like uploading a PDF over an existing PNG file name.
        if (existingFile) {
          const currentMime = String(existingFile.mimeType || "")
            .toLowerCase()
            .split(";")[0];
          const incomingMime = String(file.mimetype || "")
            .toLowerCase()
            .split(";")[0];
          if (currentMime && incomingMime && currentMime !== incomingMime) {
            res.status(400).json({
              error: `Version type mismatch for "${safeName}". Existing type is ${currentMime}, incoming is ${incomingMime}.`,
              code: "VERSION_TYPE_MISMATCH",
            });
            return;
          }
        }

        await uploadFile(storageKey, file.buffer, file.mimetype);

        if (existingFile) {
          const newVersion = existingFile.version + 1;
          const { updated, cancelledWorkflow } = await prisma.$transaction(
            async (tx) => {
              await tx.fileVersion.create({
                data: {
                  version: existingFile.version,
                  storageKey: existingFile.storageKey,
                  size: existingFile.size,
                  fileId: existingFile.id,
                  uploadedById: existingFile.uploadedById,
                },
              });

              const cancelledWorkflow = await cancelActiveWorkflowForFile(tx, {
                fileId: existingFile.id,
                tenantId: req.user!.tenantId,
                actorUserId: req.user!.userId,
                note: "Cancelled automatically because a new version was uploaded.",
              });

              const updated = await tx.file.update({
                where: { id: existingFile.id },
                data: {
                  storageKey,
                  size: file.size,
                  version: newVersion,
                  uploadedById: req.user!.userId,
                  updatedAt: new Date(),
                },
              });

              return { updated, cancelledWorkflow };
            },
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

          if (cancelledWorkflow) {
            await createAuditLog({
              action: "file.workflow.cancelled",
              userId: req.user!.userId,
              tenantId: req.user!.tenantId,
              resourceType: "file",
              resourceId: existingFile.id,
              resourceName: safeName,
              metadata: {
                workflowId: cancelledWorkflow.id,
                reason: "new_version_uploaded",
                newVersion,
              },
              req,
            });
          }
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
    const { userId, tenantId, role } = req.user!;
    const isPrivileged = [
      "SUPERADMIN",
      "ORG_ADMIN",
      "MANAGER",
      "EDITOR",
    ].includes(role);

    let allowedFileIds: string[] | null = null;
    if (!isPrivileged) {
      const perms = await prisma.permission.findMany({
        where: {
          resourceType: "file",
          OR: [{ grantedTo: "all" }, { grantedTo: "user", userId }],
          AND: [
            { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
            { file: { tenantId } },
          ],
        },
        select: { resourceId: true },
      });
      allowedFileIds = perms.map((p) => p.resourceId);
    }

    const files = await prisma.file.findMany({
      where: {
        tenantId,
        isStarred: true,
        isDeleted: false,
        ...(allowedFileIds !== null
          ? { OR: [{ id: { in: allowedFileIds } }, { uploadedById: userId }] }
          : {}),
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
    const { userId, tenantId, role } = req.user!;
    const isPrivileged = [
      "SUPERADMIN",
      "ORG_ADMIN",
      "MANAGER",
      "EDITOR",
    ].includes(role);

    let allowedFileIds: string[] | null = null;
    if (!isPrivileged) {
      const perms = await prisma.permission.findMany({
        where: {
          resourceType: "file",
          OR: [{ grantedTo: "all" }, { grantedTo: "user", userId }],
          AND: [
            { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
            { file: { tenantId } },
          ],
        },
        select: { resourceId: true },
      });
      allowedFileIds = perms.map((p) => p.resourceId);
    }

    const files = await prisma.file.findMany({
      where: {
        tenantId,
        isDeleted: false,
        ...(allowedFileIds !== null
          ? { OR: [{ id: { in: allowedFileIds } }, { uploadedById: userId }] }
          : {}),
      },
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
    const { userId, tenantId, role } = req.user!;
    const isPrivileged = [
      "SUPERADMIN",
      "ORG_ADMIN",
      "MANAGER",
      "EDITOR",
    ].includes(role);

    let allowedFileIds: string[] | null = null;
    if (!isPrivileged) {
      const perms = await prisma.permission.findMany({
        where: {
          resourceType: "file",
          OR: [{ grantedTo: "all" }, { grantedTo: "user", userId }],
          AND: [
            { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
            { file: { tenantId } },
          ],
        },
        select: { resourceId: true },
      });
      allowedFileIds = perms.map((p) => p.resourceId);
    }

    const [files, folders] = await Promise.all([
      prisma.file.findMany({
        where: {
          tenantId,
          isDeleted: true,
          ...(allowedFileIds !== null
            ? { OR: [{ id: { in: allowedFileIds } }, { uploadedById: userId }] }
            : {}),
        },
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
      // Folders in trash: only privileged users see all; viewers see none (no folder permissions in trash)
      isPrivileged
        ? prisma.folder.findMany({
            where: { tenantId, isDeleted: true },
            orderBy: { updatedAt: "desc" },
            select: { id: true, name: true, updatedAt: true },
          })
        : Promise.resolve([]),
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
        .object({ ids: z.array(z.string().uuid()).min(1).max(100) })
        .parse(req.body);

      const { userId, tenantId, role } = req.user!;
      const isPrivileged = [
        "SUPERADMIN",
        "ORG_ADMIN",
        "MANAGER",
        "EDITOR",
      ].includes(role);

      // ── PERMISSION GUARD: verify the caller has delete permission on all files
      if (!isPrivileged) {
        const filesToCheck = await prisma.file.findMany({
          where: { id: { in: ids }, tenantId, isDeleted: false },
          select: { id: true, name: true, uploadedById: true },
        });
        for (const file of filesToCheck) {
          const allowed = await userHasFilePermission(
            file.id,
            userId,
            file.uploadedById,
            role,
            "delete",
          );
          if (!allowed) {
            res.status(403).json({
              error: `You don't have permission to delete "${file.name}".`,
            });
            return;
          }
        }
      }

      // ── LOCK GUARD: reject the whole batch if any file is locked ─────────
      const lockedFiles = await prisma.file.findMany({
        where: {
          id: { in: ids },
          tenantId,
          isDeleted: false,
          isLocked: true,
        },
        select: { id: true, name: true, lockedById: true },
      });
      const isLockPrivileged = ["SUPERADMIN", "ORG_ADMIN", "MANAGER"].includes(
        role,
      );
      const blocked = lockedFiles.filter((f) => !isLockPrivileged);
      if (blocked.length > 0) {
        res.status(423).json({
          error: `${blocked.length} file(s) are locked and cannot be deleted.`,
          code: "FILE_LOCKED",
          lockedFiles: blocked.map((f) => f.name),
        });
        return;
      }

      await prisma.file.updateMany({
        where: {
          id: { in: ids },
          tenantId,
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

      const { userId, tenantId, role } = req.user!;
      const isPrivileged = [
        "SUPERADMIN",
        "ORG_ADMIN",
        "MANAGER",
        "EDITOR",
      ].includes(role);

      // ── PERMISSION GUARD: verify the caller has write permission on all files
      if (!isPrivileged) {
        const filesToCheck = await prisma.file.findMany({
          where: { id: { in: ids }, tenantId, isDeleted: false },
          select: { id: true, name: true, uploadedById: true },
        });
        for (const file of filesToCheck) {
          const allowed = await userHasFilePermission(
            file.id,
            userId,
            file.uploadedById,
            role,
            "write",
          );
          if (!allowed) {
            res.status(403).json({
              error: `You don't have permission to move "${file.name}".`,
            });
            return;
          }
        }
      }

      // ── LOCK GUARD: reject if any file in the batch is locked ────────────
      const lockedFiles = await prisma.file.findMany({
        where: {
          id: { in: ids },
          tenantId,
          isDeleted: false,
          isLocked: true,
        },
        select: { id: true, name: true, lockedById: true },
      });
      const isLockPrivileged = ["SUPERADMIN", "ORG_ADMIN", "MANAGER"].includes(
        role,
      );
      const blocked = lockedFiles.filter(
        (f) => !isLockPrivileged && f.lockedById !== userId,
      );
      if (blocked.length > 0) {
        res.status(423).json({
          error: `${blocked.length} file(s) are locked and cannot be moved.`,
          code: "FILE_LOCKED",
          lockedFiles: blocked.map((f) => f.name),
        });
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
        .object({ ids: z.array(z.string().uuid()).min(1).max(50) })
        .parse(req.body);

      const { userId, tenantId, role } = req.user!;
      const isPrivileged = [
        "SUPERADMIN",
        "ORG_ADMIN",
        "MANAGER",
        "EDITOR",
      ].includes(role);

      const files = await prisma.file.findMany({
        where: {
          id: { in: ids },
          tenantId,
          isDeleted: false,
        },
        select: { id: true, name: true, storageKey: true },
      });

      if (files.length === 0) {
        res.status(404).json({ error: "No files found" });
        return;
      }

      // ── GRANULAR DOWNLOAD CHECK for VIEWERs ──────────────────────────────
      if (!isPrivileged) {
        for (const file of files) {
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

// ─── GET /api/files/one-time-links ───────────────────────────────────────────
router.get(
  "/one-time-links",
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
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch shared links" });
    }
  },
);

// ─── DELETE /api/files/one-time-links/:linkId ─────────────────────────────────
router.delete(
  "/one-time-links/:linkId",
  verifyAuth,
  requireRole("ORG_ADMIN", "MANAGER", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    if (!isValidUUID(req.params.linkId)) {
      res.status(400).json({ error: "Invalid link ID" });
      return;
    }
    try {
      const link = await prisma.oneTimeLink.findFirst({
        where: { id: req.params.linkId, tenantId: req.user!.tenantId },
      });
      if (!link) {
        res.status(404).json({ error: "Link not found" });
        return;
      }
      await prisma.oneTimeLink.delete({ where: { id: req.params.linkId } });
      await createAuditLog({
        action: "file.link.revoked",
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        resourceType: "file",
        resourceId: link.fileId,
        req,
      });
      res.json({ message: "Link revoked" });
    } catch (err) {
      res.status(500).json({ error: "Failed to revoke link" });
    }
  },
);

// ─── PARAMETERIZED ROUTES ─────────────────────────────────────────────────────

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

      // ── GRANULAR DOWNLOAD CHECK: VIEWERs need explicit download_files capability ──
      const isPrivileged = [
        "SUPERADMIN",
        "ORG_ADMIN",
        "MANAGER",
        "EDITOR",
      ].includes(role);
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
            error: "You don't have permission to download this file.",
          });
          return;
        }
      }

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

router.get(
  "/:id/versions/:versionId/view",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    if (!isValidUUID(req.params.id) || !isValidUUID(req.params.versionId)) {
      res.status(400).json({ error: "Invalid ID" });
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

      const versionRecord = await prisma.fileVersion.findFirst({
        where: { id: req.params.versionId, fileId: file.id },
        select: {
          id: true,
          version: true,
          storageKey: true,
        },
      });
      if (!versionRecord) {
        res.status(404).json({ error: "Version not found" });
        return;
      }

      const viewUrl = await getFileViewUrl(
        versionRecord.storageKey,
        SIGNED_URL_TTL.VIEW,
      );
      await createAuditLog({
        action: "file.view",
        userId,
        tenantId,
        resourceType: "file",
        resourceId: file.id,
        resourceName: file.name,
        metadata: { version: versionRecord.version },
        req,
      });
      res.json({
        viewUrl,
        version: versionRecord.version,
        name: file.name,
        mimeType: file.mimeType,
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to open version" });
    }
  },
);

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

      // ── LOCK GUARD ────────────────────────────────────────────────────────
      if (isBlockedByLock(file, req.user!.userId, req.user!.role)) {
        res.status(423).json({
          error: "File is locked and cannot be restored to a previous version.",
          code: "FILE_LOCKED",
        });
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

// ─── PATCH /api/files/:id/rename — LOCK GUARD ────────────────────────────────
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

      // ── LOCK GUARD ────────────────────────────────────────────────────────
      if (isBlockedByLock(file, req.user!.userId, req.user!.role)) {
        res.status(423).json({
          error: "File is locked and cannot be renamed.",
          code: "FILE_LOCKED",
        });
        return;
      }

      // ── PERMISSION GUARD ──────────────────────────────────────────────────
      if (
        !(await userHasFilePermission(
          file.id,
          req.user!.userId,
          file.uploadedById,
          req.user!.role,
          "write",
        ))
      ) {
        res
          .status(403)
          .json({ error: "You don't have permission to rename this file." });
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

// ─── GET /api/files/:id/tags — must be above GET /:id ────────────────────────
router.get("/:id/tags", verifyAuth, async (req: AuthRequest, res: Response) => {
  if (!isValidUUID(req.params.id)) {
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
      select: { id: true },
    });
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    const tags = await prisma.fileTag.findMany({
      where: { fileId: req.params.id },
      include: { tag: true },
    });
    res.json({ tags });
  } catch {
    res.status(500).json({ error: "Failed to fetch file tags" });
  }
});

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

// ─── PATCH /api/files/:id/move — LOCK GUARD ───────────────────────────────────
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

      // ── LOCK GUARD ────────────────────────────────────────────────────────
      if (isBlockedByLock(file, req.user!.userId, req.user!.role)) {
        res.status(423).json({
          error: "File is locked and cannot be moved.",
          code: "FILE_LOCKED",
        });
        return;
      }

      // ── PERMISSION GUARD ──────────────────────────────────────────────────
      if (
        !(await userHasFilePermission(
          file.id,
          req.user!.userId,
          file.uploadedById,
          req.user!.role,
          "write",
        ))
      ) {
        res
          .status(403)
          .json({ error: "You don't have permission to move this file." });
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

      if (file.folderId) {
        let currentFolderId: string | null = file.folderId;
        while (currentFolderId) {
          const folder: {
            id: string;
            parentId: string | null;
            isDeleted: boolean;
          } | null = await prisma.folder.findFirst({
            where: {
              id: currentFolderId,
              tenantId: req.user!.tenantId,
            },
            select: { id: true, parentId: true, isDeleted: true },
          });
          if (!folder) break;
          if (folder.isDeleted) {
            await prisma.folder.update({
              where: { id: folder.id },
              data: { isDeleted: false },
            });
          }
          currentFolderId = folder.parentId;
        }
      }

      res.json({ message: "File restored" });
    } catch (err) {
      res.status(500).json({ error: "Failed to restore file" });
    }
  },
);

// ─── DELETE /api/files/:id — LOCK GUARD ──────────────────────────────────────
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

    // ── LOCK GUARD ────────────────────────────────────────────────────────
    if (isBlockedByLock(file, req.user!.userId, req.user!.role, "delete")) {
      res.status(423).json({
        error: "File is locked and cannot be deleted.",
        code: "FILE_LOCKED",
      });
      return;
    }

    // ── PERMISSION GUARD (coarse) ──────────────────────────────────────────
    if (
      !(await userHasFilePermission(
        file.id,
        req.user!.userId,
        file.uploadedById,
        req.user!.role,
        "delete",
      ))
    ) {
      res
        .status(403)
        .json({ error: "You don't have permission to delete this file." });
      return;
    }

    // ── GRANULAR CAPABILITY CHECK ──────────────────────────────────────────
    if (
      !(await userHasCapability(
        req.user!.userId,
        req.user!.tenantId,
        req.user!.role,
        "file",
        file.id,
        "delete_files",
      ))
    ) {
      res.status(403).json({
        error: "Your permission does not include deleting files.",
      });
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

router.delete(
  "/:id/permanent",
  verifyAuth,
  requireRole("ORG_ADMIN", "MANAGER", "SUPERADMIN"),
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

      // ── LOCK GUARD ────────────────────────────────────────────────────────
      if (
        isBlockedByLock(file as any, req.user!.userId, req.user!.role, "delete")
      ) {
        res.status(423).json({
          error: "File is locked and cannot be permanently deleted.",
          code: "FILE_LOCKED",
        });
        return;
      }

      // ── PERMISSION GUARD ──────────────────────────────────────────────────
      if (
        !(await userHasFilePermission(
          file.id,
          req.user!.userId,
          file.uploadedById,
          req.user!.role,
          "delete",
        ))
      ) {
        res.status(403).json({
          error: "You don't have permission to permanently delete this file.",
        });
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

router.get(
  "/:id/metadata",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    if (!isValidUUID(req.params.id)) {
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
        select: { id: true },
      });
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      const fileForPerm = await prisma.file.findFirst({
        where: {
          id: req.params.id,
          tenantId: req.user!.tenantId,
          isDeleted: false,
        },
        select: { id: true, uploadedById: true },
      });
      if (!fileForPerm) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      const isPrivileged = [
        "SUPERADMIN",
        "ORG_ADMIN",
        "MANAGER",
        "EDITOR",
      ].includes(req.user!.role);
      if (!isPrivileged) {
        const canViewMetadata = await userHasCapability(
          req.user!.userId,
          req.user!.tenantId,
          req.user!.role,
          "file",
          fileForPerm.id,
          "view_metadata",
        );
        if (!canViewMetadata) {
          res.status(403).json({ error: "Permission denied" });
          return;
        }
      }

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

router.get(
  "/:id/metadata-history",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    if (!isValidUUID(req.params.id)) {
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
        select: { id: true },
      });
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      const fileForPerm = await prisma.file.findFirst({
        where: {
          id: req.params.id,
          tenantId: req.user!.tenantId,
          isDeleted: false,
        },
        select: { id: true, uploadedById: true },
      });
      if (!fileForPerm) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      const isPrivileged = [
        "SUPERADMIN",
        "ORG_ADMIN",
        "MANAGER",
        "EDITOR",
      ].includes(req.user!.role);
      if (!isPrivileged) {
        const canViewMetadata = await userHasCapability(
          req.user!.userId,
          req.user!.tenantId,
          req.user!.role,
          "file",
          fileForPerm.id,
          "view_metadata",
        );
        if (!canViewMetadata) {
          res.status(403).json({ error: "Permission denied" });
          return;
        }
      }

      const logs = await prisma.auditLog.findMany({
        where: {
          tenantId: req.user!.tenantId,
          resourceType: "file",
          resourceId: req.params.id,
          action: { in: ["file.metadata.update", "file.metadata.bulk_update"] },
        },
        orderBy: { createdAt: "desc" },
        take: 30,
        include: { user: { select: { id: true, name: true, email: true } } },
      });
      res.json({ logs });
    } catch {
      res.status(500).json({ error: "Failed to fetch metadata history" });
    }
  },
);

// ─── GET /api/files/:id/metadata-schema — applicable default fields ──────
router.get(
  "/:id/metadata-schema",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    if (!isValidUUID(req.params.id)) {
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
        select: { id: true, folderId: true, uploadedById: true },
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
      ].includes(req.user!.role);
      if (!isPrivileged) {
        const canViewMetadata = await userHasCapability(
          req.user!.userId,
          req.user!.tenantId,
          req.user!.role,
          "file",
          file.id,
          "view_metadata",
        );
        if (!canViewMetadata) {
          res.status(403).json({ error: "Permission denied" });
          return;
        }
      }

      if (!file.folderId) {
        res.json({ folderId: null, fields: [] });
        return;
      }

      // Walk up ancestors and collect folder metadata field definitions.
      // For the file's own folder: include all fields.
      // For ancestors: include only recursive fields.
      const folderIds: { id: string; isSelf: boolean }[] = [];
      let current: string | null = file.folderId;
      let depth = 0;
      while (current && depth < 50) {
        folderIds.push({ id: current, isSelf: depth === 0 });
        const parentFolder: { parentId: string | null } | null =
          await prisma.folder.findFirst({
            where: {
              id: current,
              tenantId: req.user!.tenantId,
              isDeleted: false,
            },
            select: { parentId: true },
          });
        current = parentFolder?.parentId ?? null;
        depth++;
      }

      const defs = await prisma.folderMetadataField.findMany({
        where: {
          tenantId: req.user!.tenantId,
          folderId: { in: folderIds.map((f) => f.id) },
        },
        select: {
          folderId: true,
          key: true,
          type: true,
          required: true,
          recursive: true,
          options: true,
        },
      });

      const defsByFolder = new Map<string, typeof defs>();
      for (const d of defs) {
        const arr = defsByFolder.get(d.folderId) ?? [];
        arr.push(d);
        defsByFolder.set(d.folderId, arr);
      }

      // Nearest folder wins for duplicated keys.
      const keyToField = new Map<
        string,
        { key: string; type: string; required: boolean; options?: string[] }
      >();

      for (const folderRef of folderIds) {
        const list = defsByFolder.get(folderRef.id) ?? [];
        for (const f of list) {
          if (!folderRef.isSelf && !f.recursive) continue;
          if (keyToField.has(f.key.toLowerCase())) continue;
          keyToField.set(f.key.toLowerCase(), {
            key: f.key,
            type: f.type,
            required: f.required,
            options: Array.isArray(f.options) ? (f.options as string[]) : [],
          });
        }
      }

      res.json({
        folderId: file.folderId,
        fields: Array.from(keyToField.values()),
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch metadata schema" });
    }
  },
);

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

      const isPrivileged = [
        "SUPERADMIN",
        "ORG_ADMIN",
        "MANAGER",
        "EDITOR",
      ].includes(req.user!.role);

      if (!isPrivileged) {
        const canEditMetadata = await userHasCapability(
          req.user!.userId,
          req.user!.tenantId,
          req.user!.role,
          "file",
          file.id,
          "edit_metadata",
        );
        if (!canEditMetadata) {
          const hasCoarseWrite = await userHasFilePermission(
            file.id,
            req.user!.userId,
            file.uploadedById,
            req.user!.role,
            "write",
          );
          if (!hasCoarseWrite) {
            res.status(403).json({ error: "Permission denied" });
            return;
          }
        }
      }

      const oldMeta = await prisma.fileMetadata.findMany({
        where: { fileId: req.params.id },
        select: { key: true, value: true },
      });
      const oldByKey = new Map(oldMeta.map((m) => [m.key.toLowerCase(), m]));
      const newByKey = new Map(fields.map((f) => [f.key.toLowerCase(), f]));
      const allKeys = new Set([...oldByKey.keys(), ...newByKey.keys()]);
      const changes: Array<{ key: string; before: string; after: string }> = [];
      for (const lk of allKeys) {
        const before = oldByKey.get(lk)?.value ?? "";
        const after = newByKey.get(lk)?.value ?? "";
        if (before !== after) {
          changes.push({
            key: newByKey.get(lk)?.key ?? oldByKey.get(lk)?.key ?? lk,
            before,
            after,
          });
        }
      }

      await prisma.$transaction([
        prisma.fileMetadata.deleteMany({ where: { fileId: req.params.id } }),
        ...fields.map((f) =>
          prisma.fileMetadata.create({
            data: { key: f.key, value: f.value, fileId: req.params.id },
          }),
        ),
      ]);
      await createAuditLog({
        action: "file.metadata.update",
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        resourceType: "file",
        resourceId: file.id,
        resourceName: file.name,
        metadata: {
          fieldCount: fields.length,
          keys: fields.map((f) => f.key),
          changes: changes.slice(0, 30),
        },
        req,
      });
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

// ─── POST /api/files/bulk-metadata — apply metadata to many files ───────────
router.post(
  "/bulk-metadata",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const { ids, fields } = z
        .object({
          ids: z.array(z.string().uuid()).min(1).max(200),
          fields: z
            .array(
              z.object({
                key: z.string().min(1).max(100),
                value: z.string().max(500),
              }),
            )
            .min(1)
            .max(20),
        })
        .parse(req.body);

      const tenantId = req.user!.tenantId;
      const userId = req.user!.userId;
      const role = req.user!.role;
      const isPrivileged = [
        "SUPERADMIN",
        "ORG_ADMIN",
        "MANAGER",
        "EDITOR",
      ].includes(role);

      const files = await prisma.file.findMany({
        where: { tenantId, isDeleted: false, id: { in: ids } },
        select: { id: true, name: true, uploadedById: true },
      });

      const fileById = new Map(files.map((f) => [f.id, f]));
      const uniqueFields = fields.filter(
        (f, i, arr) =>
          arr.findIndex((x) => x.key.toLowerCase() === f.key.toLowerCase()) ===
          i,
      );
      const keys = uniqueFields.map((f) => f.key);

      let updatedCount = 0;
      const deniedIds: string[] = [];
      const missingIds: string[] = [];

      for (const id of ids) {
        const file = fileById.get(id);
        if (!file) {
          missingIds.push(id);
          continue;
        }

        let allowed = true;
        if (!isPrivileged) {
          const canEditMetadata = await userHasCapability(
            userId,
            tenantId,
            role,
            "file",
            id,
            "edit_metadata",
          );
          if (!canEditMetadata) {
            const hasCoarseWrite = await userHasFilePermission(
              id,
              userId,
              file.uploadedById,
              role,
              "write",
            );
            allowed = hasCoarseWrite;
          }
        }
        if (!allowed) {
          deniedIds.push(id);
          continue;
        }

        const existingForKeys = await prisma.fileMetadata.findMany({
          where: { fileId: id, key: { in: keys } },
          select: { key: true, value: true },
        });
        const existingByLower = new Map(
          existingForKeys.map((m) => [m.key.toLowerCase(), m.value]),
        );
        const changes = uniqueFields
          .map((f) => ({
            key: f.key,
            before: existingByLower.get(f.key.toLowerCase()) ?? "",
            after: f.value,
          }))
          .filter((c) => c.before !== c.after);

        await prisma.$transaction([
          prisma.fileMetadata.deleteMany({
            where: { fileId: id, key: { in: keys } },
          }),
          ...uniqueFields.map((f) =>
            prisma.fileMetadata.create({
              data: { fileId: id, key: f.key, value: f.value },
            }),
          ),
        ]);

        await createAuditLog({
          action: "file.metadata.bulk_update",
          userId: req.user!.userId,
          tenantId: req.user!.tenantId,
          resourceType: "file",
          resourceId: id,
          resourceName: file.name,
          metadata: { fieldCount: uniqueFields.length, keys, changes },
          req,
        });

        updatedCount++;
      }

      res.json({
        message: "Bulk metadata applied",
        updatedCount,
        deniedCount: deniedIds.length,
        missingCount: missingIds.length,
        deniedIds,
        missingIds,
      });
    } catch (err: any) {
      if (err?.name === "ZodError") {
        res.status(400).json({ error: "Invalid input" });
        return;
      }
      res.status(500).json({ error: "Failed to apply bulk metadata" });
    }
  },
);

router.get(
  "/:id/comments",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    if (!isValidUUID(req.params.id)) {
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
        select: { id: true },
      });
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      const comments = await prisma.fileComment.findMany({
        where: { fileId: req.params.id },
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true } } },
      });
      res.json({ comments });
    } catch {
      res.status(500).json({ error: "Failed to fetch comments" });
    }
  },
);

router.post(
  "/:id/comments",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    if (!isValidUUID(req.params.id)) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }
    try {
      const { content } = z
        .object({ content: z.string().min(1).max(1000) })
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
      const comment = await prisma.fileComment.create({
        data: { content, fileId: req.params.id, userId: req.user!.userId },
        include: { user: { select: { id: true, name: true } } },
      });
      res.json({ comment });
    } catch (err: any) {
      if (err.name === "ZodError") {
        res.status(400).json({ error: "Invalid input" });
        return;
      }
      res.status(500).json({ error: "Failed to add comment" });
    }
  },
);

router.delete(
  "/:id/comments/:commentId",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const file = await prisma.file.findFirst({
        where: { id: req.params.id, tenantId: req.user!.tenantId },
        select: { id: true },
      });
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      const comment = await prisma.fileComment.findFirst({
        where: {
          id: req.params.commentId,
          fileId: req.params.id,
          userId: req.user!.userId,
        },
      });
      if (!comment) {
        res.status(404).json({ error: "Comment not found" });
        return;
      }
      await prisma.fileComment.delete({ where: { id: req.params.commentId } });
      res.json({ message: "Comment deleted" });
    } catch {
      res.status(500).json({ error: "Failed to delete comment" });
    }
  },
);

router.post(
  "/:id/submit-approval",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    if (!isValidUUID(req.params.id)) {
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

      const isPrivileged = [
        "SUPERADMIN",
        "ORG_ADMIN",
        "MANAGER",
        "EDITOR",
      ].includes(req.user!.role);

      if (!isPrivileged) {
        const canEditAttrs = await userHasCapability(
          req.user!.userId,
          req.user!.tenantId,
          req.user!.role,
          "file",
          file.id,
          "edit_file_attrs",
        );
        if (!canEditAttrs) {
          const hasCoarseWrite = await userHasFilePermission(
            file.id,
            req.user!.userId,
            file.uploadedById,
            req.user!.role,
            "write",
          );
          if (!hasCoarseWrite) {
            res.status(403).json({ error: "Permission denied" });
            return;
          }
        }
      }

      await prisma.file.update({
        where: { id: req.params.id },
        data: {
          approvalStatus: "pending",
          approvedById: null,
          approvedAt: null,
          approvalNote: null,
        },
      });
      await createAuditLog({
        action: "file.approval.submitted",
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        resourceType: "file",
        resourceId: file.id,
        resourceName: file.name,
        req,
      });
      res.json({ message: "File submitted for approval" });
    } catch {
      res.status(500).json({ error: "Failed to submit for approval" });
    }
  },
);

router.post(
  "/:id/approve",
  verifyAuth,
  requireRole("ORG_ADMIN", "MANAGER", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    if (!isValidUUID(req.params.id)) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }
    try {
      const { action, note } = z
        .object({
          action: z.enum(["approved", "rejected"]),
          note: z.string().max(500).optional(),
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
      if (file.approvalStatus !== "pending") {
        res.status(400).json({ error: "File is not pending approval" });
        return;
      }
      await prisma.file.update({
        where: { id: req.params.id },
        data: {
          approvalStatus: action,
          approvedById: req.user!.userId,
          approvedAt: new Date(),
          approvalNote: note ?? null,
        },
      });
      const auditAction = `file.approval.${action}` as
        | "file.approval.approved"
        | "file.approval.rejected";
      await createAuditLog({
        action: auditAction,
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        resourceType: "file",
        resourceId: file.id,
        resourceName: file.name,
        metadata: { note },
        req,
      });
      res.json({ message: `File ${action}` });
    } catch (err: any) {
      if (err.name === "ZodError") {
        res.status(400).json({ error: "Invalid input" });
        return;
      }
      res.status(500).json({ error: "Failed to process approval" });
    }
  },
);

router.post(
  "/:id/lock",
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
      if (file.isLocked) {
        res.status(400).json({ error: "File is already locked" });
        return;
      }
      await prisma.file.update({
        where: { id: file.id },
        data: {
          isLocked: true,
          lockedById: req.user!.userId,
          lockedAt: new Date(),
        },
      });
      await createAuditLog({
        action: "file.lock",
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        resourceType: "file",
        resourceId: file.id,
        resourceName: file.name,
        req,
      });
      res.json({ message: "File locked" });
    } catch {
      res.status(500).json({ error: "Failed to lock file" });
    }
  },
);

router.post(
  "/:id/unlock",
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
      if (!file.isLocked) {
        res.status(400).json({ error: "File is not locked" });
        return;
      }
      const canUnlock =
        ["SUPERADMIN", "ORG_ADMIN", "MANAGER"].includes(req.user!.role) ||
        file.lockedById === req.user!.userId;
      if (!canUnlock) {
        res
          .status(403)
          .json({ error: "Only the locker or a manager can unlock" });
        return;
      }
      await prisma.file.update({
        where: { id: file.id },
        data: { isLocked: false, lockedById: null, lockedAt: null },
      });
      await createAuditLog({
        action: "file.unlock",
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        resourceType: "file",
        resourceId: file.id,
        resourceName: file.name,
        req,
      });
      res.json({ message: "File unlocked" });
    } catch {
      res.status(500).json({ error: "Failed to unlock file" });
    }
  },
);

export default router;
