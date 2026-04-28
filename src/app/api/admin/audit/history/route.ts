import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session?.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const canAudit =
        session.role === 'admin' ||
        (session.permissions as string[]).includes('audit') ||
        (session.permissions as string[]).includes('all');
    if (!canAudit) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });

    // Each audit is a group of activity_logs with method=AUDIT in the same minute,
    // from the same user. We group by user + truncated timestamp (minute) to reconstruct sessions.
    const rows = await db.query(`
        SELECT
            al.id,
            al.user_id,
            u.first_name || ' ' || u.last_name AS user_name,
            al.details,
            al.timestamp,
            date_trunc('minute', al.timestamp) AS audit_minute
        FROM activity_logs al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE al.organization_id = $1
          AND al.action IN ('ADD_STOCK','SUBTRACT_STOCK')
          AND al.details::jsonb->>'method' = 'AUDIT'
        ORDER BY al.timestamp DESC
        LIMIT 500
    `, [session.organizationId]);

    // Group into audit sessions (same user + same minute = same audit)
    const sessions: Record<string, any> = {};
    for (const row of rows) {
        const key = `${row.user_id}__${row.audit_minute}`;
        if (!sessions[key]) {
            sessions[key] = {
                id: key,
                user_name: row.user_name,
                timestamp: row.timestamp,
                note: null,
                changes: [],
            };
        }
        let details: any = {};
        try { details = typeof row.details === 'string' ? JSON.parse(row.details) : row.details; } catch {}
        if (details.note && !sessions[key].note) sessions[key].note = details.note;
        sessions[key].changes.push({
            itemId: details.itemId,
            itemName: details.itemName,
            oldQty: details.oldQty,
            newQty: details.newQty,
            diff: details.newQty - details.oldQty,
        });
    }

    const auditList = Object.values(sessions).sort(
        (a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return NextResponse.json({ audits: auditList });
}
