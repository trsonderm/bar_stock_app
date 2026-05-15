import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { scheduler } from '@/lib/scheduler';
import { db } from '@/lib/db';
import { getSmtpConfig } from '@/lib/mail';

// POST /api/super-admin/trigger-scheduler
// Body: { task: 'reports' | 'low_stock' | 'shift_reports' | 'all' }
export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { task } = await req.json();

    try {
        const results: { task: string; status: string; detail: string }[] = [];

        if (task === 'reports' || task === 'all') {
            const before = await getEmailLogCount();
            await (scheduler as any).runDueReportSchedules();
            const after = await getEmailLogCount();
            const added = after - before;
            const due = await getDueReportCount();
            results.push({
                task: 'Report Schedules',
                status: added > 0 ? 'queued' : due === 0 ? 'skipped' : 'ran',
                detail: due === 0
                    ? 'No active report schedules with next_run_at in the past'
                    : `Found ${due} due schedules — ${added} email(s) queued`,
            });
        }

        if (task === 'low_stock' || task === 'all') {
            const before = await getEmailLogCount();
            await (scheduler as any).runDueLowStockAlerts();
            const after = await getEmailLogCount();
            const added = after - before;
            const alertCount = await getLowStockAlertCount();
            results.push({
                task: 'Low Stock Alerts',
                status: added > 0 ? 'queued' : alertCount === 0 ? 'skipped' : 'ran',
                detail: alertCount === 0
                    ? 'No orgs have low_stock_alert_enabled = true'
                    : `${alertCount} org(s) have alerts enabled — time must match configured alert time exactly for email to send (${added} queued this run)`,
            });
        }

        if (task === 'shift_reports' || task === 'all') {
            const before = await getEmailLogCount();
            await (scheduler as any).runShiftReportEmails();
            const after = await getEmailLogCount();
            const added = after - before;
            const shiftCount = await getShiftReportCount();
            results.push({
                task: 'Shift Report Emails',
                status: added > 0 ? 'queued' : shiftCount === 0 ? 'skipped' : 'ran',
                detail: shiftCount === 0
                    ? 'No orgs have shift_report_enabled = true'
                    : `${shiftCount} org(s) have shift reports enabled — time must match schedule exactly (${added} queued this run)`,
            });
        }

        if (results.length === 0) {
            return NextResponse.json({ error: 'Unknown task. Use: reports | low_stock | shift_reports | all' }, { status: 400 });
        }

        // Also return SMTP config status for reporting tier
        const smtpStatus = await getSmtpStatus();

        return NextResponse.json({ ok: true, results, smtp: smtpStatus });
    } catch (err: any) {
        console.error('[trigger-scheduler]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// GET /api/super-admin/trigger-scheduler — return scheduler health diagnostics
export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const [dueReports, lowStockOrgs, shiftReportOrgs, recentLogs, smtpStatus] = await Promise.all([
            getDueReportSchedules(),
            getLowStockAlertOrgs(),
            getShiftReportOrgs(),
            getRecentEmailLogs(),
            getSmtpStatus(),
        ]);

        const schedulerRunning = (scheduler as any).interval != null;

        return NextResponse.json({
            schedulerRunning,
            smtp: smtpStatus,
            dueReports,
            lowStockOrgs,
            shiftReportOrgs,
            recentLogs,
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

async function getEmailLogCount(): Promise<number> {
    try {
        const row = await db.one('SELECT COUNT(*)::int AS cnt FROM email_log');
        return row?.cnt ?? 0;
    } catch { return 0; }
}

async function getDueReportCount(): Promise<number> {
    try {
        const row = await db.one(`
            SELECT COUNT(*)::int AS cnt
            FROM report_schedules rs
            JOIN saved_reports sr ON rs.report_id::text = sr.id::text
            WHERE rs.active = TRUE AND rs.next_run_at <= NOW()
        `);
        return row?.cnt ?? 0;
    } catch { return 0; }
}

async function getLowStockAlertCount(): Promise<number> {
    try {
        const row = await db.one(`
            SELECT COUNT(DISTINCT organization_id)::int AS cnt
            FROM settings
            WHERE key = 'low_stock_alert_enabled' AND value = 'true'
        `);
        return row?.cnt ?? 0;
    } catch { return 0; }
}

async function getShiftReportCount(): Promise<number> {
    try {
        const row = await db.one(`
            SELECT COUNT(DISTINCT organization_id)::int AS cnt
            FROM settings
            WHERE key = 'shift_report_enabled' AND value = 'true'
        `);
        return row?.cnt ?? 0;
    } catch { return 0; }
}

async function getDueReportSchedules() {
    try {
        return await db.query(`
            SELECT rs.id, rs.organization_id, rs.frequency, rs.next_run_at, rs.active,
                   sr.name AS report_name,
                   o.name AS org_name
            FROM report_schedules rs
            LEFT JOIN saved_reports sr ON rs.report_id::text = sr.id::text
            LEFT JOIN organizations o ON rs.organization_id = o.id
            WHERE rs.active = TRUE
            ORDER BY rs.next_run_at ASC NULLS LAST
            LIMIT 20
        `);
    } catch { return []; }
}

async function getLowStockAlertOrgs() {
    try {
        return await db.query(`
            SELECT s.organization_id,
                   MAX(CASE WHEN s.key = 'low_stock_alert_enabled' THEN s.value END) AS enabled,
                   MAX(CASE WHEN s.key = 'low_stock_alert_schedule' THEN s.value END) AS schedule,
                   MAX(CASE WHEN s.key = 'low_stock_alert_time' THEN s.value END) AS legacy_time,
                   MAX(CASE WHEN s.key = 'low_stock_alert_emails' THEN s.value END) AS emails,
                   o.name AS org_name
            FROM settings s
            JOIN organizations o ON s.organization_id = o.id
            WHERE s.key IN ('low_stock_alert_enabled','low_stock_alert_schedule','low_stock_alert_time','low_stock_alert_emails')
            GROUP BY s.organization_id, o.name
            HAVING MAX(CASE WHEN s.key = 'low_stock_alert_enabled' THEN s.value END) = 'true'
        `);
    } catch { return []; }
}

async function getShiftReportOrgs() {
    try {
        return await db.query(`
            SELECT s.organization_id,
                   MAX(CASE WHEN s.key = 'shift_report_enabled' THEN s.value END) AS enabled,
                   MAX(CASE WHEN s.key = 'shift_report_schedule' THEN s.value END) AS schedule,
                   MAX(CASE WHEN s.key = 'shift_report_emails' THEN s.value END) AS emails,
                   o.name AS org_name
            FROM settings s
            JOIN organizations o ON s.organization_id = o.id
            WHERE s.key IN ('shift_report_enabled','shift_report_schedule','shift_report_emails')
            GROUP BY s.organization_id, o.name
            HAVING MAX(CASE WHEN s.key = 'shift_report_enabled' THEN s.value END) = 'true'
        `);
    } catch { return []; }
}

async function getRecentEmailLogs() {
    try {
        return await db.query(`
            SELECT id, email_type, tier, subject, status, error_message, scheduled, sent_at,
                   COALESCE(org_name, (SELECT name FROM organizations WHERE id = organization_id)) AS org_display
            FROM email_log
            ORDER BY sent_at DESC
            LIMIT 10
        `);
    } catch { return []; }
}

async function getSmtpStatus() {
    try {
        const tiers = ['reporting', 'support', 'admin', 'notifications'] as const;
        const results: Record<string, { configured: boolean; host: string; user: string }> = {};
        for (const tier of tiers) {
            const cfg = await getSmtpConfig(tier);
            results[tier] = {
                configured: !!(cfg.host && cfg.auth.user),
                host: cfg.host || '(not set)',
                user: cfg.auth.user ? cfg.auth.user.replace(/(.{2}).+(@.+)/, '$1***$2') : '(not set)',
            };
        }
        return results;
    } catch { return {}; }
}
