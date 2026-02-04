const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/topshelf'
});

async function migrate() {
    console.log('Migrating stock_options to Integers...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Beer: 1, 6, 12, 24, 48
        // Liquor, Wine, Mixers, Standard: 1

        console.log('Updating Beer...');
        await client.query("UPDATE categories SET stock_options = $1 WHERE name = 'Beer'", [JSON.stringify([1, 6, 12, 24, 48])]);

        console.log('Updating Liquor, Wine, Mixers...');
        // We can do a blanket update for others OR target specifically.
        // Let's target specifically to be safe, then a catch-all if needed.
        const standardOptions = JSON.stringify([1]);

        await client.query("UPDATE categories SET stock_options = $1 WHERE name IN ('Liquor', 'Wine', 'Mixers')", [standardOptions]);

        // Also update any category that isn't 'Beer' just to be safe (for custom categories)
        // Ensure we don't overwrite if they already have custom integers? 
        // For now, let's just stick to the main ones asked.

        await client.query('COMMIT');
        console.log('Migration Complete');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Migration Failed', e);
    } finally {
        client.release();
        pool.end();
    }
}

migrate();
