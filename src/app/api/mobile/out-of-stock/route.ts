import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';

// GET /api/mobile/out-of-stock?location_id=1
// Returns items at or below their low_stock_threshold (or qty=0 if no threshold set)
export async function GET(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = req.nextUrl;
    const locationId = searchParams.get('location_id');

    let query: string;
    let params: any[];

    if (locationId) {
        query = `
            SELECT i.id, i.name, i.type, i.secondary_type,
                   COALESCE(il.quantity, i.quantity) AS quantity,
                   i.low_stock_threshold, i.order_size, i.supplier
            FROM inventory i
            LEFT JOIN inventory_locations il ON il.inventory_id = i.id AND il.location_id = $2
            WHERE i.organization_id = $1
              AND i.include_in_low_stock_alerts = TRUE
              AND (
                COALESCE(il.quantity, i.quantity) = 0
                OR (i.low_stock_threshold IS NOT NULL AND COALESCE(il.quantity, i.quantity) <= i.low_stock_threshold)
              )
            ORDER BY COALESCE(il.quantity, i.quantity) ASC, i.name ASC`;
        params = [session.organizationId, parseInt(locationId)];
    } else {
        query = `
            SELECT id, name, type, secondary_type, quantity, low_stock_threshold, order_size, supplier
            FROM inventory
            WHERE organization_id = $1
              AND include_in_low_stock_alerts = TRUE
              AND (
                quantity = 0
                OR (low_stock_threshold IS NOT NULL AND quantity <= low_stock_threshold)
              )
            ORDER BY quantity ASC, name ASC`;
        params = [session.organizationId];
    }

    const rows = await db.query(query, params);
    return NextResponse.json({
        items: rows,
        total: rows.length,
        out_of_stock: rows.filter((r: any) => Number(r.quantity) === 0).length,
        low_stock: rows.filter((r: any) => Number(r.quantity) > 0).length,
    });
}
