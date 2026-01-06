import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(req.url);
        const sort = searchParams.get('sort') || 'usage'; // usage or name

        // Todo: Logic for "Most Used"
        // "Most Used" can be calculated from activity_logs (count of subtract actions in last 30 days)
        // or we can store a 'usage_rank' in items table updated by cron.
        // For now, let's just do a simple LEFT JOIN on activity logs or just return current stock and handle sort on client or simple sort here.
        // Realtime calculation might be expensive if logs are huge.
        // Let's count usage from logs for now.

        let query = `
      SELECT 
        i.id, i.name, i.type, i.unit_cost,
        COALESCE(inv.quantity, 0) as quantity,
        COALESCE(usage_stats.usage_count, 0) as usage_count
      FROM items i
      LEFT JOIN inventory inv ON i.id = inv.item_id
      LEFT JOIN (
        SELECT 
            json_extract(details, '$.itemId') as item_id, 
            COUNT(*) as usage_count 
        FROM activity_logs 
        WHERE action = 'SUBTRACT_STOCK'
        GROUP BY json_extract(details, '$.itemId')
      ) usage_stats ON i.id = usage_stats.item_id
    `;

        // Note: SQLite JSON extraction might vary by version, check support. 
        // details in logs: { itemId: 1, quantity: 1, locationId: ... }

        // If usage sort is requested
        if (sort === 'usage') {
            query += ` ORDER BY usage_count DESC, i.name ASC`;
        } else {
            query += ` ORDER BY i.name ASC`;
        }

        const items = db.prepare(query).all();
        return NextResponse.json({ items });

    } catch (error) {
        console.error('Inventory GET error', error);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Check permission to ADD ITEM (definition)
        // "another user permission can be to add a liquor name"
        // We check session.permissions
        const canAddName = session.role === 'admin' || session.permissions.includes('add_item_name') || session.permissions.includes('all');

        if (!canAddName) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const body = await req.json();
        const { name, type } = body;

        if (!name || !type) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

        // Check for duplicate
        const existing = db.prepare('SELECT id FROM items WHERE name = ?').get(name);
        if (existing) {
            return NextResponse.json({ error: 'Item already exists' }, { status: 400 });
        }

        const validCat = db.prepare('SELECT name FROM categories WHERE name = ?').get(type);
        if (!validCat) {
            return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
        }

        const stmt = db.prepare('INSERT INTO items (name, type) VALUES (?, ?)');
        const res = stmt.run(name, type);

        // Also init inventory for default location (1)
        db.prepare('INSERT INTO inventory (item_id, location_id, quantity) VALUES (?, ?, 0)').run(res.lastInsertRowid, 1);

        // Activity Log
        db.prepare('INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)')
            .run(session.id, 'CREATE_ITEM', JSON.stringify({ name, type, itemId: res.lastInsertRowid }));

        return NextResponse.json({ success: true, id: res.lastInsertRowid });

    } catch (error: any) {
        console.error('Create Item Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Error' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Permission check
        const canEdit = session.role === 'admin' || session.permissions.includes('add_item_name') || session.permissions.includes('all');
        const canStock = session.role === 'admin' || session.permissions.includes('add_stock') || session.permissions.includes('all');

        if (!canEdit && !canStock) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });

        const { id, unit_cost, name, type, quantity } = await req.json();

        if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

        // Update Item Details (Name, Type, Cost)
        if (canEdit) {
            const updates = [];
            const params = [];

            if (unit_cost !== undefined) {
                updates.push('unit_cost = ?');
                params.push(unit_cost);
            }
            if (name !== undefined) {
                updates.push('name = ?');
                params.push(name);
            }
            if (type !== undefined) {
                updates.push('type = ?');
                params.push(type);
            }

            if (updates.length > 0) {
                params.push(id);
                db.prepare(`UPDATE items SET ${updates.join(', ')} WHERE id = ?`).run(...params);
            }
        }

        // update Quantity (Set Stock)
        if (quantity !== undefined && canStock) {
            // Get current quantity to calc difference for logs
            const current = db.prepare('SELECT quantity FROM inventory WHERE item_id = ? AND location_id = 1').get(id) as { quantity: number };
            const oldQty = current ? current.quantity : 0;
            const diff = quantity - oldQty;

            if (diff !== 0) {
                db.prepare('UPDATE inventory SET quantity = ? WHERE item_id = ? AND location_id = 1').run(quantity, id);

                const action = diff > 0 ? 'ADD_STOCK' : 'SUBTRACT_STOCK';
                // Log the set action
                db.prepare('INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)')
                    .run(session.id, action, JSON.stringify({
                        itemId: id,
                        quantity: Math.abs(diff),
                        method: 'SET_ADMIN',
                        oldQty,
                        newQty: quantity
                    }));
            }
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Only Admin can delete items
        if (session.role !== 'admin') {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

        const info = db.prepare('DELETE FROM items WHERE id = ?').run(id);

        if (info.changes === 0) {
            return NextResponse.json({ error: 'Item not found' }, { status: 404 });
        }

        // Log it
        db.prepare('INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)')
            .run(session.id, 'DELETE_ITEM', JSON.stringify({ itemId: id }));

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('Delete error', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
