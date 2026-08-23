#!/usr/bin/env node
// migration_fix_sales_history.js
// Adds entry_fee_per_person and entry_duration to customer_history so that
// past-date sales totals remain accurate even when a repeat customer visits again.

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
  console.log('  Cafe Yuji — Fix Sales History Migration');
  console.log('  (Adds entry_fee_per_person + entry_duration');
  console.log('   to customer_history for accurate past-date totals)');
  console.log('========================================\n');

  // Test connection first
  const version = runQuery('SELECT version()', 'Connecting to Supabase');
  if (!version) {
    console.error('❌ Cannot connect. Check DB_PASSWORD in .env');
    process.exit(1);
  }

  console.log('\nRunning migration queries...\n');

  // Step 1: Add entry_fee_per_person column
  runQuery(
    'ALTER TABLE customer_history ADD COLUMN IF NOT EXISTS entry_fee_per_person DECIMAL(10,2)',
    'Adding entry_fee_per_person to customer_history'
  );

  // Step 2: Add entry_duration column
  runQuery(
    "ALTER TABLE customer_history ADD COLUMN IF NOT EXISTS entry_duration VARCHAR(10) DEFAULT '2hr'",
    'Adding entry_duration to customer_history'
  );

  // Step 3: Back-fill existing rows from the parent customer record
  // (best approximation for existing historical data)
  runQuery(
    `UPDATE customer_history ch SET entry_fee_per_person = c.entry_fee_per_person, entry_duration = COALESCE(c.entry_duration, '2hr') FROM customers c WHERE ch.customer_id = c.id AND ch.entry_fee_per_person IS NULL`,
    'Back-filling existing history rows from customer profiles'
  );

  // Step 4: Verify
  console.log('\nVerifying migration...');
  const result = runQuery(
    'SELECT COUNT(*) AS total, COUNT(entry_fee_per_person) AS with_fee, COUNT(entry_duration) AS with_duration FROM customer_history',
    'Checking row counts'
  );

  if (result) {
    console.log('\nVerification result:');
    console.log(result);
  }

  console.log('\n========================================');
  console.log('  ✅ Sales History Migration Complete!');
  console.log('========================================\n');
  console.log('Next steps:');
  console.log('  1. npx serverless deploy   (deploy updated backend)');
  console.log('  2. git push                (deploy updated frontend)');
}

main();
