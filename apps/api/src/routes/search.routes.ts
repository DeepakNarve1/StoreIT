import { Router, Response } from "express";
import { verifyAuth, AuthRequest } from "../middleware/auth";
import { prisma } from "../utils/prisma";

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

    // ── Build file permission filter for viewers ──────────────────────────────
    let allowedFileIds: string[] = [];
    if (!isPrivileged) {
      const permissions = await prisma.permission.findMany({
        where: {
          resourceType: "file",
          OR: [{ grantedTo: "all" }, { grantedTo: "user", userId }],
          AND: [
            { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          ],
        },
        select: { resourceId: true },
      });
      allowedFileIds = permissions.map((p) => p.resourceId);
    }

    // ── Search files ──────────────────────────────────────────────────────────
    const files =
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
              AND: [
                {
                  OR: [
                    { name: { contains: query, mode: "insensitive" } },
                    { metadata: { some: { value: { contains: query, mode: "insensitive" } } } },
                  ]
                },
                ...(!isPrivileged
                  ? [{ OR: [{ id: { in: allowedFileIds } }, { uploadedById: userId }] }]
                  : []),
              ],
            },
            take: limitNum,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              name: true,
              mimeType: true,
              size: true,
              createdAt: true,
              version: true,
              folderId: true,
              folder: { select: { name: true } },
              category: { select: { id: true, name: true } },
            },
          })
        : [];

    // ── Search folders ────────────────────────────────────────────────────────
    const folders =
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
