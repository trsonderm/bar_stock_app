const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5433/topshelf'
});

async function checkUsers() {
    try {
        const res = await pool.query('SELECT id, email, role, permissions FROM users WHERE email = $1', ['admin@fosters.com']);
        console.log(res.rows);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

checkUsers();
