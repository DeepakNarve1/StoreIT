import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import * as dotenv from "dotenv";
import path from "path";
import {
  isLocalPostgresHost,
  normalizeDatabaseUrlForRemotePool,
  postgresHostname,
} from "./postgres-url";

// Load root .env file
dotenv.config({ path: path.join(__dirname, "../../../../.env") });

/**
 * See `postgres-url.ts`: pg v8 maps sslmode=require to strict verification; cloud URLs
 * often need sslmode=no-verify (or uselibpqcompat=true&sslmode=require).
 */
const databaseUrl = process.env.DATABASE_URL
  ? normalizeDatabaseUrlForRemotePool(process.env.DATABASE_URL)
  : undefined;

const host = databaseUrl ? postgresHostname(databaseUrl) : null;
const useRelaxedTls = host != null && !isLocalPostgresHost(host);

export const pool = new Pool({
  connectionString: databaseUrl,
  max: 10,
  connectionTimeoutMillis: 15_000,
  idleTimeoutMillis: 30_000,
  keepAlive: true,
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
