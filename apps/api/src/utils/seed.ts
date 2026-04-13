import * as dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "../../../../.env") });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import {
  isLocalPostgresHost,
  normalizeDatabaseUrlForRemotePool,
  postgresHostname,
} from "./postgres-url";

const dbUrl = process.env.DATABASE_URL
  ? normalizeDatabaseUrlForRemotePool(process.env.DATABASE_URL)
  : "";
const host = dbUrl ? postgresHostname(dbUrl) : null;
const isRemote = Boolean(host && !isLocalPostgresHost(host));

const pool = new Pool({
  connectionString: dbUrl || undefined,
  ...(isRemote ? { ssl: { rejectUnauthorized: false } } : {}),
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...");

  // Create tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: "acme-corp" },
    update: {},
    create: {
      name: "Acme Corp",
      slug: "acme-corp",
      plan: "pro",
      isActive: true,
    },
  });
  console.log("✅ Tenant created:", tenant.name);

  // Create test users for different roles in Acme Corp
  const rolesToTest = [
    { role: "ORG_ADMIN", email: "admin@acme.com", name: "Admin User", pass: "Admin@123" },
    { role: "MANAGER", email: "manager@acme.com", name: "Manager User", pass: "Manager@123" },
    { role: "EDITOR", email: "editor@acme.com", name: "Editor User", pass: "Editor@123" },
    { role: "VIEWER", email: "viewer@acme.com", name: "Viewer User", pass: "Viewer@123" },
  ];

  for (const t of rolesToTest) {
    const pwhash = await bcrypt.hash(t.pass, 12);
    await prisma.user.upsert({
      where: { email: t.email },
      update: {},
      create: {
        name: t.name,
        email: t.email,
        password: pwhash,
        role: t.role as any,
        tenantId: tenant.id,
        isActive: true,
      },
    });
    console.log(`✅ [Acme Corp] ${t.role} created: ${t.email} / ${t.pass}`);
  }

  // ── Create default categories ──────────────────────────────────────────────
  const categoryNames = [
    "Projects",
    "HR & People",
    "Finance",
    "Legal",
    "Marketing",
    "Operations",
  ];

  for (const name of categoryNames) {
    const existing = await prisma.category.findFirst({
      where: { name, tenantId: tenant.id },
    });
    if (!existing) {
      await prisma.category.create({
        data: { name, parentId: null, tenantId: tenant.id },
      });
      console.log(`✅ Category created: ${name}`);
    } else {
      console.log(`⏭️  Category already exists: ${name}`);
    }
  }

  // Create superadmin
  const superAdminPassword = await bcrypt.hash("Super@123", 12);
  const superAdminTenant = await prisma.tenant.upsert({
    where: { slug: "superadmin" },
    update: {},
    create: {
      name: "Platform Admin",
      slug: "superadmin",
      plan: "enterprise",
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "super@platform.com" },
    update: {},
    create: {
      name: "Super Admin",
      email: "super@platform.com",
      password: superAdminPassword,
      role: "SUPERADMIN",
      tenantId: superAdminTenant.id,
      isActive: true,
    },
  });
  console.log("✅ Superadmin created: super@platform.com / Super@123");

  console.log("\n✅ Seeding complete!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
