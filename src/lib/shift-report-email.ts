import { ShiftClose } from '@/components/ShiftReportCard';

const fmt = (v: number | string) => {
    const num = parseFloat(String(v)) || 0;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
};

const n = (v: number | string) => parseFloat(String(v)) || 0;

const parsePayouts = (p: any): { typeId: number; typeName: string; amount: number }[] => {
    if (!p) return [];
    if (typeof p === 'string') {
        try { return JSON.parse(p); } catch { return []; }
    }
    if (Array.isArray(p)) return p;
    return [];
};

export function buildShiftReportHtml(shift: ShiftClose, orgName: string): string {
    const payouts = parsePayouts(shift.payouts_json);
    const totalPayouts = payouts.reduce((sum, p) => sum + n(p.amount), 0);
    const ccTipsCashAmount = shift.cc_tips_cash_payout ? n(shift.cc_tips) : 0;
    const overShort = n(shift.over_short);
    const bagAmount = n(shift.bag_amount);
    const totalCash = n(shift.cash_sales) + n(shift.cash_tips);
    const totalCC = n(shift.cc_sales) + n(shift.cc_tips);

    const overShortColor = overShort >= 0 ? '#10b981' : '#ef4444';
    const bagColor = bagAmount >= 0 ? '#10b981' : '#ef4444';
    const overShortStatus = overShort > 0.005 ? 'OVER' : overShort < -0.005 ? 'SHORT' : 'BALANCED';
    const statusBgColor = overShortStatus === 'OVER' ? '#d1fae5' : overShortStatus === 'SHORT' ? '#fee2e2' : '#f3f4f6';
    const statusTextColor = overShortStatus === 'OVER' ? '#065f46' : overShortStatus === 'SHORT' ? '#991b1b' : '#374151';

    const dateStr = new Date(shift.closed_at).toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.topshelfinventory.com';

    const payoutsRows = payouts.length > 0 ? `
        <tr><td colspan="2" style="padding:16px 0 8px"><strong style="font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280">Payouts</strong></td></tr>
        ${payouts.map(p => `
            <tr>
                <td style="padding:4px 0;color:#6b7280;font-size:14px">${p.typeName}</td>
                <td style="padding:4px 0;text-align:right;font-size:14px">${fmt(p.amount)}</td>
            </tr>
        `).join('')}
        <tr>
            <td style="padding:8px 0 4px;border-top:1px solid #e5e7eb;font-weight:600;font-size:14px">Total Payouts</td>
            <td style="padding:8px 0 4px;border-top:1px solid #e5e7eb;text-align:right;font-weight:600;font-size:14px">${fmt(totalPayouts)}</td>
        </tr>
    ` : '<tr><td colspan="2" style="padding:4px 0;color:#9ca3af;font-size:13px;font-style:italic">No payouts recorded</td></tr>';

    const ccTipsRow = shift.cc_tips_cash_payout ? `
        <tr>
            <td style="padding:4px 0;color:#6b7280;font-size:14px">CC Tips Cash Payout</td>
            <td style="padding:4px 0;text-align:right;color:#ef4444;font-size:14px">-${fmt(ccTipsCashAmount)}</td>
        </tr>
    ` : '';

    const notesSection = shift.notes ? `
        <tr>
            <td colspan="2" style="padding-top:24px">
                <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:12px 16px">
                    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#92400e;margin-bottom:8px">Notes</div>
                    <div style="font-size:14px;color:#78350f;line-height:1.5">${shift.notes}</div>
                </div>
            </td>
        </tr>
    ` : '';

    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);padding:28px 40px">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <div style="color:#fbbf24;font-weight:700;font-size:14px;margin-bottom:4px">${orgName}</div>
                  <div style="color:white;font-weight:700;font-size:22px;margin-bottom:8px">Shift Close Report</div>
                  <div style="color:#94a3b8;font-size:13px">${dateStr}</div>
                  ${shift.user_name ? `<div style="color:#94a3b8;font-size:13px;margin-top:2px">Staff: ${shift.user_name}</div>` : ''}
                  ${shift.location_name ? `<div style="color:#94a3b8;font-size:13px;margin-top:2px">Location: ${shift.location_name}</div>` : ''}
                </td>
                <td align="right" valign="top">
                  <div style="display:inline-block;background:${statusBgColor};color:${statusTextColor};border-radius:8px;padding:6px 14px;font-size:13px;font-weight:800;letter-spacing:0.1em">${overShortStatus}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 40px">
            <table width="100%" cellpadding="0" cellspacing="0">

              <!-- Cash Drawer -->
              <tr><td colspan="2" style="padding-bottom:8px">
                <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;border-bottom:1px solid #e5e7eb;padding-bottom:6px">Cash Drawer</div>
              </td></tr>
              <tr>
                <td style="padding:4px 0;color:#6b7280;font-size:14px">Bank Start</td>
                <td style="padding:4px 0;text-align:right;font-size:14px">${fmt(shift.bank_start)}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#6b7280;font-size:14px">Bank End</td>
                <td style="padding:4px 0;text-align:right;font-size:14px">${fmt(shift.bank_end)}</td>
              </tr>

              <!-- Register Totals -->
              <tr><td colspan="2" style="padding:16px 0 8px">
                <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;border-bottom:1px solid #e5e7eb;padding-bottom:6px">Register Totals</div>
              </td></tr>
              <tr>
                <td style="padding:4px 0;color:#6b7280;font-size:14px">Cash Sales</td>
                <td style="padding:4px 0;text-align:right;font-size:14px">${fmt(shift.cash_sales)}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#6b7280;font-size:14px">Cash Tips</td>
                <td style="padding:4px 0;text-align:right;font-size:14px">${fmt(shift.cash_tips)}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#6b7280;font-size:14px">Credit Card Sales</td>
                <td style="padding:4px 0;text-align:right;font-size:14px">${fmt(shift.cc_sales)}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#6b7280;font-size:14px">CC Tips</td>
                <td style="padding:4px 0;text-align:right;font-size:14px">${fmt(shift.cc_tips)}</td>
              </tr>

              <!-- Payouts -->
              <tr><td colspan="2" style="padding:16px 0 8px">
                <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;border-bottom:1px solid #e5e7eb;padding-bottom:6px">Payouts</div>
              </td></tr>
              ${payoutsRows}

              <!-- Summary -->
              <tr><td colspan="2" style="padding:16px 0 8px">
                <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;border-bottom:1px solid #e5e7eb;padding-bottom:6px">Summary</div>
              </td></tr>
              <tr>
                <td colspan="2">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:0">
                    <tr>
                      <td style="padding:12px 16px 4px;color:#6b7280;font-size:14px">Cash In (Sales+Tips)</td>
                      <td style="padding:12px 16px 4px;text-align:right;font-size:14px">${fmt(totalCash)}</td>
                    </tr>
                    ${totalPayouts > 0 ? `<tr>
                      <td style="padding:4px 16px;color:#6b7280;font-size:14px">Less Payouts</td>
                      <td style="padding:4px 16px;text-align:right;color:#ef4444;font-size:14px">-${fmt(totalPayouts)}</td>
                    </tr>` : ''}
                    ${ccTipsRow}
                    <tr>
                      <td colspan="2" style="padding:8px 16px"><hr style="border:none;border-top:2px solid #d1d5db;margin:0"></td>
                    </tr>
                    <tr>
                      <td style="padding:4px 16px 12px;font-weight:700;font-size:15px">BAG AMOUNT</td>
                      <td style="padding:4px 16px 12px;text-align:right;font-weight:800;font-size:15px;color:${bagColor}">${fmt(bagAmount)}</td>
                    </tr>
                    <tr>
                      <td style="padding:0 16px 12px;border-top:1px solid #e5e7eb;font-weight:700;font-size:15px;padding-top:8px">OVER/SHORT</td>
                      <td style="padding:0 16px 12px;border-top:1px solid #e5e7eb;text-align:right;font-weight:800;font-size:15px;color:${overShortColor};padding-top:8px">${fmt(overShort)}</td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Card Totals -->
              <tr><td colspan="2" style="padding:16px 0 8px">
                <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;border-bottom:1px solid #e5e7eb;padding-bottom:6px">Card Totals</div>
              </td></tr>
              <tr>
                <td style="padding:4px 0;color:#6b7280;font-size:14px">CC Sales</td>
                <td style="padding:4px 0;text-align:right;font-size:14px">${fmt(shift.cc_sales)}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#6b7280;font-size:14px">CC Tips</td>
                <td style="padding:4px 0;text-align:right;font-size:14px">${fmt(shift.cc_tips)}</td>
              </tr>
              <tr>
                <td style="padding:8px 0 4px;border-top:1px solid #e5e7eb;font-weight:600;font-size:14px">Total CC</td>
                <td style="padding:8px 0 4px;border-top:1px solid #e5e7eb;text-align:right;font-weight:600;font-size:14px">${fmt(totalCC)}</td>
              </tr>

              <!-- Notes -->
              ${notesSection}

              <!-- CTA -->
              <tr>
                <td colspan="2" style="padding-top:28px;text-align:center">
                  <a href="${appUrl}/admin/shift-reports" style="background:#d97706;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;display:inline-block">View Full Report</a>
                </td>
              </tr>

            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:16px 40px;border-top:1px solid #e5e7eb;text-align:center">
            <p style="margin:0;color:#9ca3af;font-size:12px">TopShelf Inventory &bull; Shift Close #${shift.id} &bull; <a href="${appUrl}/admin/settings/reporting" style="color:#9ca3af">Manage Notifications</a></p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
