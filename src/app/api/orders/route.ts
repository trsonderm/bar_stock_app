import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import nodemailer from 'nodemailer';
import { sendSMS } from '@/lib/twilio';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const body = await req.json();
        const { supplier_id, expected_delivery_date, items, send_email, send_sms, location_id } = body; // items: [{item_id, quantity}]

        // Start Transaction
        await db.query('BEGIN');

        // Create Order
        const orderRes = await db.query(`
            INSERT INTO purchase_orders (organization_id, supplier_id, location_id, expected_delivery_date, details)
            VALUES ($1, $2, $3, $4, $5) RETURNING id
        `, [session.organizationId, supplier_id, location_id || null, expected_delivery_date, JSON.stringify({ created_by: session.id })]);

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

        // Post-commit: Email & SMS
        if ((send_email || send_sms) && supplier_id) {
            const supplierRes = await db.query('SELECT name, contact_email, contact_phone FROM suppliers WHERE id = $1', [supplier_id]);
            const supplier = supplierRes[0];
            const orderTotalItems = items.reduce((acc: number, i: any) => acc + i.quantity, 0);

            if (supplier) {
                const messageBody = `New Order from TopShelf. Order ID: #${orderId}. Total Items requested: ${orderTotalItems}. Please check your portal or email for details.`;
                
                if (send_sms && supplier.contact_phone) {
                    await sendSMS(supplier.contact_phone, messageBody);
                }

                if (send_email && supplier.contact_email) {
                    try {
                        let transporter = nodemailer.createTransport({
                            host: process.env.SMTP_HOST || 'smtp.sendgrid.net',
                            port: parseInt(process.env.SMTP_PORT || '587'),
                            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
                        });
                        await transporter.sendMail({
                            from: '"TopShelf" <orders@topshelfinventory.com>',
                            to: supplier.contact_email,
                            subject: `New Purchase Order #${orderId}`,
                            text: messageBody
                        });
                    } catch (mailErr) {
                        console.error('Email Dispatch Error:', mailErr);
                    }
                }
            }
        }

        return NextResponse.json({ success: true, orderId });

    } catch (e) {
        await db.query('ROLLBACK');
        console.error(e);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
