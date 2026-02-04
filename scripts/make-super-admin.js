const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5433/topshelf'
});

async function updateAdmin() {
    try {
        console.log("Updating admin permissions...");
        // Set permissions to JSON string array ["super_admin", "admin"]
        await pool.query(
            'UPDATE users SET permissions = $1 WHERE email = $2',
            [JSON.stringify(["super_admin", "admin"]), 'admin@fosters.com']
        );
        console.log("Updated.");
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

updateAdmin();
