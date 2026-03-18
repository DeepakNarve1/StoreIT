import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma";
import {
  loginUser,
  refreshAccessToken,
  hashPassword,
  validateInviteToken,
} from "../services/auth.service";
import { verifyAuth, AuthRequest } from "../middleware/auth";

const router = Router();

// ─── VALIDATION SCHEMAS ───────────────────────────────────────────────────────
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

    // Send refresh token as httpOnly cookie
    res.cookie("refresh_token", result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({
      user: result.user,
      accessToken: result.accessToken,
    });
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
    // Zod validation error
    if (err.name === "ZodError") {
      res.status(400).json({ error: "Invalid input", details: err.errors });
      return;
    }
    console.error("Login error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────
router.post("/refresh", async (req: Request, res: Response) => {
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
        tenant: {
          select: { id: true, name: true, plan: true },
        },
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
// Frontend calls this to validate invite link before showing the form
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
// User fills in name + password from invite email link
router.post("/invite/accept", async (req: Request, res: Response) => {
  try {
    const { token, name, password } = acceptInviteSchema.parse(req.body);

    const invite = await validateInviteToken(token);

    // Check if email already registered
    const existing = await prisma.user.findUnique({
      where: { email: invite.email },
    });
    if (existing) {
      res.status(400).json({ error: "User already exists" });
      return;
    }

    // Create user
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

    // Mark invite as used
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

export default router;
