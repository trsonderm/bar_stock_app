/**
 * Applies scripts/migrate.sql to the database in DATABASE_URL.
 *
 *   npm run db:migrate
 *
 * migrate.sql is idempotent (IF NOT EXISTS / duplicate_column guards), so this
 * is safe to run on every deploy and on databases of any age.
 */
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/topshelf'
});

async function migrate() {
    try {
        await pool.query(fs.readFileSync(path.join(__dirname, 'migrate.sql'), 'utf8'));
        console.log('Migrations applied successfully.');
    } catch (e) {
        console.error('Migration failed:', e.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

migrate();
