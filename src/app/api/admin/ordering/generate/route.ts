import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import { sendSMS } from '@/lib/twilio';
import { sendEmail } from '@/lib/mail';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const organizationId = session.organizationId;

        // 1. Get Settings
        const org = await db.one('SELECT ai_ordering_config, sms_enabled FROM organizations WHERE id = $1', [organizationId]);
        const config = org.ai_ordering_config ? JSON.parse(org.ai_ordering_config) : {};

        if (!config.enabled) {
            return NextResponse.json({ message: 'Automation is disabled' });
        }

        // 2. Logic to find what to order (Mocked for now)
        // Find a supplier enabled in config
        const enabledSupplierIds = config.supplier_ids || [];
        if (enabledSupplierIds.length === 0) return NextResponse.json({ message: 'No suppliers enabled' });

        const supplierId = enabledSupplierIds[0];
        const supplier = await db.one('SELECT name FROM suppliers WHERE id = $1', [supplierId]);

        // Mock items
        const mockItems = [
            { id: 101, name: 'Mock Item A', quantity: 12 },
            { id: 102, name: 'Mock Item B', quantity: 6 }
        ];

        // 3. Create Pending Order
        const token = uuidv4();
        await db.execute(
            `INSERT INTO pending_orders (token, organization_id, supplier_id, items_json, status) VALUES ($1, $2, $3, $4, 'pending')`,
            [token, organizationId, supplierId, JSON.stringify(mockItems)]
        );

        const approvalLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/orders/${token}`;

        // 4. Send Confirmation if required
        if (config.require_confirmation) {
            const ccUserIds: number[] = config.cc_user_ids || [];

            // Fetch email addresses for CC users
            let emailRecipients: string[] = [];
            if (ccUserIds.length > 0) {
                const ccUsers = await db.query(
                    'SELECT email FROM users WHERE id = ANY($1) AND organization_id = $2 AND email IS NOT NULL',
                    [ccUserIds, organizationId]
                );
                emailRecipients = ccUsers.map((u: any) => u.email).filter(Boolean);
            }

            // Fall back to the requesting admin if no CC users configured
            if (emailRecipients.length === 0 && session.email) {
                emailRecipients = [session.email];
            }

            if (emailRecipients.length > 0) {
                const itemListHtml = mockItems.map(i =>
                    `<tr><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9">${i.name}</td><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:700">${i.quantity}</td></tr>`
                ).join('');

                const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
                const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <tr><td style="background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);padding:32px 48px">
          <h1 style="margin:0;color:white;font-size:20px;font-weight:700">TopShelf Inventory</h1>
          <p style="margin:6px 0 0;color:#94a3b8;font-size:14px">Automated Order Requires Approval</p>
        </td></tr>
        <tr><td style="padding:40px 48px">
          <h2 style="margin:0 0 16px;color:#0f172a;font-size:18px">Order Approval Required</h2>
          <p style="color:#475569;margin:0 0 24px">A new automated order has been generated for <strong>${supplier.name}</strong> and requires your approval before being sent.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px">
            <thead><tr style="background:#f8fafc"><th style="padding:8px 12px;text-align:left;color:#64748b;font-size:12px;text-transform:uppercase">Item</th><th style="padding:8px 12px;text-align:center;color:#64748b;font-size:12px;text-transform:uppercase">Qty</th></tr></thead>
            <tbody>${itemListHtml}</tbody>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
            <a href="${approvalLink}" style="display:inline-block;background:#10b981;color:white;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:16px;font-weight:700">Approve Order</a>
          </td></tr></table>
          <p style="color:#94a3b8;font-size:12px;text-align:center;margin:16px 0 0">Or copy this link: ${approvalLink}</p>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:20px 48px;border-top:1px solid #e2e8f0;text-align:center">
          <p style="margin:0;color:#94a3b8;font-size:12px">TopShelf Inventory — Automated Ordering</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

                await sendEmail('admin', {
                    to: emailRecipients,
                    subject: `Order Approval Required — ${supplier.name}`,
                    html,
                    text: `An automated order for ${supplier.name} requires your approval.\n\nApprove here: ${approvalLink}`,
                });
            }

            // SMS if enabled
            if (org.sms_enabled) {
                console.log(`[SMS MOCK] Sending link to CC users: ${approvalLink}`);
            }
        }

        return NextResponse.json({ success: true, link: approvalLink, message: 'Order generated successfully' });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
