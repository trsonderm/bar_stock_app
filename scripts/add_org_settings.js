const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/topshelf'
});

async function run() {
    try {
        console.log('Adding settings column to organizations table...');
        const client = await pool.connect();

        await client.query(`
            ALTER TABLE organizations 
            ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';
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
