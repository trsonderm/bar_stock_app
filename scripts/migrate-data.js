const Database = require('better-sqlite3');
const { Pool } = require('pg');
const path = require('path');

const sqlite = new Database(path.join(process.cwd(), 'inventory.db'));
const pg = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/topshelf'
});

// Tables in dependency order
const TABLES = [
    'organizations',
    'system_settings',
    'users',
    'locations',
    'categories',
    'items',
    'inventory',
    'suppliers',
    'activity_logs',
    'bottle_level_options',
    'bottle_level_logs',
    'settings',
    'organization_tokens',
    'user_locations',
    'pending_orders'
    // 'support_tickets', 'support_messages' (if any)
];

// JSON Columns that need parsing from string (sqlite) to object (pg)
// SQLite stores JSON as string. Postgres (pg) wants object for JSONB columns? Or string works too?
// PG driver usually accepts objects for JSONB.
const JSON_COLS = {
    'users': ['permissions'],
    'organizations': ['ai_ordering_config'],
    'suppliers': ['delivery_days_json', 'order_days_json'],
    'categories': ['stock_options', 'sub_categories'],
    'activity_logs': ['details'],
    'support_messages': ['attachments'],
    'pending_orders': ['items_json']
};

const BOOL_COLS = {
    'organizations': ['sms_enabled'],
    'items': ['track_quantity'], // Mapped to INT in schema? Schema says Integer? Wait, my schema.sql says INTEGER for track_quantity.
    // Let's check schema.sql:
    // items.track_quantity INTEGER DEFAULT 1. So no bool conversion needed there.
    // organizations.sms_enabled BOOLEAN. SQLite has 0/1. PG needs false/true.
    'user_locations': ['is_primary', 'receive_daily_report'],
    'bottle_level_options': ['is_active']
};

async function migrate() {
    console.log('Starting Migration...');
    const client = await pg.connect();

    try {
        for (const table of TABLES) {
            console.log(`Migrating ${table}...`);
            const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();

            if (rows.length === 0) continue;

            // Get columns from first row
            const cols = Object.keys(rows[0]);
            const colNames = cols.map(c => `"${c}"`).join(', ');
            const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');

            for (const row of rows) {
                const values = cols.map(col => {
                    let val = row[col];

                    // Handle JSON
                    if (JSON_COLS[table] && JSON_COLS[table].includes(col)) {
                        try {
                            if (val && typeof val === 'string') return JSON.parse(val);
                        } catch (e) {
                            return []; // fallback
                        }
                    }

                    // Handle Boolean
                    if (BOOL_COLS[table] && BOOL_COLS[table].includes(col)) {
                        return val === 1;
                    }

                    return val;
                });

                // Conflict? We just wiped DB so Insert should be fine.
                // However, we must preserve IDs.
                // PG sequences won't auto-update. We just insert explicit IDs.

                await client.query(
                    `INSERT INTO ${table} (${colNames}) VALUES (${placeholders})`,
                    values
                );
            }
            console.log(`Migrated ${rows.length} rows for ${table}`);

            // Update Sequence
            // SELECT setval(pg_get_serial_sequence('tablename', 'id'), coalesce(max(id)+1, 1), false) FROM tablename;
            try {
                // Not all tables have 'id' (system_settings doesnt). 
                if (table !== 'system_settings') {
                    await client.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id), 1) ) FROM ${table}`);
                }
            } catch (seqErr) {
                console.warn(`Sequence update failed for ${table} (might not have serial id):`, seqErr.message);
            }
        }
        console.log('Migration Complete.');

    } catch (e) {
        console.error('Migration Failed:', e);
    } finally {
        client.release();
        pg.end(); // close pool
    }
}

migrate();
