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
        const locationId = searchParams.get('locationId');

        let dateFilter = `AND al.timestamp > NOW() - INTERVAL '30 days'`;
        const params: any[] = [session.organizationId];
        let pIdx = 2; // Next param index

        if (start && end) {
            dateFilter = `AND al.timestamp >= $${pIdx} AND al.timestamp <= $${pIdx + 1}`;
            params.push(start, end);
            pIdx += 2;
        }

        if (locationId) {
            dateFilter += ` AND (al.details->>'locationId')::int = $${pIdx}`;
            params.push(locationId);
            pIdx++;
        }

        const categoryId = searchParams.get('categoryId');
        if (categoryId) {
            dateFilter += ` AND i.category_id = $${pIdx}`;
            params.push(categoryId);
            pIdx++;
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
        // Filter stock by location if specified
        let stockQuery = `
            SELECT item_id, SUM(quantity) as current_stock 
            FROM inventory 
            WHERE organization_id = $1 
        `;
        const stockParams: any[] = [session.organizationId];
        if (locationId) {
            stockQuery += ` AND location_id = $2`;
            stockParams.push(locationId);
        }
        stockQuery += ` GROUP BY item_id`;

        const stock = await db.query(stockQuery, stockParams);

        const stockMap = new Map(stock.map((s: any) => [s.item_id, s.current_stock]));

        // Calculate Daily Average & Project
        // We need a map of item -> total_used / days_in_period
        // For simplicity, assume period is 30 days unless specified
        const days = (start && end) ? Math.max(1, (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 3600 * 24)) : 30;

        const projections = [];
        const insights = [];

        // Revised Ranking Query with ID
        const rankingWithId = await db.query(`
            SELECT i.id, i.name, i.low_stock_threshold, i.order_size, SUM((al.details->>'quantity')::int) as total_used
            FROM activity_logs al
            JOIN items i ON (al.details->>'itemId')::int = i.id
            WHERE al.organization_id = $1 
            AND al.action = 'SUBTRACT_STOCK'
            ${dateFilter}
            GROUP BY i.id, i.name, i.low_stock_threshold, i.order_size
            ORDER BY total_used DESC
            LIMIT 10
        `, params);

        for (const item of rankingWithId) {
            const dailyRate = item.total_used / days;
            const currentStock = parseFloat(stockMap.get(item.id) || '0');
            const threshold = item.low_stock_threshold !== null ? item.low_stock_threshold : 5;

            let orderAmount = 24; // default
            try {
                const parsed = typeof item.order_size === 'string' ? JSON.parse(item.order_size) : item.order_size;
                if (Array.isArray(parsed) && parsed.length > 0) {
                    if (typeof parsed[0] === 'object' && parsed[0].amount) orderAmount = parsed[0].amount;
                    else if (typeof parsed[0] === 'number') orderAmount = parsed[0];
                }
            } catch (e) { }

            const daysRemaining = dailyRate > 0 ? currentStock / dailyRate : 999;

            // Build future points
            const points = [];
            const pointsWithRestocks = [];
            let virtualStockNoRestock = currentStock;
            let virtualStockWithRestock = currentStock;
            let pendingOrderDeliveryDay = -1;
            const today = new Date();

            for (let i = 0; i < 30; i++) { // Project 30 days out
                const d = new Date(today);
                d.setDate(today.getDate() + i);
                const dateStr = d.toISOString().split('T')[0];

                // NO RESTOCK
                virtualStockNoRestock = virtualStockNoRestock - dailyRate;
                points.push({ date: dateStr, stock: Math.max(0, virtualStockNoRestock) });

                // WITH RESTOCK
                if (i === pendingOrderDeliveryDay) {
                    virtualStockWithRestock += orderAmount;
                    pendingOrderDeliveryDay = -1;
                }
                virtualStockWithRestock = virtualStockWithRestock - dailyRate;
                if (virtualStockWithRestock <= threshold && pendingOrderDeliveryDay === -1) {
                    pendingOrderDeliveryDay = i + 2; // Assume 2 days lead time
                }
                pointsWithRestocks.push({ date: dateStr, stock: Math.max(0, virtualStockWithRestock) });
            }

            projections.push({
                item: item.name,
                currentStock,
                dailyRate,
                daysRemaining,
                data: points,
                dataWithRestocks: pointsWithRestocks
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
