/**
 * GET /api/mobile/stock
 * Returns all inventory items with current quantities for the org.
 * Respects the org's shared_inventory_count setting the same way the admin web does:
 *   - shared_inventory_count=true  → sum quantities across all locations
 *   - shared_inventory_count=false → scope to the provided location_id, or fall back to
 *                                    the user's first assigned location
 *
 * Query params (all optional):
 *   ?location_id=2    Explicit location scope
 *   ?sort=name        "name" | "quantity" (default: name)
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';

export async function GET(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = req.nextUrl;
    const sort = searchParams.get('sort') || 'name';
    const orderBy = sort === 'quantity' ? 'quantity ASC, i.name ASC' : 'i.name ASC';

    try {
        // Read org-level settings
        let sharedInventoryCount = false;
        let showItemsAtAllLocations = true;
        let globalLowStockThreshold: number | null = null;
        try {
            const orgRow = await db.one('SELECT settings FROM organizations WHERE id = $1', [session.organizationId]);
            if (orgRow?.settings?.shared_inventory_count === true) sharedInventoryCount = true;
            if (orgRow?.settings?.show_items_at_all_locations === false) showItemsAtAllLocations = false;
        } catch { }

        try {
            const settingRow = await db.query(
                `SELECT value FROM settings WHERE organization_id = $1 AND key = 'low_stock_threshold' LIMIT 1`,
                [session.organizationId]
            );
            if (settingRow.length > 0 && settingRow[0].value) globalLowStockThreshold = Number(settingRow[0].value);
        } catch { }

        // Determine location scope
        let locationId: number | null = searchParams.get('location_id') ? parseInt(searchParams.get('location_id')!) : null;

        if (!sharedInventoryCount && !locationId) {
            // Default to the user's first assigned location
            const locRow = await db.query(
                `SELECT location_id FROM user_locations WHERE user_id = $1 AND organization_id = $2 ORDER BY location_id ASC LIMIT 1`,
                [session.id, session.organizationId]
            );
            if (locRow.length > 0) {
                locationId = locRow[0].location_id;
            } else {
                // Fall back to org's first location
                const firstLoc = await db.one(
                    'SELECT id FROM locations WHERE organization_id = $1 ORDER BY id ASC LIMIT 1',
                    [session.organizationId]
                );
                if (firstLoc) locationId = firstLoc.id;
            }
        }

        let rows: any[];
        let locationName: string | null = null;

        if (sharedInventoryCount) {
            // Sum across all locations
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
        } else {
            if (locationId) {
                try {
                    const locRow = await db.one(
                        'SELECT name FROM locations WHERE id = $1 AND organization_id = $2',
                        [locationId, session.organizationId]
                    );
                    if (locRow) locationName = locRow.name;
                } catch { }
            }

            // show_items_at_all_locations=false: INNER JOIN hides items with no inventory here
            const joinType = showItemsAtAllLocations ? 'LEFT JOIN' : 'JOIN';
            rows = await db.query(
                `SELECT
                    i.id, i.name, i.type, i.secondary_type,
                    i.supplier, i.low_stock_threshold, i.order_size,
                    COALESCE(inv.quantity, 0) AS quantity
                 FROM items i
                 ${joinType} inventory inv ON inv.item_id = i.id AND inv.location_id = $2
                 WHERE i.organization_id = $1
                   AND i.archived_at IS NULL
                 ORDER BY ${orderBy}`,
                [session.organizationId, locationId]
            );
        }

        const items = rows.map((r: any) => {
            const quantity = Number(r.quantity);
            const itemThreshold = r.low_stock_threshold != null ? Number(r.low_stock_threshold) : null;
            const effectiveThreshold = itemThreshold ?? globalLowStockThreshold;
            return {
                ...r,
                quantity,
                low_stock_threshold: itemThreshold,
            };
        });

        return NextResponse.json({
            items,
            total: items.length,
            location_id: locationId,
            location_name: locationName,
            shared_inventory: sharedInventoryCount,
            out_of_stock: items.filter(i => i.quantity === 0).length,
            low_stock: items.filter(i => {
                const threshold = i.low_stock_threshold ?? globalLowStockThreshold;
                return i.quantity > 0 && threshold != null && i.quantity <= threshold;
            }).length,
        });
    } catch (err) {
        console.error('[Mobile stock GET]', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
