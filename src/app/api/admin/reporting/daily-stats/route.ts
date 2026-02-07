import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.organizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get stats for today (UTC/Server time, simple approx)
        const today = new Date().toISOString().split('T')[0];

        // 1. Items Created Today
        const items = await db.one(`
            SELECT COUNT(*) as count FROM items 
            WHERE organization_id = $1 AND DATE(created_at) = DATE($2)
        `, [session.organizationId, today]);

        // 2. Users Active (using audits as proxy, checking if inventory_audits exists, wait, table list check first)
        // I saw 'activity_logs' in table list, that is better!

        const activity = await db.one(`
            SELECT COUNT(*) as count FROM activity_logs 
            WHERE organization_id = $1 AND DATE(created_at) = DATE($2)
        `, [session.organizationId, today]);

        // 3. Active Staff (distinct users in activity logs)
        const users = await db.one(`
            SELECT COUNT(DISTINCT user_id) as count FROM activity_logs
            WHERE organization_id = $1 AND DATE(created_at) = DATE($2)
        `, [session.organizationId, today]);

        return NextResponse.json({
            stats: {
                itemsCreated: items?.count || 0,
                auditsPerformed: activity?.count || 0, // Using activity count for now
                usersActive: users?.count || 0
            }
        });
    } catch (e: any) {
        console.error('Daily Stats API Error:', e);
        return NextResponse.json({ error: 'Server Error' }, { status: 500 });
    }
}
