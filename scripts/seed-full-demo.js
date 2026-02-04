const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/topshelf'
});

async function seed() {
    console.log('Starting Full Demo Seed...');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Clean Slate (Optional, but good for "seed the entire database")
        // Truncate cascade to wipe all data
        console.log('Wiping data...');
        await client.query('TRUNCATE TABLE organizations CASCADE');
        // Users, Items, everything cascades from organizations usually, but generic tables might not.
        // Also truncate system_settings
        await client.query('TRUNCATE TABLE system_settings');

        // 1. Create Organizations
        console.log('Creating Orgs...');
        const org1Res = await client.query("INSERT INTO organizations (name, subdomain) VALUES ('Downtown Bar', 'downtown') RETURNING id");
        const org1Id = org1Res.rows[0].id; // 1?

        const org2Res = await client.query("INSERT INTO organizations (name, subdomain) VALUES ('Uptown Club', 'uptown') RETURNING id");
        const org2Id = org2Res.rows[0].id; // 2?

        // 2. Create Users (matching Login Page buttons)
        console.log('Creating Users...');
        const hash = bcrypt.hashSync('password', 10);
        // PIN '1234'
        const pinHash = '1234'; // Using plaintext as per my previous config/auth.ts logic

        // Super Admin
        await client.query(`
            INSERT INTO users (first_name, last_name, email, password_hash, pin_hash, role, permissions, organization_id)
            VALUES ('Super', 'Admin', 'admin@topshelf.com', $1, $2, 'admin', '["super_admin", "all"]', $3)
        `, [hash, pinHash, org1Id]);

        // Org 1 Manager
        await client.query(`
            INSERT INTO users (first_name, last_name, email, password_hash, pin_hash, role, permissions, organization_id)
            VALUES ('Downtown', 'Manager', 'manager@downtown.com', $1, $2, 'admin', '["all"]', $3)
        `, [hash, pinHash, org1Id]);

        // Org 1 Staff
        await client.query(`
            INSERT INTO users (first_name, last_name, email, password_hash, pin_hash, role, permissions, organization_id)
            VALUES ('Downtown', 'Staff', 'user@downtown.com', $1, $2, 'user', '["read_inventory"]', $3)
        `, [hash, pinHash, org1Id]);

        // Org 2 Manager
        await client.query(`
            INSERT INTO users (first_name, last_name, email, password_hash, pin_hash, role, permissions, organization_id)
            VALUES ('Uptown', 'Manager', 'manager@uptown.com', $1, $2, 'admin', '["all"]', $3)
        `, [hash, pinHash, org2Id]);

        // Org 2 Staff
        await client.query(`
            INSERT INTO users (first_name, last_name, email, password_hash, pin_hash, role, permissions, organization_id)
            VALUES ('Uptown', 'Staff', 'user@uptown.com', $1, $2, 'user', '["read_inventory"]', $3)
        `, [hash, pinHash, org2Id]);

        // 3. Create Locations
        await client.query("INSERT INTO locations (name, organization_id) VALUES ('Main Bar', $1), ('Patio Bar', $1)", [org1Id]);
        await client.query("INSERT INTO locations (name, organization_id) VALUES ('VIP Lounge', $1), ('Main Room', $1)", [org2Id]);

        // 4. Create System Settings (Quick Login Enabled by default)
        await client.query("INSERT INTO system_settings (key, value) VALUES ('quick_login_enabled', 'true')");

        // 5. Populate Inventory (Basic set for Downtown)
        const items = [
            { name: "Tito's Vodka", type: "Liquor" },
            { name: "Jack Daniel's", type: "Liquor" },
            { name: "Bud Light", type: "Beer" }
        ];

        const loc1 = await client.query('SELECT id FROM locations WHERE organization_id = $1 LIMIT 1', [org1Id]);
        const loc1Id = loc1.rows[0].id;

        for (const i of items) {
            const res = await client.query("INSERT INTO items (name, type, organization_id, unit_cost) VALUES ($1, $2, $3, 10.00) RETURNING id", [i.name, i.type, org1Id]);
            await client.query("INSERT INTO inventory (item_id, location_id, quantity, organization_id) VALUES ($1, $2, 50, $3)", [res.rows[0].id, loc1Id, org1Id]);
        }

        await client.query('COMMIT');
        console.log('Full Seed Complete!');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Seed Failed', e);
    } finally {
        client.release();
        pool.end();
    }
}

seed();
