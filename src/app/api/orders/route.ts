/**
 * POST /api/orders
 *
 * Creates a purchase order with its line items.
 * Body: { supplier_id, location_id?, expected_delivery_date, items: [{ item_id, quantity }],
 *         send_email?, send_sms? }
 *
 * The order and its items are written in one transaction; the supplier is
 * then optionally notified by email and/or SMS.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { sendEmail } from '@/lib/mail';
import { sendSMS } from '@/lib/twilio';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const body = await req.json();
        const { supplier_id, expected_delivery_date, items, send_email, send_sms, location_id } = body;
        const orgId = session.organizationId;

        if (!Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: 'No items in order' }, { status: 400 });
        }

        // Every referenced record must belong to the caller's organization.
        if (supplier_id && !(await db.one('SELECT id FROM suppliers WHERE id = $1 AND organization_id = $2', [supplier_id, orgId]))) {
            return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
        }
        if (location_id && !(await db.one('SELECT id FROM locations WHERE id = $1 AND organization_id = $2', [location_id, orgId]))) {
            return NextResponse.json({ error: 'Location not found' }, { status: 404 });
        }
        const itemIds = items.map((i: any) => Number(i.item_id));
        const owned = await db.query('SELECT id FROM items WHERE id = ANY($1::int[]) AND organization_id = $2', [itemIds, orgId]);
        if (owned.length !== new Set(itemIds).size) {
            return NextResponse.json({ error: 'Some items not found' }, { status: 404 });
        }

        const orderId = await db.transaction(async (tx) => {
            const order = await tx.one(`
                INSERT INTO purchase_orders (organization_id, supplier_id, location_id, expected_delivery_date, details)
                VALUES ($1, $2, $3, $4, $5) RETURNING id
            `, [orgId, supplier_id, location_id || null, expected_delivery_date, JSON.stringify({ created_by: session.id })]);

            for (const item of items) {
                await tx.execute(`
                    INSERT INTO purchase_order_items (purchase_order_id, item_id, quantity)
                    VALUES ($1, $2, $3)
                `, [order.id, item.item_id, item.quantity]);
            }

            return order.id as number;
        });

        // Post-commit: notify the supplier
        if ((send_email || send_sms) && supplier_id) {
            const supplier = await db.one('SELECT name, contact_email, contact_phone FROM suppliers WHERE id = $1', [supplier_id]);
            const orderTotalItems = items.reduce((acc: number, i: any) => acc + i.quantity, 0);

            if (supplier) {
                const messageBody = `New Order from TopShelf. Order ID: #${orderId}. Total Items requested: ${orderTotalItems}. Please check your portal or email for details.`;

                if (send_sms && supplier.contact_phone) {
                    await sendSMS(supplier.contact_phone, messageBody);
                }

                if (send_email && supplier.contact_email) {
                    await sendEmail('admin', {
                        to: supplier.contact_email,
                        subject: `New Purchase Order #${orderId}`,
                        text: messageBody,
                    });
                }
            }
        }

        return NextResponse.json({ success: true, orderId });

    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
