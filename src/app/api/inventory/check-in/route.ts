import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const body = await req.json();
        const { order_id, check_in_items } = body; 
        // check_in_items expected as: [{ item_id: int, received_qty: number, expected_qty: number }]

        await db.query('BEGIN');

        let varianceTracker = [];

        for (const item of check_in_items) {
            // Update the inventory
            if (item.received_qty > 0) {
                 await db.query(`
                    UPDATE inventory 
                    SET quantity = quantity + $1 
                    WHERE item_id = $2 AND organization_id = $3
                 `, [item.received_qty, item.item_id, session.organizationId]);

                 // Log Activity
                 await db.query(`
                    INSERT INTO activity_logs (organization_id, user_id, action, details)
                    VALUES ($1, $2, 'CHECK_IN', $3)
                 `, [session.organizationId, session.id, JSON.stringify({ item_id: item.item_id, added: item.received_qty, order_id })]);
            }

            // Record Variance
            if (item.received_qty !== item.expected_qty) {
                varianceTracker.push({
                    item_id: item.item_id,
                    expected: item.expected_qty,
                    received: item.received_qty,
                    difference: item.received_qty - item.expected_qty
                });
            }
        }

        // Pull existing details to amend variance payload
        const orderRes = await db.query('SELECT details FROM purchase_orders WHERE id = $1 AND organization_id = $2', [order_id, session.organizationId]);
        let details = orderRes[0]?.details || {};
        details.check_in_variance = varianceTracker;
        details.checked_in_by = session.id;
        details.checked_in_at = new Date().toISOString();

        // Mark as Delivered
        await db.query(`
            UPDATE purchase_orders 
            SET status = 'DELIVERED', details = $1
            WHERE id = $2 AND organization_id = $3
        `, [JSON.stringify(details), order_id, session.organizationId]);

        await db.query('COMMIT');
        return NextResponse.json({ success: true, variance: varianceTracker });

    } catch (e) {
        await db.query('ROLLBACK');
        console.error(e);
        return NextResponse.json({ error: 'Check-In Engine Failed' }, { status: 500 });
    }
}
