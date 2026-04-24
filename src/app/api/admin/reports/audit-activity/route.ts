import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const orgId = session.organizationId;

    const { searchParams } = req.nextUrl;
    const view = searchParams.get('view') || 'log'; // log | by_date | by_employee | order_checkins
    const start = searchParams.get('start') || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const end = searchParams.get('end') || new Date().toISOString().split('T')[0];
    const action = searchParams.get('action') || 'both'; // add | subtract | both
    const groupBy = searchParams.get('groupBy') || 'date'; // date | user (for order_checkins)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = 100;
    const offset = (page - 1) * limit;

    const startTs = `${start}T00:00:00`;
    const endTs = `${end}T23:59:59`;

    let actionFilter = `al.action IN ('ADD_STOCK', 'SUBTRACT_STOCK')`;
    if (action === 'add') actionFilter = `al.action = 'ADD_STOCK'`;
    else if (action === 'subtract') actionFilter = `al.action = 'SUBTRACT_STOCK'`;

    try {
        if (view === 'log') {
            const [rows, countRow] = await Promise.all([
                db.query(`
                    SELECT
                        al.id,
                        al.timestamp,
                        al.action,
                        u.first_name || ' ' || u.last_name AS user_name,
                        al.details->>'itemName' AS item_name,
                        (al.details->>'quantity')::numeric AS quantity,
                        (al.details->>'quantityAfter')::numeric AS quantity_after,
                        al.details->>'locationId' AS location_id,
                        l.name AS location_name,
                        al.details->>'bottleLevel' AS bottle_level
                    FROM activity_logs al
                    LEFT JOIN users u ON al.user_id = u.id
                    LEFT JOIN locations l ON (al.details->>'locationId')::int = l.id
                    WHERE al.organization_id = $1
                      AND ${actionFilter}
                      AND al.timestamp >= $2
                      AND al.timestamp <= $3
                    ORDER BY al.timestamp DESC
                    LIMIT $4 OFFSET $5
                `, [orgId, startTs, endTs, limit, offset]),
                db.one(`
                    SELECT COUNT(*) AS total
                    FROM activity_logs al
                    WHERE al.organization_id = $1
                      AND ${actionFilter}
                      AND al.timestamp >= $2
                      AND al.timestamp <= $3
                `, [orgId, startTs, endTs]),
            ]);
            return NextResponse.json({ view, rows, total: parseInt(countRow?.total || '0'), page, limit });
        }

        if (view === 'by_date') {
            const rows = await db.query(`
                SELECT
                    DATE_TRUNC('day', al.timestamp) AS date,
                    al.action,
                    COUNT(*) AS transactions,
                    SUM((al.details->>'quantity')::numeric) AS total_qty
                FROM activity_logs al
                WHERE al.organization_id = $1
                  AND ${actionFilter}
                  AND al.timestamp >= $2
                  AND al.timestamp <= $3
                GROUP BY DATE_TRUNC('day', al.timestamp), al.action
                ORDER BY DATE_TRUNC('day', al.timestamp) ASC
            `, [orgId, startTs, endTs]);
            return NextResponse.json({ view, rows });
        }

        if (view === 'by_employee') {
            const rows = await db.query(`
                SELECT
                    u.first_name || ' ' || u.last_name AS user_name,
                    al.action,
                    COUNT(*) AS transactions,
                    SUM((al.details->>'quantity')::numeric) AS total_qty,
                    COUNT(DISTINCT al.details->>'itemName') AS unique_items,
                    MIN(al.timestamp) AS first_at,
                    MAX(al.timestamp) AS last_at
                FROM activity_logs al
                LEFT JOIN users u ON al.user_id = u.id
                WHERE al.organization_id = $1
                  AND ${actionFilter}
                  AND al.timestamp >= $2
                  AND al.timestamp <= $3
                GROUP BY u.id, u.first_name, u.last_name, al.action
                ORDER BY total_qty DESC
            `, [orgId, startTs, endTs]);
            return NextResponse.json({ view, rows });
        }

        if (view === 'order_checkins') {
            if (groupBy === 'user') {
                const rows = await db.query(`
                    SELECT
                        u.first_name || ' ' || u.last_name AS user_name,
                        COUNT(*) AS checkin_count,
                        COUNT(DISTINCT (al.details->>'orderId')::int) AS unique_orders,
                        SUM((al.details->>'quantity')::numeric) AS total_qty_received,
                        MIN(al.timestamp) AS first_at,
                        MAX(al.timestamp) AS last_at
                    FROM activity_logs al
                    LEFT JOIN users u ON al.user_id = u.id
                    WHERE al.organization_id = $1
                      AND al.action = 'ADD_STOCK'
                      AND al.details->>'method' = 'ORDER_RECEIVE'
                      AND al.timestamp >= $2
                      AND al.timestamp <= $3
                    GROUP BY u.id, u.first_name, u.last_name
                    ORDER BY checkin_count DESC
                `, [orgId, startTs, endTs]);
                return NextResponse.json({ view, groupBy, rows });
            } else {
                const rows = await db.query(`
                    SELECT
                        DATE_TRUNC('day', al.timestamp) AS date,
                        COUNT(*) AS checkin_count,
                        COUNT(DISTINCT (al.details->>'orderId')::int) AS unique_orders,
                        SUM((al.details->>'quantity')::numeric) AS total_qty_received,
                        COUNT(DISTINCT al.user_id) AS unique_users
                    FROM activity_logs al
                    WHERE al.organization_id = $1
                      AND al.action = 'ADD_STOCK'
                      AND al.details->>'method' = 'ORDER_RECEIVE'
                      AND al.timestamp >= $2
                      AND al.timestamp <= $3
                    GROUP BY DATE_TRUNC('day', al.timestamp)
                    ORDER BY DATE_TRUNC('day', al.timestamp) ASC
                `, [orgId, startTs, endTs]);
                return NextResponse.json({ view, groupBy, rows });
            }
        }

        return NextResponse.json({ error: 'Unknown view' }, { status: 400 });
    } catch (e: any) {
        console.error('[audit-activity]', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
