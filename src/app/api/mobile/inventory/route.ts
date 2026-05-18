/**
 * GET /api/mobile/inventory
 * Returns all inventory items with quantities and per-item low-stock threshold data.
 * Also returns the org-level global low_stock_threshold as a fallback.
 *
 * Query params (all optional):
 *   ?location_id=2    Scope quantities to a specific location
 *   ?q=vodka          Filter by name or type (case-insensitive)
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';

export async function GET(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = req.nextUrl;
    const locationId = searchParams.get('location_id');
    const q = searchParams.get('q') || '';

    try {
        // Fetch org-level global low stock threshold from settings table
        const settingRows = await db.query(
            `SELECT value FROM settings WHERE organization_id = $1 AND key = 'low_stock_threshold' LIMIT 1`,
            [session.organizationId]
        );
        const globalThreshold = settingRows.length > 0 && settingRows[0].value
            ? Number(settingRows[0].value)
            : null;

        let rows: any[];
        const searchFilter = q ? `AND (i.name ILIKE $2 OR i.type ILIKE $2)` : '';
        const searchParam = q ? `%${q}%` : null;

        if (locationId) {
            const params: any[] = [session.organizationId, parseInt(locationId)];
            if (q) params.push(`%${q}%`);
            rows = await db.query(
                `SELECT
                    i.id, i.name, i.type, i.secondary_type,
                    i.supplier, i.order_size,
                    i.low_stock_threshold,
                    i.low_stock_threshold_type,
                    i.low_stock_threshold_factor,
                    COALESCE(inv.quantity, 0) AS quantity
                 FROM items i
                 LEFT JOIN inventory inv ON inv.item_id = i.id AND inv.location_id = $2
                 WHERE i.organization_id = $1
                   AND i.archived_at IS NULL
                   ${q ? `AND (i.name ILIKE $3 OR i.type ILIKE $3)` : ''}
                 ORDER BY i.name ASC`,
                params
            );
        } else {
            const params: any[] = [session.organizationId];
            if (q) params.push(`%${q}%`);
            rows = await db.query(
                `SELECT
                    i.id, i.name, i.type, i.secondary_type,
                    i.supplier, i.order_size,
                    i.low_stock_threshold,
                    i.low_stock_threshold_type,
                    i.low_stock_threshold_factor,
                    COALESCE(SUM(inv.quantity), 0) AS quantity
                 FROM items i
                 LEFT JOIN inventory inv ON inv.item_id = i.id
                 WHERE i.organization_id = $1
                   AND i.archived_at IS NULL
                   ${q ? `AND (i.name ILIKE $2 OR i.type ILIKE $2)` : ''}
                 GROUP BY i.id, i.name, i.type, i.secondary_type,
                          i.supplier, i.order_size,
                          i.low_stock_threshold, i.low_stock_threshold_type, i.low_stock_threshold_factor
                 ORDER BY i.name ASC`,
                params
            );
        }

        const items = rows.map((r: any) => {
            const quantity = Number(r.quantity);
            const itemThreshold = r.low_stock_threshold != null ? Number(r.low_stock_threshold) : null;
            // Effective threshold: per-item if set, otherwise fall back to org global
            const effectiveThreshold = itemThreshold ?? globalThreshold;
            const isLowStock = quantity > 0 && effectiveThreshold != null && quantity <= effectiveThreshold;

            return {
                id: r.id,
                name: r.name,
                type: r.type,
                secondary_type: r.secondary_type,
                supplier: r.supplier,
                order_size: r.order_size,
                quantity,
                low_stock_threshold: itemThreshold,
                low_stock_threshold_type: r.low_stock_threshold_type || null,
                low_stock_threshold_factor: r.low_stock_threshold_factor != null ? Number(r.low_stock_threshold_factor) : null,
                effective_low_stock_threshold: effectiveThreshold,
                is_low_stock: isLowStock,
                is_out_of_stock: quantity === 0,
            };
        });

        return NextResponse.json({
            items,
            total: items.length,
            out_of_stock: items.filter(i => i.is_out_of_stock).length,
            low_stock: items.filter(i => i.is_low_stock).length,
            global_low_stock_threshold: globalThreshold,
        });
    } catch (err) {
        console.error('[Mobile inventory GET]', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
