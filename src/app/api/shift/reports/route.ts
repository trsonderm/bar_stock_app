import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { organizationId } = session;
    const sp = req.nextUrl.searchParams;

    const search = sp.get('search') || '';
    const locationId = sp.get('locationId') ? parseInt(sp.get('locationId')!) : null;
    const from = sp.get('from') || null;
    const to = sp.get('to') || null;
    const limit = Math.min(parseInt(sp.get('limit') || '50'), 200);
    const offset = parseInt(sp.get('offset') || '0');

    const conditions: string[] = ['sc.organization_id = $1'];
    const params: any[] = [organizationId];
    let idx = 2;

    if (search) {
        conditions.push(`(
            u.first_name ILIKE $${idx} OR
            u.last_name ILIKE $${idx} OR
            TO_CHAR(sc.closed_at, 'YYYY-MM-DD') ILIKE $${idx} OR
            TO_CHAR(sc.closed_at, 'Mon DD, YYYY') ILIKE $${idx}
        )`);
        params.push(`%${search}%`);
        idx++;
    }

    if (locationId) {
        conditions.push(`sc.location_id = $${idx}`);
        params.push(locationId);
        idx++;
    }

    if (from) {
        conditions.push(`sc.closed_at >= $${idx}::date`);
        params.push(from);
        idx++;
    }

    if (to) {
        conditions.push(`sc.closed_at <= ($${idx}::date + INTERVAL '1 day')`);
        params.push(to);
        idx++;
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const countResult = await db.one(`
        SELECT COUNT(*) as total
        FROM shift_closes sc
        LEFT JOIN users u ON sc.user_id = u.id
        LEFT JOIN locations l ON sc.location_id = l.id
        ${whereClause}
    `, params);

    const rows = await db.query(`
        SELECT sc.*,
            u.first_name || ' ' || u.last_name AS user_name,
            l.name AS location_name
        FROM shift_closes sc
        LEFT JOIN users u ON sc.user_id = u.id
        LEFT JOIN locations l ON sc.location_id = l.id
        ${whereClause}
        ORDER BY sc.closed_at DESC
        LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return NextResponse.json({
        shiftCloses: rows,
        total: parseInt(countResult?.total || '0'),
    });
}
