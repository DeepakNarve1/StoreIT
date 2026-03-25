import { Router, Request, Response } from "express";
import { z } from "zod";
import { verifyAuth, AuthRequest, requireRole } from "../middleware/auth";
import { prisma } from "../utils/prisma";
import { v4 as uuid } from "uuid";
import { getFileViewUrl } from "../services/storage.service";
import { sendGuestAccessEmail } from "../services/email.service";
import { createAuditLog } from "../services/audit.service";

const router = Router();

const VALID_CAPS = [
  "preview_files",
  "download_files",
  "see_files",
  "see_folders",
] as const;

// ─── POST /api/guest — create a guest share ───────────────────────────────────
router.post(
  "/",
  verifyAuth,
  requireRole("ORG_ADMIN", "MANAGER", "SUPERADMIN", "EDITOR"),
  async (req: AuthRequest, res: Response) => {
    try {
      const body = z
        .object({
          email: z.string().email(),
          label: z.string().max(100).optional(),
          fileId: z.string().uuid(),
          capabilities: z.record(z.string(), z.boolean()),
          expiresInDays: z.number().min(1).max(30).default(7),
        })
        .parse(req.body);

      // Verify the file belongs to this tenant
      const file = await prisma.file.findFirst({
        where: {
          id: body.fileId,
          tenantId: req.user!.tenantId,
          isDeleted: false,
        },
        include: { tenant: { select: { name: true } } },
      });
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      const token = uuid();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + body.expiresInDays);

      // Filter capabilities to only valid keys
      const caps: Record<string, boolean> = {};
      VALID_CAPS.forEach((k) => {
        caps[k] = body.capabilities[k] === true;
      });

      const guest = await prisma.guestAccess.create({
        data: {
          token,
          email: body.email,
          label: body.label,
          resourceType: "file",
          resourceId: body.fileId,
          fileId: body.fileId,
          capabilities: caps,
          expiresAt,
          tenantId: req.user!.tenantId,
        },
      });

      // Build the guest portal URL
      const rawBase =
        process.env.FRONTEND_URL || process.env.APP_URL || "http://localhost:5173";
      const base = rawBase.endsWith("/") ? rawBase.slice(0, -1) : rawBase;
      const guestUrl = `${base}/guest/${token}`;

      // ── Send invitation email ──────────────────────────────────────────
      try {
        await sendGuestAccessEmail({
          email: body.email,
          label: body.label || file.name,
          fileName: file.name,
          tenantName: file.tenant.name,
          guestUrl,
          expiresAt,
          capabilities: caps,
        });
      } catch (emailErr) {
        console.error("[GUEST_EMAIL] Failed to send:", emailErr);
        // Don't fail the whole request if email fails
      }

      await createAuditLog({
        action: "guest.share",
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        resourceType: "file",
        resourceId: body.fileId,
        resourceName: file.name,
        metadata: { sharedWith: body.email, expiresAt },
        req,
      });

      res.status(201).json({ guest, guestUrl });
    } catch (err: any) {
      if (err.name === "ZodError") {
        res.status(400).json({ error: "Invalid input", details: err.errors });
        return;
      }
      console.error("[GUEST_CREATE]", err);
      res.status(500).json({ error: "Failed to create guest access" });
    }
  },
);

// ─── GET /api/guest — list all guest shares for this tenant ──────────────────
router.get(
  "/",
  verifyAuth,
  requireRole("ORG_ADMIN", "MANAGER", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const guests = await prisma.guestAccess.findMany({
        where: { tenantId: req.user!.tenantId, isRevoked: false },
        include: {
          file: { select: { id: true, name: true, mimeType: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      res.json({ guests });
    } catch {
      res.status(500).json({ error: "Failed to fetch guest accesses" });
    }
  },
);

// ─── DELETE /api/guest/:id — revoke a guest share ────────────────────────────
router.delete(
  "/:id",
  verifyAuth,
  requireRole("ORG_ADMIN", "MANAGER", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const guest = await prisma.guestAccess.findFirst({
        where: { id: req.params.id, tenantId: req.user!.tenantId },
      });
      if (!guest) {
        res.status(404).json({ error: "Guest access not found" });
        return;
      }
      await prisma.guestAccess.update({
        where: { id: req.params.id },
        data: { isRevoked: true },
      });
      res.json({ message: "Guest access revoked" });
    } catch {
      res.status(500).json({ error: "Failed to revoke guest access" });
    }
  },
);

// ─── GET /api/guest/access/:token — public, verifies token and returns file ──
router.get("/access/:token", async (req: Request, res: Response) => {
  try {
    const guest = await prisma.guestAccess.findUnique({
      where: { token: req.params.token },
      include: { file: true },
    });

    if (!guest) {
      res.status(404).json({ error: "Link not found" });
      return;
    }
    if (guest.isRevoked) {
      res.status(403).json({ error: "This link has been revoked" });
      return;
    }
    if (guest.expiresAt < new Date()) {
      res.status(403).json({ error: "This link has expired" });
      return;
    }

    const caps = (guest.capabilities as Record<string, boolean>) || {};

    // Only build a view URL if preview/download is enabled
    let viewUrl: string | null = null;
    if ((caps.preview_files || caps.download_files) && guest.file) {
      viewUrl = await getFileViewUrl(guest.file.storageKey, 3600);
    }

    res.json({
      guest: {
        id: guest.id,
        label: guest.label,
        email: guest.email,
        capabilities: caps,
        expiresAt: guest.expiresAt,
      },
      file: guest.file
        ? {
            id: guest.file.id,
            name: guest.file.name,
            mimeType: guest.file.mimeType,
            size: guest.file.size,
          }
        : null,
      viewUrl,
    });
  } catch (err) {
    console.error("[GUEST_ACCESS]", err);
    res.status(500).json({ error: "Failed to access guest link" });
  }
});

export default router;
