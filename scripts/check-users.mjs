import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://storeit_db_47nq_user:VFsnc0Yw8TRr5HH3VHeYcEZPTHLQdfFx@dpg-db1mnp8u01pc73f6gqcg-a.oregon-postgres.render.com/storeit_db_47nq',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  const users = await client.query('SELECT id, email, name, role, "tenantId", "createdAt" FROM "User"');
  const tenants = await client.query('SELECT id, name, slug, plan FROM "Tenant"');
  console.log('--- TENANTS ---');
  console.log(JSON.stringify(tenants.rows, null, 2));
  console.log('--- USERS ---');
  console.log(JSON.stringify(users.rows, null, 2));
  await client.end();
}

run().catch(console.error);
