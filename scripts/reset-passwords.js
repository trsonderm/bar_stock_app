const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/topshelf'
});

async function resetPasswords() {
    try {
        const client = await pool.connect();

        console.log('Hashing "password"...');
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync('password', salt);

        console.log('Updating all users...');
        const res = await client.query('UPDATE users SET password_hash = $1', [hash]);

        console.log(`Successfully reset passwords for ${res.rowCount} users.`);

        pool.end();
    } catch (e) {
        console.error('Error resetting passwords:', e);
        pool.end();
    }
}

resetPasswords();
