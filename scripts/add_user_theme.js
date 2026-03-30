require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/topshelf',
});

async function migrate() {
    try {
        console.log('Adding ui_theme to users...');
        await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS ui_theme TEXT;');
        console.log('Migration completed successfully.');
    } catch (e) {
        console.error('Migration Failed:', e);
    } finally {
        pool.end();
    }
}

migrate();
