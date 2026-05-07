import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { scheduler } from '@/lib/scheduler';

// POST /api/super-admin/trigger-scheduler
// Manually fires scheduler tasks for testing without waiting for the cron minute.
// Body: { task: 'reports' | 'low_stock' | 'shift_reports' | 'all' }
export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { task } = await req.json();

    try {
        const results: string[] = [];

        if (task === 'reports' || task === 'all') {
            await (scheduler as any).runDueReportSchedules();
            results.push('Report schedules processed');
        }
        if (task === 'low_stock' || task === 'all') {
            await (scheduler as any).runDueLowStockAlerts();
            results.push('Low stock alerts processed');
        }
        if (task === 'shift_reports' || task === 'all') {
            await (scheduler as any).runShiftReportEmails();
            results.push('Shift report emails processed');
        }

        if (results.length === 0) {
            return NextResponse.json({ error: 'Unknown task. Use: reports | low_stock | shift_reports | all' }, { status: 400 });
        }

        return NextResponse.json({ ok: true, ran: results });
    } catch (err: any) {
        console.error('[trigger-scheduler]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
