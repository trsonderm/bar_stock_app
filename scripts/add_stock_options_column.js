const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/topshelf'
});

async function run() {
    try {
        const client = await pool.connect();

        console.log('Adding stock_options column to items table...');

        await client.query(`
            ALTER TABLE items 
            ADD COLUMN IF NOT EXISTS stock_options JSONB;
        `);

        console.log('Column added successfully.');

        client.release();
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await pool.end();
    }
}

run();
