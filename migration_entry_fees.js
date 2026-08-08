#!/usr/bin/env node
// run_migration.js — runs any SQL migration file against Supabase via psql
// Usage: node run_migration.js [optional-sql-file]
// If no file given, runs the latest migration in supabase/migrations/

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

require('dotenv').config();

const DB_HOST = 'aws-1-ap-south-1.pooler.supabase.com';
const DB_PORT = '5432';
const DB_USER = 'postgres.ssdlzespwcbteafrwppk';
const DB_NAME = 'postgres';
const DB_PASS = process.env.DB_PASSWORD || 'Yuji@7840985216';

const MIGRATIONS_DIR = path.resolve(__dirname, '../supabase/migrations');

function runSQL(sqlFile) {
  console.log(`\n🚀 Running: ${path.basename(sqlFile)}\n`);
  try {
    const result = execSync(
      `PGPASSWORD='${DB_PASS}' psql -h ${DB_HOST} -p ${DB_PORT} -U "${DB_USER}" -d ${DB_NAME} -f "${sqlFile}"`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    console.log(result);
    console.log('✅ Migration completed!\n');
  } catch (err) {
    console.error('❌ Migration failed:\n', err.stderr || err.message);
    process.exit(1);
  }
}

function runQuery(sql, label = '') {
  if (label) process.stdout.write(`${label}... `);
  try {
    const result = execSync(
      `PGPASSWORD='${DB_PASS}' psql -h ${DB_HOST} -p ${DB_PORT} -U "${DB_USER}" -d ${DB_NAME} -c "${sql.replace(/"/g, '\\"')}"`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    if (label) console.log('✅');
    return result;
  } catch (err) {
    if (label) console.log('⚠️');
    return null;
  }
}

async function main() {
  // Test connection first
  console.log('========================================');
  console.log('  Cafe Yuji — Migration Runner');
  console.log('  Host:', DB_HOST);
  console.log('========================================\n');

  const version = runQuery('SELECT version()', 'Connecting to Supabase');
  if (!version) {
    console.error('❌ Cannot connect. Check DB_PASSWORD in .env');
    process.exit(1);
  }

  // Find SQL file to run
  const fileArg = process.argv[2];
  let sqlFile;

  if (fileArg) {
    sqlFile = path.resolve(fileArg);
  } else {
    // Find latest migration in supabase/migrations/
    if (!fs.existsSync(MIGRATIONS_DIR)) {
      console.error('❌ No migrations directory found at', MIGRATIONS_DIR);
      process.exit(1);
    }
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();
    if (!files.length) {
      console.error('❌ No SQL files found in', MIGRATIONS_DIR);
      process.exit(1);
    }
    sqlFile = path.join(MIGRATIONS_DIR, files[files.length - 1]);
    console.log(`Auto-selected latest migration: ${files[files.length - 1]}`);
  }

  if (!fs.existsSync(sqlFile)) {
    console.error('❌ File not found:', sqlFile);
    process.exit(1);
  }

  runSQL(sqlFile);

  // Verify key tables/columns after migration
  console.log('--- Verification ---');
  const settings = runQuery('SELECT id, entry_fee_1hr, entry_fee_2hr FROM system_settings WHERE id=1', '  system_settings fees');
  if (settings) console.log(settings.trim());

  const cols = runQuery(
    "SELECT column_name FROM information_schema.columns WHERE table_name='customers' AND column_name IN ('entry_duration','entry_fee_per_person','rfid_uid','is_member') ORDER BY column_name",
    '  customers new columns'
  );
  if (cols) console.log(cols.trim());

  const plans = runQuery('SELECT name, price, entry_fee_override FROM membership_plans ORDER BY price', '  membership_plans');
  if (plans) console.log(plans.trim());

  console.log('\n🎉 All done!\n');
}

main();
