import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const orgId = session.organizationId;
    const { searchParams } = req.nextUrl;
    const period = searchParams.get('period') || 'month';
    const userId = searchParams.get('userId');
    const locationId = searchParams.get('locationId');
    const locIdInt = locationId ? parseInt(locationId) : null;

    const now = new Date();
    let since: Date;
    const until: Date = new Date(now);

    if (period === 'week') {
        since = new Date(now.getTime() - 7 * 86400000);
    } else if (period === 'month') {
        since = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === 'year') {
        since = new Date(now.getFullYear(), 0, 1);
    } else {
        since = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const shiftParams: any[] = [orgId, since, until];
    let userFilter = '';
    let locationFilter = '';

    if (userId) {
        userFilter = ` AND sc.user_id = $${shiftParams.push(parseInt(userId))}`;
    }
    if (locIdInt) {
        locationFilter = ` AND sc.location_id = $${shiftParams.push(locIdInt)}`;
    }

    try {
        const [rows, users, locations, stockValueRow, movementRows] = await Promise.all([
            // Shift close rows
            db.query(`
                SELECT
                    sc.id, sc.closed_at, sc.user_id,
                    u.first_name || ' ' || u.last_name AS user_name,
                    l.name AS location_name,
                    sc.cash_sales::float AS cash_sales,
                    sc.cc_sales::float AS cc_sales,
                    sc.cash_tips::float AS cash_tips,
                    sc.cc_tips::float AS cc_tips,
                    sc.payouts_json,
                    sc.bag_amount::float AS bag_amount,
                    sc.over_short::float AS over_short,
                    sc.bank_start::float AS bank_start,
                    sc.bank_end::float AS bank_end
                FROM shift_closes sc
                LEFT JOIN users u ON sc.user_id = u.id
                LEFT JOIN locations l ON sc.location_id = l.id
                WHERE sc.organization_id = $1
                  AND sc.closed_at >= $2
                  AND sc.closed_at <= $3
                  ${userFilter}${locationFilter}
                ORDER BY sc.closed_at ASC
            `, shiftParams),

            // Employees who have shift close records
            db.query(`
                SELECT DISTINCT sc.user_id AS id, u.first_name || ' ' || u.last_name AS name
                FROM shift_closes sc
                JOIN users u ON sc.user_id = u.id
                WHERE sc.organization_id = $1
                ORDER BY name ASC
            `, [orgId]),

            // Locations list
            db.query(
                `SELECT id, name FROM locations WHERE organization_id = $1 ORDER BY name ASC`,
                [orgId]
            ),

            // Current stock value at location(s)
            db.query(
                locIdInt
                    ? `SELECT COALESCE(SUM(inv.quantity * i.unit_cost), 0)::float AS stock_value
                       FROM inventory inv
                       JOIN items i ON inv.item_id = i.id
                       WHERE i.organization_id = $1 AND inv.location_id = $2`
                    : `SELECT COALESCE(SUM(inv.quantity * i.unit_cost), 0)::float AS stock_value
                       FROM inventory inv
                       JOIN items i ON inv.item_id = i.id
                       WHERE i.organization_id = $1`,
                locIdInt ? [orgId, locIdInt] : [orgId]
            ),

            // Stock movement — value of stock subtracted over the period, grouped by date bucket
            db.query(
                locIdInt
                    ? `SELECT
                         al.timestamp,
                         ABS((al.details->>'quantity')::numeric) AS qty,
                         i.unit_cost::float AS unit_cost,
                         (ABS((al.details->>'quantity')::numeric) * i.unit_cost)::float AS movement_value
                       FROM activity_logs al
                       JOIN items i ON (al.details->>'itemId')::int = i.id
                       WHERE al.organization_id = $1
                         AND al.action = 'SUBTRACT_STOCK'
                         AND al.timestamp >= $2
                         AND al.timestamp <= $3
                         AND EXISTS (
                           SELECT 1 FROM inventory
                           WHERE item_id = i.id AND location_id = $4
                         )
                       ORDER BY al.timestamp ASC`
                    : `SELECT
                         al.timestamp,
                         ABS((al.details->>'quantity')::numeric) AS qty,
                         i.unit_cost::float AS unit_cost,
                         (ABS((al.details->>'quantity')::numeric) * i.unit_cost)::float AS movement_value
                       FROM activity_logs al
                       JOIN items i ON (al.details->>'itemId')::int = i.id
                       WHERE al.organization_id = $1
                         AND al.action = 'SUBTRACT_STOCK'
                         AND al.timestamp >= $2
                         AND al.timestamp <= $3
                       ORDER BY al.timestamp ASC`,
                locIdInt ? [orgId, since, until, locIdInt] : [orgId, since, until]
            ),
        ]);

        const stockValue = stockValueRow[0]?.stock_value ?? 0;

        return NextResponse.json({
            rows,
            users,
            locations,
            stockValue,
            movementRows,
            period,
            since: since.toISOString(),
            until: until.toISOString(),
        });
    } catch (err: any) {
        console.error('[finances] Error:', err);
        return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
    }
}
