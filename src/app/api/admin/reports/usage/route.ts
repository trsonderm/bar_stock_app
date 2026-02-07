import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(req.url);
        const start = searchParams.get('start');
        const end = searchParams.get('end');

        let dateFilter = `AND al.timestamp > NOW() - INTERVAL '30 days'`;
        const params: any[] = [session.organizationId];
        let pIdx = 2; // Next param index

        if (start && end) {
            dateFilter = `AND al.timestamp >= $${pIdx} AND al.timestamp <= $${pIdx + 1}`;
            params.push(start, end);
            pIdx += 2;
        }

        // 1. Get Usage History by Date (for Line Chart)
        // Group by Date and Item
        const historyQuery = `
            SELECT DATE(al.timestamp) as date, i.name, SUM((al.details->>'quantity')::int) as used
            FROM activity_logs al
            JOIN items i ON (al.details->>'itemId')::int = i.id
            WHERE al.organization_id = $1 
            AND al.action = 'SUBTRACT_STOCK'
            ${dateFilter}
            GROUP BY date, i.name
            ORDER BY date ASC
        `;
        const history = await db.query(historyQuery, params);

        // 2. Get Usage Counts (for Bar Chart ranking)
        const rankingQuery = `
            SELECT i.name, SUM((al.details->>'quantity')::int) as total_used
            FROM activity_logs al
            JOIN items i ON (al.details->>'itemId')::int = i.id
            WHERE al.organization_id = $1 
            AND al.action = 'SUBTRACT_STOCK'
            ${dateFilter}
            GROUP BY i.name
            ORDER BY total_used DESC
            LIMIT 10
        `;
        const ranking = await db.query(rankingQuery, params);

        // 3. Build Projections (Requires Current Stock)
        // Need to fetch current stock for items in the ranking
        // Simplified: Fetch stock for all items
        const stock = await db.query(`
            SELECT item_id, SUM(quantity) as current_stock 
            FROM inventory 
            WHERE organization_id = $1 
            GROUP BY item_id
        `, [session.organizationId]);

        const stockMap = new Map(stock.map((s: any) => [s.item_id, s.current_stock]));

        // Calculate Daily Average & Project
        // We need a map of item -> total_used / days_in_period
        // For simplicity, assume period is 30 days unless specified
        const days = (start && end) ? Math.max(1, (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 3600 * 24)) : 30;

        const projections = [];
        const insights = [];

        // Identify Top 5 Items to project
        for (const item of ranking.slice(0, 5)) { // Top 5
            // Find item ID? ranking query returned name only. Let's fix ranking query to include ID if needed, 
            // or we might struggle to match with stockMap (which relies on ID).
            // Actually ActivityLog stores ItemName, but Inventory stores ItemID. 
            // We need to link by Name or ideally ID. 
            // Let's rely on name for graph, but need ID for stock.
            // Let's refetch items to get IDs or modify ranking query.
        }

        // Revised Ranking Query with ID
        const rankingWithId = await db.query(`
            SELECT i.id, i.name, SUM((al.details->>'quantity')::int) as total_used
            FROM activity_logs al
            JOIN items i ON (al.details->>'itemId')::int = i.id
            WHERE al.organization_id = $1 
            AND al.action = 'SUBTRACT_STOCK'
            ${dateFilter}
            GROUP BY i.id, i.name
            ORDER BY total_used DESC
            LIMIT 10
        `, params);

        for (const item of rankingWithId) {
            const dailyRate = item.total_used / days;
            const currentStock = parseFloat(stockMap.get(item.id) || '0');
            const daysRemaining = dailyRate > 0 ? currentStock / dailyRate : 999;

            // Build future points
            const points = [];
            const today = new Date();
            for (let i = 0; i < 30; i++) { // Project 30 days out
                const d = new Date(today);
                d.setDate(today.getDate() + i);
                const projected = Math.max(0, currentStock - (dailyRate * i));
                points.push({ date: d.toISOString().split('T')[0], stock: projected });
            }

            projections.push({
                item: item.name,
                currentStock,
                dailyRate,
                daysRemaining,
                data: points
            });

            if (daysRemaining < 7) {
                insights.push(`⚠️ ${item.name} is predicted to run out in ${Math.round(daysRemaining)} days based on recent usage.`);
            } else if (daysRemaining < 14) {
                insights.push(`ℹ️ ${item.name} has about ${Math.round(daysRemaining)} days of stock remaining.`);
            }
        }

        // Add generic insight if empty
        if (insights.length === 0 && rankingWithId.length > 0) {
            insights.push(`✅ All top items appear well-stocked based on current usage trends.`);
        }
        if (rankingWithId.length === 0) {
            insights.push(`ℹ️ No usage data found for this period.`);
        }

        // 4. Get Category Usage (Pie/Bar Chart)
        const categoryQuery = `
            SELECT c.name, SUM((al.details->>'quantity')::int) as total_used
            FROM activity_logs al
            JOIN items i ON (al.details->>'itemId')::int = i.id
            LEFT JOIN categories c ON i.type = c.id::text OR i.type = c.name
            WHERE al.organization_id = $1 
            AND al.action = 'SUBTRACT_STOCK'
            ${dateFilter}
            GROUP BY c.name
            ORDER BY total_used DESC
        `;
        const categoryUsage = await db.query(categoryQuery, params);

        return NextResponse.json({
            data: {
                history, // For "Usage Over Time"
                ranking: rankingWithId, // For "Top Items"
                projections, // For "Future Stock"
                insights,
                categoryUsage // For "Usage by Category"
            }
        });
    } catch (e: any) {
        console.error('Usage API Error:', e);
        return NextResponse.json({ error: 'Failed: ' + e.message }, { status: 500 });
    }
}
