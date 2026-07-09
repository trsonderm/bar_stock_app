import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function DELETE(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const itemId = parseInt(req.nextUrl.searchParams.get('itemId') || '');
    if (!itemId) return NextResponse.json({ error: 'Missing itemId' }, { status: 400 });

    try {
        // Remove the global product link so this item no longer receives update notifications
        await db.execute(
            'DELETE FROM item_global_links WHERE item_id = $1 AND organization_id = $2',
            [itemId, session.organizationId]
        );
        // Dismiss any pending notifications tied to this item
        await db.execute(
            `UPDATE global_product_notifications
             SET status = 'ignored', resolved_at = NOW()
             WHERE item_id = $1 AND organization_id = $2 AND status = 'pending'`,
            [itemId, session.organizationId]
        );
        return NextResponse.json({ ok: true });
    } catch {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const rows = await db.query(
            `SELECT gpn.id, gpn.global_product_id, gpn.item_id, gpn.changes,
                    gpn.notification_key, gpn.status, gpn.created_at,
                    gp.name AS global_product_name,
                    gp.category_name, gp.bottle_size_amount, gp.bottle_size_unit,
                    gp.order_size, gp.aliases, gp.is_alcohol,
                    i.name AS item_name
             FROM global_product_notifications gpn
             JOIN global_products gp ON gp.id = gpn.global_product_id
             LEFT JOIN items i ON i.id = gpn.item_id
             WHERE gpn.organization_id = $1
               AND gpn.status = 'pending'
             ORDER BY gpn.created_at DESC`,
            [session.organizationId]
        );
        return NextResponse.json({ notifications: rows });
    } catch {
        // Table doesn't exist yet
        return NextResponse.json({ notifications: [] });
    }
}
