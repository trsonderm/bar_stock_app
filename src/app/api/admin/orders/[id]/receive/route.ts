import { NextRequest, NextResponse } from 'next/server';
import { db, pool } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { sendEmail } from '@/lib/mail';
import { logActivity } from '@/lib/logger';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await getSession();
    if (!session || !session.organizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const canReceive = session.role === 'admin' || session.permissions?.includes('add_stock') || session.permissions?.includes('all');
    if (!canReceive) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const orderId = parseInt(params.id);
    const { receivedItems } = await req.json();
    // receivedItems: [{ purchase_order_item_id, item_id, item_name, ordered_qty, received_qty }]

    if (!receivedItems || !Array.isArray(receivedItems)) {
        return NextResponse.json({ error: 'Missing receivedItems' }, { status: 400 });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Validate order belongs to org
        const orderRows = await client.query(
            `SELECT id, tracking_status, status, organization_id FROM purchase_orders WHERE id = $1 AND organization_id = $2`,
            [orderId, session.organizationId]
        );
        if (!orderRows.rows || orderRows.rows.length === 0) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        // Get current location for inventory updates
        const locRes = await client.query(
            `SELECT id FROM locations WHERE organization_id = $1 ORDER BY id ASC LIMIT 1`,
            [session.organizationId]
        );
        const locationId = locRes.rows[0]?.id;
        if (!locationId) throw new Error('No location found');

        for (const ri of receivedItems) {
            const qty = Math.max(0, parseInt(ri.received_qty) || 0);

            // Update the order item received quantity
            await client.query(
                `UPDATE purchase_order_items
                 SET received_quantity = $1, confirmed_at = NOW()
                 WHERE id = $2 AND purchase_order_id = $3`,
                [qty, ri.purchase_order_item_id, orderId]
            );

            // Update inventory if qty > 0
            if (qty > 0) {
                const invRes = await client.query(
                    `SELECT quantity FROM inventory WHERE item_id = $1 AND location_id = $2`,
                    [ri.item_id, locationId]
                );
                const oldQty = invRes.rows[0]?.quantity ?? 0;
                const newQty = parseFloat(oldQty) + qty;

                await client.query(`
                    INSERT INTO inventory (item_id, location_id, quantity, organization_id)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (item_id, location_id) DO UPDATE SET quantity = $3
                `, [ri.item_id, locationId, newQty, session.organizationId]);

                // Log activity
                await client.query(`
                    INSERT INTO activity_logs (organization_id, user_id, action, details)
                    VALUES ($1, $2, 'ADD_STOCK', $3)
                `, [
                    session.organizationId,
                    session.id,
                    JSON.stringify({
                        itemId: ri.item_id,
                        itemName: ri.item_name,
                        quantity: qty,
                        method: 'ORDER_RECEIVE',
                        orderId,
                        oldQty: parseFloat(oldQty),
                        newQty
                    })
                ]);
            }
        }

        // Mark order as received
        await client.query(
            `UPDATE purchase_orders
             SET tracking_status = 'RECEIVED', status = 'DELIVERED', confirmed_by = $1, confirmed_at = NOW()
             WHERE id = $2`,
            [session.id, orderId]
        );

        await client.query('COMMIT');

        // Send email notifications to order_confirmation_recipients setting
        try {
            const settingRows = await db.query(
                `SELECT value FROM settings WHERE organization_id = $1 AND key = 'order_confirmation_recipients'`,
                [session.organizationId]
            );
            let recipientIds: number[] = [];
            if (settingRows && settingRows.length > 0) {
                try { recipientIds = JSON.parse(settingRows[0].value); } catch {}
            }

            if (recipientIds.length > 0) {
                const usersRows = await db.query(
                    `SELECT email, first_name FROM users WHERE id = ANY($1::int[]) AND email IS NOT NULL`,
                    [recipientIds]
                );

                if (usersRows && usersRows.length > 0) {
                    const emails = usersRows.map((u: any) => u.email).filter(Boolean);

                    // Build email table
                    const tableRows = receivedItems.map((ri: any) => {
                        const ordered = ri.ordered_qty;
                        const received = Math.max(0, parseInt(ri.received_qty) || 0);
                        const variance = received - ordered;
                        const varColor = variance < 0 ? '#ef4444' : variance > 0 ? '#10b981' : '#6b7280';
                        return `<tr>
                            <td style="padding:8px;border-bottom:1px solid #374151;">${ri.item_name}</td>
                            <td style="padding:8px;border-bottom:1px solid #374151;text-align:center;">${ordered}</td>
                            <td style="padding:8px;border-bottom:1px solid #374151;text-align:center;">${received}</td>
                            <td style="padding:8px;border-bottom:1px solid #374151;text-align:center;color:${varColor};">${variance >= 0 ? '+' : ''}${variance}</td>
                        </tr>`;
                    }).join('');

                    const html = `
                    <div style="font-family:sans-serif;background:#111827;color:#e5e7eb;padding:24px;border-radius:8px;">
                        <h2 style="color:#fbbf24;">Order #${orderId} Confirmed Received</h2>
                        <p>Confirmed by: <strong>${session.firstName || 'Admin'}</strong></p>
                        <p>Confirmed at: <strong>${new Date().toLocaleString()}</strong></p>
                        <table style="width:100%;border-collapse:collapse;margin-top:16px;">
                            <thead>
                                <tr style="background:#1f2937;">
                                    <th style="padding:8px;text-align:left;">Item</th>
                                    <th style="padding:8px;text-align:center;">Expected</th>
                                    <th style="padding:8px;text-align:center;">Received</th>
                                    <th style="padding:8px;text-align:center;">Variance</th>
                                </tr>
                            </thead>
                            <tbody>${tableRows}</tbody>
                        </table>
                    </div>`;

                    await sendEmail('notifications', {
                        to: emails,
                        subject: `Order #${orderId} Received — TopShelf`,
                        html
                    });
                }
            }
        } catch (emailErr) {
            console.error('Order confirmation email error:', emailErr);
            // Don't fail the request over email errors
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Order receive error:', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    } finally {
        client.release();
    }
}
