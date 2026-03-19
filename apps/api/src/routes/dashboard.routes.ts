import { Router, Response } from "express";
import { verifyAuth, AuthRequest } from "../middleware/auth";
import { prisma } from "../utils/prisma";

const router = Router();

// ─── GET /api/dashboard/stats ─────────────────────────────────────────────────
router.get("/stats", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;

    const [
      fileCount,
      folderCount,
      userCount,
      storageResult,
      recentFiles,
      categoryCount,
    ] = await Promise.all([
      // Total files
      prisma.file.count({
        where: { tenantId, isDeleted: false },
      }),
      // Total folders
      prisma.folder.count({
        where: { tenantId, isDeleted: false },
      }),
      // Total active users
      prisma.user.count({
        where: { tenantId, isActive: true },
      }),
      // Total storage used
      prisma.file.aggregate({
        where: { tenantId, isDeleted: false },
        _sum: { size: true },
      }),
      // Recent files (last 5)
      prisma.file.findMany({
        where: { tenantId, isDeleted: false },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          name: true,
          mimeType: true,
          size: true,
          createdAt: true,
          folder: { select: { name: true } },
          uploadedBy: { select: { name: true } },
        },
      }),
      // Total categories
      prisma.category.count({
        where: { tenantId },
      }),
    ]);

    const storageBytes = storageResult._sum.size || 0;

    res.json({
      stats: {
        files: fileCount,
        folders: folderCount,
        users: userCount,
        categories: categoryCount,
        storageBytes,
        storageMB: Math.round((storageBytes / 1024 / 1024) * 10) / 10,
      },
      recentFiles,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;
