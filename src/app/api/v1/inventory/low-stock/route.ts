/**
 * GET /api/v1/inventory/low-stock
 * Return items currently at or below their low-stock threshold.
 *
 * Query params:
 *   location_id  integer  Scope to a specific location
 *   limit        integer  Page size (default 100, max 500)
 *   offset       integer  Page offset (default 0)
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
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);
    const offset = parseInt(searchParams.get('offset') || '0');

    const params: any[] = [session.organizationId];
    const invJoin = locationId
        ? `LEFT JOIN inventory inv ON i.id = inv.item_id AND inv.location_id = $2`
        : `LEFT JOIN inventory inv ON i.id = inv.item_id`;
    if (locationId) params.push(locationId);

    const rows = await db.query(`
        SELECT
            i.id, i.name, i.type AS category, i.supplier,
            i.low_stock_threshold,
            COALESCE(SUM(inv.quantity), 0) AS quantity
        FROM items i
        ${invJoin}
        WHERE i.organization_id = $1
          AND COALESCE(i.include_in_low_stock_alerts, true) = true
        GROUP BY i.id
        HAVING COALESCE(SUM(inv.quantity), 0) <= COALESCE(i.low_stock_threshold, 5)
        ORDER BY quantity ASC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]);

    const total = await db.one(`
        SELECT COUNT(*) AS total FROM (
            SELECT i.id
            FROM items i
            ${invJoin}
            WHERE i.organization_id = $1
              AND COALESCE(i.include_in_low_stock_alerts, true) = true
            GROUP BY i.id, i.low_stock_threshold
            HAVING COALESCE(SUM(inv.quantity), 0) <= COALESCE(i.low_stock_threshold, 5)
        ) sub
    `, params);

    return apiList(
        rows.map(r => ({
            id: r.id,
            name: r.name,
            category: r.category,
            supplier: r.supplier,
            quantity: Number(r.quantity),
            low_stock_threshold: r.low_stock_threshold,
            deficit: Math.max(0, (r.low_stock_threshold ?? 5) - Number(r.quantity)),
        })),
        { total: Number(total?.total ?? 0), limit, offset },
    );
}
