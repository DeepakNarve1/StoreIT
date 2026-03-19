import { Router, Response, Request } from "express";
import { z, ZodError } from "zod";
import { verifyAuth, AuthRequest } from "../middleware/auth";
import { prisma } from "../utils/prisma";
import { v4 as uuid } from "uuid";
import { getFileViewUrl } from "../services/storage.service";

const router = Router();

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (val: unknown): val is string =>
  typeof val === "string" && UUID_REGEX.test(val);

const grantSchema = z.object({
  resourceType: z.enum(["file", "folder"]),
  resourceId: z.string().uuid(),
  grantedTo: z.enum(["all", "user", "department"]),
  userId: z.string().uuid().optional().nullable(),
  department: z.string().optional().nullable(),
  action: z.enum(["read", "write", "delete", "admin"]),
  expiresAt: z.string().datetime().optional().nullable(),
});

// ─── GET /api/permissions/view/:token ─────────────────────────────────────────
// Public route — no auth needed
router.get("/view/:token", async (req: Request, res: Response) => {
  try {
    const record = await prisma.oneTimeLink.findUnique({
      where: { token: req.params.token },
      include: { file: true },
    });

    // Reject if not found, already used, or expired
    if (!record) {
      res.status(404).json({ error: "Link not found" });
      return;
    }
    if (record.isUsed) {
      res.status(403).json({ error: "This link has already been used" });
      return;
    }
    if (record.expiresAt < new Date()) {
      res.status(403).json({ error: "This link has expired" });
      return;
    }

    // Mark as used immediately — prevents replay attack
    await prisma.oneTimeLink.update({
      where: { token: req.params.token },
      data: { isUsed: true },
    });

    // Get signed URL from storage
    const viewUrl = await getFileViewUrl(record.file.storageKey, 300);

    res.json({
      file: {
        id: record.file.id,
        name: record.file.name,
        mimeType: record.file.mimeType,
        size: record.file.size,
        viewUrl,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to access file" });
  }
});

// ─── GET /api/permissions/:resourceType/:resourceId ───────────────────────────
router.get(
  "/:resourceType/:resourceId",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const { resourceType, resourceId } = req.params;

      if (!isValidUUID(resourceId)) {
        res.status(400).json({ error: "Invalid resource ID" });
        return;
      }

      const permissions = await prisma.permission.findMany({
        where: { resourceType, resourceId },
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      res.json({ permissions });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch permissions" });
    }
  },
);

// ─── POST /api/permissions ────────────────────────────────────────────────────
router.post("/", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const data = grantSchema.parse(req.body);

    // Verify resource belongs to tenant
    if (data.resourceType === "file") {
      const file = await prisma.file.findFirst({
        where: { id: data.resourceId, tenantId: req.user!.tenantId },
      });
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }
    } else {
      const folder = await prisma.folder.findFirst({
        where: { id: data.resourceId, tenantId: req.user!.tenantId },
      });
      if (!folder) {
        res.status(404).json({ error: "Folder not found" });
        return;
      }
    }

    // Check if permission already exists
    const existing = await prisma.permission.findFirst({
      where: {
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        grantedTo: data.grantedTo,
        userId: data.userId ?? null,
        action: data.action,
      },
    });

    if (existing) {
      res.status(400).json({ error: "Permission already exists" });
      return;
    }

    const permission = await prisma.permission.create({
      data: {
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        grantedTo: data.grantedTo,
        userId: data.userId ?? null,
        action: data.action,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        folderId: data.resourceType === "folder" ? data.resourceId : null,
        fileId: data.resourceType === "file" ? data.resourceId : null,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    res.status(201).json({ permission });
  } catch (err: any) {
    if (err.name === "ZodError") {
      console.error("Zod validation error:", err.errors);
      res.status(400).json({ error: "Invalid input", details: err.errors });
      return;
    }
    console.error("Permission grant error:", err);
    res.status(500).json({ error: "Failed to grant permission" });
  }
});

// ─── DELETE /api/permissions/:id ──────────────────────────────────────────────
router.delete("/:id", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const permission = await prisma.permission.findUnique({
      where: { id: req.params.id },
    });

    if (!permission) {
      res.status(404).json({ error: "Permission not found" });
      return;
    }

    await prisma.permission.delete({ where: { id: req.params.id } });
    res.json({ message: "Permission removed" });
  } catch (err) {
    res.status(500).json({ error: "Failed to remove permission" });
  }
});

// ─── POST /api/permissions/one-time-link ──────────────────────────────────────
router.post(
  "/one-time-link",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const { fileId, expiresInHours = 24 } = z
        .object({
          fileId: z.string().uuid(),
          expiresInHours: z.number().min(1).max(168).default(24),
        })
        .parse(req.body);

      const file = await prisma.file.findFirst({
        where: { id: fileId, tenantId: req.user!.tenantId, isDeleted: false },
      });

      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      const token = uuid();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + expiresInHours);

      await prisma.oneTimeLink.create({
        data: {
          token,
          fileId,
          expiresAt,
          tenantId: req.user!.tenantId,
        },
      });

      const link = `${process.env.APP_URL}/view/${token}`;
      res.json({ link, expiresAt });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "ZodError") {
        res.status(400).json({ error: "Invalid input" });
        return;
      }
      res.status(500).json({ error: "Failed to create link" });
    }
  },
);

export default router;
