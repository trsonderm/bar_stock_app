import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        // Try to get itemName from items table if possible, or fallback to details
        // We use json_extract to join.
        // Postgres: (l.details->>'itemId')::int
        const logs = await db.query(`
            SELECT 
                l.id, l.action, l.details, l.timestamp,
                i.name as db_item_name
            FROM activity_logs l
            LEFT JOIN items i ON i.id = (l.details->>'itemId')::int
            WHERE l.user_id = $1 
            ORDER BY l.timestamp DESC 
            LIMIT 50
        `, [session.id]);

        // Enhance logs with correct name
        const enhancedLogs = logs.map((log: any) => {
            let details: any = {};
            if (typeof log.details === 'string') {
                try { details = JSON.parse(log.details); } catch { }
            } else {
                details = log.details || {};
            }

            // If details has itemName, use it (historical accuracy). 
            // If not, use current db name (better than nothing).
            const name = details.itemName || log.db_item_name || 'Unknown Item';

            return {
                ...log,
                details: JSON.stringify({ ...details, itemName: name })
            };
        });

        return NextResponse.json({ logs: enhancedLogs });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
