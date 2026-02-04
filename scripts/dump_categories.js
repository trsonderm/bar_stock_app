const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/topshelf',
});

async function main() {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT id, name, organization_id FROM categories');
        console.log('Categories in DB:');
        console.table(res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
