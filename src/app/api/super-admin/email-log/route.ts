import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || !(session as any).isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = req.nextUrl;
    const view = searchParams.get('view') || 'history'; // 'history' | 'schedule'
    const period = searchParams.get('period') || 'today'; // 'today' | 'week' | 'month'
    const orgId = searchParams.get('orgId');
    const emailType = searchParams.get('emailType');
    const status = searchParams.get('status');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = 50;
    const offset = (page - 1) * limit;

    try {
        if (view === 'history') {
            // Date range from period
            let since: string;
            const now = new Date();
            if (period === 'today') {
                const start = new Date(now); start.setHours(0, 0, 0, 0);
                since = start.toISOString();
            } else if (period === 'week') {
                since = new Date(now.getTime() - 7 * 86400000).toISOString();
            } else if (period === 'month') {
                since = new Date(now.getTime() - 30 * 86400000).toISOString();
            } else {
                since = new Date(now.getTime() - 90 * 86400000).toISOString();
            }

            const conditions: string[] = [`el.sent_at >= $1`];
            const params: any[] = [since];
            let pIdx = 2;

            if (orgId) { conditions.push(`el.organization_id = $${pIdx++}`); params.push(parseInt(orgId)); }
            if (emailType) { conditions.push(`el.email_type = $${pIdx++}`); params.push(emailType); }
            if (status) { conditions.push(`el.status = $${pIdx++}`); params.push(status); }

            const where = conditions.join(' AND ');

            const [rows, countRow] = await Promise.all([
                db.query(`
                    SELECT el.id, el.organization_id, el.org_name,
                           COALESCE(el.org_name, o.name) AS org_display,
                           el.email_type, el.tier, el.subject,
                           el.recipients, el.status, el.error_message,
                           el.scheduled, el.sent_at,
                           el.html_body IS NOT NULL AS has_html,
                           el.text_body IS NOT NULL AS has_text
                    FROM email_log el
                    LEFT JOIN organizations o ON el.organization_id = o.id
                    WHERE ${where}
                    ORDER BY el.sent_at DESC
                    LIMIT $${pIdx} OFFSET $${pIdx + 1}
                `, [...params, limit, offset]),
                db.one(`SELECT COUNT(*) AS total FROM email_log el WHERE ${where}`, params),
            ]);

            return NextResponse.json({
                view: 'history',
                rows,
                total: parseInt(countRow?.total || '0'),
                page,
                limit,
            });
        }

        if (view === 'detail') {
            const id = searchParams.get('id');
            if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
            const row = await db.one(
                `SELECT el.*, COALESCE(el.org_name, o.name) AS org_display
                 FROM email_log el
                 LEFT JOIN organizations o ON el.organization_id = o.id
                 WHERE el.id = $1`,
                [parseInt(id)]
            );
            if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
            return NextResponse.json({ row });
        }

        if (view === 'schedule') {
            // Build upcoming schedule from report_schedules + org settings
            const now = new Date();
            let windowEnd: Date;
            if (period === 'today') {
                windowEnd = new Date(now); windowEnd.setHours(23, 59, 59, 999);
            } else if (period === 'week') {
                windowEnd = new Date(now.getTime() + 7 * 86400000);
            } else {
                windowEnd = new Date(now.getTime() + 30 * 86400000);
            }

            // 1. Report schedules with next_run_at in window
            const reportSchedules = await db.query(`
                SELECT rs.id, rs.organization_id, rs.frequency, rs.next_run_at,
                       rs.recipients, sr.name AS report_name,
                       o.name AS org_name
                FROM report_schedules rs
                JOIN saved_reports sr ON rs.report_id::int = sr.id
                JOIN organizations o ON rs.organization_id = o.id
                WHERE rs.active = TRUE
                  AND rs.next_run_at BETWEEN $1 AND $2
                ORDER BY rs.next_run_at ASC
            `, [now, windowEnd]);

            // 2. Low stock alerts — fire daily at configured time
            const lowStockSettings = await db.query(`
                SELECT s.organization_id,
                       MAX(CASE WHEN s.key = 'low_stock_alert_enabled' THEN s.value END) AS enabled,
                       MAX(CASE WHEN s.key = 'low_stock_alert_emails'  THEN s.value END) AS emails,
                       MAX(CASE WHEN s.key = 'low_stock_alert_time'    THEN s.value END) AS alert_time,
                       o.name AS org_name
                FROM settings s
                JOIN organizations o ON s.organization_id = o.id
                WHERE s.key IN ('low_stock_alert_enabled','low_stock_alert_emails','low_stock_alert_time')
                GROUP BY s.organization_id, o.name
                HAVING MAX(CASE WHEN s.key = 'low_stock_alert_enabled' THEN s.value END) = 'true'
            `);

            // 3. Shift report schedules
            const shiftSettings = await db.query(`
                SELECT s.organization_id,
                       MAX(CASE WHEN s.key = 'shift_report_enabled'   THEN s.value END) AS enabled,
                       MAX(CASE WHEN s.key = 'shift_report_emails'    THEN s.value END) AS emails,
                       MAX(CASE WHEN s.key = 'shift_report_schedule'  THEN s.value END) AS schedule,
                       o.name AS org_name
                FROM settings s
                JOIN organizations o ON s.organization_id = o.id
                WHERE s.key IN ('shift_report_enabled','shift_report_emails','shift_report_schedule')
                GROUP BY s.organization_id, o.name
                HAVING MAX(CASE WHEN s.key = 'shift_report_enabled' THEN s.value END) = 'true'
            `);

            // Expand low stock alerts into individual daily fire times within window
            const upcomingLowStock: any[] = [];
            for (const s of lowStockSettings) {
                let timeStr = '14:00';
                try {
                    const parsed = s.alert_time ? JSON.parse(s.alert_time) : null;
                    timeStr = parsed?.time || s.alert_time || '14:00';
                } catch { timeStr = s.alert_time || '14:00'; }

                const [hh, mm] = timeStr.split(':').map(Number);
                const cursor = new Date(now);
                cursor.setHours(hh, mm, 0, 0);
                if (cursor < now) cursor.setDate(cursor.getDate() + 1);

                while (cursor <= windowEnd) {
                    upcomingLowStock.push({
                        type: 'low_stock_alert',
                        organization_id: s.organization_id,
                        org_name: s.org_name,
                        scheduled_at: cursor.toISOString(),
                        frequency: 'daily',
                        recipients: s.emails,
                        label: 'Low Stock Alert',
                    });
                    cursor.setDate(cursor.getDate() + 1);
                }
            }

            // Expand shift reports
            const upcomingShift: any[] = [];
            for (const s of shiftSettings) {
                let schedule: any = { frequency: 'daily', time: '08:00' };
                try { schedule = s.schedule ? JSON.parse(s.schedule) : schedule; } catch { }
                if (!schedule.frequency || schedule.frequency === 'per_shift') continue;

                const [hh, mm] = (schedule.time || '08:00').split(':').map(Number);
                const cursor = new Date(now);
                cursor.setHours(hh, mm, 0, 0);
                if (cursor < now) cursor.setDate(cursor.getDate() + 1);

                const stepDays = schedule.frequency === 'weekly' ? 7 : schedule.frequency === 'monthly' ? 30 : 1;
                while (cursor <= windowEnd) {
                    upcomingShift.push({
                        type: 'shift_report',
                        organization_id: s.organization_id,
                        org_name: s.org_name,
                        scheduled_at: cursor.toISOString(),
                        frequency: schedule.frequency,
                        recipients: s.emails,
                        label: 'Shift Report',
                    });
                    cursor.setDate(cursor.getDate() + stepDays);
                }
            }

            const scheduled = [
                ...reportSchedules.map((r: any) => ({
                    type: 'scheduled_report',
                    organization_id: r.organization_id,
                    org_name: r.org_name,
                    scheduled_at: r.next_run_at,
                    frequency: r.frequency,
                    recipients: r.recipients,
                    label: r.report_name,
                })),
                ...upcomingLowStock,
                ...upcomingShift,
            ].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

            return NextResponse.json({ view: 'schedule', scheduled });
        }

        return NextResponse.json({ error: 'Unknown view' }, { status: 400 });
    } catch (err: any) {
        console.error('[email-log] Error:', err);
        return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
    }
}
