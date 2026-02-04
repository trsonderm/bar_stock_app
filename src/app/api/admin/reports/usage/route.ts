import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Simple usage trend: Count 'adjust' actions in last 30 days per item
        // This relies on activity_logs details having itemId.
        // JSON query in Postgres: details->>'itemId'
        const usage = await db.query(`
            SELECT i.name, COUNT(*) as adjustments, MIN(al.timestamp) as first_seen, MAX(al.timestamp) as last_seen
            FROM activity_logs al
            JOIN items i ON (al.details->>'itemId')::int = i.id
            WHERE al.organization_id = $1 
            AND al.action IN ('ADJUST_STOCK', 'SCAN_ITEM') 
            AND al.timestamp > NOW() - INTERVAL '30 days'
            GROUP BY i.name
            ORDER BY adjustments DESC
            LIMIT 50
        `, [session.organizationId]);

        return NextResponse.json({ data: usage });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
