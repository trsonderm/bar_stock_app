import { NextRequest, NextResponse } from 'next/server';
import { pool, db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { sendEmail, enqueuePendingEmail } from '@/lib/mail';

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const organizationId = session.organizationId;
        const { itemId, change, locationId, bottleLevel } = await req.json();

        if (!itemId || change === undefined || change === null || change === 0) {
            return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
        }

        if (change > 0) {
            const canAddStock = session.role === 'admin' || session.permissions.includes('add_stock') || session.permissions.includes('all');
            if (!canAddStock) return NextResponse.json({ error: 'Permission denied: Add Stock' }, { status: 403 });
        }

        const action = change > 0 ? 'ADD_STOCK' : 'SUBTRACT_STOCK';

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Verify item belongs to this organization
            const itemRes = await client.query(
                `SELECT name FROM items WHERE id = $1 AND organization_id = $2`,
                [itemId, organizationId]
            );
            const item = itemRes.rows[0];
            if (!item) {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: 'Item not found in this organization' }, { status: 404 });
            }

            // Determine target location: payload > cookie > first location
            let targetLocationId: number | null = locationId ? parseInt(locationId) : null;

            if (!targetLocationId) {
                const cookieLoc = req.cookies.get('current_location_id')?.value;
                if (cookieLoc) {
                    const parsed = parseInt(cookieLoc);
                    if (!isNaN(parsed)) targetLocationId = parsed;
                }
            }

            if (targetLocationId) {
                const locRes = await client.query(
                    'SELECT id FROM locations WHERE id = $1 AND organization_id = $2',
                    [targetLocationId, organizationId]
                );
                if (!locRes.rows[0]) targetLocationId = null;
            }

            if (!targetLocationId) {
                const anyLoc = await client.query(
                    'SELECT id FROM locations WHERE organization_id = $1 ORDER BY id ASC LIMIT 1',
                    [organizationId]
                );
                if (!anyLoc.rows[0]) {
                    await client.query('ROLLBACK');
                    return NextResponse.json({ error: 'No location found for this organization' }, { status: 400 });
                }
                targetLocationId = anyLoc.rows[0].id;
            }

            // Upsert inventory row — ON CONFLICT DO NOTHING avoids race condition on rapid taps
            await client.query(
                `INSERT INTO inventory (item_id, location_id, quantity, organization_id)
                 VALUES ($1, $2, 0, $3)
                 ON CONFLICT (item_id, location_id) DO NOTHING`,
                [itemId, targetLocationId, organizationId]
            );

            // Update quantity — do NOT filter by organization_id; UNIQUE(item_id, location_id)
            // guarantees there is exactly one row to update regardless of which org owns it
            const updateRes = await client.query(
                `UPDATE inventory
                 SET quantity = GREATEST(0, quantity + $1), organization_id = $4
                 WHERE item_id = $2 AND location_id = $3
                 RETURNING quantity`,
                [change, itemId, targetLocationId, organizationId]
            );

            if (!updateRes.rows[0]) {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: 'Failed to update inventory' }, { status: 500 });
            }
            const newQuantity = updateRes.rows[0].quantity;

            // Activity log
            const logRes = await client.query(
                `INSERT INTO activity_logs (organization_id, user_id, action, details)
                 VALUES ($1, $2, $3, $4) RETURNING id`,
                [organizationId, session.id, action, JSON.stringify({
                    itemId,
                    itemName: item.name,
                    change: Math.abs(change),
                    quantity: Math.abs(change),
                    quantityAfter: newQuantity,
                    locationId: targetLocationId,
                    bottleLevel
                })]
            );

            // Bottle level log (optional, non-fatal)
            if (bottleLevel && logRes.rows[0]) {
                try {
                    await client.query(
                        'INSERT INTO bottle_level_logs (activity_log_id, option_label, user_id) VALUES ($1, $2, $3)',
                        [logRes.rows[0].id, bottleLevel, session.id]
                    );
                } catch (e) {
                    console.warn('Could not insert bottle level log', e);
                }
            }

            await client.query('COMMIT');

            // Fire audit alert email if configured (non-fatal)
            try {
                const auditSettings = await db.query(`
                    SELECT key, value FROM settings
                    WHERE organization_id = $1
                      AND key IN ('audit_alert_enabled','audit_alert_emails','audit_alert_actions')
                `, [organizationId]);
                const sm: Record<string, string> = {};
                auditSettings.forEach((r: any) => sm[r.key] = r.value);

                if (sm.audit_alert_enabled === 'true') {
                    const triggerOn = sm.audit_alert_actions || 'both';
                    const shouldTrigger =
                        triggerOn === 'both' ||
                        (triggerOn === 'add' && action === 'ADD_STOCK') ||
                        (triggerOn === 'subtract' && action === 'SUBTRACT_STOCK');

                    if (shouldTrigger) {
                        let recipients: string[] = [];
                        try {
                            const parsed = sm.audit_alert_emails ? JSON.parse(sm.audit_alert_emails) : null;
                            if (parsed?.to) recipients = parsed.to;
                            else if (sm.audit_alert_emails) recipients = sm.audit_alert_emails.split(',').map((e: string) => e.trim()).filter(Boolean);
                        } catch { }

                        if (recipients.length > 0) {
                            const org = await db.one('SELECT name FROM organizations WHERE id = $1', [organizationId]);
                            const orgName = org?.name || 'TopShelf';
                            const actionLabel = action === 'ADD_STOCK' ? 'Stock Added' : 'Stock Removed';
                            const qtyLabel = action === 'ADD_STOCK' ? `+${Math.abs(change)}` : `-${Math.abs(change)}`;
                            const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.topshelfinventory.com';
                            const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <tr>
          <td style="background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);padding:24px 36px">
            <div style="color:#fbbf24;font-weight:700;font-size:13px;margin-bottom:4px">${orgName}</div>
            <div style="color:white;font-weight:700;font-size:18px">${actionLabel} — Audit Alert</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 36px">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:6px 0;color:#6b7280;font-size:14px">Item</td><td style="padding:6px 0;font-weight:600;font-size:14px;text-align:right">${item.name}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280;font-size:14px">Change</td><td style="padding:6px 0;font-weight:700;font-size:14px;text-align:right;color:${action === 'ADD_STOCK' ? '#10b981' : '#ef4444'}">${qtyLabel}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280;font-size:14px">New Quantity</td><td style="padding:6px 0;font-weight:600;font-size:14px;text-align:right">${newQuantity}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280;font-size:14px">Staff</td><td style="padding:6px 0;font-size:14px;text-align:right">${session.firstName || ''} ${session.lastName || ''}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280;font-size:14px">Time</td><td style="padding:6px 0;font-size:13px;text-align:right;color:#9ca3af">${new Date().toLocaleString()}</td></tr>
            </table>
            <p style="margin:24px 0 0;text-align:center">
              <a href="${appUrl}/inventory" style="background:#1d4ed8;color:white;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:600;display:inline-block">View Inventory</a>
            </p>
          </td>
        </tr>
        <tr><td style="background:#f8fafc;padding:14px 36px;border-top:1px solid #e2e8f0;text-align:center">
          <p style="margin:0;color:#9ca3af;font-size:11px">TopShelf Inventory &bull; <a href="${appUrl}/admin/settings/reporting" style="color:#9ca3af">Manage Alerts</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
                            const opts = { to: recipients, subject: `[${orgName}] ${actionLabel}: ${item.name} (${qtyLabel})`, html, text: `${actionLabel}\nItem: ${item.name}\nChange: ${qtyLabel}\nNew Qty: ${newQuantity}\nStaff: ${session.firstName || ''} ${session.lastName || ''}` };
                            const ctx = { emailType: 'manual' as const, organizationId, orgName };
                            const pid = await enqueuePendingEmail('reporting', opts, ctx);
                            await sendEmail('reporting', opts, ctx, pid ?? undefined);
                        }
                    }
                }
            } catch (alertErr) {
                console.error('[adjust] Audit alert email error:', alertErr);
            }

            return NextResponse.json({ success: true });

        } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            throw err;
        } finally {
            client.release();
        }

    } catch (error: any) {
        console.error('Inventory Adjust Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Error' }, { status: 500 });
    }
}
