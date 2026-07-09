/**
 * GET    /api/mobile/admin/locations  — list all org locations
 * POST   /api/mobile/admin/locations  — create a location
 * PUT    /api/mobile/admin/locations  — update a location
 * DELETE /api/mobile/admin/locations?id=<id>  — delete a location (cascades inventory)
 *
 * All write methods require admin role. GET allows any authenticated user.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';

export async function GET(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const locations = await db.query(
        'SELECT id, name, address FROM locations WHERE organization_id = $1 ORDER BY name ASC',
        [session.organizationId]
    );
    return NextResponse.json({ locations });
}

export async function POST(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { name, address } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });

    const row = await db.one(
        'INSERT INTO locations (name, address, organization_id) VALUES ($1, $2, $3) RETURNING id, name, address',
        [name.trim(), address?.trim() || '', session.organizationId]
    );
    return NextResponse.json({ ok: true, location: row });
}

export async function PUT(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { id, name, address } = await req.json();
    if (!id || !name?.trim()) return NextResponse.json({ error: 'id and name are required' }, { status: 400 });

    const result = await db.execute(
        'UPDATE locations SET name = $1, address = $2 WHERE id = $3 AND organization_id = $4',
        [name.trim(), address?.trim() || '', id, session.organizationId]
    );
    if (result.rowCount === 0) return NextResponse.json({ error: 'Location not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    await db.execute(
        'DELETE FROM locations WHERE id = $1 AND organization_id = $2',
        [id, session.organizationId]
    );
    return NextResponse.json({ ok: true });
}
