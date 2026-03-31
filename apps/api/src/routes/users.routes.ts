import { Router, Response } from "express";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { verifyAuth, AuthRequest, requireRole } from "../middleware/auth";
import { prisma } from "../utils/prisma";
import { sendInviteEmail } from "../services/email.service";
import bcrypt from "bcryptjs";
import { getPlanLimits } from "../utils/plans";
import {
  getRoleProfileByIdForTenant,
  serializeRoleProfile,
} from "../services/role-profiles.service";

const router = Router();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (v: unknown): v is string => typeof v === "string" && UUID_REGEX.test(v);

const inviteSchema = z
  .object({
    email: z.string().email(),
    role: z.enum(["ORG_ADMIN", "MANAGER", "EDITOR", "VIEWER"]).optional(),
    roleProfileId: z.string().uuid().optional(),
  })
  .refine((data) => data.roleProfileId || data.role, {
    message: "Role or role profile is required",
    path: ["roleProfileId"],
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
          roleProfileId: true,
          roleProfile: {
            select: {
              id: true,
              name: true,
              baseRole: true,
              capabilities: true,
            },
          },
          isActive: true,
          createdAt: true,
          departmentId: true,
          department: { select: { id: true, name: true } },
        },
      });
      res.json({
        users: users.map((user) => ({
          ...user,
          roleProfile: serializeRoleProfile(
            user.roleProfile
              ? {
                  id: user.roleProfile.id,
                  name: user.roleProfile.name,
                  baseRole: user.roleProfile.baseRole as any,
                  capabilities: user.roleProfile.capabilities,
                }
              : user.role === "SUPERADMIN"
                ? { name: "Superadmin", baseRole: "SUPERADMIN" }
                : { name: user.role, baseRole: user.role as any },
          ),
        })),
      });
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
      const { email, role, roleProfileId } = inviteSchema.parse(req.body);

      let resolvedRole = role ?? "VIEWER";
      let resolvedRoleProfileId: string | null = null;
      let resolvedRoleName = resolvedRole.replace("_", " ");

      if (roleProfileId) {
        const roleProfile = await getRoleProfileByIdForTenant(
          roleProfileId,
          req.user!.tenantId,
        );
        if (!roleProfile) {
          res.status(400).json({ error: "Selected role profile was not found" });
          return;
        }
        resolvedRole = roleProfile.baseRole as any;
        resolvedRoleProfileId = roleProfile.id;
        resolvedRoleName = roleProfile.name;
      }

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

      // FIX #1: single query fetches both plan and name — removes duplicate const tenant declaration
      const tenant = await prisma.tenant.findUnique({
        where: { id: req.user!.tenantId },
        select: { plan: true, name: true },
      });

      // Check user limit
      const { maxUsers } = getPlanLimits(tenant?.plan ?? "free");
      const currentUsers = await prisma.user.count({
        where: { tenantId: req.user!.tenantId, isActive: true },
      });
      if (maxUsers !== Infinity && currentUsers >= maxUsers) {
        res.status(402).json({
          error: `User limit reached for your plan (${maxUsers} users). Please upgrade.`,
          code: "USER_LIMIT_REACHED",
          limit: maxUsers,
          current: currentUsers,
        });
        return;
      }

      // Get inviter info
      const inviter = await prisma.user.findUnique({
        where: { id: req.user!.userId },
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
          role: resolvedRole,
          roleProfileId: resolvedRoleProfileId,
          expiresAt,
          tenantId: req.user!.tenantId,
          invitedById: req.user!.userId,
        },
      });

      // Send invite email
      try {
        await sendInviteEmail({
          email,
          invitedByName: inviter?.name || "Admin",
          tenantName: tenant?.name || "Your Organisation",
          token,
          role: resolvedRoleName,
        });
        res.json({ message: `Invite sent to ${email}`, emailSent: true });
      } catch (emailErr: any) {
        console.error("Invite email failed:", emailErr);
        res.status(202).json({
          message: `Invite created for ${email}, but email delivery failed`,
          code: "INVITE_EMAIL_FAILED",
          error: emailErr?.message || "Failed to send invite email",
          emailSent: false,
        });
      }
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
          roleProfileId: true,
          roleProfile: {
            select: {
              id: true,
              name: true,
              baseRole: true,
            },
          },
          expiresAt: true,
          createdAt: true,
          invitedBy: { select: { name: true } },
        },
      });
      res.json({
        invites: invites.map((invite) => ({
          ...invite,
          roleProfile: invite.roleProfile
            ? {
                id: invite.roleProfile.id,
                name: invite.roleProfile.name,
                baseRole: invite.roleProfile.baseRole,
              }
            : null,
        })),
      });
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
      if (!isValidUUID(req.params.id)) {
        res.status(400).json({ error: "Invalid ID" });
        return;
      }
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

// ─── GET /api/users/me/profile ────────────────────────────────────────────────
router.get(
  "/me/profile",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          roleProfile: {
            select: {
              id: true,
              name: true,
              baseRole: true,
              capabilities: true,
            },
          },
          createdAt: true,
          tenant: { select: { name: true, plan: true } },
        },
      });
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      res.json({
        user: {
          ...user,
          roleProfile: serializeRoleProfile(
            user.roleProfile
              ? {
                  id: user.roleProfile.id,
                  name: user.roleProfile.name,
                  baseRole: user.roleProfile.baseRole as any,
                  capabilities: user.roleProfile.capabilities,
                }
              : user.role === "SUPERADMIN"
                ? { name: "Superadmin", baseRole: "SUPERADMIN" }
                : { name: user.role, baseRole: user.role as any },
          ),
        },
      });
    } catch {
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  },
);

// ─── PATCH /api/users/me/profile ─────────────────────────────────────────────
router.patch(
  "/me/profile",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const { name } = z
        .object({ name: z.string().min(2).max(100) })
        .parse(req.body);
      const updated = await prisma.user.update({
        where: { id: req.user!.userId },
        data: { name },
        select: { id: true, name: true, email: true, role: true },
      });
      res.json({ user: updated });
    } catch (err: any) {
      if (err.name === "ZodError") {
        res.status(400).json({ error: "Invalid input" });
        return;
      }
      res.status(500).json({ error: "Failed to update profile" });
    }
  },
);

// ─── PATCH /api/users/me/password ─────────────────────────────────────────────
router.patch(
  "/me/password",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const { currentPassword, newPassword } = z
        .object({
          currentPassword: z.string().min(1),
          newPassword: z.string().min(8),
        })
        .parse(req.body);

      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
      });
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) {
        res.status(400).json({ error: "Current password is incorrect" });
        return;
      }

      const hashed = await bcrypt.hash(newPassword, 12);
      await prisma.user.update({
        where: { id: req.user!.userId },
        data: { password: hashed },
      });

      res.json({ message: "Password updated successfully" });
    } catch (err: any) {
      if (err.name === "ZodError") {
        res.status(400).json({ error: "Invalid input" });
        return;
      }
      res.status(500).json({ error: "Failed to update password" });
    }
  },
);

// ─── GET /api/users/departments ───────────────────────────────────────────────
// IMPORTANT: Must be before /:id to prevent Express matching "departments" as :id
router.get(
  "/departments",
  verifyAuth,
  requireRole("ORG_ADMIN", "MANAGER", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const departments = await prisma.department.findMany({
        where: { tenantId: req.user!.tenantId },
        orderBy: { name: "asc" },
        include: { _count: { select: { users: true } } },
      });
      res.json({ departments });
    } catch {
      res.status(500).json({ error: "Failed to fetch departments" });
    }
  },
);

// ─── POST /api/users/departments ──────────────────────────────────────────────
router.post(
  "/departments",
  verifyAuth,
  requireRole("ORG_ADMIN", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { name } = z
        .object({ name: z.string().min(1).max(100) })
        .parse(req.body);

      const existing = await prisma.department.findFirst({
        where: { name, tenantId: req.user!.tenantId },
      });
      if (existing) {
        res.status(400).json({ error: "Department already exists" });
        return;
      }

      const dept = await prisma.department.create({
        data: { name, tenantId: req.user!.tenantId },
      });
      res.status(201).json({ department: dept });
    } catch (err: any) {
      if (err.name === "ZodError") {
        res.status(400).json({ error: "Invalid input" });
        return;
      }
      res.status(500).json({ error: "Failed to create department" });
    }
  },
);

// ─── DELETE /api/users/departments/:id ────────────────────────────────────────
router.delete(
  "/departments/:id",
  verifyAuth,
  requireRole("ORG_ADMIN", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!isValidUUID(req.params.id)) {
        res.status(400).json({ error: "Invalid ID" });
        return;
      }
      const dept = await prisma.department.findFirst({
        where: { id: req.params.id, tenantId: req.user!.tenantId },
      });
      if (!dept) {
        res.status(404).json({ error: "Department not found" });
        return;
      }

      // Unassign users before deleting
      await prisma.user.updateMany({
        where: { departmentId: req.params.id, tenantId: req.user!.tenantId },
        data: { departmentId: null },
      });
      await prisma.department.delete({ where: { id: req.params.id } });
      res.json({ message: "Department deleted" });
    } catch {
      res.status(500).json({ error: "Failed to delete department" });
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
      const { role, roleProfileId, isActive } = z
        .object({
          role: z.enum(["ORG_ADMIN", "MANAGER", "EDITOR", "VIEWER"]).optional(),
          roleProfileId: z.string().uuid().nullable().optional(),
          isActive: z.boolean().optional(),
        })
        .parse(req.body);

      if (!isValidUUID(req.params.id)) {
        res.status(400).json({ error: "Invalid ID" });
        return;
      }

      const user = await prisma.user.findFirst({
        where: { id: req.params.id, tenantId: req.user!.tenantId },
      });
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      
      if (user.role === "SUPERADMIN" && req.user!.role !== "SUPERADMIN") {
        res.status(403).json({ error: "Cannot modify a Superadmin" });
        return;
      }

      // If they are trying to strip the SUPERADMIN role, block it
      if (user.role === "SUPERADMIN" && role) {
        res.status(403).json({ error: "Cannot downgrade a Superadmin" });
        return;
      }

      // If they are trying to disable a SUPERADMIN, block it
      if (user.role === "SUPERADMIN" && isActive === false) {
        res.status(403).json({ error: "Cannot disable a Superadmin" });
        return;
      }

      let resolvedRoleProfileId: string | null | undefined;
      let resolvedRole = role;
      if (roleProfileId !== undefined) {
        if (roleProfileId === null) {
          resolvedRoleProfileId = null;
        } else {
          const roleProfile = await getRoleProfileByIdForTenant(
            roleProfileId,
            req.user!.tenantId,
          );
          if (!roleProfile) {
            res.status(400).json({ error: "Selected role profile was not found" });
            return;
          }
          resolvedRoleProfileId = roleProfile.id;
          resolvedRole = roleProfile.baseRole as any;
        }
      }

      const updated = await prisma.user.update({
        where: { id: req.params.id },
        data: {
          ...(resolvedRole !== undefined && { role: resolvedRole }),
          ...(resolvedRoleProfileId !== undefined && {
            roleProfileId: resolvedRoleProfileId,
          }),
          ...(isActive !== undefined && { isActive }),
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          roleProfileId: true,
          roleProfile: {
            select: {
              id: true,
              name: true,
              baseRole: true,
              capabilities: true,
            },
          },
          isActive: true,
        },
      });

      res.json({
        user: {
          ...updated,
          roleProfile: serializeRoleProfile(
            updated.roleProfile
              ? {
                  id: updated.roleProfile.id,
                  name: updated.roleProfile.name,
                  baseRole: updated.roleProfile.baseRole as any,
                  capabilities: updated.roleProfile.capabilities,
                }
              : updated.role === "SUPERADMIN"
                ? { name: "Superadmin", baseRole: "SUPERADMIN" }
                : { name: updated.role, baseRole: updated.role as any },
          ),
        },
      });
    } catch (err: any) {
      if (err.name === "ZodError") {
        res.status(400).json({ error: "Invalid input" });
        return;
      }
      res.status(500).json({ error: "Failed to update user" });
    }
  },
);

// ─── DELETE /api/users/:id — deactivate user (soft-delete) ───────────────────
router.delete(
  "/:id",
  verifyAuth,
  requireRole("ORG_ADMIN", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!isValidUUID(req.params.id)) {
        res.status(400).json({ error: "Invalid ID" });
        return;
      }
      if (req.params.id === req.user!.userId) {
        res.status(400).json({ error: "You cannot deactivate yourself" });
        return;
      }

      const user = await prisma.user.findFirst({
        where: { id: req.params.id, tenantId: req.user!.tenantId },
      });
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      if (user.role === "SUPERADMIN") {
        res.status(403).json({ error: "Cannot deactivate a Superadmin" });
        return;
      }

      await prisma.user.update({
        where: { id: req.params.id },
        data: { isActive: false },
      });

      res.json({ message: "User deactivated successfully" });
    } catch (err) {
      res.status(500).json({ error: "Failed to deactivate user" });
    }
  },
);

// ─── DELETE /api/users/:id/permanent — full cleanup and delete ────────────────
router.delete(
  "/:id/permanent",
  verifyAuth,
  requireRole("ORG_ADMIN", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!isValidUUID(req.params.id)) {
        res.status(400).json({ error: "Invalid ID" });
        return;
      }
      if (req.params.id === req.user!.userId) {
        res.status(400).json({ error: "You cannot delete yourself" });
        return;
      }

      const user = await prisma.user.findFirst({
        where: { id: req.params.id, tenantId: req.user!.tenantId },
      });
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      if (user.role === "SUPERADMIN") {
        res.status(403).json({ error: "Cannot delete a Superadmin" });
        return;
      }

      // Cleanup related records that might block deletion
      await prisma.$transaction([
        // Delete permissions granted to this user
        prisma.permission.deleteMany({ where: { userId: req.params.id } }),
        // Unlink or delete invitations
        prisma.inviteToken.deleteMany({ where: { invitedById: req.params.id } }),
        // Actually delete the user
        prisma.user.delete({ where: { id: req.params.id } }),
      ]);

      res.json({ message: "User permanently deleted" });
    } catch (err) {
      console.error("[DELETE_USER]", err);
      res.status(500).json({ error: "Failed to permanently delete user. They may have active dependencies." });
    }
  },
);

// ─── PATCH /api/users/:id/department ──────────────────────────────────────────
router.patch(
  "/:id/department",
  verifyAuth,
  requireRole("ORG_ADMIN", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { departmentId } = z
        .object({
          departmentId: z.string().uuid().nullable(),
        })
        .parse(req.body);

      const user = await prisma.user.findFirst({
        where: { id: req.params.id, tenantId: req.user!.tenantId },
      });
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      if (departmentId) {
        const dept = await prisma.department.findFirst({
          where: { id: departmentId, tenantId: req.user!.tenantId },
        });
        if (!dept) {
          res.status(400).json({ error: "Department not found" });
          return;
        }
      }

      const updated = await prisma.user.update({
        where: { id: req.params.id },
        data: { departmentId },
        select: {
          id: true,
          name: true,
          departmentId: true,
          department: { select: { name: true } },
        },
      });
      res.json({ user: updated });
    } catch (err: any) {
      if (err.name === "ZodError") {
        res.status(400).json({ error: "Invalid input" });
        return;
      }
      res.status(500).json({ error: "Failed to update department" });
    }
  },
);

export default router;
