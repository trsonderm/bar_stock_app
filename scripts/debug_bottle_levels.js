
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/topshelf',
});

async function run() {
    const client = await pool.connect();
    try {
        console.log('--- Debugging Bottle Bottle Logs ---');

        const orgId = 3; // Fosters

        // 1. Count bottle logs
        const countRes = await client.query('SELECT count(*) FROM bottle_level_logs');
        console.log(`Total Bottle Logs (Global): ${countRes.rows[0].count}`);

        // 2. Test the API Query
        const query = `
            SELECT bll.id, bll.option_label, bll.timestamp, al.organization_id
            FROM bottle_level_logs bll
            JOIN activity_logs al ON bll.activity_log_id = al.id
            WHERE al.organization_id = $1
            LIMIT 5
        `;
        const logs = await client.query(query, [orgId]);
        console.log(`API Query returned ${logs.rows.length} rows.`);
        if (logs.rows.length > 0) {
            console.log('Sample Log:', logs.rows[0]);
        } else {
            console.log('API Query returned NO data. Checking unjoined...');
            const unjoined = await client.query('SELECT * FROM bottle_level_logs LIMIT 5');
            console.log('Unjoined Sample:', unjoined.rows[0]);
        }

    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
