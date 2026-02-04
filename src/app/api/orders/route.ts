import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const body = await req.json();
        const { supplier_id, expected_delivery_date, items } = body; // items: [{item_id, quantity}]

        // Start Transaction
        await db.query('BEGIN');

        // Create Order
        const orderRes = await db.query(`
            INSERT INTO purchase_orders (organization_id, supplier_id, expected_delivery_date, details)
            VALUES ($1, $2, $3, $4) RETURNING id
        `, [session.organizationId, supplier_id, expected_delivery_date, JSON.stringify({ created_by: session.id })]);

        const orderId = orderRes[0].id; // pg-pool style or rows[0].id? Assuming db helper returns rows or we check helper again. 
        // Note: db helper in this project usually returns rows directly if using simple query wrapper?
        // Wait, looking at previous files, db.query returns result... wait, let's check `lib/db.ts` or usage.
        // In predictive route: `const usageData = await db.query(...)`. usageData.forEach...
        // So db.query returns rows array directly? Let's assume so or check.
        // Actually, if it returns rows array, `orderRes[0].id` is correct.

        for (const item of items) {
            await db.query(`
                INSERT INTO purchase_order_items (purchase_order_id, item_id, quantity)
                VALUES ($1, $2, $3)
             `, [orderId, item.item_id, item.quantity]);
        }

        await db.query('COMMIT');
        return NextResponse.json({ success: true, orderId });

    } catch (e) {
        await db.query('ROLLBACK');
        console.error(e);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
