// Env validation FIRST — fails fast if required vars are missing
import "./utils/env";

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth.routes";
import fileRoutes from "./routes/files.routes";
import folderRoutes from "./routes/folders.routes";
import categoryRoutes from "./routes/categories.routes";
import userRoutes from "./routes/users.routes";
import superadminRoutes from "./routes/superadmin.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import permissionRoutes from "./routes/permissions.routes";
import auditRoutes from "./routes/audit.routes";
import searchRoutes from "./routes/search.routes";
import tagsRoutes from "./routes/tags.routes";
import billingRoutes from "./routes/billing.routes";
import guestRoutes from "./routes/guest.routes";
import templatesRoutes from "./routes/templates.routes";
import preferencesRoutes from "./routes/preferences.routes";
import workflowRoutes from "./routes/workflow.routes";
import signingRoutes from "./routes/signatures.routes";
import roleRoutes from "./routes/roles.routes";
import notificationRoutes from "./routes/notifications.routes";
import { globalErrorHandler } from "./middleware/errorHandler";
import { prisma, pool } from "./utils/prisma";

import path from "path";

const app = express();
app.set("trust proxy", 1);

const PORT = process.env.PORT || 5000;

function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => (origin.endsWith("/") ? origin.slice(0, -1) : origin));
}

// ─── SECURITY MIDDLEWARE ─────────────────────────────────────────────────────
app.use(helmet());

const allowedOrigins = parseAllowedOrigins(process.env.FRONTEND_URL);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("CORS origin not allowed"));
    },
    credentials: true,
  }),
);

// ─── PERFORMANCE MIDDLEWARE ──────────────────────────────────────────────────
app.use(compression() as any);
app.use("/api/billing/webhook", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser() as any);

// ─── RATE LIMITING ────────────────────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: "Too many requests, please try again later." },
  skip: (req) => req.path.startsWith("/files/upload"),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  message: { error: "Too many login attempts, please try again later." },
});

const publicSigningLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { error: "Too many signing attempts, please try again later." },
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { error: "Too many upload requests, please slow down." },
});

app.use("/api/", generalLimiter);
app.use("/api/files/upload", uploadLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/signing/public", publicSigningLimiter);

// ─── HEALTH CHECK ────────────────────────────────────────────────────────────
app.get("/health", async (_req: Request, res: Response) => {
  try {
    // Verify DB connectivity on every health check
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: "ok",
      app: "StoreIT API",
      db: "connected",
      time: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({ status: "error", db: "unreachable" });
  }
});

// ─── ROUTES ──────────────────────────────────────────────────────────────────
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
app.use("/api/auth", authRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/folders", folderRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/users", userRoutes);
app.use("/api/superadmin", superadminRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/permissions", permissionRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/tags", tagsRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/guest", guestRoutes);
app.use("/api/templates", templatesRoutes);
app.use("/api/preferences", preferencesRoutes);
app.use("/api/workflow", workflowRoutes);
app.use("/api/signing", signingRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/notifications", notificationRoutes);

// ─── 404 HANDLER ─────────────────────────────────────────────────────────────
app.use("*", (_req: Request, res: Response) => {
  res.status(404).json({ error: "Route not found" });
});

// ─── GLOBAL ERROR HANDLER (must be last) ────────────────────────────────────
app.use(
  (err: unknown, req: Request, res: Response, next: NextFunction) =>
    globalErrorHandler(err, req, res, next),
);

// ─── GRACEFUL SHUTDOWN ────────────────────────────────────────────────────────
async function shutdown(signal: string) {
  console.log(`\n${signal} received — shutting down gracefully…`);
  try {
    await prisma.$disconnect();
    await pool.end();
    console.log("✅ Database connections closed.");
  } catch (err) {
    console.error("Error during shutdown:", err);
  } finally {
    process.exit(0);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ─── UNHANDLED REJECTIONS / EXCEPTIONS ───────────────────────────────────────
process.on("unhandledRejection", (reason) => {
  console.error("[Unhandled Rejection]", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[Uncaught Exception]", err);
  shutdown("uncaughtException");
});

// ─── START SERVER ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ StoreIT API running on http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || "development"}`);
});

export default app;
