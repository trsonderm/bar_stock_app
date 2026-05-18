/**
 * GET /api/mobile/stock
 * Returns all inventory items with current quantities for the org.
 * The client is responsible for filtering low/out-of-stock display.
 *
 * Query params (all optional):
 *   ?location_id=2    Scope quantities to a specific location
 *   ?sort=name        "name" | "quantity" (default: name)
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';

export async function GET(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = req.nextUrl;
    const locationId = searchParams.get('location_id');
    const sort = searchParams.get('sort') || 'name';
    const orderBy = sort === 'quantity' ? 'quantity ASC, i.name ASC' : 'i.name ASC';

    try {
        let rows: any[];

        if (locationId) {
            rows = await db.query(
                `SELECT
                    i.id, i.name, i.type, i.secondary_type,
                    i.supplier, i.low_stock_threshold, i.order_size,
                    COALESCE(inv.quantity, 0) AS quantity
                 FROM items i
                 LEFT JOIN inventory inv ON inv.item_id = i.id AND inv.location_id = $2
                 WHERE i.organization_id = $1
                   AND i.archived_at IS NULL
                 ORDER BY ${orderBy}`,
                [session.organizationId, parseInt(locationId)]
            );
        } else {
            rows = await db.query(
                `SELECT
                    i.id, i.name, i.type, i.secondary_type,
                    i.supplier, i.low_stock_threshold, i.order_size,
                    COALESCE(SUM(inv.quantity), 0) AS quantity
                 FROM items i
                 LEFT JOIN inventory inv ON inv.item_id = i.id
                 WHERE i.organization_id = $1
                   AND i.archived_at IS NULL
                 GROUP BY i.id, i.name, i.type, i.secondary_type,
                          i.supplier, i.low_stock_threshold, i.order_size
                 ORDER BY ${orderBy}`,
                [session.organizationId]
            );
        }

        const items = rows.map((r: any) => ({
            ...r,
            quantity: Number(r.quantity),
            low_stock_threshold: r.low_stock_threshold != null ? Number(r.low_stock_threshold) : null,
        }));

        return NextResponse.json({
            items,
            total: items.length,
            out_of_stock: items.filter(i => i.quantity === 0).length,
            low_stock: items.filter(i =>
                i.quantity > 0 &&
                i.low_stock_threshold != null &&
                i.quantity <= i.low_stock_threshold
            ).length,
        });
    } catch (err) {
        console.error('[Mobile stock GET]', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
