import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { dateRange, shiftId, userIds } = await req.json();
        const orgId = session.organizationId;

        let targetUserIds = userIds || [];
        let timeFilter = '';
        let timeParams: any[] = [];

        // If Shift is selected, get details
        if (shiftId) {
            const shift = await db.one('SELECT * FROM shifts WHERE id = $1 AND organization_id = $2', [shiftId, orgId]);
            if (shift) {
                // If no manual users selected, use shift's assigned users
                if (targetUserIds.length === 0 && shift.assigned_user_ids) {
                    // assigned_user_ids is JSONB list of IDs
                    targetUserIds = shift.assigned_user_ids;
                }

                // Time Filter Logic
                // If start < end (e.g. 08:00 to 16:00), simple BETWEEN
                // If start > end (e.g. 20:00 to 04:00), OR condition
                const start = shift.start_time;
                const end = shift.end_time;

                if (start < end) {
                    timeFilter = `AND (timestamp::time >= $${timeParams.length + 3}::time AND timestamp::time <= $${timeParams.length + 4}::time)`;
                    timeParams.push(start, end);
                } else {
                    // Crosses midnight (e.g. Night shift)
                    timeFilter = `AND (timestamp::time >= $${timeParams.length + 3}::time OR timestamp::time <= $${timeParams.length + 4}::time)`;
                    timeParams.push(start, end);
                }
            }
        }

        // Base Query
        // We want logs for usage (SUBTRACT_STOCK or similar)
        // Adjust action filter as needed. Assuming 'SUBTRACT_STOCK' is main usage.

        let userFilter = '';
        let userParams: any[] = [];
        if (targetUserIds.length > 0) {
            userFilter = `AND user_id = ANY($${userParams.length + timeParams.length + 3})`;
            userParams.push(targetUserIds);
        }

        const params = [orgId, dateRange.start, ...timeParams, ...userParams];

        // Note: Params index management needs care.
        // $1 = orgId
        // $2 = dateRange.start (Actually we need end too)

        // Re-building query with cleaner param indexing
        const values = [orgId, dateRange.start, dateRange.end];
        let paramIdx = 4;

        let tFilter = '';
        if (shiftId && timeParams.length > 0) {
            tFilter = timeFilter // Use logic above but adjust $ indices
                .replace(/\$\d+/g, (match) => {
                    return '$' + (paramIdx++);
                });
            values.push(...timeParams);
        }

        let uFilter = '';
        if (targetUserIds.length > 0) {
            uFilter = `AND user_id = ANY($${paramIdx++})`;
            values.push(targetUserIds);
        }

        const query = `
            SELECT 
                u.first_name, u.last_name,
                al.action,
                al.details,
                al.timestamp
            FROM activity_logs al
            JOIN users u ON al.user_id = u.id
            WHERE al.organization_id = $1
              AND al.timestamp >= $2::date
              AND al.timestamp <= ($3::date + INTERVAL '1 day')
              ${tFilter}
              ${uFilter}
            ORDER BY al.timestamp DESC
        `;

        const logs = await db.query(query, values);

        // Process logs into summary
        const summary: Record<string, { name: string, actions: number, items_used: number, value: number }> = {};
        const items: any[] = [];

        logs.forEach((log: any) => {
            const name = `${log.first_name} ${log.last_name}`;
            if (!summary[name]) summary[name] = { name, actions: 0, items_used: 0, value: 0 };

            summary[name].actions++;

            if (log.action === 'SUBTRACT_STOCK' && log.details) {
                const qty = Number(log.details.quantity || 0);
                const val = Number(log.details.value || 0); // Assuming value tracked, otherwise fetch
                summary[name].items_used += qty;
                summary[name].value += val; // If value not in details, this will be 0

                items.push({
                    user: name,
                    item: log.details.itemName || 'Unknown',
                    qty,
                    time: log.timestamp
                });
            }
        });

        return NextResponse.json({
            summary: Object.values(summary),
            logs: items
        });

    } catch (e) {
        console.error('Employee Usage Report Error', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
