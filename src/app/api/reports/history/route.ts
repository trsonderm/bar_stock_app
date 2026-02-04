import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const itemId = searchParams.get('itemId');
    const days = parseInt(searchParams.get('days') || '40');
    const organizationId = session.organizationId;

    if (!itemId) {
        return NextResponse.json({ error: 'Item ID required' }, { status: 400 });
    }

    try {
        // 1. Get Current Stock & Details
        const item = await db.one(`
            SELECT i.name, COALESCE(inv.quantity, 0) as current_stock 
            FROM items i
            LEFT JOIN inventory inv ON i.id = inv.item_id AND inv.location_id = (SELECT id FROM locations WHERE organization_id = $1 LIMIT 1)
            WHERE i.id = $2 AND i.organization_id = $1
        `, [organizationId, itemId]);

        if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

        // 2. Get Logs for past N days
        const logs = await db.query(`
            SELECT 
                timestamp, 
                action, 
                details 
            FROM activity_logs 
            WHERE organization_id = $1 
            AND (details->>'itemId')::int = $2
            AND timestamp > NOW() - INTERVAL '${days} days'
            ORDER BY timestamp DESC
        `, [organizationId, itemId]);

        // 3. Reconstruct History (Working Backwards)
        // We have Current Stock.
        // History: Date -> { stock, usage, restock }
        // Iterate backwards from Today.

        const history: any[] = [];
        let runningStock = item.current_stock;

        // Group logs by day
        const logsByDay: Record<string, any[]> = {};
        logs.forEach(l => {
            const date = new Date(l.timestamp).toISOString().split('T')[0];
            if (!logsByDay[date]) logsByDay[date] = [];
            logsByDay[date].push(l);
        });

        // Loop 0 to days-1 (Today to Past) or Past to Today?
        // Charts usually want Past -> Today.
        // But to calculate stock, we work Today -> Past (reversing actions).

        // Let's generate array of dates for chart (Past -> Today)
        const dates = [];
        for (let d = days; d >= 0; d--) {
            const date = new Date();
            date.setDate(date.getDate() - d);
            dates.push(date.toISOString().split('T')[0]);
        }

        // We need to map Date -> Stock/Usage. 
        // But runningStock is at "End of Today" (current).
        // To get "Start of Today", we reverse Today's actions.
        // Actually simpler:
        // Stock[End of D] = Stock[End of D-1] + Add[D] - Sub[D].
        // So Stock[End of D-1] = Stock[End of D] - Add[D] + Sub[D].

        // We will build a map date -> { stockEnd, usage, restock }
        // Start with current runningStock as "End of Today (or latest)".
        // If we want detailed chart, we assume 'current' is 'now'. 
        // If logs exist for 'tomorrow' (future), ignore.

        const dailyStats: Record<string, { stock: number, usage: number, restock: number }> = {};

        // Sort logs DESC (Newest first) is already done.
        // We traverse logs. For each log, we adjust runningStock.
        // But we need daily snapshots.

        // Let's iterate dates backwards (Today -> Past) to fill dailyStats.
        const todayStr = new Date().toISOString().split('T')[0];

        // Optimization: Just index logs by date first. (Done above)

        let currentCalcStock = runningStock;

        // Iterate backwards through dates
        for (let i = dates.length - 1; i >= 0; i--) {
            const dateStr = dates[i];
            const dayLogs = logsByDay[dateStr] || [];

            let dayUsage = 0;
            let dayRestock = 0;

            // Process logs for this day to find "Start of Day" stock (which is End of Prev Day)
            // And sum usage/restock.
            // Note: Logs are mixed time. 
            // Effect of log on stock:
            // ADD_STOCK (+qty).  To reverse: -qty.
            // SUBTRACT_STOCK (-qty). To reverse: +qty.

            dayLogs.forEach(l => {
                const d = l.details; // pg driver returns JSON object if jsonb column? 
                // Wait, typically pg driver returns object for jsonb. existing code used user-defined parse or cast?
                // The query uses `details->>'itemId'` so raw SQL access. 
                // But `details` column select... `pg` parses JSON usually.
                // Adapting safely:
                let qty = 0;
                if (typeof d === 'string') {
                    try { qty = JSON.parse(d).quantity || 0; } catch { }
                } else {
                    qty = d.quantity || 0;
                }

                if (l.action === 'ADD_STOCK') {
                    dayRestock += qty;
                    currentCalcStock -= qty; // Reverse operation
                } else if (l.action === 'SUBTRACT_STOCK') {
                    dayUsage += qty;
                    currentCalcStock += qty; // Reverse operation
                }
            });

            // At this point, `currentCalcStock` is the stock at the START of `dateStr` 
            // (or End of `dateStr - 1`).
            // The stock displayed for `dateStr` should typically be "End of Day" stock?
            // "End of Day Stock" for `dateStr` was the value BEFORE we reversed logs.
            // So:
            // EndStock = currentCalcStock + Restock - Usage

            dailyStats[dateStr] = {
                stock: Math.max(0, currentCalcStock + dayRestock - dayUsage),
                usage: dayUsage,
                restock: dayRestock
            };
        }

        // Convert to array sorted by date (Past -> Today)
        const finalData = dates.map(d => ({
            date: d,
            stock: dailyStats[d]?.stock || 0,
            usage: dailyStats[d]?.usage || 0,
            restock: dailyStats[d]?.restock || 0,
            // Format nice date
            label: new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        }));

        return NextResponse.json({
            item: { id: parseInt(itemId), name: item.name },
            history: finalData
        });

    } catch (e) {
        console.error('History API Error', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
