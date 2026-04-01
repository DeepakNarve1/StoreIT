import { Router, Response } from "express";
import { z } from "zod";
import { verifyAuth, AuthRequest, requireRole } from "../middleware/auth";
import { prisma } from "../utils/prisma";
import { hashPassword } from "../services/auth.service";
import { createAuditLog } from "../services/audit.service";
import jwt from "jsonwebtoken";

const router = Router();

router.use(verifyAuth);
router.use(requireRole("SUPERADMIN"));

const createOrgSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/),
  plan: z.enum(["free", "starter", "pro", "enterprise"]).default("free"),
  adminName: z.string().min(2),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8),
});

// ─── GET /api/superadmin/orgs ─────────────────────────────────────────────────
router.get("/orgs", async (req: AuthRequest, res: Response) => {
  try {
    const orgs = await prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        isActive: true,
        createdAt: true,
        _count: {
          select: {
            users: true,
            files: { where: { isDeleted: false } },
            folders: { where: { isDeleted: false } },
          },
        },
      },
    });

    const orgsWithStorage = await Promise.all(
      orgs.map(async (org) => {
        const storage = await prisma.file.aggregate({
          where: { tenantId: org.id, isDeleted: false },
          _sum: { size: true },
        });
        return { ...org, storageBytes: storage._sum.size || 0 };
      }),
    );

    res.json({ orgs: orgsWithStorage });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch organisations" });
  }
});

// ─── POST /api/superadmin/orgs ────────────────────────────────────────────────
router.post("/orgs", async (req: AuthRequest, res: Response) => {
  try {
    const { name, slug, plan, adminName, adminEmail, adminPassword } =
      createOrgSchema.parse(req.body);

    const existing = await prisma.tenant.findUnique({ where: { slug } });
    if (existing) {
      res.status(400).json({ error: "Organisation slug already taken" });
      return;
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: adminEmail },
    });
    if (existingUser) {
      res.status(400).json({ error: "Admin email already in use" });
      return;
    }

    const hashedPw = await hashPassword(adminPassword);

    const tenant = await prisma.tenant.create({
      data: {
        name,
        slug,
        plan,
        isActive: true,
        users: {
          create: {
            name: adminName,
            email: adminEmail,
            password: hashedPw,
            role: "ORG_ADMIN",
            isActive: true,
          },
        },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        isActive: true,
        createdAt: true,
        users: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    await createAuditLog({
      action: "superadmin.org.create",
      userId: req.user!.userId,
      tenantId: req.user!.tenantId,
      resourceType: "tenant",
      resourceId: tenant.id,
      resourceName: tenant.name,
      metadata: { slug, plan },
      req,
    });

    res.status(201).json({ tenant });
  } catch (err: any) {
    if (err.name === "ZodError") {
      res.status(400).json({ error: "Invalid input", details: err.errors });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Failed to create organisation" });
  }
});

// ─── PATCH /api/superadmin/orgs/:id ──────────────────────────────────────────
router.patch("/orgs/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { plan, isActive } = z
      .object({
        plan: z.enum(["free", "starter", "pro", "enterprise"]).optional(),
        isActive: z.boolean().optional(),
      })
      .parse(req.body);

    const tenant = await prisma.tenant.findUnique({
      where: { id: req.params.id },
    });
    if (!tenant) {
      res.status(404).json({ error: "Organisation not found" });
      return;
    }

    if (tenant.slug === "superadmin" && isActive === false) {
      res.status(400).json({ error: "The Platform Admin organisation cannot be suspended" });
      return;
    }

    const updated = await prisma.tenant.update({
      where: { id: req.params.id },
      data: {
        ...(plan !== undefined && { plan }),
        ...(isActive !== undefined && { isActive }),
        // Manual plan overrides should clear any live billing linkage so the
        // tenant billing page does not show stale subscription information.
        ...(plan !== undefined && {
          stripeSubscriptionId: null,
          stripeCustomerId: null,
          razorpaySubscriptionId: null,
          razorpayCustomerId: null,
          razorpayPlanId: null,
        }),
      },
      select: { id: true, name: true, slug: true, plan: true, isActive: true },
    });

    await createAuditLog({
      action: "superadmin.org.update",
      userId: req.user!.userId,
      tenantId: req.user!.tenantId,
      resourceType: "tenant",
      resourceId: req.params.id,
      resourceName: tenant.name,
      metadata: { plan, isActive },
      req,
    });

    res.json({ tenant: updated });
  } catch (err: any) {
    if (err.name === "ZodError") {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    res.status(500).json({ error: "Failed to update organisation" });
  }
});

// ─── DELETE /api/superadmin/orgs/:id ─────────────────────────────────────────
router.delete("/orgs/:id", async (req: AuthRequest, res: Response) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.params.id },
    });
    if (!tenant) {
      res.status(404).json({ error: "Organisation not found" });
      return;
    }

    if (tenant.slug === "superadmin") {
      res.status(400).json({ error: "The Platform Admin organisation cannot be suspended" });
      return;
    }

    await prisma.tenant.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });

    await createAuditLog({
      action: "superadmin.org.suspend",
      userId: req.user!.userId,
      tenantId: req.user!.tenantId,
      resourceType: "tenant",
      resourceId: req.params.id,
      resourceName: tenant.name,
      req,
    });

    res.json({ message: "Organisation suspended successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to suspend organisation" });
  }
});

// ─── GET /api/superadmin/orgs/:id/stats ───────────────────────────────────────
router.get("/orgs/:id/stats", async (req: AuthRequest, res: Response) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        isActive: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        razorpayCustomerId: true,
        razorpaySubscriptionId: true,
        razorpayPlanId: true,
      },
    });
    if (!tenant) {
      res.status(404).json({ error: "Organisation not found" });
      return;
    }

    const [userCount, fileCount, folderCount, storageResult, recentFiles] =
      await Promise.all([
        prisma.user.count({
          where: { tenantId: req.params.id, isActive: true },
        }),
        prisma.file.count({
          where: { tenantId: req.params.id, isDeleted: false },
        }),
        prisma.folder.count({
          where: { tenantId: req.params.id, isDeleted: false },
        }),
        prisma.file.aggregate({
          where: { tenantId: req.params.id, isDeleted: false },
          _sum: { size: true },
        }),
        prisma.file.findMany({
          where: { tenantId: req.params.id, isDeleted: false },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            name: true,
            size: true,
            createdAt: true,
            mimeType: true,
          },
        }),
      ]);

    res.json({
      tenant,
      stats: {
        users: userCount,
        files: fileCount,
        folders: folderCount,
        storageBytes: storageResult._sum.size || 0,
      },
      recentFiles,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// ─── POST /api/superadmin/orgs/:id/impersonate ────────────────────────────────
// SEC FIX #5: impersonation is now fully audit-logged with who did it,
// which org, and when. Token also carries impersonatedBy so any
// downstream action is traceable.
router.post(
  "/orgs/:id/impersonate",
  async (req: AuthRequest, res: Response) => {
    try {
      const orgAdmin = await prisma.user.findFirst({
        where: { tenantId: req.params.id, role: "ORG_ADMIN", isActive: true },
      });

      if (!orgAdmin) {
        res
          .status(404)
          .json({ error: "No active admin found for this organisation" });
        return;
      }

      const impersonateToken = jwt.sign(
        {
          userId: orgAdmin.id,
          tenantId: orgAdmin.tenantId,
          role: orgAdmin.role,
          email: orgAdmin.email,
          impersonatedBy: req.user!.userId, // SEC FIX #5: tracked in token
        },
        process.env.JWT_SECRET!,
        { expiresIn: "1h" },
      );

      // SEC FIX #5: every impersonation session is now in the audit log
      await createAuditLog({
        action: "superadmin.impersonate",
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        resourceType: "user",
        resourceId: orgAdmin.id,
        resourceName: orgAdmin.email,
        metadata: {
          impersonatedUserId: orgAdmin.id,
          impersonatedTenantId: orgAdmin.tenantId,
          impersonatedTenantName: req.params.id,
        },
        req,
      });

      res.json({
        accessToken: impersonateToken,
        user: {
          id: orgAdmin.id,
          name: orgAdmin.name,
          email: orgAdmin.email,
          role: orgAdmin.role,
          tenantId: orgAdmin.tenantId,
        },
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to impersonate" });
    }
  },
);

// ─── GET /api/superadmin/orgs/:id/users — list all users in tenant ────────────
router.get("/orgs/:id/users", async (req: AuthRequest, res: Response) => {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
    if (!tenant) {
      res.status(404).json({ error: "Organisation not found" });
      return;
    }

    const users = await prisma.user.findMany({
      where: { tenantId: req.params.id },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
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
  } catch {
    res.status(500).json({ error: "Failed to fetch organisation users" });
  }
});

// ─── PATCH /api/superadmin/orgs/:id/users/:userId — enable/disable user ───────
router.patch("/orgs/:id/users/:userId", async (req: AuthRequest, res: Response) => {
  try {
    const { isActive } = z
      .object({ isActive: z.boolean() })
      .parse(req.body);

    const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
    if (!tenant) {
      res.status(404).json({ error: "Organisation not found" });
      return;
    }

    const user = await prisma.user.findFirst({
      where: { id: req.params.userId, tenantId: req.params.id },
      select: { id: true, email: true, role: true, isActive: true },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (user.role === "SUPERADMIN") {
      res.status(403).json({ error: "Cannot modify a Superadmin" });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { isActive },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    await createAuditLog({
      action: "superadmin.user.update",
      userId: req.user!.userId,
      tenantId: req.user!.tenantId,
      resourceType: "user",
      resourceId: updated.id,
      resourceName: updated.email,
      metadata: {
        targetTenantId: req.params.id,
        isActive,
        previousIsActive: user.isActive,
      },
      req,
    });

    res.json({ user: updated });
  } catch (err: any) {
    if (err?.name === "ZodError") {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    res.status(500).json({ error: "Failed to update user" });
  }
});

export default router;
