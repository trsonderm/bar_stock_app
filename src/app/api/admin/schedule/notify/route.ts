import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { sendEmail, enqueuePendingEmail } from '@/lib/mail';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { userIds, scheduleEntries, message } = body;
        // scheduleEntries: [{ date, shiftName, startTime, endTime, color }]

        if (!Array.isArray(userIds) || userIds.length === 0) {
            return NextResponse.json({ error: 'No users specified' }, { status: 400 });
        }

        const orgRow = await db.one(
            'SELECT name FROM organizations WHERE id = $1',
            [session.organizationId]
        );
        const orgName = orgRow?.name || 'TopShelf';

        const users = await db.query(
            `SELECT id, first_name, last_name, email FROM users
             WHERE id = ANY($1::int[]) AND organization_id = $2 AND email IS NOT NULL`,
            [userIds, session.organizationId]
        );

        let sent = 0;
        for (const user of users) {
            if (!user.email) continue;

            const rows = (scheduleEntries || []).map((e: any) => `
                <tr>
                    <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">
                        ${new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    </td>
                    <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-weight:600;color:${e.color || '#3b82f6'}">
                        ${e.shiftName}
                    </td>
                    <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#64748b">
                        ${e.startTime} – ${e.endTime}
                    </td>
                </tr>`).join('');

            const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <tr><td style="background:linear-gradient(135deg,#1e293b,#0f172a);padding:28px 40px">
          <div style="color:#fbbf24;font-weight:700;font-size:14px;margin-bottom:4px">${orgName}</div>
          <div style="color:white;font-weight:700;font-size:20px">Your Schedule Update</div>
          <div style="color:#94a3b8;font-size:13px;margin-top:4px">Hi ${user.first_name}, your schedule has been updated.</div>
        </td></tr>
        ${message ? `<tr><td style="padding:16px 40px;background:#fffbeb;border-bottom:1px solid #fde68a">
          <p style="margin:0;color:#92400e;font-size:14px">${message}</p>
        </td></tr>` : ''}
        <tr><td style="padding:24px 40px">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
            <thead><tr style="background:#f8fafc">
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#64748b;text-transform:uppercase">Date</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#64748b;text-transform:uppercase">Shift</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#64748b;text-transform:uppercase">Time</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </td></tr>
        <tr><td style="padding:16px 40px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center">
          <p style="margin:0;color:#94a3b8;font-size:12px">${orgName} — Schedule Notification</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

            const opts = {
                to: [user.email],
                subject: `Your Schedule Update — ${orgName}`,
                html,
                text: `Hi ${user.first_name},\n\nYour schedule has been updated:\n\n${(scheduleEntries || []).map((e: any) => `${e.date}: ${e.shiftName} (${e.startTime}–${e.endTime})`).join('\n')}\n\n${message || ''}`,
            };
            const ctx = { emailType: 'manual' as const, organizationId: session.organizationId, orgName, scheduled: false };
            const pendingId = await enqueuePendingEmail('notifications', opts, ctx);
            await sendEmail('notifications', opts, ctx, pendingId ?? undefined);
            sent++;
        }

        return NextResponse.json({ success: true, sent });
    } catch (error) {
        console.error('Error sending schedule notifications:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
