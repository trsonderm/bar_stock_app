/**
 * POST /api/v1/inventory/:itemId/consume
 * Remove (consume/use) stock for a specific item at a location.
 * Quantity cannot go below zero — a 400 error is returned if insufficient stock.
 *
 * Body:
 *   quantity     number   required  Amount to remove (must be positive)
 *   location_id  integer  optional  Defaults to org's first location
 *   note         string   optional  Recorded in activity log
 */
import { NextRequest } from 'next/server';
import { pool, db } from '@/lib/db';
import { getApiSession, hasScope } from '@/lib/api-auth';
import { apiOk, Err } from '@/lib/api-response';

export async function POST(req: NextRequest, { params }: { params: { itemId: string } }) {
    const session = await getApiSession(req);
    if (!session) return Err.unauthorized();
    if (!hasScope(session, 'inventory:write')) return Err.forbidden('inventory:write');

    const itemId = parseInt(params.itemId);
    const body = await req.json();
    const { quantity, location_id, note } = body;

    if (!quantity || quantity <= 0) return Err.badRequest('quantity must be a positive number');

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const item = await db.one(
            `SELECT id, name FROM items WHERE id = $1 AND organization_id = $2`,
            [itemId, session.organizationId]
        );
        if (!item) { await client.query('ROLLBACK'); return Err.notFound('Item'); }

        let targetLocationId: number | null = location_id ? parseInt(location_id) : null;
        if (targetLocationId) {
            const loc = await db.one(`SELECT id FROM locations WHERE id = $1 AND organization_id = $2`, [targetLocationId, session.organizationId]);
            if (!loc) { await client.query('ROLLBACK'); return Err.notFound('Location'); }
        } else {
            const first = await db.one(`SELECT id FROM locations WHERE organization_id = $1 ORDER BY id ASC LIMIT 1`, [session.organizationId]);
            if (!first) { await client.query('ROLLBACK'); return Err.badRequest('No locations configured for this organization'); }
            targetLocationId = first.id;
        }

        // Read current quantity before applying removal
        const current = await client.query(
            `SELECT quantity FROM inventory WHERE item_id = $1 AND location_id = $2`,
            [itemId, targetLocationId]
        );
        const currentQty = current.rows[0] ? Number(current.rows[0].quantity) : 0;

        if (currentQty < quantity) {
            await client.query('ROLLBACK');
            return Err.badRequest(`Insufficient stock. Available: ${currentQty}, requested: ${quantity}`);
        }

        await client.query(
            `INSERT INTO inventory (item_id, location_id, quantity, organization_id)
             VALUES ($1, $2, 0, $3) ON CONFLICT (item_id, location_id) DO NOTHING`,
            [itemId, targetLocationId, session.organizationId]
        );

        const updated = await client.query(
            `UPDATE inventory SET quantity = GREATEST(0, quantity - $1), organization_id = $4
             WHERE item_id = $2 AND location_id = $3 RETURNING quantity`,
            [quantity, itemId, targetLocationId, session.organizationId]
        );
        const quantityAfter = Number(updated.rows[0].quantity);

        await client.query(
            `INSERT INTO activity_logs (organization_id, user_id, action, details) VALUES ($1, NULL, 'SUBTRACT_STOCK', $2)`,
            [session.organizationId, JSON.stringify({
                itemId, itemName: item.name,
                quantityRemoved: quantity, quantityBefore: currentQty, quantityAfter, locationId: targetLocationId,
                source: 'api', keyId: session.keyId, keyName: session.keyName, note: note || null,
            })]
        );

        await client.query('COMMIT');

        return apiOk({
            item_id: itemId,
            item_name: item.name,
            location_id: targetLocationId,
            quantity_removed: Number(quantity),
            quantity_before: currentQty,
            quantity_after: quantityAfter,
        });
    } catch (e: any) {
        await client.query('ROLLBACK').catch(() => {});
        return Err.internal(e.message);
    } finally {
        client.release();
    }
}
