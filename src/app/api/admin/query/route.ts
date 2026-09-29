/**
 * GET /api/admin/query?start=&end=
 *
 * Admin activity query: stock added / removed per user and product between two
 * dates (YYYY-MM-DD dates cover the whole day).
 */
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

        // Plain YYYY-MM-DD dates are widened to cover the whole day; full ISO timestamps are used as-is.
        let startDateStr = start;
        let endDateStr = end;

        // If simple YYYY-MM-DD, append full day range
        if (start.length === 10) startDateStr += 'T00:00:00';
        if (end.length === 10) endDateStr += 'T23:59:59.999';

        const logs = await db.query(`
            SELECT 
                l.action, l.details, l.timestamp,
                u.id as user_id, u.first_name, u.last_name,
                i.name as db_item_name
            FROM activity_logs l
            LEFT JOIN users u ON l.user_id = u.id
            LEFT JOIN items i ON i.id = (l.details->>'itemId')::int
            WHERE l.organization_id = $1 
            AND l.timestamp >= $2 AND l.timestamp <= $3
            ORDER BY u.last_name ASC, l.timestamp ASC
        `, [session.organizationId, startDateStr, endDateStr]);

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
            if (typeof log.details === 'string') {
                try { details = JSON.parse(log.details); } catch { }
            } else {
                details = log.details || {};
            }
            const itemName = details.itemName || log.db_item_name || 'Unknown Item';
            const qty = details.change || details.quantity || 0;

            if (log.action === 'ADD_STOCK') {
                report[userName].added[itemName] = (report[userName].added[itemName] || 0) + qty;
            } else if (log.action === 'SUBTRACT_STOCK') {
                report[userName].removed[itemName] = (report[userName].removed[itemName] || 0) + qty;
            }

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
