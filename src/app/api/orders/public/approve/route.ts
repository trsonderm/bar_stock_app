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

            // 3. Trigger Email Sending (Stub)
            console.log('--- SENT EMAIL TO SUPPLIER ---');
            console.log('Items:', finalItems);

            // 4. Trigger SMS to Supplier? (Optional feature: "text delivery of the link to phone numbers added in user accounts") 
            // Wait, the user said "add a text delivery of the link to phone numbers added in user accounts that show the order items and the same link to approve edit decline" 
            // -> This sends the link TO THE USER (manager) for approval.
            // Once approved, we send order to supplier via EMAIL (usually). 
            // If we also text the supplier, we'd need their mobile. 
            // Prompt says "order email or text confirmations should come on the days teh suppliers are selected."
            // Assuming "Sent" means email to supplier.

            return NextResponse.json({ success: true, status: 'sent' });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
