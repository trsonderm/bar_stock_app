import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function PUT(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const body = await req.json();
        const { orderId, status } = body;

        if (!orderId || !['PENDING', 'DELIVERED', 'CANCELLED'].includes(status)) {
            return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
        }

        await db.query(`
            UPDATE purchase_orders 
            SET status = $1 
            WHERE id = $2 AND organization_id = $3
        `, [status, orderId, session.organizationId]);

        return NextResponse.json({ success: true });

    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }
}
