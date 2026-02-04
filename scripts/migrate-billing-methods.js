const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5433/topshelf'
});

async function migrate() {
    console.log('Starting Billing Methods Migration...');
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        console.log('Creating Billing Methods Table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS billing_methods (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                card_brand TEXT, -- Visa, Mastercard
                last_4 TEXT,
                encrypted_token TEXT, -- Mock token
                is_default BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query('COMMIT');
        console.log('Migration Complete');
        process.exit(0);
    } catch (e) {
        if (client) await client.query('ROLLBACK');
        console.error('Migration Failed', e);
        process.exit(1);
    } finally {
        if (client) client.release();
    }
}

migrate();
