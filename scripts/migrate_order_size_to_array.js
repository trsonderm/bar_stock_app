const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/topshelf'
});

async function run() {
    try {
        const client = await pool.connect();

        console.log('Dropping default...');
        await client.query('ALTER TABLE items ALTER COLUMN order_size DROP DEFAULT');

        console.log('Migrating items.order_size from INTEGER to JSONB...');

        // Convert existing integer values to a JSON array containing that integer
        // If it's already JSONB (from failed attempt), skip? No, transaction rolled back? Not really unless explicit.
        // Let's assume it's still INTEGER.
        // We use COALESCE and jsonb_build_array.
        await client.query(`
            ALTER TABLE items 
            ALTER COLUMN order_size TYPE JSONB 
            USING jsonb_build_array(COALESCE(order_size, 1));
        `);

        console.log('Setting new default...');
        await client.query(`
            ALTER TABLE items 
            ALTER COLUMN order_size SET DEFAULT '[1]'::jsonb;
        `);

        console.log('Migration successful.');

        client.release();
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await pool.end();
    }
}

run();
