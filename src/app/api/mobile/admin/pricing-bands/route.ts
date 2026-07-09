/**
 * GET    /api/mobile/admin/pricing-bands  — list all pricing time bands
 * POST   /api/mobile/admin/pricing-bands  — create a pricing band
 * PUT    /api/mobile/admin/pricing-bands  — update a pricing band
 * DELETE /api/mobile/admin/pricing-bands  — delete a pricing band
 *
 * All methods require admin role.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';

async function ensureTable() {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS package_pricing_bands (
            id SERIAL PRIMARY KEY,
            organization_id INT NOT NULL,
            name VARCHAR(100) NOT NULL,
            start_time TIME NOT NULL,
            end_time TIME NOT NULL,
            sort_order INT DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `).catch(() => {});
}

export async function GET(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    await ensureTable();
    const bands = await db.query(
        'SELECT id, name, start_time, end_time, sort_order FROM package_pricing_bands WHERE organization_id = $1 ORDER BY sort_order ASC, id ASC',
        [session.organizationId]
    );
    return NextResponse.json({ bands });
}

export async function POST(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    await ensureTable();
    const { name, start_time, end_time, sort_order } = await req.json();
    if (!name?.trim() || !start_time || !end_time) {
        return NextResponse.json({ error: 'name, start_time, and end_time are required' }, { status: 400 });
    }
    const row = await db.one(
        'INSERT INTO package_pricing_bands (organization_id, name, start_time, end_time, sort_order) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, start_time, end_time, sort_order',
        [session.organizationId, name.trim(), start_time, end_time, sort_order ?? 0]
    );
    return NextResponse.json({ band: row });
}

export async function PUT(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { id, name, start_time, end_time, sort_order } = await req.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (name !== undefined) { updates.push(`name = $${idx++}`); params.push(name.trim()); }
    if (start_time !== undefined) { updates.push(`start_time = $${idx++}`); params.push(start_time); }
    if (end_time !== undefined) { updates.push(`end_time = $${idx++}`); params.push(end_time); }
    if (sort_order !== undefined) { updates.push(`sort_order = $${idx++}`); params.push(sort_order); }
    if (updates.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

    params.push(id, session.organizationId);
    await db.execute(
        `UPDATE package_pricing_bands SET ${updates.join(', ')} WHERE id = $${idx++} AND organization_id = $${idx}`,
        params
    );
    return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    await db.execute(
        'DELETE FROM package_pricing_bands WHERE id = $1 AND organization_id = $2',
        [id, session.organizationId]
    );
    return NextResponse.json({ ok: true });
}
