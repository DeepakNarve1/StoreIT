// FIX #9: removed duplicate dotenv.config() call — only one load needed
import "dotenv/config";

import express from "express";
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

import path from "path";

const app = express();
const PORT = process.env.PORT || 5000;

// ─── SECURITY MIDDLEWARE ─────────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  }),
);

// ─── PERFORMANCE MIDDLEWARE ──────────────────────────────────────────────────
app.use(compression() as any);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser() as any);

// ─── RATE LIMITING ────────────────────────────────────────────────────────────
// General API limiter — auth, reads, etc.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: "Too many requests, please try again later." },
  skip: (req) => req.path.startsWith("/files/upload"),
});

// FIX #6: Upload gets its own generous limiter so bulk uploads
// (20 files at once) don't hit 429 after the global 100-req cap.
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { error: "Too many upload requests, please slow down." },
});

app.use("/api/", generalLimiter);
app.use("/api/files/upload", uploadLimiter);

// ─── HEALTH CHECK ────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    app: "StoreIT API",
    time: new Date().toISOString(),
  });
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

// ─── 404 HANDLER ─────────────────────────────────────────────────────────────
app.use("*", (req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ─── GRACEFUL SHUTDOWN ────────────────────────────────────────────────────────
process.on("SIGTERM", () => {
  console.log("SIGTERM received — shutting down gracefully");
  process.exit(0);
});

// ─── START SERVER ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ StoreIT API running on http://localhost:${PORT}`);
});

export default app;
