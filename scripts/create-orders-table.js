const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/topshelf'
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Creating purchase_orders table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS purchase_orders (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER NOT NULL,
                supplier_id INTEGER,
                status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, DELIVERED, CANCELLED
                order_date TIMESTAMP DEFAULT NOW(),
                expected_delivery_date DATE,
                details JSONB, -- Store snapshot of algorithm used etc
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);

        console.log('Creating purchase_order_items table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS purchase_order_items (
                id SERIAL PRIMARY KEY,
                purchase_order_id INTEGER REFERENCES purchase_orders(id) ON DELETE CASCADE,
                item_id INTEGER NOT NULL,
                quantity INTEGER NOT NULL, -- Units ordered
                cost_at_order DECIMAL(10,2) -- Snapshot cost
            );
        `);

        console.log('Migration Complete.');
    } catch (err) {
        console.error('Migration Failed:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
