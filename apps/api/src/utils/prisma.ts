import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import * as dotenv from "dotenv";
import path from "path";

// Load root .env file
dotenv.config({ path: path.join(__dirname, "../../../../.env") });

/**
 * Hosted Postgres (Render, Neon, RDS, etc.) requires TLS. If `sslmode` is omitted,
 * the driver may not match libpq defaults and connections can fail or drop with
 * "Connection terminated unexpectedly". Local dev typically does not use SSL.
 *
 * Override in DATABASE_URL if needed, e.g. `sslmode=verify-full` or
 * `uselibpqcompat=true&sslmode=require` (see PostgreSQL libpq SSL docs).
 */
function ensureRemotePostgresSsl(connectionString: string): string {
  try {
    const forParse = connectionString.replace(/^postgresql:/i, "http:");
    const u = new URL(forParse);
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return connectionString;
    }
    if (/[?&]sslmode=/i.test(connectionString)) {
      return connectionString;
    }
    const sep = connectionString.includes("?") ? "&" : "?";
    return `${connectionString}${sep}sslmode=require`;
  } catch {
    return connectionString;
  }
}

const databaseUrl = process.env.DATABASE_URL
  ? ensureRemotePostgresSsl(process.env.DATABASE_URL)
  : undefined;

export const pool = new Pool({
  connectionString: databaseUrl,
  max: 10,
  connectionTimeoutMillis: 15_000,
  idleTimeoutMillis: 30_000,
  keepAlive: true,
});

const adapter = new PrismaPg(pool);

// Prevent multiple Prisma instances in development
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development" ? ["query", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
