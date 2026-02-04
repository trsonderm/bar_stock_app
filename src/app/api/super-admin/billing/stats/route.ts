import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Calculate Stats
        // MRR = Sum of amounts of latest paid invoices? Or just sum of all active PRO plans * price?
        // Let's do PRO plans * 49
        const subStats = await db.one("SELECT COUNT(*) as count FROM organizations WHERE subscription_plan = 'PRO'");
        const mrr = parseInt(subStats.count) * 49.00;

        const pendingStats = await db.one("SELECT COALESCE(SUM(amount), 0) as total FROM invoices WHERE status = 'PENDING'");

        // Recent Invoices
        const invoices = await db.query(`
            SELECT i.*, o.name as organization_name 
            FROM invoices i 
            JOIN organizations o ON i.organization_id = o.id 
            ORDER BY i.created_at DESC 
            LIMIT 20
        `);

        return NextResponse.json({
            stats: {
                revenue: mrr,
                pending: parseFloat(pendingStats.total),
                activeSubs: parseInt(subStats.count)
            },
            invoices
        });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
