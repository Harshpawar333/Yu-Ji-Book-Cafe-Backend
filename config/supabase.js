// ============================================
// Supabase Client Configuration
// ============================================

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  console.error('Required: SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY');
  console.error('Available env vars:', Object.keys(process.env).filter(k => k.includes('SUPABASE')));
  // Don't exit in Lambda - let routes handle the error
  if (!process.env.AWS_EXECUTION_ENV) {
    process.exit(1);
  }
}

// Create Supabase client with optimized settings for Lambda
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    headers: {
      'Connection': 'keep-alive',
    },
  },
  db: {
    schema: 'public',
  },
});

// Test connection
async function testConnection() {
  try {
    const { data, error } = await supabase.from('system_settings').select('*').limit(1);
    if (error) throw error;
    console.log('✅ Supabase connected successfully');
    return true;
  } catch (error) {
    console.error('❌ Supabase connection failed:', error.message);
    return false;
  }
}

module.exports = { supabase, testConnection };
