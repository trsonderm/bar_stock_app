const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/topshelf',
});

async function run() {
    const client = await pool.connect();
    try {
        console.log('Adding low_stock_threshold column to items table...');

        await client.query(`
            ALTER TABLE items 
            ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER DEFAULT 5;
        `);

        console.log('Migration successful: low_stock_threshold added.');
    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        client.release();
        pool.end();
    }
}

run();
