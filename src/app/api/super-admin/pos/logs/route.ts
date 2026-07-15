import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { searchParams } = new URL(req.url);
        const orgId = searchParams.get('org_id');
        const posType = searchParams.get('pos_type');
        const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);

        const conditions: string[] = [];
        const params: any[] = [];
        let pIdx = 1;

        if (orgId) { conditions.push(`l.organization_id = $${pIdx++}`); params.push(parseInt(orgId)); }
        if (posType) { conditions.push(`l.pos_type = $${pIdx++}`); params.push(posType); }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const logs = await db.query(
            `SELECT l.*, o.name as org_name
             FROM pos_sync_logs l
             JOIN organizations o ON l.organization_id = o.id
             ${where}
             ORDER BY l.started_at DESC
             LIMIT $${pIdx}`,
            [...params, limit]
        );

        return NextResponse.json({ logs });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
