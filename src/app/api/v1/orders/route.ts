/**
 * GET  /api/v1/orders  — list purchase orders
 * POST /api/v1/orders  — create a purchase order
 *
 * GET query params:
 *   status   string  "PENDING" | "DELIVERED" | "CANCELLED" | "all" (default "all")
 *   limit    integer (default 50, max 200)
 *   offset   integer (default 0)
 *
 * POST body:
 *   location_id          integer   required
 *   items                array     required  [{ item_id, quantity, unit_cost? }]
 *   expected_delivery    string    ISO date string (optional)
 *   notes                string    optional
 */
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getApiSession, hasScope } from '@/lib/api-auth';
import { apiOk, apiList, Err } from '@/lib/api-response';

export async function GET(req: NextRequest) {
    const session = await getApiSession(req);
    if (!session) return Err.unauthorized();
    if (!hasScope(session, 'orders:read')) return Err.forbidden('orders:read');

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'all';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
    const offset = parseInt(searchParams.get('offset') || '0');

    const params: any[] = [session.organizationId];
    let where = 'WHERE o.organization_id = $1';
    if (status !== 'all') {
        params.push(status.toUpperCase());
        where += ` AND o.status = $${params.length}`;
    }

    const orders = await db.query(`
        SELECT o.id, o.status, o.expected_delivery, o.notes,
               o.created_at, o.updated_at,
               l.name AS location_name, o.location_id,
               COUNT(oi.id) AS item_count
        FROM orders o
        LEFT JOIN locations l ON o.location_id = l.id
        LEFT JOIN order_items oi ON oi.order_id = o.id
        ${where}
        GROUP BY o.id, l.name
        ORDER BY o.created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]);

    const total = await db.one(`SELECT COUNT(*) AS total FROM orders o ${where}`, params);

    return apiList(
        orders.map(o => ({
            id: o.id,
            status: o.status,
            location_id: o.location_id,
            location_name: o.location_name,
            item_count: Number(o.item_count),
            expected_delivery: o.expected_delivery,
            notes: o.notes,
            created_at: o.created_at,
            updated_at: o.updated_at,
        })),
        { total: Number(total?.total ?? 0), limit, offset },
    );
}

export async function POST(req: NextRequest) {
    const session = await getApiSession(req);
    if (!session) return Err.unauthorized();
    if (!hasScope(session, 'orders:write')) return Err.forbidden('orders:write');

    const body = await req.json();
    const { location_id, items, expected_delivery, notes } = body;

    if (!location_id) return Err.badRequest('location_id is required');
    if (!Array.isArray(items) || items.length === 0) return Err.badRequest('items must be a non-empty array');

    const loc = await db.one(`SELECT id FROM locations WHERE id = $1 AND organization_id = $2`, [location_id, session.organizationId]);
    if (!loc) return Err.notFound('Location');

    const order = await db.one(
        `INSERT INTO orders (organization_id, location_id, status, expected_delivery, notes, created_by_source)
         VALUES ($1, $2, 'PENDING', $3, $4, 'api') RETURNING id, status, created_at`,
        [session.organizationId, location_id, expected_delivery || null, notes || null]
    );

    const insertedItems = [];
    for (const item of items) {
        if (!item.item_id || !item.quantity) continue;
        const itemRow = await db.one(`SELECT id, name FROM items WHERE id = $1 AND organization_id = $2`, [item.item_id, session.organizationId]);
        if (!itemRow) continue;
        const oi = await db.one(
            `INSERT INTO order_items (order_id, item_id, quantity, unit_cost)
             VALUES ($1, $2, $3, $4) RETURNING id`,
            [order.id, item.item_id, item.quantity, item.unit_cost || null]
        );
        insertedItems.push({ id: oi.id, item_id: item.item_id, item_name: itemRow.name, quantity: item.quantity });
    }

    return apiOk({ id: order.id, status: order.status, created_at: order.created_at, items: insertedItems }, {}, 201);
}
