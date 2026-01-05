import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || session.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const start = searchParams.get('start');
        const end = searchParams.get('end');

        if (!start || !end) {
            return NextResponse.json({ error: 'Missing date range' }, { status: 400 });
        }

        // Adjust end date to cover the full day if it's just a YYYY-MM-DD string
        // If end is 2024-01-04, we want up to 2024-01-04 23:59:59 or just strict string comparison if user passes full ISO.
        // Let's assume user passes simple dates, we'll append time.
        // Actually, easiest is letting client handle ISO strings, but for robustness:
        const startDate = new Date(start);
        const endDate = new Date(end);
        // If input is YYYY-MM-DD, set end date to end of that day
        if (end.length === 10) {
            endDate.setHours(23, 59, 59, 999);
        }

        const logs = db.prepare(`
            SELECT 
                l.action, l.details, l.timestamp,
                u.id as user_id, u.first_name, u.last_name,
                i.name as db_item_name
            FROM activity_logs l
            LEFT JOIN users u ON l.user_id = u.id
            LEFT JOIN items i ON i.id = json_extract(l.details, '$.itemId')
            WHERE l.timestamp >= ? AND l.timestamp <= ?
            ORDER BY u.last_name ASC, l.timestamp ASC
        `).all(startDate.toISOString(), endDate.toISOString());

        // Aggregate by User -> Item
        const report: Record<string, any> = {};

        logs.forEach((log: any) => {
            const userName = `${log.first_name} ${log.last_name || ''}`.trim();
            if (!report[userName]) {
                report[userName] = {
                    id: log.user_id,
                    added: {},
                    removed: {},
                    logs: []
                };
            }

            let details: any = {};
            try { details = JSON.parse(log.details); } catch { }
            const itemName = details.itemName || log.db_item_name || 'Unknown Item';
            const qty = details.change || details.quantity || 0;

            if (log.action === 'ADD_STOCK') {
                report[userName].added[itemName] = (report[userName].added[itemName] || 0) + qty;
            } else if (log.action === 'SUBTRACT_STOCK') {
                report[userName].removed[itemName] = (report[userName].removed[itemName] || 0) + qty;
            }

            // Should we add ALL logs? Query asked for aggregate. 
            // "get user activity which is grouped by user and aggregate sum"
            // Let's return just aggregate for the summary view, maybe distinct logs aren't needed for the high level?
            // "grouped by user and aggregate sum of actions by name of product"
            // Let's mostly focus on sums. 
        });

        // Format for client
        const result = Object.entries(report).map(([user, data]: [string, any]) => ({
            user,
            added: Object.entries(data.added).map(([name, qty]) => ({ name, qty })),
            removed: Object.entries(data.removed).map(([name, qty]) => ({ name, qty }))
        }));

        return NextResponse.json({ report: result });

    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
