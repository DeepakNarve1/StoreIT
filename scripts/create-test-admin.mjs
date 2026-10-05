import * as dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

import pg from "pg";
import { createRequire } from "module";
const require = createRequire(path.join(__dirname, "../apps/api/package.json"));
const bcrypt = require("bcryptjs");

const { Client } = pg;

const client = new Client({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://storeit_db_47nq_user:VFsnc0Yw8TRr5HH3VHeYcEZPTHLQdfFx@dpg-db1mnp8u01pc73f6gqcg-a.oregon-postgres.render.com/storeit_db_47nq",
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  console.log("Connected to database...");

  // 1. Create or get Demo Tenant with 'free' plan (1 GB limit)
  let tenantRes = await client.query(
    `SELECT id, name, slug, plan FROM "Tenant" WHERE slug = $1`,
    ["demo-corp"]
  );

  let tenantId;
  if (tenantRes.rows.length === 0) {
    const insertTenant = await client.query(
      `INSERT INTO "Tenant" (id, name, slug, plan, "isActive", "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), 'Demo Corp (1GB)', 'demo-corp', 'free', true, NOW(), NOW())
       RETURNING id, name, slug, plan`
    );
    tenantId = insertTenant.rows[0].id;
    console.log("✅ Created Demo Tenant (1GB limit):", insertTenant.rows[0]);
  } else {
    tenantId = tenantRes.rows[0].id;
    // ensure plan is 'free' (1GB)
    await client.query(`UPDATE "Tenant" SET plan = 'free' WHERE id = $1`, [tenantId]);
    console.log("ℹ️ Found existing Demo Tenant:", tenantRes.rows[0]);
  }

  // 2. Create standard Categories for Demo Tenant
  const categories = ["Documents", "Images", "Invoices", "Projects"];
  for (const cat of categories) {
    const exists = await client.query(
      `SELECT id FROM "Category" WHERE name = $1 AND "tenantId" = $2`,
      [cat, tenantId]
    );
    if (exists.rows.length === 0) {
      await client.query(
        `INSERT INTO "Category" (id, name, "tenantId", "createdAt")
         VALUES (gen_random_uuid(), $1, $2, NOW())`,
        [cat, tenantId]
      );
    }
  }

  // 3. Create Test Admin User with 1GB plan
  const email = "testadmin@storeit.com";
  const pass = "Admin@123";
  const passwordHash = await bcrypt.hash(pass, 12);

  const userRes = await client.query(
    `SELECT id, email, role FROM "User" WHERE email = $1`,
    [email]
  );

  if (userRes.rows.length === 0) {
    const insertUser = await client.query(
      `INSERT INTO "User" (id, name, email, password, role, "tenantId", "isActive", "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), 'Test Admin (1GB)', $1, $2, 'ORG_ADMIN', $3, true, NOW(), NOW())
       RETURNING id, name, email, role`,
      [email, passwordHash, tenantId]
    );
    console.log(`✅ Created Test Admin: ${insertUser.rows[0].email} / ${pass}`);
  } else {
    await client.query(
      `UPDATE "User" SET password = $1, role = 'ORG_ADMIN', "tenantId" = $2, "isActive" = true WHERE email = $3`,
      [passwordHash, tenantId, email]
    );
    console.log(`✅ Updated Test Admin: ${email} / ${pass}`);
  }

  await client.end();
  console.log("\n🎉 Done!");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
