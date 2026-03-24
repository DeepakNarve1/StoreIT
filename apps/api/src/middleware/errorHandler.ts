import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";

/**
 * Centralized error-handling middleware.
 * Must be registered LAST in express — after all routes.
 * Converts known error types into clean JSON responses.
 */
export function globalErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  // ── Validation errors ────────────────────────────────────────────────────
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation error",
      details: err.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      })),
    });
    return;
  }

  // ── Prisma known errors ──────────────────────────────────────────────────
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") {
      // Record not found
      res.status(404).json({ error: "Resource not found" });
      return;
    }
    if (err.code === "P2002") {
      // Unique constraint violation
      res.status(409).json({ error: "A record with that value already exists" });
      return;
    }
    if (err.code === "P2003") {
      // Foreign key constraint
      res.status(400).json({ error: "Related resource does not exist" });
      return;
    }
    console.error("[Prisma]", err.code, err.message);
    res.status(500).json({ error: "Database error" });
    return;
  }

  // ── Prisma validation errors (bad UUID shape, etc.) ──────────────────────
  if (err instanceof Prisma.PrismaClientValidationError) {
    console.error("[Prisma Validation]", err.message);
    res.status(400).json({ error: "Invalid request data" });
    return;
  }

  // ── Generic Error ────────────────────────────────────────────────────────
  if (err instanceof Error) {
    console.error("[Unhandled Error]", err.message, err.stack);
    res.status(500).json({
      error:
        process.env.NODE_ENV === "production"
          ? "Internal server error"
          : err.message,
    });
    return;
  }

  // ── Unknown non-Error throws ─────────────────────────────────────────────
  console.error("[Unknown Error]", err);
  res.status(500).json({ error: "Internal server error" });
}
