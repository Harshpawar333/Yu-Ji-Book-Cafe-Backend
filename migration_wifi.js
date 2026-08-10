#!/usr/bin/env node
// migration_wifi.js — Add WiFi config columns to system_settings

const { execSync } = require('child_process');

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
    if (label) console.log('⚠️  Failed');
    console.error(err.stderr || err.message);
    return null;
  }
}

async function main() {
  console.log('========================================');
  console.log('  Cafe Yuji — WiFi Config Migration');
  console.log('========================================\n');

  const version = runQuery('SELECT version()', 'Connecting to Supabase');
  if (!version) {
    console.error('❌ Cannot connect. Check DB_PASSWORD in .env');
    process.exit(1);
  }

  console.log('\nRunning migration queries...');

  runQuery(
    "ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS wifi_ssid TEXT",
    "Adding wifi_ssid"
  );

  runQuery(
    "ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS wifi_password TEXT",
    "Adding wifi_password"
  );

  runQuery(
    "ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS wifi_security TEXT DEFAULT 'WPA'",
    "Adding wifi_security"
  );

  runQuery(
    "ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS wifi_hidden BOOLEAN DEFAULT FALSE",
    "Adding wifi_hidden"
  );

  runQuery(
    "ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS wifi_display_name TEXT",
    "Adding wifi_display_name"
  );

  runQuery(
    "ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS wifi_updated_at TIMESTAMPTZ",
    "Adding wifi_updated_at"
  );

  runQuery(
    "ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS wifi_updated_by TEXT",
    "Adding wifi_updated_by"
  );

  console.log('\n========================================');
  console.log('  ✅ WiFi Migration Complete!');
  console.log('========================================');
}

main();

