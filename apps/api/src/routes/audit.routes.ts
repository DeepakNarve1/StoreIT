import { Router, Response } from "express";
import { verifyAuth, AuthRequest, requireRole } from "../middleware/auth";
import { prisma } from "../utils/prisma";

const router = Router();

// ─── GET /api/audit — list audit logs for tenant ──────────────────────────────
router.get(
  "/",
  verifyAuth,
  requireRole("ORG_ADMIN", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        page = "1",
        limit = "50",
        action,
        userId,
        resourceType,
      } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      const where: {
        tenantId: string;
        action?: string;
        userId?: string;
        resourceType?: string;
      } = { tenantId: req.user!.tenantId };

      if (action) where.action = action as string;
      if (userId) where.userId = userId as string;
      if (resourceType) where.resourceType = resourceType as string;

      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limitNum,
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        }),
        prisma.auditLog.count({ where }),
      ]);

      res.json({
        logs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  },
);

// ─── GET /api/audit/stats — summary stats ────────────────────────────────────
router.get(
  "/stats",
  verifyAuth,
  requireRole("ORG_ADMIN", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const since = new Date();
      since.setDate(since.getDate() - 30); // last 30 days

      const [total, uploads, deletes, logins, byAction] = await Promise.all([
        prisma.auditLog.count({ where: { tenantId } }),
        prisma.auditLog.count({
          where: { tenantId, action: "file.upload", createdAt: { gte: since } },
        }),
        prisma.auditLog.count({
          where: { tenantId, action: "file.delete", createdAt: { gte: since } },
        }),
        prisma.auditLog.count({
          where: { tenantId, action: "user.login", createdAt: { gte: since } },
        }),
        prisma.auditLog.groupBy({
          by: ["action"],
          where: { tenantId, createdAt: { gte: since } },
          _count: { action: true },
          orderBy: { _count: { action: "desc" } },
          take: 10,
        }),
      ]);

      res.json({
        total,
        last30Days: { uploads, deletes, logins },
        byAction: byAction.map((b) => ({
          action: b.action,
          count: b._count.action,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch audit stats" });
    }
  },
);

export default router;
