const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:postgres@localhost:5433/topshelf' });

async function run() {
    try {
        console.log('--- Running Scheduler ---');
        const now = new Date();

        // Find due schedules
        const res = await pool.query(`
            SELECT s.*, r.name as report_name 
            FROM report_schedules s
            JOIN saved_reports r ON s.report_id = r.id
            WHERE s.active = true AND s.next_run_at <= $1
        `, [now]);

        if (res.rows.length === 0) {
            console.log('No reports due.');
            return;
        }

        console.log(`Found ${res.rows.length} due reports.`);

        for (const schedule of res.rows) {
            console.log(`Proccessing schedule for report: ${schedule.report_name} (ID: ${schedule.report_id})`);
            console.log(`Sending email to: ${schedule.recipients.join(', ')}`);

            // SIMULATE EMAIL SENDING HERE
            // await sendEmail(...)

            // Calculate next run
            let nextRun = new Date(schedule.next_run_at);
            const freq = schedule.frequency;

            if (freq === 'daily') nextRun.setDate(nextRun.getDate() + 1);
            if (freq === 'weekly') nextRun.setDate(nextRun.getDate() + 7);
            if (freq === 'monthly') {
                nextRun.setMonth(nextRun.getMonth() + 1);
                // Handle month overflow/short months if needed, defaulting to simple add for now
            }

            // Update DB
            await pool.query('UPDATE report_schedules SET next_run_at = $1 WHERE id = $2', [nextRun, schedule.id]);
            console.log(`Updated next run to: ${nextRun.toISOString()}`);
        }

    } catch (e) {
        console.error('Scheduler Error:', e);
    } finally {
        pool.end();
    }
}

run();
