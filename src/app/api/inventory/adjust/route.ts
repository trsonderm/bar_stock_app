import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const organizationId = session.organizationId;
        const { itemId, change, locationId = 1, bottleLevel } = await req.json();

        if (!itemId || !change) return NextResponse.json({ error: 'Invalid data' }, { status: 400 });

        // Check permissions
        if (change > 0) {
            const canAddStock = session.role === 'admin' || session.permissions.includes('add_stock') || session.permissions.includes('all');
            if (!canAddStock) return NextResponse.json({ error: 'Permission denied: Add Stock' }, { status: 403 });
        }

        const action = change > 0 ? 'ADD_STOCK' : 'SUBTRACT_STOCK';

        // Begin Transaction
        await db.execute('BEGIN');

        try {
            // 0. Verify Item/Location ownership
            const item = await db.one('SELECT name FROM items WHERE id = $1 AND organization_id = $2', [itemId, organizationId]);
            if (!item) throw new Error('Item not found in this organization');

            // Determine Location Context
            // Priority: Payload > Cookie > Default
            let targetLocationId = locationId;

            // If payload is default "1" (legacy) or undefined, try cookie
            if (!targetLocationId || targetLocationId === 1) {
                const cookieLoc = req.cookies.get('current_location_id')?.value;
                if (cookieLoc) {
                    targetLocationId = parseInt(cookieLoc);
                }
            }

            const location = await db.one('SELECT id FROM locations WHERE id = $1 AND organization_id = $2', [targetLocationId, organizationId]);

            if (!location) {
                // Try fallback to any location
                const anyLoc = await db.one('SELECT id FROM locations WHERE organization_id = $1 LIMIT 1', [organizationId]);
                if (anyLoc) targetLocationId = anyLoc.id;
                else throw new Error('No location found for this organization');
            }

            // Update Inventory
            // First check if row exists
            const invExists = await db.one('SELECT id FROM inventory WHERE item_id = $1 AND location_id = $2', [itemId, targetLocationId]);

            if (!invExists) {
                await db.execute(
                    'INSERT INTO inventory (item_id, location_id, quantity, organization_id) VALUES ($1, $2, 0, $3)',
                    [itemId, targetLocationId, organizationId]
                );
            }

            // Perform Update
            // Postgres has RETURNING.
            const updateRes = await db.one(`
                UPDATE inventory 
                SET quantity = GREATEST(0, quantity + $1) 
                WHERE item_id = $2 AND location_id = $3 AND organization_id = $4
                RETURNING quantity
             `, [change, itemId, targetLocationId, organizationId]);

            if (!updateRes) {
                throw new Error('Failed to update inventory.');
            }

            const newQuantity = updateRes.quantity;

            // 3. Log
            const logRes = await db.one(`
                INSERT INTO activity_logs (organization_id, user_id, action, details) 
                VALUES ($1, $2, $3, $4) 
                RETURNING id
            `, [organizationId, session.id, action, JSON.stringify({
                itemId,
                itemName: item.name,
                change: Math.abs(change),
                quantity: Math.abs(change), // historic field naming
                quantityAfter: newQuantity,
                locationId: targetLocationId,
                bottleLevel
            })]);

            // 4. Bottle Level Log (if provided)
            if (bottleLevel) {
                try {
                    await db.execute(
                        'INSERT INTO bottle_level_logs (activity_log_id, option_label, user_id) VALUES ($1, $2, $3)',
                        [logRes.id, bottleLevel, session.id]
                    );
                } catch (e) {
                    console.warn('Could not insert bottle level log', e);
                }
            }

            await db.execute('COMMIT');
            return NextResponse.json({ success: true });

        } catch (err) {
            await db.execute('ROLLBACK');
            throw err;
        }

    } catch (error: any) {
        console.error('Inventory Adjust Error', error);
        return NextResponse.json({ error: error.message || 'Internal Error' }, { status: 500 });
    }
}
