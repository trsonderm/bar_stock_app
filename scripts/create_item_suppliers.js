const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/topshelf'
});

async function run() {
    try {
        console.log('Creating item_suppliers table...');
        const client = await pool.connect();

        await client.query(`
            CREATE TABLE IF NOT EXISTS item_suppliers (
                id SERIAL PRIMARY KEY,
                item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
                supplier_id INTEGER REFERENCES suppliers(id) ON DELETE CASCADE,
                supplier_sku TEXT,
                is_preferred BOOLEAN DEFAULT FALSE,
                UNIQUE(item_id, supplier_id)
            )
        `);

        console.log('Table created successfully.');
        client.release();
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await pool.end();
    }
}

run();
