require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Error: Supabase URL or Key is missing from .env file.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUsers() {
  console.log("Checking users in the 'users' table...");
  const { data, error } = await supabase.from('users').select('*');
  
  if (error) {
    console.error("Error fetching users:", error);
    return;
  }
  
  if (data && data.length === 0) {
    console.log("No users found.");
    return;
  }
  
  console.log(`Found ${data.length} user(s):`);
  console.log(JSON.stringify(data, null, 2));
}

checkUsers();
