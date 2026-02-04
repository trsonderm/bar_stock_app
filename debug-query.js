const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/topshelf',
});

async function run() {
    const client = await pool.connect();
    try {
        console.log('--- Checking Predictive Query ---');
        // Exact query from predictive/route.ts
        const orgId = 3;
        const usageData = await client.query(`
            SELECT 
                (details->>'itemId')::int as item_id,
                SUM((details->>'quantity')::int) as total_used
            FROM activity_logs
            WHERE organization_id = $1
              AND action = 'SUBTRACT_STOCK'
              AND timestamp >= NOW() - INTERVAL '30 days'
            GROUP BY (details->>'itemId')::int
        `, [orgId]);
        console.log('Usage Data Count:', usageData.rowCount);
        console.log('Sample Usage:', usageData.rows.slice(0, 3));

        console.log('\n--- Checking Log Details ---');
        const logs = await client.query("SELECT details FROM activity_logs WHERE action IN ('ADD_STOCK', 'SUBTRACT_STOCK') ORDER BY timestamp DESC LIMIT 3");
        console.log('Recent Logs:', logs.rows.map(r => r.details));

    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}

run();
