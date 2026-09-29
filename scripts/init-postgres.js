/**
 * Initializes a fresh PostgreSQL database for TopShelf.
 *
 *   node scripts/init-postgres.js           # only if the database is empty
 *   node scripts/init-postgres.js --force   # DROP everything and start over
 *
 * Applies scripts/schema.sql (base tables) followed by scripts/migrate.sql
 * (idempotent additions), so a new install ends up with the full schema.
 * Existing databases should only ever run migrate.sql.
 */
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/topshelf'
});

const force = process.argv.includes('--force');

async function initDB() {
    const client = await pool.connect();
    try {
        const { rows } = await client.query(
            "SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'"
        );

        if (rows[0].n > 0) {
            if (!force) {
                console.error(
                    `Database already contains ${rows[0].n} tables. Refusing to overwrite it.\n` +
                    'To upgrade an existing database run:  psql "$DATABASE_URL" -f scripts/migrate.sql\n' +
                    'To wipe it and start over run:        node scripts/init-postgres.js --force'
                );
                process.exitCode = 1;
                return;
            }
            console.log('--force given: dropping existing schema...');
            await client.query(`
                DROP SCHEMA public CASCADE;
                CREATE SCHEMA public;
                GRANT ALL ON SCHEMA public TO postgres;
                GRANT ALL ON SCHEMA public TO public;
            `);
        }

        for (const file of ['schema.sql', 'migrate.sql']) {
            console.log(`Applying ${file}...`);
            await client.query(fs.readFileSync(path.join(__dirname, file), 'utf8'));
        }
        console.log('Schema initialized successfully.');
    } catch (e) {
        console.error('Init Failed:', e);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

initDB();
