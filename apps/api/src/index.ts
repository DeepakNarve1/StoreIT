import "dotenv/config";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import dotenv from "dotenv";
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

import path from "path";
dotenv.config({ path: path.join(__dirname, "../../.env") });

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

// ─── RATE LIMITING ───────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: "Too many requests, please try again later." },
});
app.use("/api/", limiter);

// ─── HEALTH CHECK ────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    app: "FolderIT Clone API",
    time: new Date().toISOString(),
  });
});

// ─── ROUTES ──────────────────────────────────────────────────────────────────
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

// ─── 404 HANDLER ─────────────────────────────────────────────────────────────
app.use("*", (req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ─── START SERVER ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ FolderIT Clone API running on http://localhost:${PORT}`);
});

export default app;
