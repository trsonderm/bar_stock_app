import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

    try {
        const order = await db.one(`
            SELECT po.*, s.name as supplier_name 
            FROM pending_orders po
            JOIN suppliers s ON po.supplier_id = s.id
            WHERE po.token = $1
        `, [token]);

        if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

        return NextResponse.json({ order });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
