import { Router, Response } from "express";
import { verifyAuth, AuthRequest } from "../middleware/auth";
import { prisma } from "../utils/prisma";
import { userCanAccessFile } from "../services/file-access.service";
import { userHasCapability } from "./permissions.routes";
import {
  reindexFileFromStorage,
  runOcrSelfTest,
} from "../services/file-search-index.service";

const router = Router();

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (value: unknown): value is string =>
  typeof value === "string" && UUID_REGEX.test(value);

// ─── POST /api/search/reindex/:fileId — rebuild extracted text (privileged or uploader) ─
router.post(
  "/reindex/:fileId",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    if (!isValidUUID(req.params.fileId)) {
      res.status(400).json({ error: "Invalid file ID" });
      return;
    }
    try {
      const file = await prisma.file.findFirst({
        where: {
          id: req.params.fileId,
          tenantId: req.user!.tenantId,
          isDeleted: false,
        },
        select: {
          id: true,
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
        file.uploadedById ?? null,
        file.folderId ?? null,
      );
      if (!canAccess) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
      const privileged = [
        "SUPERADMIN",
        "ORG_ADMIN",
        "MANAGER",
        "EDITOR",
      ].includes(req.user!.role);
      const isUploader = file.uploadedById === req.user!.userId;
      if (!privileged && !isUploader) {
        res.status(403).json({ error: "You cannot reindex this file" });
        return;
      }

      await reindexFileFromStorage(file.id);
      res.json({ ok: true, fileId: file.id });
    } catch (err) {
      console.error("Search reindex error:", err);
      res.status(500).json({ error: "Failed to reindex file content" });
    }
  },
);

// ─── GET /api/search/diagnostics/ocr — verify Tesseract + sharp (managers+)
router.get(
  "/diagnostics/ocr",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    const role = req.user!.role;
    if (!["SUPERADMIN", "ORG_ADMIN", "MANAGER"].includes(role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const result = await runOcrSelfTest();
    res.json(result);
  },
);

// ─── GET /api/search?q=query&type=file|folder|all ─────────────────────────────
router.get("/", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { q, type = "all", categoryId, limit = "20" } = req.query;

    const query = String(q || "").trim();
    const limitNum = Math.min(parseInt(String(limit), 10) || 20, 50);
    const MIME_FILTERS: Record<string, string> = {
      pdf: "application/pdf",
      image: "image/",
      video: "video/",
      audio: "audio/",
      excel: "spreadsheetml",
      zip: "zip",
    };
    const mimeFilter = MIME_FILTERS[String(type)] ?? null;
    const resolvedType = mimeFilter ? "file" : String(type);

    if (!query || query.length < 1) {
      res.json({ files: [], folders: [], categories: [], total: 0 });
      return;
    }

    const { tenantId, userId, role } = req.user!;
    const isPrivileged = [
      "SUPERADMIN",
      "ORG_ADMIN",
      "MANAGER",
      "EDITOR",
    ].includes(role);

    let ftsFileIds: string[] = [];
    if (query.length >= 2) {
      try {
        const takeFts = Math.min(limitNum * 8, 400);
        const ftsRows = await prisma.$queryRaw<{ id: string }[]>`
          SELECT f.id
          FROM "File" f
          WHERE f."tenantId" = ${tenantId}
            AND f."isDeleted" = false
            AND f."searchText" IS NOT NULL
            AND length(trim(f."searchText")) > 0
            AND to_tsvector('english', coalesce(f."searchText", ''))
                @@ websearch_to_tsquery('english', ${query})
          LIMIT ${takeFts}
        `;
        ftsFileIds = ftsRows.map((r) => r.id);
      } catch (ftsErr) {
        console.error("Full-text search query failed:", ftsErr);
      }
    }

    const fileOrConditions: object[] = [
      { name: { contains: query, mode: "insensitive" } },
      {
        metadata: {
          some: { value: { contains: query, mode: "insensitive" } },
        },
      },
      { searchText: { contains: query, mode: "insensitive" } },
    ];
    if (ftsFileIds.length > 0) {
      fileOrConditions.push({ id: { in: ftsFileIds } });
    }

    // Fetch a large candidate pool before ACL filtering. A small `take` (e.g. 20) caused
    // filename / content matches to be missing when other rows (metadata/searchText) also matched.
    const FILE_CANDIDATE_CAP = 3000;

    // ── Search files ──────────────────────────────────────────────────────────
    const fileCandidates =
      resolvedType === "all" || resolvedType === "file"
        ? await prisma.file.findMany({
            where: {
              tenantId,
              isDeleted: false,
              ...(mimeFilter
                ? {
                    mimeType: {
                      contains: String(mimeFilter),
                      mode: "insensitive",
                    },
                  }
                : {}),
              ...(categoryId ? { categoryId: String(categoryId) } : {}),
              OR: fileOrConditions,
            },
            take: FILE_CANDIDATE_CAP,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              name: true,
              mimeType: true,
              size: true,
              createdAt: true,
              version: true,
              folderId: true,
              uploadedById: true,
              folder: { select: { name: true } },
              category: { select: { id: true, name: true } },
            },
          })
        : [];
    const files = isPrivileged
      ? fileCandidates.slice(0, limitNum)
      : (
          await Promise.all(
            fileCandidates.map(async (file) => {
              const canAccess = await userCanAccessFile(
                file.id,
                userId,
                tenantId,
                role,
                file.uploadedById ?? null,
                file.folderId ?? null,
              );
              return canAccess ? file : null;
            }),
          )
        )
          .filter((f): f is (typeof fileCandidates)[number] => !!f)
          .slice(0, limitNum);

    // ── Search folders ────────────────────────────────────────────────────────
    const folderCandidates =
      resolvedType === "all" || resolvedType === "folder"
        ? await prisma.folder.findMany({
            where: {
              tenantId,
              isDeleted: false,
              name: { contains: query, mode: "insensitive" },
              ...(categoryId ? { categoryId: String(categoryId) } : {}),
            },
            take: limitNum,
            orderBy: { name: "asc" },
            select: {
              id: true,
              name: true,
              parentId: true,
              createdAt: true,
              category: { select: { id: true, name: true } },
              _count: {
                select: {
                  files: { where: { isDeleted: false } },
                  children: { where: { isDeleted: false } },
                },
              },
            },
          })
        : [];
    const folders = isPrivileged
      ? folderCandidates
      : (
          await Promise.all(
            folderCandidates.map(async (folder) => {
              const canSeeFolder = await userHasCapability(
                userId,
                tenantId,
                role,
                "folder",
                folder.id,
                "see_folders",
              );
              return canSeeFolder ? folder : null;
            }),
          )
        ).filter((f): f is (typeof folderCandidates)[number] => !!f);

    // ── Search categories ─────────────────────────────────────────────────────
    const categories =
      resolvedType === "all"
        ? await prisma.category.findMany({
            where: {
              tenantId,
              name: { contains: query, mode: "insensitive" },
            },
            take: 5,
            orderBy: { name: "asc" },
            select: {
              id: true,
              name: true,
              parentId: true,
              _count: {
                select: {
                  files: { where: { isDeleted: false } },
                  folders: { where: { isDeleted: false } },
                },
              },
            },
          })
        : [];

    const total = files.length + folders.length + categories.length;

    res.json({
      files,
      folders,
      categories,
      total,
      query,
      contentSearch: true,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Search failed" });
  }
});

export default router;
