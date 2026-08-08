require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Error: Supabase URL or Key is missing from .env file.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createSuperAdmin() {
  const username = "harshpawar333@gmail.com";
  const plaintextPassword = "Yuji@321123";
  const role = "superadmin";

  console.log(`Hashing password for ${username}...`);
  const passwordHash = await bcrypt.hash(plaintextPassword, 10);

  console.log(`Inserting user into Supabase...`);
  const { data, error } = await supabase
    .from('users')
    .insert([
      {
        username: username,
        password_hash: passwordHash,
        role: role
      }
    ])
    .select();

  if (error) {
    if (error.code === '23505') { // Unique constraint violation usually
       console.log("User may already exist in the database!");
    } else {
       console.error("Error creating superadmin:", error);
    }
  } else {
    console.log("Superadmin user created successfully:");
    console.log(data);
  }
}

createSuperAdmin();
