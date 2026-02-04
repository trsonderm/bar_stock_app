const { Client } = require('pg');

const client = new Client({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:5433/topshelf'
});

async function migrate() {
    try {
        await client.connect();
        console.log('Connected to PostgreSQL...');

        console.log('Creating Suppliers Table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS suppliers (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER NOT NULL REFERENCES organizations(id),
                name TEXT NOT NULL,
                contact_email TEXT,
                contact_phone TEXT,
                delivery_days_json TEXT DEFAULT '[]', -- e.g. ["Monday", "Thursday"]
                lead_time_days INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log('Creating Item Suppliers Table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS item_suppliers (
                id SERIAL PRIMARY KEY,
                item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
                supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
                cost_per_unit DECIMAL(10, 2),
                supplier_sku TEXT,
                is_preferred BOOLEAN DEFAULT FALSE,
                UNIQUE(item_id, supplier_id)
            );
        `);

        console.log('Creating Predictive Stats Table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS predictive_stats (
                id SERIAL PRIMARY KEY,
                item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
                avg_daily_usage DECIMAL(10, 4) DEFAULT 0,
                safety_stock_rec DECIMAL(10, 2) DEFAULT 0,
                last_calculated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                override_usage_rate DECIMAL(10, 4), -- Manual admin override
                UNIQUE(item_id)
            );
        `);

        console.log('Migration Complete.');

    } catch (e) {
        console.error('Migration Failed:', e);
    } finally {
        await client.end();
    }
}

migrate();
