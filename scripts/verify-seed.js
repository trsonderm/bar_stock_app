const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/topshelf'
});

async function verify() {
    try {
        console.log('Verifying Data...');
        const userCount = await pool.query('SELECT COUNT(*) FROM users');
        const itemCount = await pool.query('SELECT COUNT(*) FROM items');
        const invCount = await pool.query('SELECT COUNT(*) FROM inventory');
        const logCount = await pool.query('SELECT COUNT(*) FROM activity_logs');

        console.log('Users:', userCount.rows[0].count);
        console.log('Items:', itemCount.rows[0].count);
        console.log('Inventory Rows:', invCount.rows[0].count);
        console.log('Activity Logs:', logCount.rows[0].count);

        pool.end();
    } catch (e) {
        console.error(e);
    }
}
verify();
