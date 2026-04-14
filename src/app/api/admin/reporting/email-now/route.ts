import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { sendEmail } from '@/lib/mail';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.organizationId;
    const body = await req.json();
    const { reportType, date } = body;

    try {
        // Get org report settings
        const settingsRows = await db.query(
            `SELECT key, value FROM settings WHERE organization_id = $1 AND key IN ('report_emails','report_title','low_stock_threshold','use_global_low_stock')`,
            [organizationId]
        );
        const settings: Record<string, string> = {};
        settingsRows.forEach((r: any) => { settings[r.key] = r.value; });

        // Parse recipients
        let recipients: string[] = [];
        const rawEmails = settings.report_emails || '';
        try {
            const parsed = JSON.parse(rawEmails);
            if (parsed.to) recipients = [...recipients, ...parsed.to];
            if (parsed.cc) recipients = [...recipients, ...parsed.cc];
        } catch {
            recipients = rawEmails.split(',').map((e: string) => e.trim()).filter(Boolean);
        }

        if (recipients.length === 0) {
            return NextResponse.json({ error: 'No report recipients configured. Please add recipients in Report Settings.' }, { status: 400 });
        }

        const reportTitle = settings.report_title || 'Report';
        const orgRow = await db.one('SELECT name FROM organizations WHERE id = $1', [organizationId]);
        const orgName = orgRow?.name || 'Your Organization';

        let html = '';
        let subject = '';

        if (reportType === 'daily') {
            const targetDate = date || new Date().toISOString().split('T')[0];
            // Fetch daily report data via internal logic
            const windowStart = new Date(targetDate);
            windowStart.setHours(6, 0, 0, 0);
            const windowEnd = new Date(targetDate);
            windowEnd.setDate(windowEnd.getDate() + 1);
            windowEnd.setHours(6, 0, 0, 0);

            const logs = await db.query(`
                SELECT al.user_id, CONCAT(u.first_name, ' ', u.last_name) as user_name,
                       (al.details->>'itemId')::int as item_id,
                       al.details->>'itemName' as item_name,
                       (al.details->>'quantity')::numeric as quantity,
                       al.action
                FROM activity_logs al
                LEFT JOIN users u ON al.user_id = u.id
                WHERE al.organization_id = $1
                  AND (al.action = 'SUBTRACT_STOCK' OR al.action = 'ADD_STOCK')
                  AND al.timestamp >= $2 AND al.timestamp <= $3
            `, [organizationId, windowStart.toISOString(), windowEnd.toISOString()]);

            const itemIds = [...new Set(logs.map((l: any) => l.item_id).filter(Boolean))];
            const itemCosts: Record<number, number> = {};
            if (itemIds.length > 0) {
                const items = await db.query('SELECT id, unit_cost FROM items WHERE id = ANY($1) AND organization_id = $2', [itemIds, organizationId]);
                items.forEach((i: any) => { itemCosts[i.id] = Number(i.unit_cost || 0); });
            }

            const usageByItem: Record<string, { name: string, qty: number, cost: number }> = {};
            let totalUsageCost = 0;

            logs.forEach((log: any) => {
                if (log.action !== 'SUBTRACT_STOCK') return;
                const qty = Number(log.quantity);
                const cost = (itemCosts[log.item_id] || 0) * qty;
                const key = log.item_name || String(log.item_id);
                if (!usageByItem[key]) usageByItem[key] = { name: key, qty: 0, cost: 0 };
                usageByItem[key].qty += qty;
                usageByItem[key].cost += cost;
                totalUsageCost += cost;
            });

            const topItems = Object.values(usageByItem).sort((a, b) => b.cost - a.cost).slice(0, 15);
            const itemRows = topItems.map(i =>
                `<tr><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#1e293b">${i.name}</td><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:center">${i.qty.toFixed(1)}</td><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;color:#d97706;font-weight:600">$${i.cost.toFixed(2)}</td></tr>`
            ).join('');

            subject = `${reportTitle} — ${targetDate}`;
            html = buildEmailHtml(orgName, subject, `
                <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 24px;margin-bottom:24px;display:flex;gap:32px">
                    <div><div style="font-size:13px;color:#6b7280;text-transform:uppercase;font-weight:600">Total Usage Cost</div><div style="font-size:28px;font-weight:700;color:#0f172a">$${totalUsageCost.toFixed(2)}</div></div>
                    <div><div style="font-size:13px;color:#6b7280;text-transform:uppercase;font-weight:600">Items Moved</div><div style="font-size:28px;font-weight:700;color:#0f172a">${logs.filter((l: any) => l.action === 'SUBTRACT_STOCK').length}</div></div>
                </div>
                <h3 style="margin:0 0 12px;color:#0f172a;font-size:15px;font-weight:600">Top Items Used</h3>
                <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
                    <thead><tr style="background:#f8fafc"><th style="padding:8px 12px;text-align:left;color:#64748b;font-size:12px;text-transform:uppercase">Item</th><th style="padding:8px 12px;text-align:center;color:#64748b;font-size:12px;text-transform:uppercase">Qty</th><th style="padding:8px 12px;text-align:right;color:#64748b;font-size:12px;text-transform:uppercase">Cost</th></tr></thead>
                    <tbody>${itemRows || '<tr><td colspan="3" style="padding:16px;text-align:center;color:#9ca3af">No usage recorded for this date.</td></tr>'}</tbody>
                </table>
            `);
        } else if (reportType === 'smart-order') {
            // Fetch low-stock / predictive summary
            const lowStockItems = await db.query(`
                SELECT i.name, i.type, i.low_stock_threshold,
                       COALESCE(SUM(inv.quantity), 0) as current_stock
                FROM items i
                LEFT JOIN inventory inv ON i.id = inv.item_id
                WHERE i.organization_id = $1
                GROUP BY i.id, i.name, i.type, i.low_stock_threshold
                HAVING COALESCE(SUM(inv.quantity), 0) <= COALESCE(i.low_stock_threshold, 5)
                ORDER BY current_stock ASC
                LIMIT 25
            `, [organizationId]);

            const itemRows = lowStockItems.map((i: any) =>
                `<tr><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#1e293b;font-weight:500">${i.name}</td><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:center;color:#dc2626;font-weight:700">${Number(i.current_stock).toFixed(1)}</td><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:center;color:#9ca3af">${i.low_stock_threshold || 5}</td></tr>`
            ).join('');

            subject = `Smart Order Report — ${new Date().toLocaleDateString()}`;
            html = buildEmailHtml(orgName, subject, `
                <p style="color:#475569;margin:0 0 20px">The following items are below their low stock threshold and may need to be ordered.</p>
                <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
                    <thead><tr style="background:#fef2f2"><th style="padding:8px 12px;text-align:left;color:#64748b;font-size:12px;text-transform:uppercase">Item</th><th style="padding:8px 12px;text-align:center;color:#64748b;font-size:12px;text-transform:uppercase">Current Stock</th><th style="padding:8px 12px;text-align:center;color:#64748b;font-size:12px;text-transform:uppercase">Threshold</th></tr></thead>
                    <tbody>${itemRows || '<tr><td colspan="3" style="padding:16px;text-align:center;color:#9ca3af">No low stock items detected.</td></tr>'}</tbody>
                </table>
            `);
        } else if (reportType === 'bottle-levels') {
            // Last 7 days of bottle level data
            const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
            const logs = await db.query(`
                SELECT DATE(al.timestamp) as log_date,
                       al.details->>'level' as level,
                       COUNT(*) as count
                FROM activity_logs al
                WHERE al.organization_id = $1
                  AND al.action = 'CHECK_IN'
                  AND al.timestamp >= $2
                  AND al.details->>'level' IS NOT NULL
                GROUP BY DATE(al.timestamp), al.details->>'level'
                ORDER BY log_date DESC, level
            `, [organizationId, sevenDaysAgo]);

            const byDate: Record<string, Record<string, number>> = {};
            logs.forEach((r: any) => {
                if (!byDate[r.log_date]) byDate[r.log_date] = {};
                byDate[r.log_date][r.level] = Number(r.count);
            });

            const dates = Object.keys(byDate).sort().reverse();
            const allLevels = ['0-25%', '25-50%', '50-75%', '75-100%'];

            const tableRows = dates.map(d =>
                `<tr><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-weight:600">${d}</td>${allLevels.map(l => `<td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:center">${byDate[d][l] || '-'}</td>`).join('')}</tr>`
            ).join('');

            subject = `Bottle Levels Report — ${new Date().toLocaleDateString()}`;
            html = buildEmailHtml(orgName, subject, `
                <p style="color:#475569;margin:0 0 20px">Bottle level check-ins for the past 7 days.</p>
                <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
                    <thead><tr style="background:#f8fafc"><th style="padding:8px 12px;text-align:left;color:#64748b;font-size:12px">Date</th>${allLevels.map(l => `<th style="padding:8px 12px;text-align:center;color:#64748b;font-size:12px">${l}</th>`).join('')}</tr></thead>
                    <tbody>${tableRows || '<tr><td colspan="5" style="padding:16px;text-align:center;color:#9ca3af">No data recorded recently.</td></tr>'}</tbody>
                </table>
            `);
        } else {
            return NextResponse.json({ error: 'Unknown report type' }, { status: 400 });
        }

        const sent = await sendEmail('reporting', { to: recipients, subject, html });
        if (!sent) {
            return NextResponse.json({ error: 'Email delivery failed. Check the Reporting mail account in Super Admin → Mail Accounts.' }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: `Report sent to ${recipients.length} recipient${recipients.length !== 1 ? 's' : ''}.` });
    } catch (e: any) {
        console.error('[email-now] Error:', e);
        return NextResponse.json({ error: 'Failed to send report: ' + e.message }, { status: 500 });
    }
}

function buildEmailHtml(orgName: string, title: string, body: string): string {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.topshelfinventory.com';
    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px">
    <tr><td align="center">
      <table width="660" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <tr>
          <td style="background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);padding:32px 48px">
            <h1 style="margin:0;color:white;font-size:20px;font-weight:700">TopShelf Inventory</h1>
            <p style="margin:6px 0 0;color:#94a3b8;font-size:14px">${orgName}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 48px">
            <h2 style="margin:0 0 24px;color:#0f172a;font-size:18px;font-weight:600">${title}</h2>
            <p style="margin:0 0 24px;color:#64748b;font-size:13px">Generated: ${new Date().toLocaleString()}</p>
            ${body}
            <p style="margin:32px 0 0;text-align:center">
              <a href="${appUrl}/admin/reports" style="background:#d97706;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600">View Full Reports</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:20px 48px;border-top:1px solid #e2e8f0;text-align:center">
            <p style="margin:0;color:#94a3b8;font-size:12px">TopShelf Inventory &bull; <a href="${appUrl}/admin/settings/reporting" style="color:#94a3b8">Manage Report Settings</a></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
