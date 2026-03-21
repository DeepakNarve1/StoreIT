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

// ─── GET /api/audit/export — download as CSV ──────────────────────────────────
router.get(
  "/export",
  verifyAuth,
  requireRole("ORG_ADMIN", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { action, userId, resourceType, from, to } = req.query;

      const where: any = { tenantId: req.user!.tenantId };
      if (action) where.action = action;
      if (userId) where.userId = userId;
      if (resourceType) where.resourceType = resourceType;
      if (from || to) {
        where.createdAt = {};
        if (from) where.createdAt.gte = new Date(from as string);
        if (to) where.createdAt.lte = new Date(to as string);
      }

      const logs = await prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 10000, // cap at 10k rows
        include: { user: { select: { name: true, email: true } } },
      });

      // Build CSV
      const header = [
        "Date",
        "Action",
        "User",
        "Email",
        "Resource Type",
        "Resource Name",
        "IP Address",
      ];
      const rows = logs.map((log) => [
        new Date(log.createdAt).toISOString(),
        log.action,
        log.user?.name ?? "System",
        log.user?.email ?? "",
        log.resourceType ?? "",
        log.resourceName ?? "",
        log.ipAddress ?? "",
      ]);

      const escape = (val: string) => `"${val.replace(/"/g, '""')}"`;
      const csv = [header, ...rows]
        .map((row) => row.map(escape).join(","))
        .join("\n");

      const filename = `audit-log-${new Date().toISOString().split("T")[0]}.csv`;
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      res.send(csv);
    } catch (err) {
      res.status(500).json({ error: "Failed to export audit logs" });
    }
  },
);

export default router;
