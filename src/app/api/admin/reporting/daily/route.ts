import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date'); // YYYY-MM-DD
    const today = new Date();
    const targetDate = dateParam ? new Date(dateParam) : today;

    // Validate Date
    if (isNaN(targetDate.getTime())) {
        return NextResponse.json({ error: 'Invalid Date' }, { status: 400 });
    }

    const organizationId = session.organizationId;

    try {
        // 1. Determine Window (Shift Logic)
        // Fetch all shifts to find the LATEST end time to determine "Closing Time"
        const shifts = await db.query('SELECT end_time FROM shifts WHERE organization_id = $1', [organizationId]);

        let closingTimeHour = 2; // Default 2 AM if no shifts
        let maxEndTime = 0;

        if (shifts.length > 0) {
            shifts.forEach((s: any) => {
                const [h, m] = s.end_time.split(':').map(Number);
                // Convert to "hours from start of day", dealing with late night (0-5 AM) as > 24 for comparison?
                // Actually, we just need to know if any shift ends late.
                // If a shift ends at 02:00, that's effectively 26:00 relative to previous day.
                // Let's assume day starts at 6AM.
                // If end time is < 6, it's next day.
                let effectiveHour = h;
                if (h < 6) effectiveHour += 24;

                if (effectiveHour > maxEndTime) {
                    maxEndTime = effectiveHour;
                    closingTimeHour = h; // Keep original hour for Date construction
                }
            });
        }

        // Window Start: 6:00 AM on targetDate
        const windowStart = new Date(targetDate);
        windowStart.setHours(6, 0, 0, 0);

        // Window End: Closing Hour + 1 on targetDate (or next day if crosses midnight)
        const windowEnd = new Date(targetDate);
        // If closingHour < 6, it means next day
        if (closingTimeHour < 6) {
            windowEnd.setDate(windowEnd.getDate() + 1);
        }
        windowEnd.setHours(closingTimeHour + 1, 0, 0, 0);

        console.log(`Daily Report Window: ${windowStart.toISOString()} -> ${windowEnd.toISOString()}`);

        // 2. Fetch All Activity Logs (Usage AND Restocks)
        const logs = await db.query(`
            SELECT 
                al.user_id,
                al.user_id,
                CONCAT(u.first_name, ' ', u.last_name) as user_name,
                (al.details->>'itemId')::int as item_id,
                al.details->>'itemName' as item_name,
                (al.details->>'quantity')::numeric as quantity,
                al.action,
                al.timestamp
            FROM activity_logs al
            LEFT JOIN users u ON al.user_id = u.id
            WHERE al.organization_id = $1
              AND (al.action = 'SUBTRACT_STOCK' OR al.action = 'ADD_STOCK')
              AND al.timestamp >= $2
              AND al.timestamp <= $3
        `, [organizationId, windowStart.toISOString(), windowEnd.toISOString()]);

        // 3. Fetch Item Costs (Current Cost, might have changed but best estimate)
        const itemIds = [...new Set(logs.map((l: any) => l.item_id))];
        let itemCosts: Record<number, number> = {};

        if (itemIds.length > 0) {
            const items = await db.query(`SELECT id, unit_cost FROM items WHERE id = ANY($1)`, [itemIds]);
            items.forEach((i: any) => itemCosts[i.id] = Number(i.unit_cost || 0));
        }

        // 4. Aggregate Data
        // Usage
        const usage_userStats: Record<string, { name: string, items: number, cost: number }> = {};
        const usage_itemStats: Record<number, { name: string, quantity: number, cost: number }> = {};
        let totalUsageCost = 0;
        let totalUsageItems = 0;

        // Restock
        const restock_userStats: Record<string, { name: string, items: number, cost: number }> = {};
        const restock_itemStats: Record<number, { name: string, quantity: number, cost: number }> = {};
        let totalRestockCost = 0;
        let totalRestockItems = 0;

        logs.forEach((log: any) => {
            const cost = (itemCosts[log.item_id] || 0) * Number(log.quantity);
            const qty = Number(log.quantity);
            const uid = log.user_id || 'unknown';
            const uName = log.user_name || 'Unknown User';
            const iId = log.item_id;
            const iName = log.item_name || 'Unknown Item';

            if (log.action === 'SUBTRACT_STOCK') {
                // Usage
                if (!usage_userStats[uid]) usage_userStats[uid] = { name: uName, items: 0, cost: 0 };
                usage_userStats[uid].items += qty;
                usage_userStats[uid].cost += cost;

                if (!usage_itemStats[iId]) usage_itemStats[iId] = { name: iName, quantity: 0, cost: 0 };
                usage_itemStats[iId].quantity += qty;
                usage_itemStats[iId].cost += cost;

                totalUsageCost += cost;
                totalUsageItems += qty;
            } else if (log.action === 'ADD_STOCK') {
                // Restock
                if (!restock_userStats[uid]) restock_userStats[uid] = { name: uName, items: 0, cost: 0 };
                restock_userStats[uid].items += qty;
                restock_userStats[uid].cost += cost;

                if (!restock_itemStats[iId]) restock_itemStats[iId] = { name: iName, quantity: 0, cost: 0 };
                restock_itemStats[iId].quantity += qty;
                restock_itemStats[iId].cost += cost;

                totalRestockCost += cost;
                totalRestockItems += qty;
            }
        });

        // Convert Maps to Arrays
        const usageByUsers = Object.values(usage_userStats).sort((a, b) => b.cost - a.cost);
        const usageByItems = Object.values(usage_itemStats).sort((a, b) => b.cost - a.cost);
        const restockByUsers = Object.values(restock_userStats).sort((a, b) => b.cost - a.cost);
        const restockByItems = Object.values(restock_itemStats).sort((a, b) => b.cost - a.cost);


        // 5. Alerts (Low Stock & Run-out)
        const inventory = await db.query(`
            SELECT i.id, i.name, i.low_stock_threshold, SUM(inv.quantity) as quantity, i.order_size, i.unit_cost
            FROM items i
            LEFT JOIN inventory inv ON i.id = inv.item_id WHERE inv.organization_id = $1
            GROUP BY i.id
        `, [organizationId]);

        const lowStockAlerts = inventory.filter((i: any) => i.quantity <= (i.low_stock_threshold || 5));

        // Basic "Run Out" Prediction
        // Flag if current stock < today's usage (meaning we barely made it, or ran out)
        // Or strictly if stock is 0
        const runOutAlerts = inventory
            .map((i: any) => {
                const usedToday = usage_itemStats[i.id]?.quantity || 0;
                if (usedToday > 0 && i.quantity < (usedToday * 0.5)) {
                    // If remaining stock is less than 50% of today's usage, define as "Critical / Might Run Out Tomorrow"
                    return { ...i, reason: `Stock (${i.quantity}) is low compared to daily usage (${usedToday})` };
                }
                return null;
            })
            .filter(Boolean);


        // 6. Return Real Data (No Fake/Preview Mode)
        // If no logs, arrays are empty and totals are 0.
        // Alerts are still calculated from real inventory.

        return NextResponse.json({
            date: targetDate.toISOString().split('T')[0],
            is_preview: false,
            summary: {
                total_usage_cost: totalUsageCost,
                total_usage_items: totalUsageItems,
                total_restock_cost: totalRestockCost,
                total_restock_items: totalRestockItems,
                net_value_change: totalRestockCost - totalUsageCost
            },
            usage: {
                by_user: usageByUsers,
                by_item: usageByItems
            },
            restock: {
                by_user: restockByUsers,
                by_item: restockByItems
            },
            alerts: {
                low_stock: lowStockAlerts,
                run_out: runOutAlerts
            }
        });

    } catch (e) {
        console.error('Daily Report Error', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
