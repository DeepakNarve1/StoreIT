import { Router, Response } from "express";
import { verifyAuth, AuthRequest, requireRole } from "../middleware/auth";
import { prisma } from "../utils/prisma";
import XLSX from "xlsx";
import PDFDocument from "pdfkit";
import { userHasCapability } from "./permissions.routes";
import { z } from "zod";
import { userCanAccessFile } from "../services/file-access.service";

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

// ─── GET /api/audit/file/:fileId — audit events for one file ───────────────
router.get(
  "/file/:fileId",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    const paramsSchema = z.object({ fileId: z.string().uuid() });
    const parsed = paramsSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid file ID" });
      return;
    }

    try {
      const { fileId } = parsed.data;
      const { userId, tenantId, role } = req.user!;
      const privileged = ["SUPERADMIN", "ORG_ADMIN", "MANAGER", "EDITOR"].includes(role);

      if (!privileged) {
        const file = await prisma.file.findFirst({
          where: { id: fileId, tenantId, isDeleted: false },
          select: { id: true, uploadedById: true, folderId: true },
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
          file.folderId,
        );
        if (!canAccess) {
          res.status(403).json({ error: "Access denied" });
          return;
        }
        const ok = await userHasCapability(
          userId,
          tenantId,
          role,
          "file",
          fileId,
          "see_audit_trails_file",
        );
        if (!ok) {
          res.status(403).json({ error: "Access denied" });
          return;
        }
      }

      const logs = await prisma.auditLog.findMany({
        where: {
          tenantId,
          resourceType: "file",
          resourceId: fileId,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });

      res.json({ logs });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch file audit log" });
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
      const { action, userId, resourceType, from, to, format } = req.query;
      const exportFormat = String(format ?? "csv").toLowerCase();
      const allowedFormats = new Set(["csv", "xlsx", "ods", "pdf"]);
      if (!allowedFormats.has(exportFormat)) {
        res.status(400).json({ error: "Unsupported export format" });
        return;
      }

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
      const datePart = new Date().toISOString().split("T")[0];

      if (exportFormat === "csv") {
        const filename = `audit-log-${datePart}.csv`;
        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${filename}"`,
        );
        res.send(csv);
        return;
      }

      if (exportFormat === "xlsx" || exportFormat === "ods") {
        const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Audit Log");
        const bookType = exportFormat === "ods" ? "ods" : "xlsx";
        const buffer = XLSX.write(workbook, { type: "buffer", bookType });
        const filename = `audit-log-${datePart}.${bookType}`;
        const contentType =
          bookType === "ods"
            ? "application/vnd.oasis.opendocument.spreadsheet"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        res.setHeader("Content-Type", contentType);
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${filename}"`,
        );
        res.send(buffer);
        return;
      }

      const filename = `audit-log-${datePart}.pdf`;
      const doc = new PDFDocument({ margin: 40, size: "A4" });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(chunk as Buffer));
      doc.on("error", () => {
        res.status(500).json({ error: "Failed to generate PDF export" });
      });
      doc.fontSize(16).text("Audit Log Export", { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10).text(`Generated at: ${new Date().toISOString()}`);
      doc.moveDown(1);
      logs.forEach((log, index) => {
        const line = [
          `${index + 1}.`,
          new Date(log.createdAt).toISOString(),
          log.action,
          log.user?.name ?? "System",
          log.resourceType ?? "",
          log.resourceName ?? "",
          log.ipAddress ?? "",
        ].join(" | ");
        doc.fontSize(9).text(line, { width: 520 });
        doc.moveDown(0.35);
      });
      doc.end();
      await new Promise<void>((resolve) => {
        doc.on("end", () => resolve());
      });
      const pdfBuffer = Buffer.concat(chunks);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
    } catch (err) {
      res.status(500).json({ error: "Failed to export audit logs" });
    }
  },
);

export default router;
