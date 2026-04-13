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
function postgresHostname(connectionString: string): string | null {
  try {
    const forParse = connectionString.replace(/^postgresql:/i, "http:");
    return new URL(forParse).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isLocalPostgresHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function ensureRemotePostgresSsl(connectionString: string): string {
  try {
    const host = postgresHostname(connectionString);
    if (!host || isLocalPostgresHost(host)) {
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

const host = databaseUrl ? postgresHostname(databaseUrl) : null;
const useRelaxedTls = host != null && !isLocalPostgresHost(host);

export const pool = new Pool({
  connectionString: databaseUrl,
  max: 10,
  connectionTimeoutMillis: 15_000,
  idleTimeoutMillis: 30_000,
  keepAlive: true,
  // Match seed.ts / typical cloud Postgres: TLS is required but Node must not
  // reject self-signed or CA chains the runtime does not trust (common on Render).
  ...(useRelaxedTls ? { ssl: { rejectUnauthorized: false } } : {}),
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
