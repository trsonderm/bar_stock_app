/**
 * GET  /api/v1/inventory  — list all inventory items with current stock quantities
 * POST /api/v1/inventory  — create a new inventory item
 *
 * GET query params:
 *   location_id  integer  Filter to a specific location
 *   category     string   Filter by category/type
 *   low_stock    boolean  If true, return only items at or below threshold
 *   limit        integer  Page size (default 100, max 500)
 *   offset       integer  Page offset (default 0)
 *   sort         string   "name" | "quantity" | "type" (default "name")
 *
 * POST body:
 *   name                  string   required
 *   category              string   optional  e.g. "Spirits"
 *   sub_category          string   optional  e.g. "Vodka"
 *   supplier              string   optional
 *   unit_cost             number   optional
 *   sale_price            number   optional
 *   order_size            number   optional
 *   low_stock_threshold   number   optional  (default: 5)
 *   initial_quantity      number   optional  Stock quantity to set at first location (default: 0)
 *   location_id           integer  optional  Location for initial_quantity (default: org's first)
 */
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getApiSession, hasScope } from '@/lib/api-auth';
import { apiList, apiOk, Err } from '@/lib/api-response';

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

export async function POST(req: NextRequest) {
    const session = await getApiSession(req);
    if (!session) return Err.unauthorized();
    if (!hasScope(session, 'inventory:write')) return Err.forbidden('inventory:write');

    const body = await req.json();
    const { name, category, sub_category, supplier, unit_cost, sale_price, order_size, low_stock_threshold, initial_quantity, location_id } = body;

    if (!name || !name.trim()) return Err.badRequest('name is required');

    const existing = await db.one(
        `SELECT id FROM items WHERE organization_id = $1 AND LOWER(name) = LOWER($2)`,
        [session.organizationId, name.trim()]
    );
    if (existing) return Err.badRequest('An item with that name already exists');

    const item = await db.one(
        `INSERT INTO items (organization_id, name, type, secondary_type, supplier, unit_cost, sale_price, order_size, low_stock_threshold)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [session.organizationId, name.trim(), category || null, sub_category || null, supplier || null,
         unit_cost || null, sale_price || null, order_size || null, low_stock_threshold ?? 5]
    );

    if (initial_quantity && initial_quantity > 0) {
        let targetLocationId: number | null = location_id ? parseInt(location_id) : null;
        if (!targetLocationId) {
            const first = await db.one(`SELECT id FROM locations WHERE organization_id = $1 ORDER BY id ASC LIMIT 1`, [session.organizationId]);
            if (first) targetLocationId = first.id;
        }
        if (targetLocationId) {
            await db.execute(
                `INSERT INTO inventory (item_id, location_id, quantity, organization_id) VALUES ($1,$2,$3,$4)
                 ON CONFLICT (item_id, location_id) DO UPDATE SET quantity = $3`,
                [item.id, targetLocationId, initial_quantity, session.organizationId]
            );
        }
    }

    return apiOk({ id: item.id, created: true }, {}, 201);
}
