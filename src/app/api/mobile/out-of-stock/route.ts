import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';

// GET /api/mobile/out-of-stock?location_id=1
// Returns items at or below their low_stock_threshold
export async function GET(req: NextRequest) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = req.nextUrl;
        const locationId = searchParams.get('location_id');

        let rows: any[];

        if (locationId) {
            rows = await db.query(
                `SELECT i.id, i.name, i.type, i.secondary_type,
                        COALESCE(inv.quantity, 0) AS quantity,
                        i.low_stock_threshold, i.order_size, i.supplier
                 FROM items i
                 LEFT JOIN inventory inv ON inv.item_id = i.id AND inv.location_id = $2
                 WHERE i.organization_id = $1
                   AND i.include_in_low_stock_alerts = TRUE
                   AND (
                     COALESCE(inv.quantity, 0) = 0
                     OR (i.low_stock_threshold IS NOT NULL AND COALESCE(inv.quantity, 0) <= i.low_stock_threshold)
                   )
                 ORDER BY COALESCE(inv.quantity, 0) ASC, i.name ASC`,
                [session.organizationId, parseInt(locationId)]
            );
        } else {
            rows = await db.query(
                `SELECT i.id, i.name, i.type, i.secondary_type,
                        COALESCE(SUM(inv.quantity), 0) AS quantity,
                        i.low_stock_threshold, i.order_size, i.supplier
                 FROM items i
                 LEFT JOIN inventory inv ON inv.item_id = i.id
                 WHERE i.organization_id = $1
                   AND i.include_in_low_stock_alerts = TRUE
                 GROUP BY i.id, i.name, i.type, i.secondary_type, i.low_stock_threshold, i.order_size, i.supplier
                 HAVING COALESCE(SUM(inv.quantity), 0) = 0
                     OR (i.low_stock_threshold IS NOT NULL AND COALESCE(SUM(inv.quantity), 0) <= i.low_stock_threshold)
                 ORDER BY COALESCE(SUM(inv.quantity), 0) ASC, i.name ASC`,
                [session.organizationId]
            );
        }

        return NextResponse.json({
            items: rows,
            total: rows.length,
            out_of_stock: rows.filter((r: any) => Number(r.quantity) === 0).length,
            low_stock: rows.filter((r: any) => Number(r.quantity) > 0).length,
        });
    } catch (err) {
        console.error('Mobile out-of-stock error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
