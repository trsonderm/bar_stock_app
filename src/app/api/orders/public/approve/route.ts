/**
 * POST /api/orders/public/approve
 *
 * Public (token-authenticated) approve or decline of a pending automated order.
 * Body: { token, action: 'approve' | 'decline', items }. Sending the approved
 * order to the supplier is not implemented yet.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
// import { sendEmail } from '@/lib/email'; // Assume exists or we stub it
// import { sendSMS } from '@/lib/twilio'; // To be implemented

export async function POST(req: NextRequest) {
    const { token, items, action } = await req.json(); // action: 'approve' | 'decline'

    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

    try {
        const order = await db.one('SELECT * FROM pending_orders WHERE token = $1', [token]);
        if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

        if (order.status !== 'pending') {
            return NextResponse.json({ error: 'Order already processed' }, { status: 400 });
        }

        if (action === 'decline') {
            await db.execute("UPDATE pending_orders SET status = 'declined' WHERE id = $1", [order.id]);
            return NextResponse.json({ success: true, status: 'declined' });
        }

        if (action === 'approve') {
            // 1. Update items with edited versions
            const finalItems = items || []; // Validation needed?

            // 2. Mark Sent
            await db.execute(
                "UPDATE pending_orders SET status = 'sent', items_json = $1 WHERE id = $2",
                [JSON.stringify(finalItems), order.id]
            );

            // TODO: deliver the approved order to the supplier (email and/or SMS).
            // Only the status change is implemented so far.
            console.log(`[orders/approve] Order ${order.id} approved with ${finalItems.length} items (supplier delivery not implemented)`);

            return NextResponse.json({ success: true, status: 'sent' });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
