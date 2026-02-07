import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.organizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const items = await db.query(`
            SELECT i.id, i.name, c.name as category, i.low_stock_threshold as min,
                   COALESCE(SUM(inv.quantity), 0) as current, 'units' as unit
            FROM items i
            LEFT JOIN categories c ON i.type = c.id::text OR i.type = c.name -- Attempt to join, schema might vary for cats
            LEFT JOIN inventory inv ON i.id = inv.item_id
            WHERE i.organization_id = $1
            GROUP BY i.id, i.name, c.name, i.low_stock_threshold
            HAVING COALESCE(SUM(inv.quantity), 0) <= COALESCE(i.low_stock_threshold, 0)
            ORDER BY current ASC
        `, [session.organizationId]);

        return NextResponse.json({ items });
    } catch (e: any) {
        console.error('Low Stock API Error:', e);
        return NextResponse.json({ error: 'Server Error: ' + e.message }, { status: 500 });
    }
}
