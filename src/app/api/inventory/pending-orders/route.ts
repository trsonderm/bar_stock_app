import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const orders = await db.query(`
            SELECT
                po.id,
                po.tracking_status,
                po.expected_delivery_date,
                po.created_at,
                s.name AS supplier_name,
                (SELECT COUNT(*) FROM purchase_order_items WHERE purchase_order_id = po.id) AS item_count
            FROM purchase_orders po
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            WHERE po.organization_id = $1
              AND po.archived_at IS NULL
              AND (po.tracking_status IN ('PENDING', 'IN_TRANSIT', 'PARTIALLY_RECEIVED')
                   OR (po.tracking_status IS NULL AND po.status = 'PENDING'))
            ORDER BY po.created_at DESC
        `, [session.organizationId]);

        return NextResponse.json({ orders: orders || [] });
    } catch (e) {
        console.error('Pending orders GET error:', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
