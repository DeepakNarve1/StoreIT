import * as dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "../../../../.env") });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
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

  // Create superadmin user
  const hashedPassword = await bcrypt.hash("Admin@123", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@acme.com" },
    update: {},
    create: {
      name: "Admin User",
      email: "admin@acme.com",
      password: hashedPassword,
      role: "ORG_ADMIN",
      tenantId: tenant.id,
      isActive: true,
    },
  });
  console.log("✅ Admin user created:", admin.email);
  console.log("🔑 Password: Admin@123");

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
