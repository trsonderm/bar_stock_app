const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/topshelf'
});

async function enableQuickLogin() {
    try {
        const client = await pool.connect();

        console.log('Enabling Quick Login...');
        await client.query(`
            INSERT INTO system_settings (key, value) 
            VALUES ('quick_login_enabled', 'true') 
            ON CONFLICT (key) DO UPDATE SET value = 'true'
        `);
        console.log('Success.');

        pool.end();
    } catch (e) {
        console.error('Error:', e);
        pool.end();
    }
}

enableQuickLogin();
