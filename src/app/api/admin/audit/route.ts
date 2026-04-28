import { NextRequest, NextResponse } from 'next/server';
import { db, pool } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { sendEmail, enqueuePendingEmail } from '@/lib/mail';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const canAudit = session.role === 'admin' || (session.permissions as string[]).includes('audit') || (session.permissions as string[]).includes('all');
    if (!canAudit) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });

    const { changes, note, emailReport } = await req.json();
    if (!Array.isArray(changes) || changes.length === 0) return NextResponse.json({ error: 'No changes provided' }, { status: 400 });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Default to org's first location
        const locRes = await client.query('SELECT id FROM locations WHERE organization_id = $1 ORDER BY id ASC LIMIT 1', [session.organizationId]);
        const locationId = locRes.rows[0]?.id;
        if (!locationId) throw new Error('No location found');

        for (const change of changes) {
            const { id, newQty, oldQty } = change;
            const diff = newQty - oldQty;

            await client.query(
                `INSERT INTO inventory (item_id, location_id, quantity, organization_id)
                 VALUES ($1,$2,$3,$4) ON CONFLICT (item_id, location_id) DO UPDATE SET quantity = $3`,
                [id, locationId, newQty, session.organizationId]
            );

            await client.query(
                `INSERT INTO activity_logs (organization_id, user_id, action, details) VALUES ($1,$2,$3,$4)`,
                [session.organizationId, session.id, diff > 0 ? 'ADD_STOCK' : 'SUBTRACT_STOCK',
                    JSON.stringify({ itemId: id, itemName: change.name, quantity: Math.abs(diff), method: 'AUDIT', note: note || '', oldQty, newQty })]
            );
        }

        await client.query('COMMIT');

        // Optional email report
        if (emailReport) {
            try {
                const [orgRow, settingsRows] = await Promise.all([
                    db.one('SELECT name FROM organizations WHERE id = $1', [session.organizationId]),
                    db.query("SELECT value FROM settings WHERE key = 'report_emails' AND organization_id = $1", [session.organizationId]),
                ]);
                const orgName = orgRow?.name || 'TopShelf';
                let recipients: string[] = [];
                try {
                    const val = settingsRows[0]?.value;
                    const parsed = val ? JSON.parse(val) : null;
                    recipients = parsed?.to || (typeof val === 'string' ? val.split(',').map((s: string) => s.trim()) : []);
                } catch {}

                if (recipients.length > 0) {
                    const auditDate = new Date().toLocaleString();
                    const added = changes.filter((c: any) => c.diff > 0);
                    const removed = changes.filter((c: any) => c.diff < 0);
                    const rows = changes.map((c: any) => `
                        <tr>
                            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-weight:500">${c.name}</td>
                            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;color:#64748b">${Number(c.oldQty).toFixed(2)}</td>
                            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600">${Number(c.newQty).toFixed(2)}</td>
                            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700;color:${c.diff > 0 ? '#16a34a' : '#dc2626'}">${c.diff > 0 ? '+' : ''}${Number(c.diff).toFixed(2)}</td>
                        </tr>`).join('');

                    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <tr><td style="background:linear-gradient(135deg,#1e293b,#0f172a);padding:28px 40px">
          <div style="color:#fbbf24;font-weight:700;font-size:14px;margin-bottom:4px">${orgName}</div>
          <div style="color:white;font-weight:700;font-size:20px">Inventory Audit Report</div>
          <div style="color:#94a3b8;font-size:13px;margin-top:4px">${auditDate}${note ? ` · ${note}` : ''}</div>
        </td></tr>
        <tr><td style="padding:12px 40px;background:#f8fafc;border-bottom:1px solid #e2e8f0">
          <span style="color:#64748b;font-size:13px">
            ${changes.length} item${changes.length !== 1 ? 's' : ''} adjusted &nbsp;·&nbsp;
            <span style="color:#16a34a">${added.length} additions</span> &nbsp;·&nbsp;
            <span style="color:#dc2626">${removed.length} reductions</span>
          </span>
        </td></tr>
        <tr><td style="padding:24px 40px">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
            <thead><tr style="background:#f8fafc">
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#64748b;text-transform:uppercase">Item</th>
              <th style="padding:10px 12px;text-align:right;font-size:12px;color:#64748b;text-transform:uppercase">System</th>
              <th style="padding:10px 12px;text-align:right;font-size:12px;color:#64748b;text-transform:uppercase">Counted</th>
              <th style="padding:10px 12px;text-align:right;font-size:12px;color:#64748b;text-transform:uppercase">Diff</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </td></tr>
        <tr><td style="padding:16px 40px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center">
          <p style="margin:0;color:#94a3b8;font-size:12px">TopShelf Inventory Audit Report</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

                    const opts = {
                        to: recipients,
                        subject: `Inventory Audit Report — ${orgName} — ${new Date().toLocaleDateString()}`,
                        html,
                        text: `Inventory Audit\n${auditDate}\n\n${changes.map((c: any) => `${c.name}: ${c.oldQty} → ${c.newQty} (${c.diff > 0 ? '+' : ''}${c.diff})`).join('\n')}`,
                    };
                    const ctx = { emailType: 'manual' as const, organizationId: session.organizationId, orgName, scheduled: false };
                    const pendingId = await enqueuePendingEmail('reporting', opts, ctx);
                    await sendEmail('reporting', opts, ctx, pendingId ?? undefined);
                }
            } catch (e) {
                console.error('[audit] email failed:', e);
            }
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Audit Error:', e);
        return NextResponse.json({ error: 'Audit Failed' }, { status: 500 });
    } finally {
        client.release();
    }
}
