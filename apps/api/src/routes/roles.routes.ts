import { Router, Response } from "express";
import { z } from "zod";
import { verifyAuth, AuthRequest, requireRole } from "../middleware/auth";
import { prisma } from "../utils/prisma";
import {
  ALL_ROLE_CAPABILITIES,
  getRoleProfileByIdForTenant,
  getTenantRoleProfiles,
  normalizeCapabilities,
} from "../services/role-profiles.service";

const router = Router();

const roleCapabilitySchema = z.record(z.string(), z.boolean()).superRefine((value, ctx) => {
  for (const key of Object.keys(value)) {
    if (!ALL_ROLE_CAPABILITIES.includes(key as (typeof ALL_ROLE_CAPABILITIES)[number])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unsupported capability: ${key}`,
      });
    }
  }
});

const roleProfileSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(240).optional().nullable(),
  baseRole: z.enum(["ORG_ADMIN", "MANAGER", "EDITOR", "VIEWER"]),
  capabilities: roleCapabilitySchema,
});

router.get(
  "/",
  verifyAuth,
  requireRole("ORG_ADMIN", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const roles = await getTenantRoleProfiles(req.user!.tenantId);
      const roleIds = roles.map((role) => role.id);

      const [userCounts, inviteCounts] = await Promise.all([
        prisma.user.groupBy({
          by: ["roleProfileId"],
          where: {
            tenantId: req.user!.tenantId,
            roleProfileId: { in: roleIds },
          },
          _count: { _all: true },
        }),
        prisma.inviteToken.groupBy({
          by: ["roleProfileId"],
          where: {
            tenantId: req.user!.tenantId,
            roleProfileId: { in: roleIds },
            isUsed: false,
            expiresAt: { gt: new Date() },
          },
          _count: { _all: true },
        }),
      ]);

      const userCountMap = new Map(
        userCounts.map((row) => [row.roleProfileId, row._count._all]),
      );
      const inviteCountMap = new Map(
        inviteCounts.map((row) => [row.roleProfileId, row._count._all]),
      );

      res.json({
        roles: roles.map((role) => ({
          id: role.id,
          name: role.name,
          description: role.description,
          baseRole: role.baseRole,
          isSystem: role.isSystem,
          systemKey: role.systemKey,
          capabilities: normalizeCapabilities(role.capabilities),
          createdAt: role.createdAt,
          updatedAt: role.updatedAt,
          _count: {
            users: userCountMap.get(role.id) ?? 0,
            invites: inviteCountMap.get(role.id) ?? 0,
          },
        })),
      });
    } catch (err) {
      console.error("roles list error:", err);
      res.status(500).json({ error: "Failed to fetch roles" });
    }
  },
);

router.post(
  "/",
  verifyAuth,
  requireRole("ORG_ADMIN", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const data = roleProfileSchema.parse(req.body);

      const existing = await prisma.roleProfile.findFirst({
        where: {
          tenantId: req.user!.tenantId,
          name: data.name,
        },
      });

      if (existing) {
        res.status(400).json({ error: "A role with that name already exists" });
        return;
      }

      const role = await prisma.roleProfile.create({
        data: {
          tenantId: req.user!.tenantId,
          name: data.name,
          description: data.description ?? null,
          baseRole: data.baseRole,
          capabilities: normalizeCapabilities(data.capabilities),
          isSystem: false,
        },
      });

      res.status(201).json({
        role: {
          ...role,
          capabilities: normalizeCapabilities(role.capabilities),
        },
      });
    } catch (err: any) {
      if (err.name === "ZodError") {
        res.status(400).json({ error: "Invalid input", details: err.errors });
        return;
      }
      console.error("roles create error:", err);
      res.status(500).json({ error: "Failed to create role" });
    }
  },
);

router.patch(
  "/:id",
  verifyAuth,
  requireRole("ORG_ADMIN", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const data = roleProfileSchema.partial().parse(req.body);
      const role = await getRoleProfileByIdForTenant(req.params.id, req.user!.tenantId);

      if (!role) {
        res.status(404).json({ error: "Role not found" });
        return;
      }

      // System roles: only capabilities and description are editable.
      // Name and baseRole are locked to preserve system integrity.
      if (role.isSystem) {
        if (data.name !== undefined && data.name !== role.name) {
          res.status(400).json({ error: "Built-in role names cannot be changed" });
          return;
        }
        if (data.baseRole !== undefined && data.baseRole !== role.baseRole) {
          res.status(400).json({ error: "Built-in role hierarchy cannot be changed" });
          return;
        }
      }

      if (data.name && data.name !== role.name) {
        const duplicate = await prisma.roleProfile.findFirst({
          where: {
            tenantId: req.user!.tenantId,
            name: data.name,
            id: { not: role.id },
          },
          select: { id: true },
        });
        if (duplicate) {
          res.status(400).json({ error: "A role with that name already exists" });
          return;
        }
      }

      const updated = await prisma.roleProfile.update({
        where: { id: role.id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.description !== undefined ? { description: data.description ?? null } : {}),
          ...(data.baseRole !== undefined ? { baseRole: data.baseRole } : {}),
          ...(data.capabilities !== undefined
            ? { capabilities: normalizeCapabilities(data.capabilities) }
            : {}),
        },
      });

      if (data.baseRole && data.baseRole !== role.baseRole) {
        await prisma.$transaction([
          prisma.user.updateMany({
            where: {
              tenantId: req.user!.tenantId,
              roleProfileId: role.id,
            },
            data: { role: data.baseRole },
          }),
          prisma.inviteToken.updateMany({
            where: {
              tenantId: req.user!.tenantId,
              roleProfileId: role.id,
              isUsed: false,
            },
            data: { role: data.baseRole },
          }),
        ]);
      }

      res.json({
        role: {
          ...updated,
          capabilities: normalizeCapabilities(updated.capabilities),
        },
      });
    } catch (err: any) {
      if (err.name === "ZodError") {
        res.status(400).json({ error: "Invalid input", details: err.errors });
        return;
      }
      console.error("roles update error:", err);
      res.status(500).json({ error: "Failed to update role" });
    }
  },
);

router.delete(
  "/:id",
  verifyAuth,
  requireRole("ORG_ADMIN", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const role = await getRoleProfileByIdForTenant(req.params.id, req.user!.tenantId);
      if (!role) {
        res.status(404).json({ error: "Role not found" });
        return;
      }
      if (role.isSystem) {
        res.status(400).json({ error: "Built-in roles cannot be deleted" });
        return;
      }

      const [userCount, inviteCount] = await Promise.all([
        prisma.user.count({
          where: { tenantId: req.user!.tenantId, roleProfileId: role.id },
        }),
        prisma.inviteToken.count({
          where: {
            tenantId: req.user!.tenantId,
            roleProfileId: role.id,
            isUsed: false,
            expiresAt: { gt: new Date() },
          },
        }),
      ]);

      if (userCount > 0 || inviteCount > 0) {
        res.status(400).json({
          error: "Reassign users and pending invites before deleting this role",
        });
        return;
      }

      await prisma.roleProfile.delete({ where: { id: role.id } });
      res.json({ message: "Role deleted" });
    } catch (err) {
      console.error("roles delete error:", err);
      res.status(500).json({ error: "Failed to delete role" });
    }
  },
);

export default router;
