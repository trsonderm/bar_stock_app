const Database = require('better-sqlite3');
const { Pool } = require('pg');
const path = require('path');

// SQLite Connection
const sqlitePath = path.join(__dirname, '../inventory.db');
const sqlite = new Database(sqlitePath);

// Postgres Connection
const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5433/topshelf'
});

async function migrate() {
    console.log('🚀 Starting SQLite to Postgres Migration...');

    try {
        const client = await pgPool.connect();

        // 1. Define Schema (Postgres)
        console.log('📦 Creating Postgres Schema...');
        await client.query(`
            DROP TABLE IF EXISTS support_messages CASCADE;
            DROP TABLE IF EXISTS support_tickets CASCADE;
            DROP TABLE IF EXISTS bottle_level_logs CASCADE;
            DROP TABLE IF EXISTS activity_logs CASCADE;
            DROP TABLE IF EXISTS inventory CASCADE;
            DROP TABLE IF EXISTS items CASCADE;
            DROP TABLE IF EXISTS locations CASCADE;
            DROP TABLE IF EXISTS users CASCADE;
            DROP TABLE IF EXISTS categories CASCADE;
            DROP TABLE IF EXISTS organizations CASCADE;
            DROP TABLE IF EXISTS settings CASCADE;
            DROP TABLE IF EXISTS bottle_level_options CASCADE;
            DROP TABLE IF EXISTS system_settings CASCADE;

            CREATE TABLE organizations (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                billing_status TEXT DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE locations (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                address TEXT,
                organization_id INTEGER REFERENCES organizations(id)
            );

            CREATE TABLE categories (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                stock_options TEXT, -- JSON
                organization_id INTEGER REFERENCES organizations(id)
            );

            CREATE TABLE users (
                id SERIAL PRIMARY KEY,
                first_name TEXT,
                last_name TEXT,
                email TEXT, -- Unique constraint per org or global? Legacy was global unique email? SQLite: UNIQUE
                role TEXT,
                password_hash TEXT,
                pin_hash TEXT,
                organization_id INTEGER REFERENCES organizations(id),
                permissions TEXT, -- JSON
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_super_admin BOOLEAN DEFAULT FALSE,
                address TEXT,
                phone TEXT,
                bio TEXT
            );
            CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;

            CREATE TABLE items (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT,
                secondary_type TEXT,
                unit_cost DECIMAL(10, 2) DEFAULT 0,
                organization_id INTEGER REFERENCES organizations(id),
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE inventory (
                id SERIAL PRIMARY KEY,
                item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
                location_id INTEGER REFERENCES locations(id) ON DELETE CASCADE,
                quantity INTEGER DEFAULT 0,
                organization_id INTEGER REFERENCES organizations(id),
                par_level INTEGER DEFAULT 0,
                bottle_size TEXT,
                UNIQUE(item_id, location_id)
            );

            CREATE TABLE activity_logs (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER REFERENCES organizations(id),
                user_id INTEGER REFERENCES users(id),
                action TEXT NOT NULL,
                details TEXT, -- JSON
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE settings (
                key TEXT,
                value TEXT,
                organization_id INTEGER REFERENCES organizations(id),
                PRIMARY KEY (key, organization_id)
            );

            CREATE TABLE support_tickets (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                organization_id INTEGER REFERENCES organizations(id),
                subject TEXT NOT NULL,
                status TEXT DEFAULT 'open',
                priority TEXT DEFAULT 'normal',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE support_messages (
                id SERIAL PRIMARY KEY,
                ticket_id INTEGER REFERENCES support_tickets(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id),
                message TEXT NOT NULL,
                is_staff_reply BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                attachments TEXT -- JSON array of URLs
            );

            CREATE TABLE bottle_level_options (
                id SERIAL PRIMARY KEY,
                label TEXT NOT NULL,
                value DECIMAL(3, 2) NOT NULL,
                display_order INTEGER,
                organization_id INTEGER REFERENCES organizations(id)
            );

            CREATE TABLE bottle_level_logs (
                id SERIAL PRIMARY KEY,
                activity_log_id INTEGER REFERENCES activity_logs(id),
                option_label TEXT,
                user_id INTEGER REFERENCES users(id)
            );

            -- Global Settings for Super Admin
            CREATE TABLE system_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            );
        `);

        // 2. Transfer Data
        console.log('🔄 Transferring Data...');

        const transfer = async (tableStr, columns) => {
            const rows = sqlite.prepare(`SELECT * FROM ${tableStr}`).all();
            if (rows.length === 0) return;

            console.log(`   -> ${tableStr} (${rows.length} rows)`);

            // Build Query
            const cols = columns.join(', ');
            const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
            const sql = `INSERT INTO ${tableStr} (${cols}) VALUES (${placeholders})`;

            for (const row of rows) {
                const values = columns.map(c => {
                    // Handle JSON fields that might be strings in SQLite
                    if (['permissions', 'details', 'stock_options', 'attachments'].includes(c)) {
                        return row[c]; // Pass string, Postgres driver handles it or expects string for TEXT columns
                    }
                    return row[c];
                });
                await client.query(sql, values);
            }

            // Reset Sequence
            await client.query(`SELECT setval(pg_get_serial_sequence('${tableStr}', 'id'), (SELECT MAX(id) FROM ${tableStr}) + 1)`);
        };

        // Define Columns explicitly to match SQLite select *
        // We assume SQLite columns match Postgres columns defined above roughly.

        // Organizations
        await transfer('organizations', ['id', 'name', 'billing_status']);

        // Locations
        await transfer('locations', ['id', 'name', 'address', 'organization_id']);

        // Categories
        await transfer('categories', ['id', 'name', 'stock_options', 'organization_id']);

        // Users
        // SQLite might not have 'address', 'phone', 'bio'.
        // We transfer common columns.
        const users = sqlite.prepare('SELECT * FROM users').all();
        console.log(`   -> users (${users.length} rows)`);
        const validUserIds = new Set(); // Track valid IDs

        for (const u of users) {
            validUserIds.add(u.id);
            // Handle missing is_super_admin column in SQLite source if it doesn't exist?
            // Seeding script added it? No, schema in seed script didn't have is_super_admin column on users table command?
            // Wait, seed script logic: "Our schema migration didn't seemingly add is_super_admin".
            // We'll rely on role='admin' + email='admin@fosters.com' logic or simple copy.
            await client.query(`
                INSERT INTO users (id, first_name, last_name, email, role, password_hash, pin_hash, organization_id, permissions)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             `, [u.id, u.first_name, u.last_name, u.email, u.role, u.password_hash, u.pin_hash, u.organization_id, u.permissions]);
        }
        await client.query(`SELECT setval('users_id_seq', (SELECT MAX(id) FROM users) + 1)`);

        // Items
        await transfer('items', ['id', 'name', 'type', 'secondary_type', 'unit_cost', 'organization_id', 'description']);

        // Inventory
        await transfer('inventory', ['id', 'item_id', 'location_id', 'quantity', 'organization_id']); // Bottle size/par level might be missing in source

        // Activity Logs
        // Custom transfer to filter orphans
        {
            const logs = sqlite.prepare('SELECT * FROM activity_logs').all();
            console.log(`   -> activity_logs (${logs.length} rows)`);

            for (const log of logs) {
                if (log.user_id && !validUserIds.has(log.user_id)) {
                    // console.log(`Skipping orphaned log id ${log.id} (user_id ${log.user_id} not found)`);
                    continue;
                }
                await client.query(`
                    INSERT INTO activity_logs (id, organization_id, user_id, action, details, timestamp)
                    VALUES ($1, $2, $3, $4, $5, $6)
                `, [log.id, log.organization_id, log.user_id, log.action, log.details, log.timestamp]);
            }
            await client.query(`SELECT setval('activity_logs_id_seq', (SELECT MAX(id) FROM activity_logs) + 1)`);

        }

        // Settings (Composite Key, no sequence)
        const settings = sqlite.prepare('SELECT * FROM settings').all();

        console.log(`   -> settings (${settings.length} rows)`);
        for (const s of settings) {
            await client.query('INSERT INTO settings (key, value, organization_id) VALUES ($1, $2, $3)', [s.key, s.value, s.organization_id]);
        }

        // Support Tickets
        await transfer('support_tickets', ['id', 'user_id', 'organization_id', 'subject', 'status', 'created_at']);

        // Support Messages
        await transfer('support_messages', ['id', 'ticket_id', 'user_id', 'message', 'created_at', 'attachments']);

        // Bottle Level Options (if any)
        try {
            await transfer('bottle_level_options', ['id', 'label', 'value', 'display_order', 'organization_id']);
        } catch (e) { console.log('   (Skipping bottle_level_options - might not exist in source)'); }

        console.log('✅ Migration Complete!');
        client.release();
        process.exit(0);

    } catch (err) {
        console.error('❌ Migration Failed:', err);
        process.exit(1);
    }
}

migrate();
