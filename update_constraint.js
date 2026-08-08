const { Client } = require('pg');

const run = async () => {
    // The password from your local environment setup
    const password = encodeURIComponent('Yuji@7840985216');
    const projectRef = 'ssdlzespwcbteafrwppk';

    // Direct database connection string
    const connectionString = `postgresql://postgres:${password}@db.${projectRef}.supabase.co:5432/postgres`;

    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log("Connecting to Supabase Postgres database...");
        await client.connect();

        console.log("Connected! Applying constraints...");

        // Drop and Re-add users constraint
        await client.query("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;");
        await client.query("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('superadmin', 'admin', 'manager', 'staff'));");
        console.log("✅ 'users' table constraint updated.");

        // Drop and Re-add inventory_users constraint
        await client.query("ALTER TABLE inventory_users DROP CONSTRAINT IF EXISTS inventory_users_role_check;");
        await client.query("ALTER TABLE inventory_users ADD CONSTRAINT inventory_users_role_check CHECK (role IN ('superadmin', 'admin', 'manager', 'staff', 'viewer'));");
        console.log("✅ 'inventory_users' table constraint updated.");

        console.log("🎉 All constraints successfully updated!");
    } catch (err) {
        console.error("❌ Error updating constraints:", err);
    } finally {
        await client.end();
    }
};

run();
