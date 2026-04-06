import { Router, Response } from "express";
import { verifyAuth, AuthRequest } from "../middleware/auth";
import { prisma } from "../utils/prisma";

const router = Router();

router.get("/", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: {
          tenantId: req.user!.tenantId,
          userId: req.user!.userId,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          type: true,
          title: true,
          message: true,
          resourceType: true,
          resourceId: true,
          link: true,
          isRead: true,
          createdAt: true,
        },
      }),
      prisma.notification.count({
        where: {
          tenantId: req.user!.tenantId,
          userId: req.user!.userId,
          isRead: false,
        },
      }),
    ]);

    res.json({ items, unreadCount });
  } catch {
    res.status(500).json({ error: "Failed to load notifications" });
  }
});

router.post("/:id/read", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const result = await prisma.notification.updateMany({
      where: {
        id: req.params.id,
        tenantId: req.user!.tenantId,
        userId: req.user!.userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    if (result.count === 0) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to update notification" });
  }
});

router.post("/read-all", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.notification.updateMany({
      where: {
        tenantId: req.user!.tenantId,
        userId: req.user!.userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to mark notifications as read" });
  }
});

export default router;
