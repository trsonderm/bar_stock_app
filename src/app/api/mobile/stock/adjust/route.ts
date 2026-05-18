/**
 * POST /api/mobile/stock/adjust
 * Add or subtract stock for an item. Uses JWT Bearer auth (mobile users).
 *
 * Body:
 *   item_id      integer  required
 *   change       number   required  Positive = add stock, negative = subtract
 *   location_id  integer  optional  Defaults to user's first assigned location
 *   note         string   optional  Recorded in activity log
 */
import { NextRequest, NextResponse } from 'next/server';
import { pool, db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';

export async function POST(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

    const { item_id, change, location_id, note } = body;

    if (!item_id) return NextResponse.json({ error: 'item_id is required' }, { status: 400 });
    if (change === undefined || change === null || Number(change) === 0) {
        return NextResponse.json({ error: 'change must be a non-zero number' }, { status: 400 });
    }

    const numChange = Number(change);
    const isAdd = numChange > 0;

    // Check permission
    const perms: string[] = Array.isArray(session.permissions) ? session.permissions : [];
    const hasAll = perms.includes('all');
    const canAdd = hasAll || perms.includes('add_stock');
    const canSubtract = hasAll || perms.includes('subtract_stock');

    if (isAdd && !canAdd) {
        return NextResponse.json({ error: 'Permission denied: add_stock required' }, { status: 403 });
    }
    if (!isAdd && !canSubtract) {
        return NextResponse.json({ error: 'Permission denied: subtract_stock required' }, { status: 403 });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Verify item belongs to this org
        const item = await db.one(
            `SELECT id, name, low_stock_threshold FROM items WHERE id = $1 AND organization_id = $2`,
            [item_id, session.organizationId]
        );
        if (!item) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: 'Item not found' }, { status: 404 });
        }

        // Resolve location
        let targetLocationId: number | null = location_id ? parseInt(location_id) : null;
        if (targetLocationId) {
            const loc = await db.one(
                `SELECT id FROM locations WHERE id = $1 AND organization_id = $2`,
                [targetLocationId, session.organizationId]
            );
            if (!loc) {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: 'Location not found' }, { status: 404 });
            }
        } else {
            // Default: first location assigned to this user (or org's first location)
            const userLoc = await db.one(
                `SELECT l.id FROM locations l
                 JOIN user_locations ul ON l.id = ul.location_id
                 WHERE ul.user_id = $1 AND l.organization_id = $2
                 ORDER BY l.id ASC LIMIT 1`,
                [session.id, session.organizationId]
            );
            if (userLoc) {
                targetLocationId = userLoc.id;
            } else {
                const firstLoc = await db.one(
                    `SELECT id FROM locations WHERE organization_id = $1 ORDER BY id ASC LIMIT 1`,
                    [session.organizationId]
                );
                if (!firstLoc) {
                    await client.query('ROLLBACK');
                    return NextResponse.json({ error: 'No locations configured' }, { status: 400 });
                }
                targetLocationId = firstLoc.id;
            }
        }

        // Ensure inventory row exists
        await client.query(
            `INSERT INTO inventory (item_id, location_id, quantity, organization_id)
             VALUES ($1, $2, 0, $3) ON CONFLICT (item_id, location_id) DO NOTHING`,
            [item_id, targetLocationId, session.organizationId]
        );

        // Apply change (floor at 0)
        const updated = await client.query(
            `UPDATE inventory
             SET quantity = GREATEST(0, quantity + $1)
             WHERE item_id = $2 AND location_id = $3
             RETURNING quantity`,
            [numChange, item_id, targetLocationId]
        );
        const newQuantity = Number(updated.rows[0].quantity);

        // Activity log
        const action = isAdd ? 'ADD_STOCK' : 'SUBTRACT_STOCK';
        await client.query(
            `INSERT INTO activity_logs (organization_id, user_id, action, details)
             VALUES ($1, $2, $3, $4)`,
            [session.organizationId, session.id, action, JSON.stringify({
                itemId: item_id,
                itemName: item.name,
                quantity: Math.abs(numChange),
                quantityAfter: newQuantity,
                locationId: targetLocationId,
                source: 'mobile',
                note: note || null,
            })]
        );

        await client.query('COMMIT');

        return NextResponse.json({
            item_id: Number(item_id),
            item_name: item.name,
            location_id: targetLocationId,
            change: numChange,
            quantity_after: newQuantity,
        });
    } catch (e: any) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[Mobile stock adjust]', e);
        return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 });
    } finally {
        client.release();
    }
}
