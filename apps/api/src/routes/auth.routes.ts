import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma";
import {
  loginUser,
  refreshAccessToken,
  hashPassword,
  validateInviteToken,
} from "../services/auth.service";
import { verifyAuth, AuthRequest, verifyCsrf } from "../middleware/auth";
import { createAuditLog } from "../services/audit.service";
import { sendPasswordResetEmail } from "../services/email.service";
import { v4 as uuid } from "uuid";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const acceptInviteSchema = z.object({
  token: z.string().uuid(),
  name: z.string().min(2),
  password: z.string().min(8),
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const result = await loginUser(email, password);

    const isProd = process.env.NODE_ENV === "production";
    res.cookie("refresh_token", result.refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax", // 'none' required for cross-domain cookies (Vercel -> Render)
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    await createAuditLog({
      action: "user.login",
      userId: result.user.id,
      tenantId: result.user.tenantId,
      resourceType: "user",
      resourceId: result.user.id,
      resourceName: result.user.email,
      req,
    });

    res.json({ user: result.user, accessToken: result.accessToken });
  } catch (err: any) {
    if (err.message === "INVALID_CREDENTIALS") {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    if (err.message === "ACCOUNT_DISABLED") {
      res.status(403).json({ error: "Your account has been disabled" });
      return;
    }
    if (err.message === "TENANT_DISABLED") {
      res.status(403).json({ error: "Your organisation account is inactive" });
      return;
    }
    if (err.name === "ZodError") {
      res.status(400).json({ error: "Invalid input", details: err.errors });
      return;
    }
    console.error("Login error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────
router.post("/refresh", verifyCsrf, async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.refresh_token;

    if (!refreshToken) {
      res.status(401).json({ error: "No refresh token" });
      return;
    }

    const result = await refreshAccessToken(refreshToken);
    res.json(result);
  } catch {
    res.status(401).json({ error: "Invalid or expired refresh token" });
  }
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
router.post("/logout", (req: Request, res: Response) => {
  res.clearCookie("refresh_token");
  res.json({ message: "Logged out successfully" });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get("/me", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        tenantId: true,
        isActive: true,
        createdAt: true,
        tenant: { select: { id: true, name: true, plan: true } },
      },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: "Something went wrong" });
  }
});

// ─── GET /api/auth/invite/:token ──────────────────────────────────────────────
router.get("/invite/:token", async (req: Request, res: Response) => {
  try {
    const invite = await validateInviteToken(req.params.token);
    res.json({
      email: invite.email,
      role: invite.role,
      tenantName: invite.tenant.name,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── POST /api/auth/invite/accept ─────────────────────────────────────────────
router.post("/invite/accept", async (req: Request, res: Response) => {
  try {
    const { token, name, password } = acceptInviteSchema.parse(req.body);

    const invite = await validateInviteToken(token);

    const existing = await prisma.user.findUnique({
      where: { email: invite.email },
    });
    if (existing) {
      res.status(400).json({ error: "User already exists" });
      return;
    }

    const hashedPassword = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email: invite.email,
        name,
        password: hashedPassword,
        role: invite.role,
        tenantId: invite.tenantId,
        isActive: true,
      },
    });

    await prisma.inviteToken.update({
      where: { token },
      data: { isUsed: true },
    });

    res.json({
      message: "Account created successfully. You can now log in.",
      email: user.email,
    });
  } catch (err: any) {
    if (err.name === "ZodError") {
      res.status(400).json({ error: "Invalid input", details: err.errors });
      return;
    }
    res.status(400).json({ error: err.message || "Something went wrong" });
  }
});

// ─── POST /api/auth/forgot-password ──────────────────────────────────────────
router.post("/forgot-password", async (req: Request, res: Response) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);

    // Always return 200 — never reveal if email exists (security)
    const user = await prisma.user.findUnique({ where: { email } });
    if (user && user.isActive) {
      // Invalidate any existing unused tokens for this email
      await prisma.passwordResetToken.updateMany({
        where: { email, isUsed: false },
        data: { isUsed: true },
      });

      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // FIX: PasswordResetToken has no User relation — email is a plain String field
      const record = await prisma.passwordResetToken.create({
        data: {
          token: uuid(),
          email,
          expiresAt,
        },
      });

      await sendPasswordResetEmail({
        email,
        token: record.token,
        name: user.name,
      });
    }

    res.json({ message: "If that email exists, a reset link has been sent." });
  } catch (err: any) {
    if (err.name === "ZodError") {
      res.status(400).json({ error: "Invalid email" });
      return;
    }
    res.status(500).json({ error: "Something went wrong" });
  }
});

// ─── POST /api/auth/reset-password ───────────────────────────────────────────
router.post("/reset-password", async (req: Request, res: Response) => {
  try {
    const { token, password } = z
      .object({
        token: z.string().uuid(),
        password: z.string().min(8),
      })
      .parse(req.body);

    const record = await prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (!record || record.isUsed || record.expiresAt < new Date()) {
      res
        .status(400)
        .json({ error: "This reset link is invalid or has expired." });
      return;
    }

    const hashed = await hashPassword(password);
    await prisma.user.update({
      where: { email: record.email },
      data: { password: hashed },
    });
    await prisma.passwordResetToken.update({
      where: { token },
      data: { isUsed: true },
    });

    res.json({ message: "Password reset successfully. You can now log in." });
  } catch (err: any) {
    if (err.name === "ZodError") {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    res.status(500).json({ error: "Something went wrong" });
  }
});

export default router;
