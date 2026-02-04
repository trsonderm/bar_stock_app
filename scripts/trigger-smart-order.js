const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/topshelf',
});

async function run() {
    const client = await pool.connect();
    try {
        console.log('Triggering Smart Order Suggestion...');
        // Set Tito's stock to 1 (Burn rate ~2/day, lead time 1 day -> Trigger requires < 3 days stock)
        // 1 < 3 -> Should trigger CRITICAL or HIGH order.
        const res = await client.query(`
            UPDATE inventory 
            SET quantity = 1 
            WHERE item_id IN (
                SELECT id FROM items WHERE name = 'Tito''s Vodka' AND organization_id = 3
            )
        `);
        console.log(`Updated ${res.rowCount} item(s) to quantity 1.`);
    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}

run();
