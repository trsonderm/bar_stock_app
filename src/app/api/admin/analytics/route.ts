import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || session.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Analytics:
        // 1. Total Activity Today
        // 2. Most Active User
        // 3. Recent Logs

        const today = new Date().toISOString().split('T')[0];

        const totalActivity = db.prepare('SELECT COUNT(*) as count FROM activity_logs WHERE DATE(timestamp) = ?').get(today) as { count: number };

        // Most active user today
        const topUser = db.prepare(`
        SELECT u.first_name, COUNT(*) as count 
        FROM activity_logs l 
        JOIN users u ON l.user_id = u.id 
        WHERE DATE(l.timestamp) = ? 
        GROUP BY l.user_id 
        ORDER BY count DESC 
        LIMIT 1
    `).get(today) as { first_name: string, count: number } | undefined;

        // Recent Logs (Limit 20)
        const recentLogs = db.prepare(`
        SELECT l.id, u.first_name, l.action, l.details, l.timestamp 
        FROM activity_logs l
        LEFT JOIN users u ON l.user_id = u.id
        ORDER BY l.timestamp DESC
        LIMIT 20
    `).all();

        return NextResponse.json({
            stats: {
                todayCount: totalActivity.count,
                topUser: topUser ? `${topUser.first_name} (${topUser.count})` : 'N/A'
            },
            logs: recentLogs
        });

    } catch (error) {
        console.error('Analytics error', error);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
