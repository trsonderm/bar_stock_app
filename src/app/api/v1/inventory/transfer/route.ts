/**
 * POST /api/v1/inventory/transfer
 * Transfer stock for an item from one location to another.
 *
 * Body:
 *   item_id            integer  required
 *   from_location_id   integer  required
 *   to_location_id     integer  required
 *   quantity           number   required  Must be positive
 *   note               string   optional
 */
import { NextRequest } from 'next/server';
import { pool, db } from '@/lib/db';
import { getApiSession, hasScope } from '@/lib/api-auth';
import { apiOk, Err } from '@/lib/api-response';

export async function POST(req: NextRequest) {
    const session = await getApiSession(req);
    if (!session) return Err.unauthorized();
    if (!hasScope(session, 'inventory:write')) return Err.forbidden('inventory:write');

    const body = await req.json();
    const { item_id, from_location_id, to_location_id, quantity, note } = body;

    if (!item_id) return Err.badRequest('item_id is required');
    if (!from_location_id) return Err.badRequest('from_location_id is required');
    if (!to_location_id) return Err.badRequest('to_location_id is required');
    if (!quantity || quantity <= 0) return Err.badRequest('quantity must be a positive number');
    if (from_location_id === to_location_id) return Err.badRequest('from_location_id and to_location_id must be different');

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const item = await db.one(`SELECT id, name FROM items WHERE id = $1 AND organization_id = $2`, [item_id, session.organizationId]);
        if (!item) { await client.query('ROLLBACK'); return Err.notFound('Item'); }

        const fromLoc = await db.one(`SELECT id FROM locations WHERE id = $1 AND organization_id = $2`, [from_location_id, session.organizationId]);
        if (!fromLoc) { await client.query('ROLLBACK'); return Err.notFound('Source location'); }

        const toLoc = await db.one(`SELECT id FROM locations WHERE id = $1 AND organization_id = $2`, [to_location_id, session.organizationId]);
        if (!toLoc) { await client.query('ROLLBACK'); return Err.notFound('Destination location'); }

        // Check source has enough stock
        const src = await client.query(
            `SELECT quantity FROM inventory WHERE item_id = $1 AND location_id = $2`,
            [item_id, from_location_id]
        );
        const srcQty = src.rows[0] ? Number(src.rows[0].quantity) : 0;
        if (srcQty < quantity) {
            await client.query('ROLLBACK');
            return Err.badRequest(`Insufficient stock at source location. Available: ${srcQty}, requested: ${quantity}`);
        }

        // Deduct from source
        await client.query(
            `UPDATE inventory SET quantity = quantity - $1 WHERE item_id = $2 AND location_id = $3`,
            [quantity, item_id, from_location_id]
        );

        // Add to destination (upsert)
        await client.query(
            `INSERT INTO inventory (item_id, location_id, quantity, organization_id)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (item_id, location_id) DO UPDATE SET quantity = inventory.quantity + $3`,
            [item_id, to_location_id, quantity, session.organizationId]
        );

        await client.query(
            `INSERT INTO activity_logs (organization_id, user_id, action, details) VALUES ($1, NULL, 'TRANSFER_STOCK', $2)`,
            [session.organizationId, JSON.stringify({
                itemId: item_id, itemName: item.name,
                fromLocationId: from_location_id, toLocationId: to_location_id,
                quantity, source: 'api', keyId: session.keyId, keyName: session.keyName, note: note || null,
            })]
        );

        await client.query('COMMIT');

        return apiOk({
            item_id: Number(item_id),
            item_name: item.name,
            from_location_id: Number(from_location_id),
            to_location_id: Number(to_location_id),
            quantity_transferred: Number(quantity),
        });
    } catch (e: any) {
        await client.query('ROLLBACK').catch(() => {});
        return Err.internal(e.message);
    } finally {
        client.release();
    }
}
