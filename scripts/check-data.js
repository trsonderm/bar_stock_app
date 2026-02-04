const { Pool } = require('pg');

const pool = new Pool({
    connectionString: 'postgresql://postgres:postgres@localhost:5433/topshelf',
});

async function checkData() {
    const client = await pool.connect();
    try {
        console.log('Checking Data...');

        // Check Org
        const org = await client.query("SELECT * FROM organizations WHERE name = 'Downtown Bar'");
        if (org.rows.length === 0) {
            console.log('Downtown Bar not found!');
            return;
        }
        const orgId = org.rows[0].id;
        console.log('Downtown Bar ID:', orgId);

        // Check Logs
        const logs = await client.query('SELECT count(*) FROM activity_logs WHERE organization_id = $1', [orgId]);
        console.log('Activity Log Count:', logs.rows[0].count);

        if (parseInt(logs.rows[0].count) > 0) {
            const recent = await client.query('SELECT * FROM activity_logs WHERE organization_id = $1 ORDER BY timestamp DESC LIMIT 3', [orgId]);
            console.log('Recent Logs:', recent.rows);
        }

        // Check Notification History
        const notifs = await client.query('SELECT count(*) FROM notifications WHERE organization_id = $1', [orgId]);
        console.log('Notification Count:', notifs.rows[0].count);

        if (parseInt(notifs.rows[0].count) > 0) {
            const recentNotifs = await client.query('SELECT * FROM notifications WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 3', [orgId]);
            console.log('Recent Notifications:', recentNotifs.rows);
        }

    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}

checkData();
