
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/topshelf',
});

async function run() {
    const client = await pool.connect();
    try {
        console.log('--- Debugging Activity Query ---');

        // Simulate exact params from UI (Today)
        // Today is 2026-02-16 based on local time provided
        const startStr = '2026-02-16';
        const endStr = '2026-02-16';

        // Replicate NEW API Date parsing exactly
        let startDateStr = startStr;
        let endDateStr = endStr;

        // If simple YYYY-MM-DD, append full day range
        if (startStr.length === 10) startDateStr += 'T00:00:00';
        if (endStr.length === 10) endDateStr += 'T23:59:59.999';

        // Output the resulting strings being sent to DB
        const startIso = startDateStr;
        const endIso = endDateStr;

        console.log(`Time Range: ${startIso} to ${endIso}`);

        // 1. Check raw count
        const countRes = await client.query('SELECT count(*) FROM activity_logs WHERE timestamp >= $1 AND timestamp <= $2', [startIso, endIso]);
        console.log(`Total Logs in Range: ${countRes.rows[0].count}`);

        // 2. Run the exact query from the API
        const query = `
            SELECT 
                l.action, l.details, l.timestamp,
                u.id as user_id, u.first_name, u.last_name,
                i.name as db_item_name,
                l.organization_id
            FROM activity_logs l
            LEFT JOIN users u ON l.user_id = u.id
            LEFT JOIN items i ON i.id = (l.details->>'itemId')::int
            WHERE l.timestamp >= $1 AND l.timestamp <= $2
            ORDER BY u.last_name ASC, l.timestamp ASC
            LIMIT 10
        `;

        const logs = await client.query(query, [startIso, endIso]);
        console.log(`Query returned ${logs.rows.length} rows (limited to 10).`);

        if (logs.rows.length > 0) {
            const log = logs.rows[0];
            console.log('--- Sample Log ---');
            console.log('Timestamp:', log.timestamp);
            console.log('Org ID:', log.organization_id);
            console.log('Details (Raw):', log.details);
            console.log('Type of details:', typeof log.details);

            // Replicate parsing logic
            let details = {};
            if (typeof log.details === 'string') {
                try { details = JSON.parse(log.details); } catch (e) { console.log('Parse error:', e.message); }
            } else {
                details = log.details || {};
            }
            console.log('Parsed Details:', details);

            const qty = details.change || details.quantity || 0;
            console.log('Calculated Qty:', qty);
        }

    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
