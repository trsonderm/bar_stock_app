/**
 * GET    /api/mobile/admin/schedule/shifts              — list shift templates
 * POST   /api/mobile/admin/schedule/shifts              — create a shift template
 * PUT    /api/mobile/admin/schedule/shifts              — update a shift template
 * DELETE /api/mobile/admin/schedule/shifts?id=<id>     — delete a shift template
 *
 * Any authenticated user may GET (needed for scheduler).
 * Write methods require admin role.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';

export async function GET(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const locationId = req.nextUrl.searchParams.get('locationId');

    const shifts = locationId
        ? await db.query(
            `SELECT * FROM shifts WHERE organization_id = $1 AND (location_id IS NULL OR location_id = $2)
             ORDER BY location_id NULLS FIRST, start_time ASC`,
            [session.organizationId, parseInt(locationId)]
          )
        : await db.query(
            'SELECT * FROM shifts WHERE organization_id = $1 ORDER BY location_id NULLS FIRST, start_time ASC',
            [session.organizationId]
          );

    return NextResponse.json({ shifts });
}

export async function POST(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { label, start_time, end_time, color, assigned_user_ids, location_id } = await req.json();
    if (!label?.trim() || !start_time || !end_time) {
        return NextResponse.json({ error: 'label, start_time, and end_time are required' }, { status: 400 });
    }

    const row = await db.one(
        `INSERT INTO shifts (organization_id, label, start_time, end_time, color, assigned_user_ids, location_id)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7) RETURNING id`,
        [
            session.organizationId,
            label.trim(), start_time, end_time,
            color || '#3b82f6',
            JSON.stringify(assigned_user_ids || []),
            location_id ? parseInt(location_id) : null,
        ]
    );
    return NextResponse.json({ ok: true, id: row.id });
}

export async function PUT(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { id, label, start_time, end_time, color, assigned_user_ids, location_id } = await req.json();
    if (!id || !label?.trim() || !start_time || !end_time) {
        return NextResponse.json({ error: 'id, label, start_time, and end_time are required' }, { status: 400 });
    }

    const setClauses = ['label = $1', 'start_time = $2', 'end_time = $3', 'color = $4', 'assigned_user_ids = $5::jsonb'];
    const params: any[] = [label.trim(), start_time, end_time, color || '#3b82f6', JSON.stringify(assigned_user_ids || [])];

    if (location_id !== undefined) {
        setClauses.push(`location_id = $${params.length + 1}`);
        params.push(location_id ? parseInt(location_id) : null);
    }
    params.push(id, session.organizationId);

    const result = await db.execute(
        `UPDATE shifts SET ${setClauses.join(', ')} WHERE id = $${params.length - 1} AND organization_id = $${params.length}`,
        params
    );
    if (result.rowCount === 0) return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    await db.execute('DELETE FROM shifts WHERE id = $1 AND organization_id = $2', [id, session.organizationId]);
    return NextResponse.json({ ok: true });
}
