import { Router, Response } from "express";
import { verifyAuth, AuthRequest } from "../middleware/auth";
import { prisma } from "../utils/prisma";

const router = Router();

// ─── GET /api/search?q=query&type=file|folder|all ─────────────────────────────
router.get("/", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { q, type = "all", categoryId, mimeType, limit = "20" } = req.query;

    const query = String(q || "").trim();
    const limitNum = Math.min(parseInt(String(limit)), 50);

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
      type === "all" || type === "file"
        ? await prisma.file.findMany({
            where: {
              tenantId,
              isDeleted: false,
              name: { contains: query, mode: "insensitive" },
              ...(mimeType
                ? {
                    mimeType: {
                      contains: String(mimeType),
                      mode: "insensitive",
                    },
                  }
                : {}),
              ...(categoryId ? { categoryId: String(categoryId) } : {}),
              ...(!isPrivileged
                ? {
                    OR: [
                      { id: { in: allowedFileIds } },
                      { uploadedById: userId },
                    ],
                  }
                : {}),
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
      type === "all" || type === "folder"
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
      type === "all"
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
