import { db } from './db';
import { sendEmail, enqueuePendingEmail } from './mail';
import { runAutoDisable } from './billing-auto-disable';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

class Scheduler {
    private interval: NodeJS.Timeout | null = null;
    private lastRunMinute = -1;
    private tasks: { name: string; cron: string; run: () => Promise<void> }[] = [];

    constructor() {
        this.tasks = [
            { name: 'Daily Cleanup', cron: '0 4 * * *', run: () => this.cleanupLogs() },
            { name: 'Billing Check', cron: '0 5 * * *', run: () => this.checkBilling() },
            { name: 'Auto Disable Past Due', cron: '0 6 * * *', run: () => this.runAutoDisablePastDue() },
            { name: 'Auto Backup', cron: '0 * * * *', run: () => this.checkAutoBackup() },
            { name: 'Report Schedules', cron: '* * * * *', run: () => this.runDueReportSchedules() },
            { name: 'Low Stock Alerts', cron: '* * * * *', run: () => this.runDueLowStockAlerts() },
            { name: 'Shift Report Emails', cron: '* * * * *', run: () => this.runShiftReportEmails() },
        ];
    }

    start() {
        if (this.interval) return;
        console.log('Scheduler Started');

        // Poll every 5 seconds; only run tasks once per minute regardless of server start time
        this.interval = setInterval(() => {
            const now = new Date();
            const minuteKey = now.getHours() * 60 + now.getMinutes();
            if (minuteKey !== this.lastRunMinute) {
                this.lastRunMinute = minuteKey;
                this.checkTasks(now);
            }
        }, 5000);
    }

    stop() {
        if (this.interval) clearInterval(this.interval);
        this.interval = null;
    }

    private async checkTasks(now: Date) {
        const currentMin = now.getMinutes();
        const currentHr = now.getHours();

        for (const task of this.tasks) {
            const [min, hr] = task.cron.split(' ');
            if (
                (min === '*' || parseInt(min) === currentMin) &&
                (hr === '*' || parseInt(hr) === currentHr)
            ) {
                console.log(`Running Task: ${task.name}`);
                try {
                    await task.run();
                    await this.logRun(task.name, 'SUCCESS');
                } catch (e) {
                    console.error(`Task Failed: ${task.name}`, e);
                    await this.logRun(task.name, 'FAILED', String(e));
                }
            }
        }
    }

    // --- Tasks ---

    private async cleanupLogs() {
        // Respect log_retention_days from system_settings
        let days = 90;
        try {
            const row = await db.one("SELECT value FROM system_settings WHERE key = 'log_retention_days'");
            if (row) days = parseInt(row.value) || 90;
        } catch { }
        await db.execute(`DELETE FROM activity_logs WHERE timestamp < NOW() - INTERVAL '${days} days'`);
    }

    private async runAutoDisablePastDue() {
        try {
            const enabledRow = await db.one(
                `SELECT value FROM system_settings WHERE key = 'billing_auto_disable_enabled'`
            ).catch(() => null);
            if (enabledRow?.value !== 'true') return;
            await runAutoDisable();
        } catch (e) {
            console.error('[auto-disable] Failed:', e);
        }
    }

    private async checkBilling() {
        console.log("Checking for due invoices...");
        try {
            const orgs = await db.query("SELECT id, name, subscription_plan FROM organizations WHERE billing_status = 'active'");
            const now = new Date();
            const currentMonth = now.toISOString().slice(0, 7);

            for (const org of orgs) {
                const existingRows = await db.query(
                    "SELECT id FROM invoices WHERE organization_id = $1 AND TO_CHAR(created_at, 'YYYY-MM') = $2",
                    [org.id, currentMonth]
                );

                if (existingRows.length === 0) {
                    const amount = org.subscription_plan === 'PRO' ? 49.00 : 0.00;
                    if (amount > 0) {
                        await db.execute(
                            "INSERT INTO invoices (organization_id, amount, status, due_date) VALUES ($1, $2, 'PENDING', $3)",
                            [org.id, amount, new Date(now.getFullYear(), now.getMonth() + 1, 0)]
                        );
                    }
                }
            }
        } catch (e) {
            console.error('Billing Job Failed', e);
        }
    }

    private async runDueReportSchedules() {
        try {
            const now = new Date();
            const due = await db.query(`
                SELECT rs.*, sr.name as report_name, sr.config as report_config,
                       o.subscription_plan, o.settings as org_settings
                FROM report_schedules rs
                JOIN saved_reports sr ON rs.report_id::int = sr.id
                JOIN organizations o ON rs.organization_id = o.id
                WHERE rs.active = TRUE
                  AND rs.next_run_at <= $1
            `, [now]);

            for (const schedule of due) {
                try {
                    await this.sendScheduledReport(schedule);

                    // Advance next_run_at
                    const next = new Date();
                    next.setHours(8, 0, 0, 0);
                    if (schedule.frequency === 'daily') next.setDate(next.getDate() + 1);
                    else if (schedule.frequency === 'weekly') next.setDate(next.getDate() + 7);
                    else if (schedule.frequency === 'monthly') {
                        next.setMonth(next.getMonth() + 1);
                        next.setDate(1);
                    } else {
                        next.setDate(next.getDate() + 1);
                    }

                    await db.execute(
                        'UPDATE report_schedules SET next_run_at = $1 WHERE id = $2',
                        [next, schedule.id]
                    );
                } catch (e) {
                    console.error(`[Scheduler] Failed to send report schedule ${schedule.id}:`, e);
                }
            }
        } catch (e) {
            console.error('[Scheduler] runDueReportSchedules error:', e);
        }
    }

    private async sendScheduledReport(schedule: any) {
        const config = typeof schedule.report_config === 'string'
            ? JSON.parse(schedule.report_config)
            : schedule.report_config;

        const recipients = schedule.recipients
            ? schedule.recipients.split(',').map((r: string) => r.trim()).filter(Boolean)
            : [];

        if (recipients.length === 0) return;

        // Build a simple HTML summary of the report sections
        const sections: any[] = config?.sections || [];
        let sectionsHtml = '';

        for (const section of sections) {
            try {
                const rows = await this.fetchReportData(schedule.organization_id, section);
                if (!rows || rows.length === 0) continue;

                const cols = Object.keys(rows[0]);
                const headerRow = cols.map(c => `<th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0;color:#64748b;font-size:12px;text-transform:uppercase">${c.replace(/_/g, ' ')}</th>`).join('');
                const dataRows = rows.slice(0, 20).map((row: any) =>
                    `<tr>${cols.map(c => `<td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#1e293b;font-size:14px">${row[c] ?? ''}</td>`).join('')}</tr>`
                ).join('');

                sectionsHtml += `
                    <div style="margin-bottom:32px">
                        <h3 style="margin:0 0 12px;color:#0f172a;font-size:16px;font-weight:600">${section.title || section.dataSource || 'Report Section'}</h3>
                        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
                            <thead><tr style="background:#f8fafc">${headerRow}</tr></thead>
                            <tbody>${dataRows}</tbody>
                        </table>
                        ${rows.length > 20 ? `<p style="color:#64748b;font-size:12px;margin:8px 0 0">Showing 20 of ${rows.length} rows</p>` : ''}
                    </div>`;
            } catch { }
        }

        if (!sectionsHtml) sectionsHtml = '<p style="color:#64748b">No data available for this report period.</p>';

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.topshelfinventory.com';
        const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px">
    <tr><td align="center">
      <table width="700" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <tr>
          <td style="background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);padding:32px 48px">
            <h1 style="margin:0;color:white;font-size:20px;font-weight:700">TopShelf Inventory</h1>
            <p style="margin:8px 0 0;color:#94a3b8;font-size:14px">Scheduled Report: ${schedule.report_name}</p>
          </td>
        </tr>
        <tr><td style="padding:40px 48px">
          <p style="margin:0 0 8px;color:#64748b;font-size:13px">Generated: ${new Date().toLocaleString()} &bull; Frequency: ${schedule.frequency}</p>
          ${sectionsHtml}
          <p style="margin:32px 0 0;text-align:center">
            <a href="${appUrl}/admin/reports" style="background:#d97706;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600">View Full Report</a>
          </p>
        </td></tr>
        <tr>
          <td style="background:#f8fafc;padding:20px 48px;border-top:1px solid #e2e8f0;text-align:center">
            <p style="margin:0;color:#94a3b8;font-size:12px">TopShelf Inventory &bull; notifications@topshelfinventory.com &bull; <a href="${appUrl}/admin/settings/reporting" style="color:#94a3b8">Manage Schedules</a></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

        const emailOpts = {
            to: recipients,
            subject: `[TopShelf] ${schedule.report_name} — ${schedule.frequency.charAt(0).toUpperCase() + schedule.frequency.slice(1)} Report`,
            html,
            text: `TopShelf Scheduled Report: ${schedule.report_name}\nGenerated: ${new Date().toLocaleString()}\n\nView your full report at: ${appUrl}/admin/reports`,
        };
        const emailCtx = { emailType: 'scheduled_report' as const, organizationId: schedule.organization_id, scheduled: true };
        const pendingId = await enqueuePendingEmail('reporting', emailOpts, emailCtx);
        await sendEmail('reporting', emailOpts, emailCtx, pendingId ?? undefined);

        console.log(`[Scheduler] Sent scheduled report "${schedule.report_name}" to ${recipients.join(', ')}`);
    }

    private async fetchReportData(organizationId: number, section: any): Promise<any[]> {
        const { dataSource, groupBy, dateRange } = section;
        const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : dateRange === '90d' ? 90 : 7;
        const since = new Date(Date.now() - days * 86400000).toISOString();

        if (dataSource === 'stock_usage') {
            if (groupBy === 'item') {
                return db.query(`
                    SELECT i.name as item_name, SUM(ABS((al.details->>'quantity')::numeric)) as total_used
                    FROM activity_logs al
                    JOIN items i ON (al.details->>'itemId')::int = i.id
                    WHERE al.action = 'SUBTRACT_STOCK' AND al.organization_id = $1 AND al.timestamp >= $2
                    GROUP BY i.name ORDER BY total_used DESC LIMIT 50
                `, [organizationId, since]);
            }
            if (groupBy === 'user') {
                return db.query(`
                    SELECT u.first_name || ' ' || u.last_name as user_name,
                           COUNT(*) as transactions,
                           SUM(ABS((al.details->>'quantity')::numeric)) as total_used
                    FROM activity_logs al
                    JOIN users u ON al.user_id = u.id
                    WHERE al.action = 'SUBTRACT_STOCK' AND al.organization_id = $1 AND al.timestamp >= $2
                    GROUP BY u.id, u.first_name, u.last_name ORDER BY total_used DESC
                `, [organizationId, since]);
            }
        }
        if (dataSource === 'low_stock') {
            return db.query(`
                SELECT i.name, i.type, i.low_stock_threshold, COALESCE(SUM(inv.quantity), 0) as current_stock
                FROM items i
                LEFT JOIN inventory inv ON i.id = inv.item_id
                WHERE i.organization_id = $1
                GROUP BY i.id, i.name, i.type, i.low_stock_threshold
                HAVING COALESCE(SUM(inv.quantity), 0) <= COALESCE(i.low_stock_threshold, 5)
                ORDER BY current_stock ASC
            `, [organizationId]);
        }
        if (dataSource === 'inventory_value') {
            return db.query(`
                SELECT i.name, i.type, i.unit_cost,
                       COALESCE(SUM(inv.quantity), 0) as quantity,
                       ROUND(i.unit_cost * COALESCE(SUM(inv.quantity), 0), 2) as total_value
                FROM items i
                LEFT JOIN inventory inv ON i.id = inv.item_id
                WHERE i.organization_id = $1
                GROUP BY i.id, i.name, i.type, i.unit_cost
                ORDER BY total_value DESC LIMIT 50
            `, [organizationId]);
        }
        return [];
    }

    private async runDueLowStockAlerts() {
        try {
            // Get all orgs with low stock alerts enabled
            const orgSettings = await db.query(`
                SELECT s.organization_id,
                       MAX(CASE WHEN s.key = 'low_stock_alert_enabled' THEN s.value END) as alert_enabled,
                       MAX(CASE WHEN s.key = 'low_stock_alert_emails' THEN s.value END) as alert_emails,
                       MAX(CASE WHEN s.key = 'low_stock_alert_schedule' THEN s.value END) as alert_schedule,
                       MAX(CASE WHEN s.key = 'low_stock_alert_time' THEN s.value END) as alert_time_legacy,
                       MAX(CASE WHEN s.key = 'low_stock_alert_title' THEN s.value END) as alert_title,
                       MAX(CASE WHEN s.key = 'low_stock_threshold' THEN s.value END) as threshold
                FROM settings s
                WHERE s.key IN ('low_stock_alert_enabled','low_stock_alert_emails','low_stock_alert_schedule','low_stock_alert_time','low_stock_alert_title','low_stock_threshold')
                GROUP BY s.organization_id
                HAVING MAX(CASE WHEN s.key = 'low_stock_alert_enabled' THEN s.value END) = 'true'
            `);

            const now = new Date();
            const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

            for (const s of orgSettings) {
                // Parse schedule — prefer new low_stock_alert_schedule JSON, fall back to legacy low_stock_alert_time plain string
                let scheduleTime = '14:00';
                try {
                    const raw = s.alert_schedule || s.alert_time_legacy;
                    const parsed = raw ? JSON.parse(raw) : null;
                    scheduleTime = parsed?.time || raw || '14:00';
                } catch {
                    scheduleTime = s.alert_schedule || s.alert_time_legacy || '14:00';
                }

                if (scheduleTime !== currentTime) continue;

                // Get recipients
                let recipients: string[] = [];
                try {
                    const parsed = s.alert_emails ? JSON.parse(s.alert_emails) : null;
                    if (parsed?.to) recipients = parsed.to;
                    else if (typeof s.alert_emails === 'string') recipients = s.alert_emails.split(',').map((r: string) => r.trim()).filter(Boolean);
                } catch {
                    recipients = s.alert_emails ? s.alert_emails.split(',').map((r: string) => r.trim()).filter(Boolean) : [];
                }

                if (recipients.length === 0) continue;

                const threshold = parseInt(s.threshold) || 5;
                const lowItems = await db.query(`
                    SELECT i.name, i.type, COALESCE(SUM(inv.quantity), 0) as quantity, i.low_stock_threshold
                    FROM items i
                    LEFT JOIN inventory inv ON i.id = inv.item_id
                    WHERE i.organization_id = $1
                    GROUP BY i.id, i.name, i.type, i.low_stock_threshold
                    HAVING COALESCE(SUM(inv.quantity), 0) <= COALESCE(i.low_stock_threshold, $2)
                    ORDER BY quantity ASC
                `, [s.organization_id, threshold]);

                if (lowItems.length === 0) continue;

                const title = s.alert_title || 'URGENT: Low Stock Alert';
                const rows = lowItems.map((item: any) =>
                    `<tr>
                        <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;color:#1e293b;font-weight:500">${item.name}</td>
                        <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;color:#64748b">${item.type}</td>
                        <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;color:${item.quantity <= 0 ? '#ef4444' : '#f59e0b'};font-weight:700">${item.quantity}</td>
                        <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;color:#64748b">${item.low_stock_threshold ?? threshold}</td>
                    </tr>`
                ).join('');

                const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.topshelfinventory.com';
                const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <tr>
          <td style="background:linear-gradient(135deg,#7f1d1d 0%,#991b1b 100%);padding:32px 48px">
            <h1 style="margin:0;color:white;font-size:20px;font-weight:700">⚠️ ${title}</h1>
            <p style="margin:8px 0 0;color:#fca5a5;font-size:14px">${lowItems.length} item${lowItems.length > 1 ? 's' : ''} at or below threshold</p>
          </td>
        </tr>
        <tr><td style="padding:40px 48px">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
            <thead>
              <tr style="background:#fef2f2">
                <th style="padding:10px 16px;text-align:left;font-size:12px;color:#991b1b;text-transform:uppercase">Item</th>
                <th style="padding:10px 16px;text-align:left;font-size:12px;color:#991b1b;text-transform:uppercase">Category</th>
                <th style="padding:10px 16px;text-align:left;font-size:12px;color:#991b1b;text-transform:uppercase">In Stock</th>
                <th style="padding:10px 16px;text-align:left;font-size:12px;color:#991b1b;text-transform:uppercase">Threshold</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <p style="margin:32px 0 0;text-align:center">
            <a href="${appUrl}/inventory" style="background:#dc2626;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600">View Inventory</a>
          </p>
        </td></tr>
        <tr>
          <td style="background:#f8fafc;padding:20px 48px;border-top:1px solid #e2e8f0;text-align:center">
            <p style="margin:0;color:#94a3b8;font-size:12px">TopShelf Inventory &bull; <a href="${appUrl}/admin/settings/reporting" style="color:#94a3b8">Manage Alerts</a></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

                const lsOpts = {
                    to: recipients,
                    subject: title,
                    html,
                    text: `${title}\n\n${lowItems.map((i: any) => `${i.name}: ${i.quantity} (threshold: ${i.low_stock_threshold ?? threshold})`).join('\n')}\n\nView inventory: ${appUrl}/inventory`,
                };
                const lsCtx = { emailType: 'low_stock_alert' as const, organizationId: s.organization_id, scheduled: true };
                const lsPendingId = await enqueuePendingEmail('reporting', lsOpts, lsCtx);
                await sendEmail('reporting', lsOpts, lsCtx, lsPendingId ?? undefined);

                console.log(`[Scheduler] Sent low stock alert for org ${s.organization_id} to ${recipients.join(', ')}`);
            }
        } catch (e) {
            console.error('[Scheduler] runDueLowStockAlerts error:', e);
        }
    }

    private async runShiftReportEmails() {
        try {
            const { runShiftReportSchedule } = await import('./shift-report-scheduler');
            await runShiftReportSchedule();
        } catch (e) {
            console.error('[Scheduler] Shift report email error:', e);
        }
    }

    private async logRun(name: string, status: string, error?: string) {
        console.log(`[CRON] ${name}: ${status} ${error || ''}`);
    }

    private async checkAutoBackup() {
        try {
            const row = await db.one("SELECT value FROM system_settings WHERE key='db_backups'");
            if (!row) return;
            const cfg = JSON.parse(row.value);
            if (!cfg.cron_enabled) return;

            const intervalHours: Record<string, number> = { daily: 24, weekly: 168, monthly: 720 };
            const minHours = intervalHours[cfg.interval] ?? 168;

            const backupDir = path.join(process.cwd(), 'backups');
            let lastBackupMs = 0;
            if (fs.existsSync(backupDir)) {
                const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.sql'));
                for (const f of files) {
                    const mt = fs.statSync(path.join(backupDir, f)).mtimeMs;
                    if (mt > lastBackupMs) lastBackupMs = mt;
                }
            }

            const hoursSinceLast = (Date.now() - lastBackupMs) / 3600000;
            if (hoursSinceLast < minHours) return;

            console.log(`[Scheduler] Auto backup triggered (interval: ${cfg.interval})`);
            await this.runBackup();
        } catch (e) {
            console.error('[Scheduler] checkAutoBackup error:', e);
        }
    }

    async runBackup(): Promise<string> {
        const backupDir = path.join(process.cwd(), 'backups');
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `backup-${timestamp}.sql`;
        const filepath = path.join(backupDir, filename);
        const dbUrl = process.env.DATABASE_URL || '';

        const cmd = `pg_dump --clean --if-exists --no-password --dbname="${dbUrl}" --file="${filepath}"`;

        return new Promise((resolve, reject) => {
            exec(cmd, (error, _stdout, stderr) => {
                if (error) {
                    console.error(`[Backup] pg_dump error: ${error.message}`, stderr);
                    return reject(error);
                }
                resolve(filename);
            });
        });
    }

    getBackups() {
        const backupDir = path.join(process.cwd(), 'backups');
        if (!fs.existsSync(backupDir)) return [];
        return fs.readdirSync(backupDir)
            .filter(f => f.endsWith('.sql'))
            .map(f => {
                const stat = fs.statSync(path.join(backupDir, f));
                return { name: f, size: stat.size, created: stat.mtime };
            })
            .sort((a, b) => b.created.getTime() - a.created.getTime());
    }
}

export const scheduler = new Scheduler();
