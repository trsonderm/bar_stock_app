import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    // Super Admin Check
    const isSuperAdmin = session?.isSuperAdmin || (session?.permissions as any)?.includes('super_admin');
    if (!session || !isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orgCount = await db.one('SELECT COUNT(*) as count FROM organizations');
    const userCount = await db.one('SELECT COUNT(*) as count FROM users');
    const ticketCount = await db.one("SELECT COUNT(*) as count FROM support_tickets WHERE status = 'open'");

    // Growth: Last 7 days user creations
    const growth = await db.query(`
        SELECT TO_CHAR(created_at, 'Mon DD') as date, COUNT(*) as count 
        FROM users 
        WHERE created_at > NOW() - INTERVAL '7 days' 
        GROUP BY TO_CHAR(created_at, 'Mon DD')
        ORDER BY min(created_at)
    `);

    // Activity: Last 7 days logs
    const activity = await db.query(`
        SELECT TO_CHAR(timestamp, 'Mon DD') as date, COUNT(*) as count 
        FROM activity_logs 
        WHERE timestamp > NOW() - INTERVAL '7 days' 
        GROUP BY TO_CHAR(timestamp, 'Mon DD')
        ORDER BY min(timestamp)
    `);

    return NextResponse.json({
        orgCount: parseInt(orgCount.count),
        userCount: parseInt(userCount.count),
        ticketCount: parseInt(ticketCount.count),
        growth: growth.map((g: any) => ({ name: g.date, value: parseInt(g.count) })),
        activity: activity.map((a: any) => ({ name: a.date, value: parseInt(a.count) }))
    });
}
