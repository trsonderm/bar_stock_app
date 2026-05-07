// Ensures all email_log columns exist and report_schedules is properly set up.
// Safe to run multiple times — all operations are idempotent.
// Usage: node scripts/fix-email-log-schema.js

const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/topshelf'
});

async function run() {
    const client = await pool.connect();
    try {
        console.log('=== Email Queue Schema Fix ===\n');

        // 1. Add missing columns to email_log
        const missingCols = [
            { col: 'scheduled',     def: 'BOOLEAN DEFAULT FALSE' },
            { col: 'html_body',     def: 'TEXT' },
            { col: 'text_body',     def: 'TEXT' },
            { col: 'tier',          def: "TEXT DEFAULT 'notifications'" },
            { col: 'org_name',      def: 'TEXT' },
            { col: 'error_message', def: 'TEXT' },
        ];

        for (const { col, def } of missingCols) {
            const exists = await client.query(
                `SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'email_log' AND column_name = $1`, [col]
            );
            if (exists.rows.length === 0) {
                await client.query(`ALTER TABLE email_log ADD COLUMN IF NOT EXISTS ${col} ${def}`);
                console.log(`  ✓ Added column: email_log.${col}`);
            } else {
                console.log(`  · Already exists: email_log.${col}`);
            }
        }

        // 2. Ensure status column allows 'pending'
        const statusCheck = await client.query(
            `SELECT character_maximum_length FROM information_schema.columns
             WHERE table_name = 'email_log' AND column_name = 'status'`
        );
        if (statusCheck.rows[0]?.character_maximum_length < 20) {
            await client.query(`ALTER TABLE email_log ALTER COLUMN status TYPE VARCHAR(20)`);
            console.log('  ✓ Widened email_log.status to VARCHAR(20)');
        }

        // 3. Ensure report_schedules table exists
        await client.query(`
            CREATE TABLE IF NOT EXISTS report_schedules (
                id              SERIAL PRIMARY KEY,
                report_id       TEXT NOT NULL,
                organization_id INTEGER REFERENCES organizations(id),
                frequency       TEXT,
                recipients      TEXT,
                active          BOOLEAN DEFAULT TRUE,
                next_run_at     TIMESTAMP,
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('\n  ✓ report_schedules table OK');

        // 4. Diagnostic: show email queue status
        console.log('\n=== Diagnostic ===');

        const pending = await client.query(`SELECT COUNT(*) as c FROM email_log WHERE status = 'pending'`);
        const sent    = await client.query(`SELECT COUNT(*) as c FROM email_log WHERE status = 'sent'    AND sent_at > NOW() - INTERVAL '7 days'`);
        const failed  = await client.query(`SELECT COUNT(*) as c FROM email_log WHERE status = 'failed'  AND sent_at > NOW() - INTERVAL '7 days'`);
        const skipped = await client.query(`SELECT COUNT(*) as c FROM email_log WHERE status = 'skipped' AND sent_at > NOW() - INTERVAL '7 days'`);

        console.log(`  email_log pending:          ${pending.rows[0].c}`);
        console.log(`  email_log sent (7d):        ${sent.rows[0].c}`);
        console.log(`  email_log failed (7d):      ${failed.rows[0].c}`);
        console.log(`  email_log skipped (7d):     ${skipped.rows[0].c}`);

        const schedules = await client.query(`SELECT COUNT(*) as c FROM report_schedules WHERE active = TRUE`);
        const overdue   = await client.query(`SELECT COUNT(*) as c FROM report_schedules WHERE active = TRUE AND next_run_at <= NOW()`);
        console.log(`  report_schedules active:    ${schedules.rows[0].c}`);
        console.log(`  report_schedules overdue:   ${overdue.rows[0].c}`);

        // 5. Show last 5 skipped/failed emails for SMTP diagnosis
        const recent = await client.query(
            `SELECT id, tier, email_type, subject, status, error_message, sent_at
             FROM email_log WHERE status IN ('failed','skipped') ORDER BY sent_at DESC LIMIT 5`
        );
        if (recent.rows.length > 0) {
            console.log('\n  Last failed/skipped emails:');
            recent.rows.forEach(r => {
                console.log(`    [${r.status}] tier=${r.tier} type=${r.email_type} — ${r.error_message || '(no error message)'}`);
            });
            console.log('\n  → If you see "SMTP not configured for tier", go to Super Admin → Site Settings');
            console.log('    and configure the SMTP credentials for that tier (reporting, notifications, etc.)');
        } else {
            console.log('\n  No failed/skipped emails found — SMTP may never have been attempted.');
            console.log('  Check that report_schedules has active rows with next_run_at in the past.');
        }

        // 6. Check SMTP config
        const smtpKeys = await client.query(
            `SELECT key, CASE WHEN key LIKE '%pass%' THEN '***' ELSE value END as val
             FROM system_settings
             WHERE key LIKE '%smtp%'
             ORDER BY key`
        );
        if (smtpKeys.rows.length > 0) {
            console.log('\n  SMTP settings in system_settings:');
            smtpKeys.rows.forEach(r => console.log(`    ${r.key} = ${r.val}`));
        } else {
            console.log('\n  ⚠️  No SMTP settings found in system_settings.');
            console.log('    Go to Super Admin → Site Settings to configure SMTP for each mail tier.');
        }

        console.log('\n=== Done ===');
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
