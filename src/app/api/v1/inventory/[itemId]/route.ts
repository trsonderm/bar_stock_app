/**
 * GET    /api/v1/inventory/:itemId  — get a single item with quantities per location
 * PUT    /api/v1/inventory/:itemId  — update item fields (name, category, supplier, costs, threshold)
 * DELETE /api/v1/inventory/:itemId  — delete an item (and all inventory rows)
 */
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getApiSession, hasScope } from '@/lib/api-auth';
import { apiOk, Err } from '@/lib/api-response';

export async function GET(req: NextRequest, { params }: { params: { itemId: string } }) {
    const session = await getApiSession(req);
    if (!session) return Err.unauthorized();
    if (!hasScope(session, 'inventory:read')) return Err.forbidden('inventory:read');

    const itemId = parseInt(params.itemId);
    const item = await db.one(
        `SELECT id, name, type AS category, secondary_type AS sub_category,
                supplier, unit_cost, sale_price, order_size, low_stock_threshold,
                COALESCE(barcodes, '[]'::jsonb) AS barcodes,
                COALESCE(aliases, '[]'::jsonb) AS aliases
         FROM items WHERE id = $1 AND organization_id = $2`,
        [itemId, session.organizationId]
    );
    if (!item) return Err.notFound('Item');

    const quantities = await db.query(
        `SELECT l.id AS location_id, l.name AS location_name, COALESCE(inv.quantity, 0) AS quantity
         FROM locations l
         LEFT JOIN inventory inv ON inv.location_id = l.id AND inv.item_id = $1
         WHERE l.organization_id = $2
         ORDER BY l.name ASC`,
        [itemId, session.organizationId]
    );

    return apiOk({
        ...item,
        unit_cost: item.unit_cost ? Number(item.unit_cost) : null,
        sale_price: item.sale_price ? Number(item.sale_price) : null,
        quantities: quantities.map(q => ({
            location_id: q.location_id,
            location_name: q.location_name,
            quantity: Number(q.quantity),
        })),
        total_quantity: quantities.reduce((s: number, q: any) => s + Number(q.quantity), 0),
    });
}

export async function PUT(req: NextRequest, { params }: { params: { itemId: string } }) {
    const session = await getApiSession(req);
    if (!session) return Err.unauthorized();
    if (!hasScope(session, 'inventory:write')) return Err.forbidden('inventory:write');

    const itemId = parseInt(params.itemId);
    const exists = await db.one(`SELECT id FROM items WHERE id = $1 AND organization_id = $2`, [itemId, session.organizationId]);
    if (!exists) return Err.notFound('Item');

    const body = await req.json();
    const allowed = ['name', 'type', 'secondary_type', 'supplier', 'unit_cost', 'sale_price', 'order_size', 'low_stock_threshold'];

    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const field of allowed) {
        const bodyKey = field === 'type' ? 'category' : field === 'secondary_type' ? 'sub_category' : field;
        if (body[bodyKey] !== undefined) {
            setClauses.push(`${field} = $${idx++}`);
            values.push(body[bodyKey]);
        }
    }

    if (setClauses.length === 0) return Err.badRequest('No updatable fields provided');

    values.push(itemId, session.organizationId);
    const updated = await db.one(
        `UPDATE items SET ${setClauses.join(', ')} WHERE id = $${idx} AND organization_id = $${idx + 1} RETURNING id`,
        values
    );

    return apiOk({ id: updated.id, updated: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { itemId: string } }) {
    const session = await getApiSession(req);
    if (!session) return Err.unauthorized();
    if (!hasScope(session, 'inventory:write')) return Err.forbidden('inventory:write');

    const itemId = parseInt(params.itemId);
    const result = await db.execute(
        `DELETE FROM items WHERE id = $1 AND organization_id = $2`,
        [itemId, session.organizationId]
    );

    if ((result as any).rowCount === 0) return Err.notFound('Item');
    return apiOk({ id: itemId, deleted: true });
}
