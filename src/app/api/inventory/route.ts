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

    } catch (error) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Permission: Admin or add_item_name (treating cost editing same as item editing)
        const canEdit = session.role === 'admin' || session.permissions.includes('add_item_name') || session.permissions.includes('all');
        if (!canEdit) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });

        const { id, unit_cost } = await req.json();

        if (!id || unit_cost === undefined) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

        db.prepare('UPDATE items SET unit_cost = ? WHERE id = ?').run(unit_cost, id);

        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
