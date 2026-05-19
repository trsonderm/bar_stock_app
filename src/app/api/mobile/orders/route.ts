/**
 * GET /api/mobile/orders
 * Lists purchase orders for the org — filtered to actionable statuses by default.
 *
 * Query params (all optional):
 *   ?status=PENDING         Filter by status. Default: PENDING,IN_TRANSIT,PARTIALLY_RECEIVED
 *   ?location_id=2          Filter to a specific location
 *   ?limit=50               Page size (default 50, max 100)
 *   ?offset=0               Pagination offset
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';

const VALID_STATUSES = ['PENDING', 'IN_TRANSIT', 'PARTIALLY_RECEIVED', 'DELIVERED', 'CANCELLED'];
const DEFAULT_STATUSES = ['PENDING', 'IN_TRANSIT', 'PARTIALLY_RECEIVED'];

export async function GET(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = req.nextUrl;
    const statusParam = searchParams.get('status');
    const locationId = searchParams.get('location_id');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    // Parse requested statuses
    let statuses: string[];
    if (statusParam === 'all') {
        statuses = VALID_STATUSES;
    } else if (statusParam) {
        statuses = statusParam.toUpperCase().split(',').filter(s => VALID_STATUSES.includes(s));
        if (statuses.length === 0) statuses = DEFAULT_STATUSES;
    } else {
        statuses = DEFAULT_STATUSES;
    }

    try {
        const params: any[] = [session.organizationId, statuses];
        let extraWhere = '';
        if (locationId) {
            params.push(parseInt(locationId));
            extraWhere = ` AND o.location_id = $${params.length}`;
        }

        const rows = await db.query(
            `SELECT o.id, o.status, o.location_id, l.name AS location_name,
                    o.expected_delivery, o.notes, o.created_at, o.updated_at,
                    COUNT(oi.id)::int AS item_count,
                    COALESCE(SUM(oi.quantity), 0)::int AS total_units,
                    COALESCE(SUM(oi.quantity_received), 0)::int AS units_received
             FROM orders o
             LEFT JOIN locations l ON o.location_id = l.id
             LEFT JOIN order_items oi ON oi.order_id = o.id
             WHERE o.organization_id = $1
               AND o.status = ANY($2::text[])
               ${extraWhere}
             GROUP BY o.id, l.name
             ORDER BY
               CASE o.status
                 WHEN 'IN_TRANSIT' THEN 1
                 WHEN 'PARTIALLY_RECEIVED' THEN 2
                 WHEN 'PENDING' THEN 3
                 ELSE 4
               END,
               o.expected_delivery ASC NULLS LAST,
               o.created_at DESC
             LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
            [...params, limit, offset]
        );

        const countRow = await db.one(
            `SELECT COUNT(*)::int AS total FROM orders o
             WHERE o.organization_id = $1 AND o.status = ANY($2::text[])${extraWhere}`,
            params
        );

        return NextResponse.json({
            orders: rows.map(r => ({
                id: r.id,
                status: r.status,
                location_id: r.location_id,
                location_name: r.location_name,
                expected_delivery: r.expected_delivery,
                notes: r.notes,
                item_count: r.item_count,
                total_units: r.total_units,
                units_received: r.units_received,
                created_at: r.created_at,
                updated_at: r.updated_at,
            })),
            total: countRow?.total ?? 0,
            limit,
            offset,
        });
    } catch (err) {
        console.error('[Mobile orders GET]', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
