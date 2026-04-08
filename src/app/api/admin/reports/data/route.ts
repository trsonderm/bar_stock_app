import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// POST: Fetch preview/report data for a given section config
export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.subscriptionPlan !== 'pro' && !session.isSuperAdmin) {
        return NextResponse.json({ error: 'Pro subscription required' }, { status: 403 });
    }

    const orgId = session.organizationId;

    try {
        const { section } = await req.json();
        const { dataSource, filters, groupBy, aggregation, timeFrame } = section || {};

        // Build time bounds
        let startDate: string | null = null;
        let endDate: string | null = null;
        const now = new Date();

        if (timeFrame?.type === 'workday') {
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
            endDate = now.toISOString();
        } else if (timeFrame?.type === 'custom' && timeFrame.from && timeFrame.to) {
            startDate = new Date(timeFrame.from).toISOString();
            endDate = new Date(timeFrame.to).toISOString();
        } else if (timeFrame?.type === 'last7') {
            startDate = new Date(Date.now() - 7 * 86400000).toISOString();
            endDate = now.toISOString();
        } else if (timeFrame?.type === 'last30') {
            startDate = new Date(Date.now() - 30 * 86400000).toISOString();
            endDate = now.toISOString();
        } else {
            startDate = new Date(Date.now() - 30 * 86400000).toISOString();
            endDate = now.toISOString();
        }

        // Filter by location(s)
        const locationFilter = filters?.locations;
        let locationIds: number[] = [];
        if (locationFilter && locationFilter !== 'all' && Array.isArray(locationFilter)) {
            locationIds = locationFilter;
        }

        // Filter by user(s)
        const userFilter = filters?.users;
        let userIds: number[] = [];
        if (userFilter && userFilter !== 'all' && Array.isArray(userFilter)) {
            userIds = userFilter;
        }

        // Determine action filter
        let actionFilter = '';
        if (dataSource === 'add_stock') actionFilter = `AND al.action = 'ADD_STOCK'`;
        else if (dataSource === 'remove_stock') actionFilter = `AND al.action = 'SUBTRACT_STOCK'`;
        else if (dataSource === 'bottle_levels') {
            // Bottle level data
            const data = await db.query(`
                SELECT bll.option_label, COUNT(*) as count
                FROM bottle_level_logs bll
                JOIN activity_logs al ON bll.activity_log_id = al.id
                WHERE al.organization_id = $1
                  AND al.timestamp >= $2 AND al.timestamp <= $3
                GROUP BY bll.option_label
                ORDER BY count DESC
                LIMIT 50
            `, [orgId, startDate, endDate]);
            return NextResponse.json({ rows: data || [], columns: ['option_label', 'count'] });
        } else {
            actionFilter = `AND al.action IN ('ADD_STOCK', 'SUBTRACT_STOCK')`;
        }

        // User filter
        let userSql = userIds.length > 0 ? `AND al.user_id = ANY(ARRAY[${userIds.join(',')}])` : '';

        // GroupBy logic
        const gb = Array.isArray(groupBy) ? groupBy[0] : groupBy;
        let selectExtra = '';
        let groupExtra = '';

        if (gb === 'user') {
            selectExtra = `, u.first_name || ' ' || u.last_name AS user_name`;
            groupExtra = `, u.first_name, u.last_name`;
        } else if (gb === 'item') {
            selectExtra = `, (al.details->>'itemName') AS item_name`;
            groupExtra = `, (al.details->>'itemName')`;
        } else if (gb === 'category') {
            selectExtra = `, i.type AS category`;
            groupExtra = `, i.type`;
        }

        // Aggregation
        const aggFn = aggregation === 'count' ? 'COUNT(*)' :
                      aggregation === 'avg' ? 'AVG((al.details->>\'quantity\')::numeric)' :
                      'SUM((al.details->>\'quantity\')::numeric)';

        const rows = await db.query(`
            SELECT
                DATE_TRUNC('day', al.timestamp) AS date,
                ${aggFn} AS value
                ${selectExtra}
            FROM activity_logs al
            LEFT JOIN users u ON al.user_id = u.id
            LEFT JOIN items i ON (al.details->>'itemId')::int = i.id
            WHERE al.organization_id = $1
              AND al.timestamp >= $2
              AND al.timestamp <= $3
              ${actionFilter}
              ${userSql}
            GROUP BY DATE_TRUNC('day', al.timestamp) ${groupExtra}
            ORDER BY DATE_TRUNC('day', al.timestamp) ASC
            LIMIT 100
        `, [orgId, startDate, endDate]);

        // Summary stats for KPI sections
        const summary = await db.query(`
            SELECT
                COUNT(*) AS total_transactions,
                SUM((al.details->>'quantity')::numeric) AS total_quantity,
                COUNT(DISTINCT al.user_id) AS unique_users,
                COUNT(DISTINCT (al.details->>'itemId')::int) AS unique_items
            FROM activity_logs al
            WHERE al.organization_id = $1
              AND al.timestamp >= $2
              AND al.timestamp <= $3
              ${actionFilter}
              ${userSql}
        `, [orgId, startDate, endDate]);

        return NextResponse.json({
            rows: rows || [],
            summary: summary?.[0] || {},
            columns: ['date', 'value', gb === 'user' ? 'user_name' : gb === 'item' ? 'item_name' : gb === 'category' ? 'category' : null].filter(Boolean)
        });
    } catch (e) {
        console.error('Report data error:', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
