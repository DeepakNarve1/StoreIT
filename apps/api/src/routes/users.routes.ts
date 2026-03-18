import { Router, Response } from "express";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { verifyAuth, AuthRequest, requireRole } from "../middleware/auth";
import { prisma } from "../utils/prisma";
import { sendInviteEmail } from "../services/email.service";

const router = Router();

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["ORG_ADMIN", "MANAGER", "EDITOR", "VIEWER"]).default("VIEWER"),
});

// ─── GET /api/users — list all users in tenant ────────────────────────────────
router.get(
  "/",
  verifyAuth,
  requireRole("ORG_ADMIN", "MANAGER", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const users = await prisma.user.findMany({
        where: { tenantId: req.user!.tenantId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      });
      res.json({ users });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  },
);

// ─── POST /api/users/invite — invite a new user ───────────────────────────────
router.post(
  "/invite",
  verifyAuth,
  requireRole("ORG_ADMIN", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { email, role } = inviteSchema.parse(req.body);

      // Check not already a member
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        res.status(400).json({ error: "User with this email already exists" });
        return;
      }

      // Check no pending invite for this email
      const pendingInvite = await prisma.inviteToken.findFirst({
        where: {
          email,
          tenantId: req.user!.tenantId,
          isUsed: false,
          expiresAt: { gt: new Date() },
        },
      });
      if (pendingInvite) {
        res
          .status(400)
          .json({ error: "An active invite already exists for this email" });
        return;
      }

      // Get inviter info + tenant
      const inviter = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { name: true },
      });
      const tenant = await prisma.tenant.findUnique({
        where: { id: req.user!.tenantId },
        select: { name: true },
      });

      // Create invite token — expires in 7 days
      const token = uuid();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await prisma.inviteToken.create({
        data: {
          token,
          email,
          role,
          expiresAt,
          tenantId: req.user!.tenantId,
          invitedById: req.user!.userId,
        },
      });

      // Send invite email
      await sendInviteEmail({
        email,
        invitedByName: inviter?.name || "Admin",
        tenantName: tenant?.name || "Your Organisation",
        token,
        role,
      });

      res.json({ message: `Invite sent to ${email}` });
    } catch (err: any) {
      if (err.name === "ZodError") {
        res.status(400).json({ error: "Invalid input", details: err.errors });
        return;
      }
      console.error("Invite error:", err);
      res.status(500).json({ error: err.message || "Failed to send invite" });
    }
  },
);

// ─── GET /api/users/invites — list pending invites ────────────────────────────
router.get(
  "/invites",
  verifyAuth,
  requireRole("ORG_ADMIN", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const invites = await prisma.inviteToken.findMany({
        where: {
          tenantId: req.user!.tenantId,
          isUsed: false,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          role: true,
          expiresAt: true,
          createdAt: true,
          invitedBy: { select: { name: true } },
        },
      });
      res.json({ invites });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch invites" });
    }
  },
);

// ─── DELETE /api/users/invites/:id — cancel an invite ────────────────────────
router.delete(
  "/invites/:id",
  verifyAuth,
  requireRole("ORG_ADMIN", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const invite = await prisma.inviteToken.findFirst({
        where: { id: req.params.id, tenantId: req.user!.tenantId },
      });
      if (!invite) {
        res.status(404).json({ error: "Invite not found" });
        return;
      }
      await prisma.inviteToken.update({
        where: { id: req.params.id },
        data: { isUsed: true }, // mark as used = cancelled
      });
      res.json({ message: "Invite cancelled" });
    } catch (err) {
      res.status(500).json({ error: "Failed to cancel invite" });
    }
  },
);

// ─── PATCH /api/users/:id — update user role or status ───────────────────────
router.patch(
  "/:id",
  verifyAuth,
  requireRole("ORG_ADMIN", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { role, isActive } = z
        .object({
          role: z.enum(["ORG_ADMIN", "MANAGER", "EDITOR", "VIEWER"]).optional(),
          isActive: z.boolean().optional(),
        })
        .parse(req.body);

      const user = await prisma.user.findFirst({
        where: { id: req.params.id, tenantId: req.user!.tenantId },
      });
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const updated = await prisma.user.update({
        where: { id: req.params.id },
        data: {
          ...(role !== undefined && { role }),
          ...(isActive !== undefined && { isActive }),
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
        },
      });

      res.json({ user: updated });
    } catch (err: any) {
      if (err.name === "ZodError") {
        res.status(400).json({ error: "Invalid input" });
        return;
      }
      res.status(500).json({ error: "Failed to update user" });
    }
  },
);

// ─── DELETE /api/users/:id — remove user from tenant ─────────────────────────
router.delete(
  "/:id",
  verifyAuth,
  requireRole("ORG_ADMIN", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      // Prevent self-deletion
      if (req.params.id === req.user!.userId) {
        res.status(400).json({ error: "You cannot remove yourself" });
        return;
      }

      const user = await prisma.user.findFirst({
        where: { id: req.params.id, tenantId: req.user!.tenantId },
      });
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      await prisma.user.update({
        where: { id: req.params.id },
        data: { isActive: false },
      });

      res.json({ message: "User removed successfully" });
    } catch (err) {
      res.status(500).json({ error: "Failed to remove user" });
    }
  },
);

export default router;
