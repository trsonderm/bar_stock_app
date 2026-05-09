/**
 * POST /api/v1/inventory/adjust
 * Add or subtract stock for an item at a specific location.
 *
 * Body:
 *   item_id      integer  required
 *   change       number   required  Positive = add, negative = subtract
 *   location_id  integer  optional  Defaults to the org's first location
 *   note         string   optional  Recorded in activity log
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
    const { item_id, change, location_id, note } = body;

    if (!item_id) return Err.badRequest('item_id is required');
    if (change === undefined || change === null || change === 0) return Err.badRequest('change must be a non-zero number');

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const item = await db.one(
            `SELECT id, name FROM items WHERE id = $1 AND organization_id = $2`,
            [item_id, session.organizationId]
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

        await client.query(
            `INSERT INTO inventory (item_id, location_id, quantity, organization_id)
             VALUES ($1, $2, 0, $3) ON CONFLICT (item_id, location_id) DO NOTHING`,
            [item_id, targetLocationId, session.organizationId]
        );

        const updated = await client.query(
            `UPDATE inventory SET quantity = GREATEST(0, quantity + $1), organization_id = $4
             WHERE item_id = $2 AND location_id = $3 RETURNING quantity`,
            [change, item_id, targetLocationId, session.organizationId]
        );
        const newQuantity = updated.rows[0].quantity;

        const action = change > 0 ? 'ADD_STOCK' : 'SUBTRACT_STOCK';
        await client.query(
            `INSERT INTO activity_logs (organization_id, user_id, action, details)
             VALUES ($1, NULL, $2, $3)`,
            [session.organizationId, action, JSON.stringify({
                itemId: item_id, itemName: item.name,
                change: Math.abs(change), quantity: Math.abs(change),
                quantityAfter: newQuantity, locationId: targetLocationId,
                source: 'api', keyId: session.keyId, keyName: session.keyName,
                note: note || null,
            })]
        );

        await client.query('COMMIT');

        return apiOk({
            item_id: Number(item_id),
            item_name: item.name,
            location_id: targetLocationId,
            change: Number(change),
            quantity_after: Number(newQuantity),
        });
    } catch (e: any) {
        await client.query('ROLLBACK').catch(() => {});
        return Err.internal(e.message);
    } finally {
        client.release();
    }
}
