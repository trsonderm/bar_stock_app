const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/topshelf',
});

async function run() {
    const client = await pool.connect();
    try {
        console.log('Adding order_size to items table...');
        await client.query(`
            ALTER TABLE items 
            ADD COLUMN IF NOT EXISTS order_size INTEGER DEFAULT 1;
        `);
        console.log('Done.');
    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}
run();
