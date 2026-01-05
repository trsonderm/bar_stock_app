import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { itemId, change, locationId = 1 } = await req.json(); // Default location 1

        if (!itemId || !change) return NextResponse.json({ error: 'Invalid data' }, { status: 400 });

        // Check permissions
        // "add icon button... will require a user permission"
        // "subtract icon button available to all user"

        if (change > 0) {
            const canAddStock = session.role === 'admin' || session.permissions.includes('add_stock') || session.permissions.includes('all');
            if (!canAddStock) return NextResponse.json({ error: 'Permission denied: Add Stock' }, { status: 403 });
        }
        // Subtract is available to all (session exists)

        const action = change > 0 ? 'ADD_STOCK' : 'SUBTRACT_STOCK';
        const cleanChange = Math.abs(change);

        const transaction = db.transaction(() => {
            // Update Inventory
            // Update Inventory
            // Check if row exists
            const invExists = db.prepare('SELECT * FROM inventory WHERE item_id = ? AND location_id = ?').get(itemId, locationId);
            if (!invExists) {
                db.prepare('INSERT INTO inventory (item_id, location_id, quantity) VALUES (?, ?, ?)').run(itemId, locationId, 0);
            }
            // 1. Update stock
            // We need to know current stock first to clamp properly if needed, but the simple UPDATE MAX(0,...) works for values.
            // But we need the RESULTING quantity.
            // First, ensure the inventory row exists for the item and location
            const exists = db.prepare('SELECT * FROM inventory WHERE item_id = ? AND location_id = ?').get(itemId, locationId);
            if (!exists) {
                db.prepare('INSERT INTO inventory (item_id, location_id, quantity) VALUES (?, ?, ?)').run(itemId, locationId, 0);
            }

            const update = db.prepare(`
                UPDATE inventory 
                SET quantity = MAX(0, quantity + ?) 
                WHERE item_id = ? AND location_id = ?
                RETURNING quantity
             `).get(change, itemId, locationId) as any;

            if (!update) {
                // This case should ideally not be hit if the INSERT above works, or if the item always exists.
                // If it does, it means the item_id/location_id combination didn't exist and wasn't created.
                throw new Error('Failed to update inventory: Item not found or could not be created in inventory for this location.');
            }

            const newQuantity = update.quantity;

            // 2. Fetch Item Name for Log
            const item = db.prepare('SELECT name FROM items WHERE id = ?').get(itemId) as any;

            // 3. Log
            const action = change > 0 ? 'ADD_STOCK' : 'SUBTRACT_STOCK';
            db.prepare('INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)')
                .run(session.id, action, JSON.stringify({
                    itemId,
                    itemName: item.name,
                    change: Math.abs(change),
                    quantity: Math.abs(change), // Keeping 'quantity' for backward compat in some views
                    quantityAfter: newQuantity,
                    locationId
                }));
        });

        transaction();

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Inventory Adjust Error', error);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
