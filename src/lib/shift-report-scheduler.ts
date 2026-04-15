import { db } from './db';
import { sendEmail } from './mail';
import { buildShiftReportHtml } from './shift-report-email';

export async function runShiftReportSchedule(): Promise<void> {
    try {
        // Get all orgs with shift_report_enabled = 'true'
        const orgSettings = await db.query(`
            SELECT s.organization_id,
                   MAX(CASE WHEN s.key = 'shift_report_enabled' THEN s.value END) as enabled,
                   MAX(CASE WHEN s.key = 'shift_report_emails' THEN s.value END) as emails,
                   MAX(CASE WHEN s.key = 'shift_report_schedule' THEN s.value END) as schedule,
                   MAX(CASE WHEN s.key = 'shift_report_title' THEN s.value END) as title
            FROM settings s
            WHERE s.key IN ('shift_report_enabled','shift_report_emails','shift_report_schedule','shift_report_title')
            GROUP BY s.organization_id
            HAVING MAX(CASE WHEN s.key = 'shift_report_enabled' THEN s.value END) = 'true'
        `);

        if (!orgSettings || orgSettings.length === 0) return;

        const now = new Date();
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const currentDayOfWeek = now.getDay(); // 0=Sunday, 6=Saturday
        const currentDayOfMonth = now.getDate();

        for (const s of orgSettings) {
            try {
                // Parse schedule
                let schedule: { frequency: string; time?: string; dayOfWeek?: number; shiftInclusion?: string } = { frequency: 'per_shift', time: '08:00' };
                try {
                    if (s.schedule) schedule = JSON.parse(s.schedule);
                } catch { }

                // per_shift is handled at shift close time — skip here
                if (!schedule.frequency || schedule.frequency === 'per_shift') continue;

                const scheduleTime = schedule.time || '08:00';

                // Check if current time matches
                if (scheduleTime !== currentTime) continue;

                // Check frequency-specific conditions
                if (schedule.frequency === 'weekly') {
                    const targetDay = schedule.dayOfWeek ?? 1;
                    if (currentDayOfWeek !== targetDay) continue;
                } else if (schedule.frequency === 'monthly') {
                    if (currentDayOfMonth !== 1) continue;
                }
                // 'daily' — just time match, already checked

                // Parse recipients
                let recipients: string[] = [];
                try {
                    const parsed = s.emails ? JSON.parse(s.emails) : null;
                    if (parsed?.to) recipients = parsed.to;
                    else if (typeof s.emails === 'string') recipients = s.emails.split(',').map((r: string) => r.trim()).filter(Boolean);
                } catch {
                    recipients = s.emails ? s.emails.split(',').map((r: string) => r.trim()).filter(Boolean) : [];
                }

                if (recipients.length === 0) continue;

                // Determine time period for shifts
                const periodStart = getPeriodStart(schedule.frequency, now, schedule.dayOfWeek);

                // Get org name
                const org = await db.one('SELECT name FROM organizations WHERE id = $1', [s.organization_id]);
                const orgName = org?.name || 'TopShelf';
                const subject = s.title || 'Shift Close Report';

                const shiftInclusion = schedule.shiftInclusion || 'all_shifts';

                if (shiftInclusion === 'summary_only') {
                    await sendSummaryEmail(s.organization_id, orgName, subject, recipients, periodStart, now, schedule.frequency);
                } else {
                    await sendAllShiftsEmail(s.organization_id, orgName, subject, recipients, periodStart, now, schedule.frequency);
                }

                console.log(`[Scheduler] Sent shift report digest for org ${s.organization_id} to ${recipients.join(', ')}`);
            } catch (e) {
                console.error(`[Scheduler] Shift report error for org ${s.organization_id}:`, e);
            }
        }
    } catch (e) {
        console.error('[Scheduler] runShiftReportSchedule error:', e);
    }
}

function getPeriodStart(frequency: string, now: Date, dayOfWeek?: number): Date {
    const start = new Date(now);
    if (frequency === 'daily') {
        start.setDate(start.getDate() - 1);
        start.setHours(0, 0, 0, 0);
    } else if (frequency === 'weekly') {
        start.setDate(start.getDate() - 7);
        start.setHours(0, 0, 0, 0);
    } else if (frequency === 'monthly') {
        start.setMonth(start.getMonth() - 1);
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
    }
    return start;
}

async function sendAllShiftsEmail(
    organizationId: number,
    orgName: string,
    subjectPrefix: string,
    recipients: string[],
    periodStart: Date,
    periodEnd: Date,
    frequency: string
): Promise<void> {
    const shifts = await db.query(`
        SELECT sc.*,
            u.first_name || ' ' || u.last_name AS user_name,
            l.name AS location_name
        FROM shift_closes sc
        LEFT JOIN users u ON sc.user_id = u.id
        LEFT JOIN locations l ON sc.location_id = l.id
        WHERE sc.organization_id = $1
          AND sc.closed_at >= $2
          AND sc.closed_at <= $3
        ORDER BY sc.closed_at DESC
    `, [organizationId, periodStart, periodEnd]);

    if (!shifts || shifts.length === 0) return;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.topshelfinventory.com';
    const periodLabel = `${periodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    // Build individual shift sections
    const shiftSections = shifts.map((shift: any) => buildShiftReportHtml(shift, orgName)).join(
        '<div style="height:32px;border-top:3px dashed #e5e7eb;margin:32px 0"></div>'
    );

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:680px;margin:0 auto;padding:24px 16px">
    <div style="background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);border-radius:12px 12px 0 0;padding:24px 32px;margin-bottom:0">
      <div style="color:#fbbf24;font-weight:700;font-size:14px;margin-bottom:4px">${orgName}</div>
      <div style="color:white;font-weight:700;font-size:20px;margin-bottom:4px">${subjectPrefix} — ${frequency.charAt(0).toUpperCase() + frequency.slice(1)} Digest</div>
      <div style="color:#94a3b8;font-size:13px">${periodLabel} &bull; ${shifts.length} shift${shifts.length > 1 ? 's' : ''}</div>
    </div>
    ${shiftSections}
    <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;border-radius:0 0 12px 12px;text-align:center">
      <p style="margin:0;color:#9ca3af;font-size:12px">TopShelf Inventory &bull; <a href="${appUrl}/admin/shift-reports" style="color:#9ca3af">View All Reports</a> &bull; <a href="${appUrl}/admin/settings/reporting" style="color:#9ca3af">Manage Notifications</a></p>
    </div>
  </div>
</body>
</html>`;

    await sendEmail('reporting', {
        to: recipients,
        subject: `${subjectPrefix} — ${frequency.charAt(0).toUpperCase() + frequency.slice(1)} Digest — ${periodLabel}`,
        html,
        text: `${subjectPrefix}\nPeriod: ${periodLabel}\nShifts: ${shifts.length}\n\nView at: ${appUrl}/admin/shift-reports`,
    });
}

async function sendSummaryEmail(
    organizationId: number,
    orgName: string,
    subjectPrefix: string,
    recipients: string[],
    periodStart: Date,
    periodEnd: Date,
    frequency: string
): Promise<void> {
    const summary = await db.one(`
        SELECT
            COUNT(*) as total_shifts,
            SUM(cash_sales::numeric) as total_cash_sales,
            SUM(cash_tips::numeric) as total_cash_tips,
            SUM(cc_sales::numeric) as total_cc_sales,
            SUM(cc_tips::numeric) as total_cc_tips,
            SUM(bag_amount::numeric) as total_bag_amount,
            SUM(over_short::numeric) as total_over_short
        FROM shift_closes
        WHERE organization_id = $1
          AND closed_at >= $2
          AND closed_at <= $3
    `, [organizationId, periodStart, periodEnd]);

    if (!summary || parseInt(summary.total_shifts) === 0) return;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.topshelfinventory.com';
    const periodLabel = `${periodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    const fmt = (v: any) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(parseFloat(v) || 0);
    const overShortColor = parseFloat(summary.total_over_short) >= 0 ? '#10b981' : '#ef4444';

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <tr>
          <td style="background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);padding:28px 40px">
            <div style="color:#fbbf24;font-weight:700;font-size:14px;margin-bottom:4px">${orgName}</div>
            <div style="color:white;font-weight:700;font-size:20px;margin-bottom:4px">${subjectPrefix} — Summary</div>
            <div style="color:#94a3b8;font-size:13px">${periodLabel} &bull; ${summary.total_shifts} shift${parseInt(summary.total_shifts) !== 1 ? 's' : ''}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:6px 0;color:#6b7280;font-size:14px">Total Cash Sales</td>
                <td style="padding:6px 0;text-align:right;font-size:14px;font-weight:600">${fmt(summary.total_cash_sales)}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#6b7280;font-size:14px">Total Cash Tips</td>
                <td style="padding:6px 0;text-align:right;font-size:14px;font-weight:600">${fmt(summary.total_cash_tips)}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#6b7280;font-size:14px">Total CC Sales</td>
                <td style="padding:6px 0;text-align:right;font-size:14px;font-weight:600">${fmt(summary.total_cc_sales)}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#6b7280;font-size:14px">Total CC Tips</td>
                <td style="padding:6px 0;text-align:right;font-size:14px;font-weight:600">${fmt(summary.total_cc_tips)}</td>
              </tr>
              <tr>
                <td colspan="2" style="padding:8px 0"><hr style="border:none;border-top:2px solid #e5e7eb;margin:0"></td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-weight:700;font-size:15px">Total Bag Amount</td>
                <td style="padding:6px 0;text-align:right;font-size:15px;font-weight:800;color:${parseFloat(summary.total_bag_amount) >= 0 ? '#10b981' : '#ef4444'}">${fmt(summary.total_bag_amount)}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-weight:700;font-size:15px">Total Over/Short</td>
                <td style="padding:6px 0;text-align:right;font-size:15px;font-weight:800;color:${overShortColor}">${fmt(summary.total_over_short)}</td>
              </tr>
            </table>
            <p style="margin:28px 0 0;text-align:center">
              <a href="${appUrl}/admin/shift-reports" style="background:#d97706;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;display:inline-block">View Full Reports</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:16px 40px;border-top:1px solid #e5e7eb;text-align:center">
            <p style="margin:0;color:#9ca3af;font-size:12px">TopShelf Inventory &bull; <a href="${appUrl}/admin/settings/reporting" style="color:#9ca3af">Manage Notifications</a></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    await sendEmail('reporting', {
        to: recipients,
        subject: `${subjectPrefix} — ${frequency.charAt(0).toUpperCase() + frequency.slice(1)} Summary — ${periodLabel}`,
        html,
        text: `${subjectPrefix} Summary\nPeriod: ${periodLabel}\nShifts: ${summary.total_shifts}\nTotal Bag: ${fmt(summary.total_bag_amount)}\nOver/Short: ${fmt(summary.total_over_short)}\n\nView at: ${appUrl}/admin/shift-reports`,
    });
}
