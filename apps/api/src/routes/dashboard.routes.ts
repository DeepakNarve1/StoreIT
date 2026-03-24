import { Router, Response } from "express";
import { verifyAuth, AuthRequest } from "../middleware/auth";
import { prisma } from "../utils/prisma";
import { getPlanLimits } from "../utils/plans";

const router = Router();

router.get("/stats", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { userId, role } = req.user!;

    const isPrivileged = [
      "SUPERADMIN",
      "ORG_ADMIN",
      "MANAGER",
      "EDITOR",
    ].includes(role);

    // For VIEWER — get only file IDs they have permission to see
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

    const fileWhere = {
      tenantId,
      isDeleted: false,
      ...(allowedFileIds !== null
        ? { OR: [{ id: { in: allowedFileIds } }, { uploadedById: userId }] }
        : {}),
    };

    const [
      tenantData,
      fileCount,
      folderCount,
      userCount,
      storageResult,
      recentFiles,
      categoryCount,
    ] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { plan: true },
      }),
      prisma.file.count({ where: fileWhere }),
      prisma.folder.count({ where: { tenantId, isDeleted: false } }),
      prisma.user.count({ where: { tenantId, isActive: true } }),
      prisma.file.aggregate({
        where: fileWhere,
        _sum: { size: true },
      }),
      prisma.file.findMany({
        where: fileWhere,
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
      prisma.category.count({ where: { tenantId } }),
    ]);

    const storageBytes = storageResult._sum.size || 0;
    const { storageBytes: storageLimit } = getPlanLimits(
      tenantData?.plan ?? "free",
    );

    res.json({
      stats: {
        files: fileCount,
        folders: folderCount,
        users: userCount,
        categories: categoryCount,
        storageBytes,
        storageMB: Math.round((storageBytes / 1024 / 1024) * 10) / 10,
        storageLimit,
        plan: tenantData?.plan ?? "free",
      },
      recentFiles,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;
