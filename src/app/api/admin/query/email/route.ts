import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { sendEmail } from '@/lib/mail';

const ACTION_LABELS: Record<string, string> = {
    ADD_STOCK: 'Stock Added',
    SUBTRACT_STOCK: 'Stock Removed',
    AUDIT: 'Audit',
    TRANSFER_IN: 'Transfer In',
    TRANSFER_OUT: 'Transfer Out',
    ORDER_SUBMITTED: 'Order Submitted',
    ORDER_RECEIVED: 'Order Received',
    MANUAL_DB_BACKUP: 'DB Backup',
    CHECK_IN: 'Check-In',
    SHIFT_CLOSE: 'Shift Close',
};

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { to, subject, logs, filters } = await req.json();
    if (!to || !logs) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

    const rows = logs
        .map((r: any) => `
            <tr>
                <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;color:#374151;white-space:nowrap;">
                    ${new Date(r.timestamp).toLocaleString()}
                </td>
                <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;color:#374151;">${r.user_name}</td>
                <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;color:#374151;">${r.location_name || '—'}</td>
                <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;">
                    <span style="
                        display:inline-block;padding:2px 8px;border-radius:12px;font-size:0.78rem;font-weight:600;
                        background:${r.action === 'ADD_STOCK' ? '#d1fae5' : r.action === 'SUBTRACT_STOCK' ? '#fee2e2' : '#e0e7ff'};
                        color:${r.action === 'ADD_STOCK' ? '#065f46' : r.action === 'SUBTRACT_STOCK' ? '#991b1b' : '#3730a3'};
                    ">${ACTION_LABELS[r.action] || r.action}</span>
                </td>
                <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;color:#374151;">${r.item_name || '—'}</td>
                <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600;color:${r.action === 'ADD_STOCK' ? '#059669' : r.action === 'SUBTRACT_STOCK' ? '#dc2626' : '#374151'};">
                    ${r.change != null ? (r.action === 'ADD_STOCK' ? '+' : r.action === 'SUBTRACT_STOCK' ? '−' : '') + r.change : '—'}
                </td>
            </tr>`)
        .join('');

    const filterSummary = Object.entries(filters || {})
        .filter(([, v]) => v)
        .map(([k, v]) => `<span style="background:#f3f4f6;padding:2px 8px;border-radius:10px;font-size:0.82rem;margin-right:6px;">${k}: <strong>${v}</strong></span>`)
        .join('');

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Activity Report</title></head>
<body style="font-family:Arial,sans-serif;color:#111827;margin:0;padding:0;background:#f9fafb;">
<div style="max-width:900px;margin:0 auto;padding:24px;">
  <div style="background:#1f2937;padding:20px 24px;border-radius:8px 8px 0 0;">
    <h1 style="margin:0;color:white;font-size:1.3rem;">Activity Report</h1>
    <p style="margin:6px 0 0;color:#9ca3af;font-size:0.85rem;">Generated ${new Date().toLocaleString()}</p>
  </div>
  ${filterSummary ? `<div style="background:#f3f4f6;padding:10px 24px;border:1px solid #e5e7eb;border-top:none;">Active filters: ${filterSummary}</div>` : ''}
  <div style="background:white;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;overflow:hidden;">
    <table style="width:100%;border-collapse:collapse;font-size:0.875rem;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:10px;text-align:left;color:#6b7280;font-size:0.75rem;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">Time</th>
          <th style="padding:10px;text-align:left;color:#6b7280;font-size:0.75rem;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">User</th>
          <th style="padding:10px;text-align:left;color:#6b7280;font-size:0.75rem;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">Location</th>
          <th style="padding:10px;text-align:left;color:#6b7280;font-size:0.75rem;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">Action</th>
          <th style="padding:10px;text-align:left;color:#6b7280;font-size:0.75rem;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">Item</th>
          <th style="padding:10px;text-align:center;color:#6b7280;font-size:0.75rem;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">Qty</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="6" style="text-align:center;padding:20px;color:#9ca3af;">No activity found</td></tr>'}</tbody>
    </table>
    <div style="padding:12px 16px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:0.82rem;color:#6b7280;">
      ${logs.length} record${logs.length !== 1 ? 's' : ''} · Sent from TopShelf
    </div>
  </div>
</div>
</body>
</html>`;

    const ok = await sendEmail(
        'notifications',
        { to, subject: subject || 'Activity Report', html },
        { organizationId: session.organizationId, orgName: '', emailType: 'activity_report' }
    );

    return NextResponse.json({ success: ok });
}
