import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || session.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const orgId = session.organizationId;
        const today = new Date().toISOString().split('T')[0];

        // 1. Total Activity Today
        const totalActivity = await db.one(`
            SELECT COUNT(*) as count 
            FROM activity_logs 
            WHERE organization_id = $1 AND DATE(timestamp) = $2
        `, [orgId, today]);

        // 2. Most active user today
        const topUser = await db.one(`
            SELECT u.first_name, COUNT(*) as count 
            FROM activity_logs l 
            JOIN users u ON l.user_id = u.id 
            WHERE l.organization_id = $1 AND DATE(l.timestamp) = $2 
            GROUP BY l.user_id, u.first_name
            ORDER BY count DESC 
            LIMIT 1
        `, [orgId, today]);

        // 3. Recent Logs (Limit 20)
        const recentLogs = await db.query(`
            SELECT l.id, u.first_name, l.action, l.details, l.timestamp 
            FROM activity_logs l
            LEFT JOIN users u ON l.user_id = u.id
            WHERE l.organization_id = $1
            ORDER BY l.timestamp DESC
            LIMIT 20
        `, [orgId]);

        return NextResponse.json({
            stats: {
                todayCount: totalActivity ? parseInt(totalActivity.count) : 0,
                topUser: topUser ? `${topUser.first_name} (${topUser.count})` : 'N/A'
            },
            logs: recentLogs
        });

    } catch (error) {
        console.error('Analytics error', error);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
