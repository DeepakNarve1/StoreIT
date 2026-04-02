import { Router, Response } from "express";
import { verifyAuth, AuthRequest } from "../middleware/auth";
import { prisma } from "../utils/prisma";
import { userCanAccessFile } from "../services/file-access.service";
import { userHasCapability } from "./permissions.routes";

const router = Router();

// ─── GET /api/search?q=query&type=file|folder|all ─────────────────────────────
router.get("/", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { q, type = "all", categoryId, limit = "20" } = req.query;

    const query = String(q || "").trim();
    const limitNum = Math.min(parseInt(String(limit)), 50);
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
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { metadata: { some: { value: { contains: query, mode: "insensitive" } } } },
              ],
            },
            take: isPrivileged ? limitNum : Math.min(limitNum * 4, 200),
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

    res.json({ files, folders, categories, total, query });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Search failed" });
  }
});

export default router;
