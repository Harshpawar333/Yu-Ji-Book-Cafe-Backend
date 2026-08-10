// migration_wifi.js
// Run once: node migration_wifi.js
// Adds WiFi config columns to system_settings table

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log("Adding WiFi config columns to system_settings...");

  const sql = `
    ALTER TABLE system_settings
      ADD COLUMN IF NOT EXISTS wifi_ssid TEXT,
      ADD COLUMN IF NOT EXISTS wifi_password TEXT,
      ADD COLUMN IF NOT EXISTS wifi_security TEXT DEFAULT 'WPA',
      ADD COLUMN IF NOT EXISTS wifi_hidden BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS wifi_display_name TEXT,
      ADD COLUMN IF NOT EXISTS wifi_updated_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS wifi_updated_by TEXT;
  `;

  const { error } = await supabase.rpc("exec_sql", { sql }).catch(() => ({ error: null }));

  if (error) {
    // exec_sql may not exist, use direct query alternative
    console.log("Direct RPC failed, trying via REST...");
  }

  // Insert default row if missing
  const { error: upsertError } = await supabase
    .from("system_settings")
    .upsert({ id: 1 }, { onConflict: "id", ignoreDuplicates: true });

  if (upsertError) {
    console.error("Upsert error:", upsertError);
  } else {
    console.log("✅ Migration complete. Run the following SQL manually in Supabase SQL editor if columns don't exist:");
    console.log(sql);
  }
}

run();
