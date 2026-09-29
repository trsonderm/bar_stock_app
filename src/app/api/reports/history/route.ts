/**
 * GET /api/reports/history?itemId=&locationId=
 *
 * Stock movement history of one item at a location (activity log entries).
 */
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

    // Resolve location from param or cookie
    const locParam = req.nextUrl.searchParams.get('locationId');
    const cookieLoc = req.headers.get('cookie')?.match(/current_location_id=(\d+)/)?.[1];
    let locationId: number | null = locParam ? parseInt(locParam) : (cookieLoc ? parseInt(cookieLoc) : null);

    try {
        // Validate location belongs to org, default to first
        if (locationId) {
            const validLoc = await db.one('SELECT id FROM locations WHERE id = $1 AND organization_id = $2', [locationId, organizationId]);
            if (!validLoc) locationId = null;
        }
        if (!locationId) {
            const defaultLoc = await db.one('SELECT id FROM locations WHERE organization_id = $1 ORDER BY id ASC LIMIT 1', [organizationId]);
            locationId = defaultLoc?.id ?? null;
        }

        // 1. Get Current Stock & Details for this location
        const item = await db.one(`
            SELECT i.name, COALESCE(inv.quantity, 0) as current_stock
            FROM items i
            LEFT JOIN inventory inv ON i.id = inv.item_id AND inv.location_id = $3
            WHERE i.id = $2 AND i.organization_id = $1
        `, [organizationId, itemId, locationId]);

        if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

        // 2. Get Logs for past N days scoped to this location
        const logs = await db.query(`
            SELECT
                timestamp,
                action,
                details
            FROM activity_logs
            WHERE organization_id = $1
              AND (details->>'itemId')::int = $2
              AND timestamp > NOW() - ($3 * INTERVAL '1 day')
              AND ($4::int IS NULL OR (details->>'locationId')::int = $4::int)
            ORDER BY timestamp DESC
        `, [organizationId, itemId, days, locationId]);

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

        // Chart dates, oldest first. Stock is reconstructed by walking backwards from
        // today's stock and reversing each day's movements:
        //   stockEndOf(D-1) = stockEndOf(D) - restock(D) + usage(D)
        const dates = [];
        for (let d = days; d >= 0; d--) {
            const date = new Date();
            date.setDate(date.getDate() - d);
            dates.push(date.toISOString().split('T')[0]);
        }

        const dailyStats: Record<string, { stock: number, usage: number, restock: number }> = {};

        const todayStr = new Date().toISOString().split('T')[0];

        let currentCalcStock = runningStock;

        // Iterate backwards through dates
        for (let i = dates.length - 1; i >= 0; i--) {
            const dateStr = dates[i];
            const dayLogs = logsByDay[dateStr] || [];

            let dayUsage = 0;
            let dayRestock = 0;

            // Sum the day's movements and reverse them to get the stock at the start of the day.

            dayLogs.forEach(l => {
                // details is JSONB (already an object), but tolerate a JSON string too
                const d = l.details;
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

            // currentCalcStock is now the stock at the start of dateStr; report end-of-day stock.

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
