
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { source, type, period, dateRange } = body;
        const organizationId = session.organizationId;

        let query = '';
        let params: any[] = [organizationId];
        let data: any[] = [];

        // Helper to handle date filtering
        const getDateFilter = (startDate?: string, endDate?: string) => {
            let filter = '';
            let pIndex = params.length + 1;

            if (startDate) {
                filter += ` AND timestamp >= $${pIndex}`;
                params.push(startDate);
                pIndex++;
            }
            if (endDate) {
                // inclusive end date
                filter += ` AND timestamp <= $${pIndex}::timestamp + INTERVAL '1 day'`;
                params.push(endDate);
                pIndex++;
            }
            return filter;
        };

        // Helper for Orders date filtering (uses order_date)
        const getOrderDateFilter = (startDate?: string, endDate?: string) => {
            let filter = '';
            let pIndex = params.length + 1;

            if (startDate) {
                filter += ` AND order_date >= $${pIndex}`;
                params.push(startDate);
                pIndex++;
            }
            if (endDate) {
                filter += ` AND order_date <= $${pIndex}::timestamp + INTERVAL '1 day'`;
                params.push(endDate);
                pIndex++;
            }
            return filter;
        };


        if (source === 'inventory') {
            // Snapshot - Top 20 items by quantity
            query = `
                SELECT i.name, inv.quantity as value 
                FROM inventory inv
                JOIN items i ON inv.item_id = i.id
                WHERE inv.organization_id = $1
                ORDER BY inv.quantity DESC
                LIMIT 20
            `;
            const rows = await db.query(query, params);
            data = rows;
        }

        else if (source === 'activity') {
            // Activity Over Time
            const dateFilter = getDateFilter(dateRange?.start, dateRange?.end);
            let truncPeriod = 'month';
            if (period === 'daily') truncPeriod = 'day';
            if (period === 'weekly') truncPeriod = 'week';
            if (period === 'yearly') truncPeriod = 'year';

            // For chart, we group by time
            query = `
                SELECT 
                    to_char(date_trunc('${truncPeriod}', timestamp), 'YYYY-MM-DD') as name,
                    COUNT(*) as value
                FROM activity_logs
                WHERE organization_id = $1 ${dateFilter}
                GROUP BY 1
                ORDER BY 1 ASC
            `;
            const rows = await db.query(query, params);
            data = rows;
        }

        else if (source === 'orders') {
            // Orders Over Time
            const dateFilter = getOrderDateFilter(dateRange?.start, dateRange?.end);
            let truncPeriod = 'month';
            if (period === 'daily') truncPeriod = 'day';
            if (period === 'weekly') truncPeriod = 'week';
            if (period === 'yearly') truncPeriod = 'year';

            query = `
                SELECT 
                    to_char(date_trunc('${truncPeriod}', order_date), 'YYYY-MM-DD') as name,
                    COUNT(*) as value -- Or SUM cost if we parsed details
                FROM purchase_orders
                WHERE organization_id = $1 ${dateFilter}
                GROUP BY 1
                ORDER BY 1 ASC
            `;
            const rows = await db.query(query, params);
            data = rows;
        }

        else if (source === 'users_stats') {
            // Top Subtractors
            const dateFilter = getDateFilter(dateRange?.start, dateRange?.end);

            query = `
                SELECT 
                    u.first_name || ' ' || u.last_name as name,
                    SUM(COALESCE((details->>'quantity')::int, 0)) as value
                FROM activity_logs
                JOIN users u ON activity_logs.user_id = u.id
                WHERE activity_logs.organization_id = $1 
                  AND action = 'SUBTRACT_STOCK'
                  ${dateFilter}
                GROUP BY u.id
                ORDER BY value DESC
                LIMIT 10
             `;
            const rows = await db.query(query, params);
            data = rows;
        }

        return NextResponse.json({ data });

    } catch (error) {
        console.error('Error fetching reporting data:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
