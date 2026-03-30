import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
         // Get all PENDING orders and fold their items into a JSON array
         const orders = await db.query(`
            SELECT 
                po.id,
                po.expected_delivery_date,
                po.details,
                s.name as supplier_name,
                (
                    SELECT json_agg(json_build_object(
                        'id', poi.id,
                        'item_id', poi.item_id,
                        'expected_qty', poi.quantity,
                        'name', i.name,
                        'type', i.type
                    ))
                    FROM purchase_order_items poi
                    JOIN items i ON i.id = poi.item_id
                    WHERE poi.purchase_order_id = po.id
                ) as items
            FROM purchase_orders po
            LEFT JOIN suppliers s ON s.id = po.supplier_id
            WHERE po.organization_id = $1 AND po.status = 'PENDING'
            ORDER BY po.created_at ASC
         `, [session.organizationId]);

         return NextResponse.json({ orders });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Failed to find orders' }, { status: 500 });
    }
}
