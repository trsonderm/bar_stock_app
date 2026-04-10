import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const organizationId = session.organizationId;
        const { itemId, change, locationId, bottleLevel } = await req.json();

        if (!itemId || change === undefined || change === null || change === 0) {
            return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
        }

        if (change > 0) {
            const canAddStock = session.role === 'admin' || session.permissions.includes('add_stock') || session.permissions.includes('all');
            if (!canAddStock) return NextResponse.json({ error: 'Permission denied: Add Stock' }, { status: 403 });
        }

        const action = change > 0 ? 'ADD_STOCK' : 'SUBTRACT_STOCK';

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Verify item belongs to this organization
            const itemRes = await client.query(
                `SELECT name FROM items WHERE id = $1 AND organization_id = $2`,
                [itemId, organizationId]
            );
            const item = itemRes.rows[0];
            if (!item) {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: 'Item not found in this organization' }, { status: 404 });
            }

            // Determine target location: payload > cookie > first location
            let targetLocationId: number | null = locationId ? parseInt(locationId) : null;

            if (!targetLocationId) {
                const cookieLoc = req.cookies.get('current_location_id')?.value;
                if (cookieLoc) {
                    const parsed = parseInt(cookieLoc);
                    if (!isNaN(parsed)) targetLocationId = parsed;
                }
            }

            if (targetLocationId) {
                const locRes = await client.query(
                    'SELECT id FROM locations WHERE id = $1 AND organization_id = $2',
                    [targetLocationId, organizationId]
                );
                if (!locRes.rows[0]) targetLocationId = null;
            }

            if (!targetLocationId) {
                const anyLoc = await client.query(
                    'SELECT id FROM locations WHERE organization_id = $1 ORDER BY id ASC LIMIT 1',
                    [organizationId]
                );
                if (!anyLoc.rows[0]) {
                    await client.query('ROLLBACK');
                    return NextResponse.json({ error: 'No location found for this organization' }, { status: 400 });
                }
                targetLocationId = anyLoc.rows[0].id;
            }

            // Upsert inventory row — ON CONFLICT DO NOTHING avoids race condition on rapid taps
            await client.query(
                `INSERT INTO inventory (item_id, location_id, quantity, organization_id)
                 VALUES ($1, $2, 0, $3)
                 ON CONFLICT (item_id, location_id) DO NOTHING`,
                [itemId, targetLocationId, organizationId]
            );

            // Update quantity — do NOT filter by organization_id; UNIQUE(item_id, location_id)
            // guarantees there is exactly one row to update regardless of which org owns it
            const updateRes = await client.query(
                `UPDATE inventory
                 SET quantity = GREATEST(0, quantity + $1), organization_id = $4
                 WHERE item_id = $2 AND location_id = $3
                 RETURNING quantity`,
                [change, itemId, targetLocationId, organizationId]
            );

            if (!updateRes.rows[0]) {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: 'Failed to update inventory' }, { status: 500 });
            }
            const newQuantity = updateRes.rows[0].quantity;

            // Activity log
            const logRes = await client.query(
                `INSERT INTO activity_logs (organization_id, user_id, action, details)
                 VALUES ($1, $2, $3, $4) RETURNING id`,
                [organizationId, session.id, action, JSON.stringify({
                    itemId,
                    itemName: item.name,
                    change: Math.abs(change),
                    quantity: Math.abs(change),
                    quantityAfter: newQuantity,
                    locationId: targetLocationId,
                    bottleLevel
                })]
            );

            // Bottle level log (optional, non-fatal)
            if (bottleLevel && logRes.rows[0]) {
                try {
                    await client.query(
                        'INSERT INTO bottle_level_logs (activity_log_id, option_label, user_id) VALUES ($1, $2, $3)',
                        [logRes.rows[0].id, bottleLevel, session.id]
                    );
                } catch (e) {
                    console.warn('Could not insert bottle level log', e);
                }
            }

            await client.query('COMMIT');
            return NextResponse.json({ success: true });

        } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            throw err;
        } finally {
            client.release();
        }

    } catch (error: any) {
        console.error('Inventory Adjust Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Error' }, { status: 500 });
    }
}
