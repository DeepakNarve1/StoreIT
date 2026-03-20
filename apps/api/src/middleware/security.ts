// ─── SEC FIX #3: MIME type allowlist ─────────────────────────────────────────
// Only allow safe, known MIME types. Executables, scripts, and SVG
// (which can contain embedded JS) are explicitly blocked.
// This runs BEFORE multer saves to memory, rejecting disallowed types early.

import { Request, Response, NextFunction } from "express";
import multer from "multer";

const ALLOWED_MIME_TYPES = new Set([
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/rtf",
  "text/plain",
  "text/csv",
  // Images (no SVG — it can contain scripts)
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/tiff",
  // Video
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  // Audio
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/mp4",
  // Archives
  "application/zip",
  "application/x-zip-compressed",
  "application/x-rar-compressed",
  "application/x-7z-compressed",
  "application/gzip",
  // Data
  "application/json",
  "text/xml",
  "application/xml",
]);

// Dangerous extensions that should never be uploaded regardless of MIME
const BLOCKED_EXTENSIONS = new Set([
  ".exe",
  ".bat",
  ".cmd",
  ".sh",
  ".ps1",
  ".msi",
  ".dll",
  ".so",
  ".dylib",
  ".app",
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".mjs",
  ".cjs",
  ".php",
  ".py",
  ".rb",
  ".pl",
  ".go",
  ".html",
  ".htm",
  ".svg",
  ".xhtml",
  ".jar",
  ".class",
  ".war",
  ".vbs",
  ".wsf",
  ".hta",
]);

export const validateMimeType = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const files = (req as any).files as Express.Multer.File[] | undefined;
  const file = (req as any).file as Express.Multer.File | undefined;
  const allFiles = files ?? (file ? [file] : []);

  for (const f of allFiles) {
    // Check MIME type
    if (!ALLOWED_MIME_TYPES.has(f.mimetype)) {
      res.status(400).json({
        error: `File type not allowed: ${f.mimetype}`,
        file: f.originalname,
      });
      return;
    }

    // Double-check extension — clients can lie about MIME type
    const ext = require("path").extname(f.originalname).toLowerCase();
    if (BLOCKED_EXTENSIONS.has(ext)) {
      res.status(400).json({
        error: `File extension not allowed: ${ext}`,
        file: f.originalname,
      });
      return;
    }
  }

  next();
};

// SEC FIX #4: Signed URL expiry constants — single source of truth
// so every presign call uses a consistent, short-lived window.
export const SIGNED_URL_TTL = {
  VIEW: 3600, // 1 hour — file preview modal
  DOWNLOAD: 300, // 5 minutes — download redirect
  ONE_TIME: 300, // 5 minutes — one-time link (already consumed by then)
} as const;
