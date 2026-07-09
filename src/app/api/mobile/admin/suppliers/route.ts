/**
 * GET    /api/mobile/admin/suppliers          — list all org + global suppliers
 * POST   /api/mobile/admin/suppliers          — create a supplier
 * PUT    /api/mobile/admin/suppliers          — update a supplier
 * DELETE /api/mobile/admin/suppliers?id=<id>  — delete a supplier
 *
 * GET: any authenticated user.  Write methods: admin only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';

export async function GET(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const suppliers = await db.query(
        `SELECT id, name, contact_email, contact_phone,
                delivery_days_json, order_days_json, lead_time_days,
                (organization_id IS NULL) AS is_global
         FROM suppliers
         WHERE organization_id = $1 OR organization_id IS NULL
         ORDER BY CASE WHEN organization_id IS NULL THEN 0 ELSE 1 END, name ASC`,
        [session.organizationId]
    );
    return NextResponse.json({ suppliers });
}

export async function POST(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { name, contact_email, contact_phone, delivery_days, order_days, lead_time_days } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });

    const row = await db.one(
        `INSERT INTO suppliers (organization_id, name, contact_email, contact_phone, delivery_days_json, order_days_json, lead_time_days)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
            session.organizationId,
            name.trim(),
            contact_email?.trim() || null,
            contact_phone?.trim() || null,
            JSON.stringify(delivery_days || []),
            JSON.stringify(order_days || []),
            lead_time_days ?? 1,
        ]
    );
    return NextResponse.json({ ok: true, id: row.id });
}

export async function PUT(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { id, name, contact_email, contact_phone, delivery_days, order_days, lead_time_days } = await req.json();
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (name !== undefined) { updates.push(`name = $${idx++}`); params.push(name.trim()); }
    if (contact_email !== undefined) { updates.push(`contact_email = $${idx++}`); params.push(contact_email?.trim() || null); }
    if (contact_phone !== undefined) { updates.push(`contact_phone = $${idx++}`); params.push(contact_phone?.trim() || null); }
    if (delivery_days !== undefined) { updates.push(`delivery_days_json = $${idx++}`); params.push(JSON.stringify(delivery_days)); }
    if (order_days !== undefined) { updates.push(`order_days_json = $${idx++}`); params.push(JSON.stringify(order_days)); }
    if (lead_time_days !== undefined) { updates.push(`lead_time_days = $${idx++}`); params.push(lead_time_days); }

    if (updates.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    params.push(id, session.organizationId);

    const result = await db.execute(
        `UPDATE suppliers SET ${updates.join(', ')} WHERE id = $${idx++} AND organization_id = $${idx}`,
        params
    );
    if (result.rowCount === 0) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    await db.execute(
        'DELETE FROM suppliers WHERE id = $1 AND organization_id = $2',
        [id, session.organizationId]
    );
    return NextResponse.json({ ok: true });
}
