const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/topshelf'
});

async function run() {
    try {
        console.log("Checking exact duplicates in items table...");
        const exact = await pool.query('SELECT name, organization_id, count(*) FROM items GROUP BY name, organization_id HAVING count(*) > 1');
        console.log('Exact Duplicates:', exact.rows);

        console.log("\\nChecking name duplicates across global/org...");
        const cross = await pool.query('SELECT name, count(*) FROM items WHERE organization_id = 3 OR organization_id IS NULL GROUP BY name HAVING count(*) > 1');
        console.log('Name Duplicates (Global + Org 3):', cross.rows);

        console.log("\\nChecking NOT EXISTS fix count...");
        const fix = await pool.query(`
            SELECT count(*) as total, count(distinct name) as distinct_names 
            FROM items i
            WHERE (
                i.organization_id = 3 
                OR (i.organization_id IS NULL AND NOT EXISTS (
                    SELECT 1 FROM items i2 WHERE i2.name = i.name AND i2.organization_id = 3
                ))
            )
        `);
        console.log('Fixed Counts:', fix.rows[0]);
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

run();
