import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { scheduler } from '@/lib/scheduler';

async function requireSuperAdmin() {
    const session = await getSession();
    if (!session?.isSuperAdmin) return null;
    return session;
}

// GET — summary stats: email queue, push notifications, scheduler
export async function GET() {
    const session = await requireSuperAdmin();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        // Email queue counts by status
        const statusCounts = await db.query(
            `SELECT status, COUNT(*) as count FROM email_log GROUP BY status`
        );
        const emailStats: Record<string, number> = {};
        statusCounts.forEach((r: any) => { emailStats[r.status] = Number(r.count); });

        // Recent failed/skipped emails
        const failedEmails = await db.query(
            `SELECT id, organization_id, org_name, email_type, tier, subject,
                    recipients, status, error_message, sent_at
             FROM email_log
             WHERE status IN ('failed', 'skipped')
             ORDER BY sent_at DESC
             LIMIT 25`
        );

        // Pending emails (could be stuck)
        const pendingEmails = await db.query(
            `SELECT id, organization_id, org_name, email_type, tier, subject,
                    recipients, status, sent_at
             FROM email_log
             WHERE status = 'pending'
             ORDER BY sent_at ASC
             LIMIT 25`
        );

        // Push notification stats
        let pushStats: Record<string, number> = {};
        let recentPush: any[] = [];
        try {
            const pushCounts = await db.query(
                `SELECT status, COUNT(*) as count FROM push_notifications GROUP BY status`
            );
            pushCounts.forEach((r: any) => { pushStats[r.status] = Number(r.count); });
            recentPush = await db.query(
                `SELECT id, user_id, title, body, status, created_at, sent_at
                 FROM push_notifications
                 ORDER BY created_at DESC
                 LIMIT 20`
            );
        } catch {}

        // Report schedules (scheduler status)
        let schedules: any[] = [];
        try {
            schedules = await db.query(
                `SELECT rs.id, rs.report_id, rs.frequency, rs.active, rs.next_run_at,
                        o.name as org_name
                 FROM report_schedules rs
                 LEFT JOIN organizations o ON rs.organization_id = o.id
                 WHERE rs.active = TRUE
                 ORDER BY rs.next_run_at ASC
                 LIMIT 30`
            );
        } catch {}

        return NextResponse.json({
            emailStats,
            failedEmails,
            pendingEmails,
            pushStats,
            recentPush,
            schedules,
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// POST — trigger scheduler task, or retry/clear emails
export async function POST(req: NextRequest) {
    const session = await requireSuperAdmin();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action } = body;

    try {
        if (action === 'trigger') {
            const { task } = body;
            const results: string[] = [];
            if (task === 'reports' || task === 'all') {
                await (scheduler as any).runDueReportSchedules?.();
                results.push('Report schedules processed');
            }
            if (task === 'low_stock' || task === 'all') {
                await (scheduler as any).runDueLowStockAlerts?.();
                results.push('Low stock alerts processed');
            }
            if (task === 'shift_reports' || task === 'all') {
                await (scheduler as any).runShiftReportEmails?.();
                results.push('Shift report emails processed');
            }
            return NextResponse.json({ ok: true, ran: results });
        }

        if (action === 'retry') {
            const { emailId } = body;
            if (!emailId) return NextResponse.json({ error: 'emailId required' }, { status: 400 });
            await db.execute(
                `UPDATE email_log SET status = 'pending', error_message = NULL WHERE id = $1 AND status IN ('failed', 'skipped')`,
                [emailId]
            );
            return NextResponse.json({ ok: true });
        }

        if (action === 'retry_all_failed') {
            await db.execute(
                `UPDATE email_log SET status = 'pending', error_message = NULL WHERE status = 'failed'`
            );
            return NextResponse.json({ ok: true });
        }

        if (action === 'clear') {
            const { status } = body;
            if (!['failed', 'skipped', 'pending'].includes(status)) {
                return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
            }
            const result = await db.query(
                `DELETE FROM email_log WHERE status = $1 RETURNING id`, [status]
            );
            return NextResponse.json({ ok: true, deleted: result.length });
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
