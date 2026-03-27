import { Router, Response } from "express";
import { z } from "zod";
import { verifyAuth, AuthRequest } from "../middleware/auth";
import { prisma } from "../utils/prisma";

const router = Router();

const sidebarOrderSchema = z.object({
  order: z.array(z.string().min(1)).max(50),
});

const folderOrderSchema = z.object({
  folderId: z.string().uuid(),
  files: z.array(z.string().uuid()).max(500).default([]),
  folders: z.array(z.string().uuid()).max(500).default([]),
});

router.get("/sidebar-order", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.user!;
    const pref = await prisma.userPreference.findUnique({
      where: { userId_key: { userId, key: "sidebar_order" } },
      select: { value: true },
    });
    const order = Array.isArray((pref?.value as any)?.order)
      ? ((pref?.value as any).order as unknown[]).filter(
          (x): x is string => typeof x === "string",
        )
      : [];
    res.json({ order });
  } catch {
    res.status(500).json({ error: "Failed to load sidebar order" });
  }
});

router.put("/sidebar-order", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { order } = sidebarOrderSchema.parse(req.body);
    const { userId, tenantId } = req.user!;
    await prisma.userPreference.upsert({
      where: { userId_key: { userId, key: "sidebar_order" } },
      create: {
        userId,
        tenantId,
        key: "sidebar_order",
        value: { order },
      },
      update: {
        value: { order },
      },
    });
    res.json({ ok: true });
  } catch (err: any) {
    if (err?.name === "ZodError") {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }
    res.status(500).json({ error: "Failed to save sidebar order" });
  }
});

router.get("/folder-order", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const folderId = String(req.query.folderId ?? "");
    const parsed = z.string().uuid().safeParse(folderId);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid folderId" });
      return;
    }
    const { userId } = req.user!;
    const key = `folder_order:${folderId}`;
    const pref = await prisma.userPreference.findUnique({
      where: { userId_key: { userId, key } },
      select: { value: true },
    });
    const value = (pref?.value as any) ?? {};
    const files = Array.isArray(value.files)
      ? (value.files as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    const folders = Array.isArray(value.folders)
      ? (value.folders as unknown[]).filter(
          (x): x is string => typeof x === "string",
        )
      : [];
    res.json({ files, folders });
  } catch {
    res.status(500).json({ error: "Failed to load folder order" });
  }
});

router.put("/folder-order", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { folderId, files, folders } = folderOrderSchema.parse(req.body);
    const { userId, tenantId } = req.user!;
    const key = `folder_order:${folderId}`;
    await prisma.userPreference.upsert({
      where: { userId_key: { userId, key } },
      create: {
        userId,
        tenantId,
        key,
        value: { files, folders },
      },
      update: {
        value: { files, folders },
      },
    });
    res.json({ ok: true });
  } catch (err: any) {
    if (err?.name === "ZodError") {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }
    res.status(500).json({ error: "Failed to save folder order" });
  }
});

export default router;

