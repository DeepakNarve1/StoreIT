import { Router, Response } from "express";
import { z } from "zod";
import { verifyAuth, AuthRequest, requireRole } from "../middleware/auth";
import { prisma } from "../utils/prisma";

const router = Router();

// Schema for defining a template
const templateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
  fields: z.array(
    z.object({
      key: z.string().min(1).max(100),
      type: z.enum(["text", "number", "date", "boolean"]),
      required: z.boolean().default(false),
    })
  ),
});

// ─── GET /api/templates ────────────────────────────────────────────────────────
router.get("/", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const templates = await prisma.metadataTemplate.findMany({
      where: { tenantId: req.user!.tenantId },
      include: {
        fields: {
          orderBy: { key: "asc" }
        }
      },
      orderBy: { name: "asc" },
    });
    res.json({ templates });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch templates" });
  }
});

// ─── POST /api/templates ───────────────────────────────────────────────────────
router.post(
  "/",
  verifyAuth,
  requireRole("ORG_ADMIN", "MANAGER", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const data = templateSchema.parse(req.body);

      const template = await prisma.$transaction(async (tx) => {
        const t = await tx.metadataTemplate.create({
          data: {
            name: data.name,
            description: data.description,
            tenantId: req.user!.tenantId,
          },
        });

        if (data.fields.length > 0) {
          await tx.metadataTemplateField.createMany({
            data: data.fields.map((f) => ({
              key: f.key,
              type: f.type,
              required: f.required,
              templateId: t.id,
            })),
          });
        }
        
        return t;
      });

      res.status(201).json({ template });
    } catch (err: any) {
      if (err.name === "ZodError") {
        res.status(400).json({ error: "Invalid layout", details: err.errors });
        return;
      }
      res.status(500).json({ error: "Failed to create template" });
    }
  }
);

// ─── PUT /api/templates/:id ────────────────────────────────────────────────────
router.put(
  "/:id",
  verifyAuth,
  requireRole("ORG_ADMIN", "MANAGER", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      // First verify it belongs to tenant
      const existing = await prisma.metadataTemplate.findFirst({
        where: { id: req.params.id, tenantId: req.user!.tenantId },
      });

      if (!existing) {
        res.status(404).json({ error: "Template not found" });
        return;
      }

      const data = templateSchema.parse(req.body);

      await prisma.$transaction(async (tx) => {
        // Update main template info
        await tx.metadataTemplate.update({
          where: { id: req.params.id },
          data: {
            name: data.name,
            description: data.description,
          },
        });

        // Delete old fields
        await tx.metadataTemplateField.deleteMany({
          where: { templateId: req.params.id },
        });

        // Insert new fields
        if (data.fields.length > 0) {
          await tx.metadataTemplateField.createMany({
            data: data.fields.map((f) => ({
              key: f.key,
              type: f.type,
              required: f.required,
              templateId: req.params.id,
            })),
          });
        }
      });

      res.json({ message: "Template updated successfully" });
    } catch (err: any) {
      if (err.name === "ZodError") {
        res.status(400).json({ error: "Invalid layout", details: err.errors });
        return;
      }
      res.status(500).json({ error: "Failed to update template" });
    }
  }
);

// ─── DELETE /api/templates/:id ─────────────────────────────────────────────────
router.delete(
  "/:id",
  verifyAuth,
  requireRole("ORG_ADMIN", "MANAGER", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const template = await prisma.metadataTemplate.findFirst({
        where: { id: req.params.id, tenantId: req.user!.tenantId },
      });

      if (!template) {
        res.status(404).json({ error: "Template not found" });
        return;
      }

      await prisma.metadataTemplate.delete({
        where: { id: req.params.id },
      });

      res.json({ message: "Template deleted" });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete template" });
    }
  }
);

export default router;
