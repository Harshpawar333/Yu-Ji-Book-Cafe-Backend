#!/usr/bin/env node
// migration_discounts.js — Add discount columns to system_settings and customers

const { execSync } = require('child_process');
const path = require('path');

require('dotenv').config();

const DB_HOST = 'aws-1-ap-south-1.pooler.supabase.com';
const DB_PORT = '5432';
const DB_USER = 'postgres.ssdlzespwcbteafrwppk';
const DB_NAME = 'postgres';
const DB_PASS = process.env.DB_PASSWORD || 'Yuji@7840985216';

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
    if (label) console.log('⚠️ Failed');
    console.error(err.stderr || err.message);
    return null;
  }
}

async function main() {
  console.log('========================================');
  console.log('  Cafe Yuji — Discount Migration');
  console.log('========================================\n');

  const version = runQuery('SELECT version()', 'Connecting to Supabase');
  if (!version) {
    console.error('❌ Cannot connect. Check DB_PASSWORD in .env');
    process.exit(1);
  }

  console.log('\nRunning migration queries...');

  runQuery(
    "ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS max_discount_percent INTEGER NOT NULL DEFAULT 15",
    "Adding max_discount_percent to system_settings"
  );

  runQuery(
    "ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_discount_given NUMERIC(10,2) DEFAULT 0",
    "Adding total_discount_given to customers"
  );

  console.log('\n✅ Migration completed successfully!');
}

main();
