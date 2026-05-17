import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const session = await getSession();
        if (!session || session.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const orgId = session.organizationId;

        const [
            itemStats,
            lowStockItems,
            pendingOrders,
            activityRows,
            categoryBreakdown,
            pendingSwaps,
            recentActivity,
        ] = await Promise.all([
            // Total items + low stock count
            db.one(`
                SELECT
                    COUNT(*) FILTER (WHERE archived_at IS NULL) AS total_items,
                    COUNT(*) FILTER (WHERE archived_at IS NULL AND EXISTS (
                        SELECT 1 FROM inventory inv
                        WHERE inv.item_id = i.id
                        GROUP BY inv.item_id
                        HAVING COALESCE(SUM(inv.quantity), 0) <= COALESCE(i.low_stock_threshold, 0)
                    )) AS low_stock_count
                FROM items i
                WHERE i.organization_id = $1
            `, [orgId]).catch(() => ({ total_items: 0, low_stock_count: 0 })),

            // Low stock items detail (top 8 most critical)
            db.query(`
                SELECT i.id, i.name, i.type,
                       COALESCE(SUM(inv.quantity), 0) AS current_qty,
                       COALESCE(i.low_stock_threshold, 0) AS threshold
                FROM items i
                LEFT JOIN inventory inv ON inv.item_id = i.id
                WHERE i.organization_id = $1 AND i.archived_at IS NULL
                GROUP BY i.id, i.name, i.type, i.low_stock_threshold
                HAVING COALESCE(SUM(inv.quantity), 0) <= COALESCE(i.low_stock_threshold, 0)
                ORDER BY COALESCE(SUM(inv.quantity), 0) ASC
                LIMIT 8
            `, [orgId]).catch(() => []),

            // Pending orders count
            db.one(`
                SELECT COUNT(*) AS count
                FROM purchase_orders
                WHERE organization_id = $1 AND status = 'PENDING'
            `, [orgId]).catch(() => ({ count: 0 })),

            // 7-day activity chart data
            db.query(`
                SELECT DATE(timestamp) AS day, COUNT(*) AS count
                FROM activity_logs
                WHERE organization_id = $1
                  AND timestamp >= NOW() - INTERVAL '7 days'
                GROUP BY DATE(timestamp)
                ORDER BY day ASC
            `, [orgId]).catch(() => []),

            // Category breakdown for donut/bar chart
            db.query(`
                SELECT
                    COALESCE(NULLIF(i.type, ''), 'Uncategorized') AS category,
                    COUNT(*) AS count
                FROM items i
                WHERE i.organization_id = $1 AND i.archived_at IS NULL
                GROUP BY i.type
                ORDER BY count DESC
                LIMIT 8
            `, [orgId]).catch(() => []),

            // Pending swap requests awaiting manager approval
            db.query(`
                SELECT ssr.id, ssr.status, ssr.message, ssr.created_at,
                       COALESCE(ssr.request_type, 'direct') AS request_type,
                       COALESCE(ssr.is_giveaway, false) AS is_giveaway,
                       COALESCE(ru.display_name, ru.first_name||' '||ru.last_name) AS requester_name,
                       COALESCE(tu.display_name, tu.first_name||' '||tu.last_name) AS target_name,
                       rs.date AS requester_date,
                       rsh.label AS requester_shift,
                       rsh.start_time AS requester_start,
                       rsh.end_time AS requester_end,
                       ts.date AS target_date,
                       tsh.label AS target_shift
                FROM shift_swap_requests ssr
                JOIN users ru ON ru.id = ssr.requester_id
                LEFT JOIN users tu ON tu.id = ssr.target_id
                JOIN user_schedules rs ON rs.id = ssr.requester_schedule_id
                JOIN shifts rsh ON rsh.id = rs.shift_id
                LEFT JOIN user_schedules ts ON ts.id = ssr.target_schedule_id
                LEFT JOIN shifts tsh ON tsh.id = ts.shift_id
                WHERE ssr.organization_id = $1 AND ssr.status = 'pending_manager'
                ORDER BY ssr.employee_responded_at DESC NULLS LAST
                LIMIT 5
            `, [orgId]).catch(() => []),

            // Recent activity log (10 entries)
            db.query(`
                SELECT al.id, al.action, al.timestamp,
                       COALESCE(u.display_name, u.first_name||' '||u.last_name) AS user_name,
                       al.details
                FROM activity_logs al
                LEFT JOIN users u ON u.id = al.user_id
                WHERE al.organization_id = $1
                ORDER BY al.timestamp DESC
                LIMIT 10
            `, [orgId]).catch(() => []),
        ]);

        // Fill in missing days in activity chart
        const today = new Date();
        const activityMap = new Map(activityRows.map((r: any) => [r.day?.toISOString?.()?.split('T')[0] || r.day, Number(r.count)]));
        const activityChart = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(today);
            d.setDate(today.getDate() - (6 - i));
            const key = d.toISOString().split('T')[0];
            return { date: key, count: activityMap.get(key) || 0, label: d.toLocaleDateString('en', { weekday: 'short' }) };
        });

        return NextResponse.json({
            stats: {
                totalItems: Number(itemStats?.total_items || 0),
                lowStockCount: Number(itemStats?.low_stock_count || 0),
                pendingOrders: Number(pendingOrders?.count || 0),
                activityToday: activityChart[6]?.count || 0,
            },
            activityChart,
            categoryBreakdown: categoryBreakdown.map((r: any) => ({
                category: r.category,
                count: Number(r.count),
            })),
            lowStockItems: lowStockItems.map((r: any) => ({
                id: r.id,
                name: r.name,
                type: r.type || 'Unknown',
                currentQty: Number(r.current_qty),
                threshold: Number(r.threshold),
            })),
            pendingSwaps: pendingSwaps.map((r: any) => ({
                id: r.id,
                requestType: r.request_type,
                isGiveaway: r.is_giveaway,
                requesterName: r.requester_name,
                targetName: r.target_name,
                requesterDate: r.requester_date,
                requesterShift: r.requester_shift,
                requesterStart: r.requester_start,
                requesterEnd: r.requester_end,
                targetDate: r.target_date,
                targetShift: r.target_shift,
                message: r.message,
                createdAt: r.created_at,
            })),
            recentActivity: recentActivity.map((r: any) => ({
                id: r.id,
                action: r.action,
                userName: r.user_name,
                timestamp: r.timestamp,
                details: r.details,
            })),
        });
    } catch (e: any) {
        console.error('Dashboard API error:', e);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
