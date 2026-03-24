import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  let tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: "Test Tenant",
        slug: "test-tenant-" + Date.now(),
        plan: "enterprise",
      },
    });
  }

  const testUsers = [
    {
      email: "superadmin@test.com",
      name: "Test Superadmin",
      role: "SUPERADMIN",
    },
    { email: "orgadmin@test.com", name: "Test Org Admin", role: "ORG_ADMIN" },
    { email: "manager@test.com", name: "Test Manager", role: "MANAGER" },
    { email: "editor@test.com", name: "Test Editor", role: "EDITOR" },
    { email: "viewer@test.com", name: "Test Viewer", role: "VIEWER" },
  ];

  console.log("--- Checking & Creating Test Users ---");
  for (const tu of testUsers) {
    let user = await prisma.user.findUnique({ where: { email: tu.email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: tu.email,
          name: tu.name,
          role: tu.role as import("@prisma/client").Role,
          password: passwordHash,
          tenantId: tenant.id,
        },
      });
      console.log(`✅ Created: ${tu.email} (${tu.role})`);
    } else {
      console.log(`ℹ️ Already exists: ${tu.email} (${user.role})`);
    }
  }

  console.log("\n--- HOW TO TEST ---");
  console.log("Login with any of the emails above.");
  console.log("Password for all is: password123");
  console.log("");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
