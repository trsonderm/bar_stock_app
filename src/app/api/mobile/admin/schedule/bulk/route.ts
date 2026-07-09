/**
 * POST /api/mobile/admin/schedule/bulk
 *
 * Bulk schedule operations.
 * Body: { action, start?, end? }
 *
 * action = "clear_week"         — delete all entries between start and end dates
 * action = "clear_after_today"  — delete all entries from today onwards
 *
 * Requires admin role.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';

export async function POST(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { action, start, end } = await req.json();

    if (action === 'clear_week') {
        if (!start || !end) return NextResponse.json({ error: 'start and end required for clear_week' }, { status: 400 });
        const result = await db.execute(
            'DELETE FROM user_schedules WHERE organization_id = $1 AND date >= $2 AND date <= $3',
            [session.organizationId, start, end]
        );
        return NextResponse.json({ ok: true, deleted: result.rowCount });
    }

    if (action === 'clear_after_today') {
        const today = new Date().toISOString().split('T')[0];
        const result = await db.execute(
            'DELETE FROM user_schedules WHERE organization_id = $1 AND date >= $2',
            [session.organizationId, today]
        );
        return NextResponse.json({ ok: true, deleted: result.rowCount });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
