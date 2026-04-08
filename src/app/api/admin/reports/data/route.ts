import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// Deterministic fake data so every data source has a useful preview
function generateFakeRows(dataSource: string, groupBy: string): any[] {
    const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(Date.now() - (6 - i) * 86400000);
        return d.toISOString();
    });

    if (groupBy === 'user') {
        return ['Alice', 'Bob', 'Carlos', 'Diana'].map((name, i) => ({
            date: days[i] || days[0],
            user_name: name,
            value: Math.floor(Math.random() * 40 + 10),
        }));
    }
    if (groupBy === 'item') {
        return ['Vodka', 'Rum', 'Gin', 'Whiskey', 'Tequila'].map((item, i) => ({
            date: days[i] || days[0],
            item_name: item,
            value: Math.floor(Math.random() * 30 + 5),
        }));
    }
    if (groupBy === 'category') {
        return ['Spirits', 'Beer', 'Wine', 'Mixers'].map((cat, i) => ({
            date: days[i] || days[0],
            category: cat,
            value: Math.floor(Math.random() * 60 + 10),
        }));
    }
    if (dataSource === 'bottle_levels') {
        return ['Empty', 'Quarter', 'Half', 'Three-Quarter', 'Full'].map((label, i) => ({
            option_label: label,
            count: [45, 30, 60, 25, 10][i],
            value: [45, 30, 60, 25, 10][i],
        }));
    }
    // Default: daily timeseries
    return days.map((date, i) => ({
        date,
        value: [12, 18, 9, 24, 15, 21, 7][i],
    }));
}

function generateFakeSummary() {
    return {
        total_transactions: 142,
        total_quantity: '312',
        unique_users: 5,
        unique_items: 28,
    };
}

// POST: Fetch preview/report data for a given section config
export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const isPro = session.subscriptionPlan === 'pro' || session.subscriptionPlan === 'free_trial' || session.isSuperAdmin;
    if (!isPro) return NextResponse.json({ error: 'Pro subscription required' }, { status: 403 });

    const orgId = session.organizationId;

    try {
        const body = await req.json();
        const { section, forceMock } = body;
        const { dataSource, filters, groupBy, aggregation, timeFrame } = section || {};

        // Build time bounds
        let startDate: string;
        let endDate: string;
        const now = new Date();

        if (timeFrame?.type === 'workday') {
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
            endDate = now.toISOString();
        } else if (timeFrame?.type === 'custom' && timeFrame.from && timeFrame.to) {
            startDate = new Date(timeFrame.from).toISOString();
            endDate = new Date(timeFrame.to + 'T23:59:59').toISOString();
        } else if (timeFrame?.type === 'last7') {
            startDate = new Date(Date.now() - 7 * 86400000).toISOString();
            endDate = now.toISOString();
        } else {
            // last30 + default
            startDate = new Date(Date.now() - 30 * 86400000).toISOString();
            endDate = now.toISOString();
        }

        // Filter by user(s)
        const userFilter = filters?.users;
        let userIds: number[] = [];
        if (userFilter && userFilter !== 'all' && Array.isArray(userFilter)) {
            userIds = userFilter;
        }
        const userSql = userIds.length > 0 ? `AND al.user_id = ANY(ARRAY[${userIds.map(Number).join(',')}])` : '';

        // Determine action filter
        let actionFilter = '';
        if (dataSource === 'add_stock') actionFilter = `AND al.action = 'ADD_STOCK'`;
        else if (dataSource === 'remove_stock') actionFilter = `AND al.action = 'SUBTRACT_STOCK'`;
        else if (dataSource === 'bottle_levels') {
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

            const hasBottleData = !forceMock && data && data.length > 0;
            const rows = hasBottleData ? data : generateFakeRows('bottle_levels', 'none');
            return NextResponse.json({ rows, columns: ['option_label', 'count'], isSample: !hasBottleData });
        } else {
            actionFilter = `AND al.action IN ('ADD_STOCK', 'SUBTRACT_STOCK')`;
        }

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
                      aggregation === 'avg' ? `AVG((al.details->>'quantity')::numeric)` :
                      `SUM((al.details->>'quantity')::numeric)`;

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
        const summaryRows = await db.query(`
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

        const hasRealData = !forceMock && rows && rows.length > 0;
        const finalRows = hasRealData ? rows : generateFakeRows(dataSource || 'add_stock', gb || 'none');
        const finalSummary = hasRealData ? (summaryRows?.[0] || {}) : generateFakeSummary();

        return NextResponse.json({
            rows: finalRows,
            summary: finalSummary,
            isSample: !hasRealData,
            columns: ['date', 'value', gb === 'user' ? 'user_name' : gb === 'item' ? 'item_name' : gb === 'category' ? 'category' : null].filter(Boolean)
        });
    } catch (e) {
        console.error('Report data error:', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
