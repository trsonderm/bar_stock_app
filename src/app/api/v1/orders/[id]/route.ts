/**
 * GET    /api/v1/orders/:id  — get order with line items
 * PUT    /api/v1/orders/:id  — update status ("PENDING"|"DELIVERED"|"CANCELLED")
 * DELETE /api/v1/orders/:id  — delete a PENDING order
 */
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getApiSession, hasScope } from '@/lib/api-auth';
import { apiOk, Err } from '@/lib/api-response';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await getApiSession(req);
    if (!session) return Err.unauthorized();
    if (!hasScope(session, 'orders:read')) return Err.forbidden('orders:read');

    const order = await db.one(
        `SELECT o.id, o.status, o.location_id, l.name AS location_name,
                o.expected_delivery, o.notes, o.created_at, o.updated_at
         FROM orders o
         LEFT JOIN locations l ON o.location_id = l.id
         WHERE o.id = $1 AND o.organization_id = $2`,
        [params.id, session.organizationId]
    );
    if (!order) return Err.notFound('Order');

    const items = await db.query(
        `SELECT oi.id, oi.item_id, i.name AS item_name,
                oi.quantity, oi.quantity_received, oi.unit_cost
         FROM order_items oi
         LEFT JOIN items i ON oi.item_id = i.id
         WHERE oi.order_id = $1`,
        [params.id]
    );

    return apiOk({
        ...order,
        items: items.map(i => ({
            id: i.id,
            item_id: i.item_id,
            item_name: i.item_name,
            quantity: Number(i.quantity),
            quantity_received: i.quantity_received != null ? Number(i.quantity_received) : null,
            unit_cost: i.unit_cost ? Number(i.unit_cost) : null,
        })),
    });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await getApiSession(req);
    if (!session) return Err.unauthorized();
    if (!hasScope(session, 'orders:write')) return Err.forbidden('orders:write');

    const { status, notes } = await req.json();
    const validStatuses = ['PENDING', 'DELIVERED', 'CANCELLED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED'];
    if (status && !validStatuses.includes(status)) {
        return Err.badRequest(`status must be one of: ${validStatuses.join(', ')}`);
    }

    const order = await db.one(`SELECT id FROM orders WHERE id = $1 AND organization_id = $2`, [params.id, session.organizationId]);
    if (!order) return Err.notFound('Order');

    const updates: string[] = ['updated_at = NOW()'];
    const values: any[] = [];
    let idx = 1;
    if (status) { updates.push(`status = $${idx++}`); values.push(status); }
    if (notes !== undefined) { updates.push(`notes = $${idx++}`); values.push(notes); }

    values.push(params.id, session.organizationId);
    await db.execute(
        `UPDATE orders SET ${updates.join(', ')} WHERE id = $${idx} AND organization_id = $${idx + 1}`,
        values
    );

    return apiOk({ id: Number(params.id), updated: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await getApiSession(req);
    if (!session) return Err.unauthorized();
    if (!hasScope(session, 'orders:write')) return Err.forbidden('orders:write');

    const order = await db.one(`SELECT id, status FROM orders WHERE id = $1 AND organization_id = $2`, [params.id, session.organizationId]);
    if (!order) return Err.notFound('Order');
    if (order.status !== 'PENDING') return Err.badRequest('Only PENDING orders can be deleted');

    await db.execute(`DELETE FROM order_items WHERE order_id = $1`, [params.id]);
    await db.execute(`DELETE FROM orders WHERE id = $1 AND organization_id = $2`, [params.id, session.organizationId]);

    return apiOk({ id: Number(params.id), deleted: true });
}
