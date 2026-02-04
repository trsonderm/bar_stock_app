const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/topshelf'
});

async function disableQuickLogin() {
    try {
        console.log('Disabling Quick Login...');
        await pool.query("UPDATE system_settings SET value = 'false' WHERE key = 'quick_login_enabled'");
        console.log('Quick Login Disabled.');
        pool.end();
    } catch (e) {
        console.error(e);
    }
}
disableQuickLogin();
