const { Client } = require('pg');

const db = new Client({
    connectionString: 'postgresql://postgres:postgres@localhost:5432/topshelf',
});

async function run() {
    await db.connect();
    const orgId = 3;

    try {
        const query = `
            SELECT bll.option_label, bll.timestamp 
            FROM bottle_level_logs bll
            JOIN activity_logs al ON bll.activity_log_id = al.id
            WHERE al.organization_id = $1
            ORDER BY bll.timestamp DESC
        `;
        const res = await db.query(query, [orgId]);
        const logs = res.rows;
        console.log(`Logs found: ${logs.length}`);

        const shifts = {};

        logs.forEach((log) => {
            const date = new Date(log.timestamp);
            const shiftDate = new Date(date);
            if (date.getHours() < 5) {
                shiftDate.setDate(shiftDate.getDate() - 1);
            }
            const dateStr = shiftDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

            if (!shifts[dateStr]) shifts[dateStr] = {};
            if (!shifts[dateStr][log.option_label]) shifts[dateStr][log.option_label] = 0;
            shifts[dateStr][log.option_label]++;
        });

        console.log('Processed Shifts:', JSON.stringify(shifts, null, 2));

        const result = Object.entries(shifts).map(([date, counts]) => ({
            date,
            counts
        }));
        console.log('Result Array:', JSON.stringify(result, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await db.end();
    }
}

run();
