/**
 * GET /api/v1/inventory
 * List all inventory items with current stock quantities.
 *
 * Query params:
 *   location_id  integer  Filter to a specific location
 *   category     string   Filter by category/type
 *   low_stock    boolean  If true, return only items at or below threshold
 *   limit        integer  Page size (default 100, max 500)
 *   offset       integer  Page offset (default 0)
 *   sort         string   "name" | "quantity" | "type" (default "name")
 */
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getApiSession, hasScope } from '@/lib/api-auth';
import { apiList, Err } from '@/lib/api-response';

export async function GET(req: NextRequest) {
    const session = await getApiSession(req);
    if (!session) return Err.unauthorized();
    if (!hasScope(session, 'inventory:read')) return Err.forbidden('inventory:read');

    const { searchParams } = new URL(req.url);
    const locationId = searchParams.get('location_id') ? parseInt(searchParams.get('location_id')!) : null;
    const category = searchParams.get('category') || null;
    const lowStockOnly = searchParams.get('low_stock') === 'true';
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);
    const offset = parseInt(searchParams.get('offset') || '0');
    const sort = searchParams.get('sort') || 'name';

    const sortCol = sort === 'quantity' ? 'quantity' : sort === 'type' ? 'i.type' : 'i.name';

    const invJoin = locationId
        ? `LEFT JOIN inventory inv ON i.id = inv.item_id AND inv.location_id = $2`
        : `LEFT JOIN inventory inv ON i.id = inv.item_id`;

    const params: any[] = [session.organizationId];
    if (locationId) params.push(locationId);

    let where = `WHERE i.organization_id = $1`;
    if (category) {
        params.push(category);
        where += ` AND i.type = $${params.length}`;
    }

    const rows = await db.query(`
        SELECT
            i.id,
            i.name,
            i.type        AS category,
            i.secondary_type AS sub_category,
            i.supplier,
            i.unit_cost,
            i.sale_price,
            i.order_size,
            i.low_stock_threshold,
            COALESCE(SUM(inv.quantity), 0) AS quantity
        FROM items i
        ${invJoin}
        ${where}
        GROUP BY i.id
        ${lowStockOnly ? 'HAVING COALESCE(SUM(inv.quantity), 0) <= COALESCE(i.low_stock_threshold, 5)' : ''}
        ORDER BY ${sortCol} ASC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]);

    const totalRows = await db.one(`
        SELECT COUNT(*) AS total FROM items i ${where}
    `, params);

    return apiList(
        rows.map(r => ({
            id: r.id,
            name: r.name,
            category: r.category,
            sub_category: r.sub_category,
            supplier: r.supplier,
            unit_cost: r.unit_cost ? Number(r.unit_cost) : null,
            sale_price: r.sale_price ? Number(r.sale_price) : null,
            order_size: r.order_size,
            low_stock_threshold: r.low_stock_threshold,
            quantity: Number(r.quantity),
        })),
        { total: Number(totalRows?.total ?? 0), limit, offset },
    );
}
