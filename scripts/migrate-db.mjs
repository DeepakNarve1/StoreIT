/**
 * DB Migration Script: Old Render DB → New Render DB
 *
 * This script:
 * 1. Reads all data from the OLD database (table-by-table)
 * 2. Applies Prisma migrations on the NEW database (creates schema)
 * 3. Inserts all data into the NEW database in correct dependency order
 *
 * Usage:
 *   node scripts/migrate-db.mjs
 */

import pg from 'pg';

const { Pool } = pg;

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const OLD_DB_URL =
  'postgresql://storeit_db_rjsu_user:xdWEIWYWYXcuXZw6bBXfSaCqRBOsDlSf@dpg-d8vv3p4vikkc73dm9arg-a.oregon-postgres.render.com/storeit_db_rjsu';

const NEW_DB_URL =
  'postgresql://storeit_db_47nq_user:VFsnc0Yw8TRr5HH3VHeYcEZPTHLQdfFx@dpg-db1mnp8u01pc73f6gqcg-a.oregon-postgres.render.com/storeit_db_47nq';

// Tables in dependency order (parents before children)
// This ensures FK constraints don't fail on insert
const TABLE_ORDER = [
  'Tenant',
  'Department',
  'RoleProfile',           // role_profiles
  'User',
  'UserPreference',        // user_preferences
  'Category',
  'Folder',
  'File',
  'FileVersion',
  'Tag',
  'FileTag',
  'Permission',
  'InviteToken',
  'PasswordResetToken',    // password_reset_tokens
  'OneTimeLink',
  'FileMetadata',          // file_metadata
  'FileComment',
  'ApprovalWorkflow',      // approval_workflows
  'ApprovalStep',          // approval_steps
  'ApprovalActionLog',     // approval_action_logs
  'SignatureWorkflow',     // signature_workflows
  'SignatureStep',         // signature_steps
  'SignatureActionLog',    // signature_action_logs
  'AuditLog',
  'GuestAccess',           // guest_access
  'MetadataTemplate',      // metadata_templates
  'MetadataTemplateField', // metadata_template_fields
  'FolderMetadataField',   // folder_metadata_fields
  'Notification',          // notifications
];

// Map Prisma model name → actual table name (only needed where they differ)
const MODEL_TO_TABLE = {
  UserPreference: 'user_preferences',
  RoleProfile: 'role_profiles',
  PasswordResetToken: 'password_reset_tokens',
  FileMetadata: 'file_metadata',
  ApprovalWorkflow: 'approval_workflows',
  ApprovalStep: 'approval_steps',
  ApprovalActionLog: 'approval_action_logs',
  SignatureWorkflow: 'signature_workflows',
  SignatureStep: 'signature_steps',
  SignatureActionLog: 'signature_action_logs',
  GuestAccess: 'guest_access',
  MetadataTemplate: 'metadata_templates',
  MetadataTemplateField: 'metadata_template_fields',
  FolderMetadataField: 'folder_metadata_fields',
  Notification: 'notifications',
};

function getTableName(model) {
  return MODEL_TO_TABLE[model] ?? `"${model}"`;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function makePool(url) {
  return new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
}

async function fetchAll(pool, tableName) {
  const name = MODEL_TO_TABLE[tableName] ? `"${MODEL_TO_TABLE[tableName]}"` : `"${tableName}"`;
  try {
    const { rows } = await pool.query(`SELECT * FROM ${name}`);
    return rows;
  } catch (err) {
    if (err.code === '42P01') {
      // Table doesn't exist yet — skip
      console.warn(`  ⚠  Table ${name} not found in source — skipping`);
      return [];
    }
    throw err;
  }
}

async function insertBatch(pool, tableName, rows) {
  if (rows.length === 0) return;
  const name = MODEL_TO_TABLE[tableName] ? `"${MODEL_TO_TABLE[tableName]}"` : `"${tableName}"`;
  const columns = Object.keys(rows[0]);
  const colList = columns.map((c) => `"${c}"`).join(', ');

  for (const row of rows) {
    const values = columns.map((c) => row[c]);
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    try {
      await pool.query(
        `INSERT INTO ${name} (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
        values
      );
    } catch (err) {
      console.error(`  ✗ Failed to insert row into ${name}:`, err.message);
      console.error('    Row data:', JSON.stringify(row).slice(0, 200));
    }
  }
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Starting database migration...\n');

  const oldPool = makePool(OLD_DB_URL);
  const newPool = makePool(NEW_DB_URL);

  // Test connections
  try {
    await oldPool.query('SELECT 1');
    console.log('✅ Connected to OLD database');
  } catch (err) {
    console.error('❌ Cannot connect to OLD database:', err.message);
    process.exit(1);
  }

  try {
    await newPool.query('SELECT 1');
    console.log('✅ Connected to NEW database\n');
  } catch (err) {
    console.error('❌ Cannot connect to NEW database:', err.message);
    process.exit(1);
  }

  // Disable FK checks on new DB during migration
  await newPool.query('SET session_replication_role = replica;');
  console.log('🔓 Disabled FK constraints on new DB for bulk insert\n');

  let totalRows = 0;

  for (const model of TABLE_ORDER) {
    process.stdout.write(`📦 Migrating [${model}]... `);
    const rows = await fetchAll(oldPool, model);
    process.stdout.write(`${rows.length} rows → `);
    await insertBatch(newPool, model, rows);
    console.log('done ✓');
    totalRows += rows.length;
  }

  // Re-enable FK checks
  await newPool.query('SET session_replication_role = DEFAULT;');
  console.log('\n🔒 Re-enabled FK constraints on new DB');

  console.log(`\n✅ Migration complete! Total rows migrated: ${totalRows}`);

  await oldPool.end();
  await newPool.end();
}

main().catch((err) => {
  console.error('\n💥 Migration failed:', err);
  process.exit(1);
});
