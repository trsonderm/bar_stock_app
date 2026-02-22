const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/topshelf'
});

async function run() {
    try {
        const client = await pool.connect();

        console.log('Adding cost_per_unit to item_suppliers...');
        await client.query(`
            ALTER TABLE item_suppliers 
            ADD COLUMN IF NOT EXISTS cost_per_unit NUMERIC(10,2);
        `);

        console.log('Creating purchase_orders table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS purchase_orders (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER REFERENCES organizations(id),
                supplier_id INTEGER REFERENCES suppliers(id),
                status TEXT DEFAULT 'PENDING',
                expected_delivery_date TIMESTAMP,
                details JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log('Creating purchase_order_items table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS purchase_order_items (
                id SERIAL PRIMARY KEY,
                purchase_order_id INTEGER REFERENCES purchase_orders(id) ON DELETE CASCADE,
                item_id INTEGER REFERENCES items(id),
                quantity INTEGER
            );
        `);

        console.log('Missing relations fixed successfully.');

        client.release();
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await pool.end();
    }
}

run();
