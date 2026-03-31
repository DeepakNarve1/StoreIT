import { z } from "zod";
import * as dotenv from "dotenv";
import path from "path";

// Load .env from the monorepo root before any validation
dotenv.config({ path: path.join(__dirname, "../../../../.env") });

/**
 * Validates all required environment variables at boot time.
 * The server will refuse to start if any required variable is missing,
 * preventing cryptic runtime crashes in production.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.string().default("5000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  FRONTEND_URL: z.string().url().optional(),

  // Cloudflare R2 / S3-compatible storage (optional — falls back to local disk)
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),

  // Email (optional — invite/reset/guest emails won't send without it)
  SENDGRID_API_KEY: z.string().optional(),
  FROM_EMAIL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌  Missing / invalid environment variables:");
    result.error.issues.forEach((issue) => {
      console.error(`   • ${issue.path.join(".")}: ${issue.message}`);
    });
    process.exit(1);
  }
  return result.data;
}

export const env = validateEnv();
