import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { scheduler } from '@/lib/scheduler';
import { db } from '@/lib/db';
import { getSmtpConfig, sendEmail } from '@/lib/mail';

type MailTier = 'reporting' | 'support' | 'admin' | 'notifications';

// GET — return scheduler status, task list with last run, SMTP health, recent email log
export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const taskList = scheduler.getTaskList();
        const runLog = scheduler.getRunLog();

        // For each task find its most recent run log entry
        const tasks = taskList.map(t => {
            const entries = runLog
                .filter(e => e.name === t.name)
                .sort((a, b) => b.ts.getTime() - a.ts.getTime());
            const last = entries[0] ?? null;
            return {
                name: t.name,
                cron: t.cron,
                lastRun: last
                    ? { status: last.status, ts: last.ts.toISOString(), error: last.error ?? null }
                    : null,
            };
        });

        const schedulerRunning = (scheduler as any).interval != null;

        const smtp = await getSmtpHealth();
        const recentEmails = await getRecentEmailLog();

        return NextResponse.json({ schedulerRunning, tasks, smtp, recentEmails });
    } catch (err: any) {
        console.error('[cron-analyzer GET]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// POST — trigger task or send test email
export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { action } = body;

        if (action === 'trigger') {
            const { task } = body as { task: string };
            let result = '';

            switch (task) {
                case 'reports':
                    await (scheduler as any).runDueReportSchedules();
                    result = 'Report Schedules task triggered.';
                    break;
                case 'low_stock':
                    await (scheduler as any).runDueLowStockAlerts();
                    result = 'Low Stock Alerts task triggered.';
                    break;
                case 'shift_reports':
                    await (scheduler as any).runShiftReportEmails();
                    result = 'Shift Report Emails task triggered.';
                    break;
                case 'billing':
                    await (scheduler as any).checkBilling();
                    result = 'Billing Check task triggered.';
                    break;
                case 'cleanup':
                    await (scheduler as any).cleanupLogs();
                    result = 'Daily Cleanup task triggered.';
                    break;
                case 'disable':
                    await (scheduler as any).runAutoDisablePastDue();
                    result = 'Auto Disable Past Due task triggered.';
                    break;
                case 'backup':
                    const filename = await scheduler.runBackup();
                    result = `Backup completed: ${filename}`;
                    break;
                case 'all':
                    await Promise.allSettled([
                        (scheduler as any).runDueReportSchedules(),
                        (scheduler as any).runDueLowStockAlerts(),
                        (scheduler as any).runShiftReportEmails(),
                        (scheduler as any).checkBilling(),
                        (scheduler as any).cleanupLogs(),
                    ]);
                    result = 'All tasks triggered.';
                    break;
                default:
                    return NextResponse.json({ error: `Unknown task: ${task}` }, { status: 400 });
            }

            return NextResponse.json({ ok: true, result });
        }

        if (action === 'test_email') {
            const { tier, to } = body as { tier: string; to: string };
            const validTiers: MailTier[] = ['reporting', 'support', 'admin', 'notifications'];
            if (!validTiers.includes(tier as MailTier)) {
                return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
            }
            if (!to) {
                return NextResponse.json({ error: 'Recipient email required' }, { status: 400 });
            }

            const config = await getSmtpConfig(tier as MailTier);
            if (!config.host || !config.auth.user) {
                return NextResponse.json({
                    error: `SMTP not configured for "${tier}" tier. Please save settings first.`,
                }, { status: 400 });
            }

            const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:500px;margin:0 auto;padding:32px;background:white;border-radius:12px;border:1px solid #e2e8f0">
  <h2 style="margin:0 0 16px;color:#0f172a">&#x2705; TopShelf Mail Test Successful</h2>
  <p style="color:#475569;margin:0 0 16px">The <strong>${tier}</strong> SMTP route is working correctly.</p>
  <table style="width:100%;font-size:13px;color:#64748b;border-collapse:collapse">
    <tr><td style="padding:4px 0"><strong>Tier:</strong></td><td>${tier}</td></tr>
    <tr><td style="padding:4px 0"><strong>Host:</strong></td><td>${config.host}</td></tr>
    <tr><td style="padding:4px 0"><strong>Port:</strong></td><td>${config.port}</td></tr>
    <tr><td style="padding:4px 0"><strong>User:</strong></td><td>${config.auth.user}</td></tr>
    <tr><td style="padding:4px 0"><strong>Secure:</strong></td><td>${config.secure ? 'Yes (SSL/TLS)' : 'No (STARTTLS)'}</td></tr>
    <tr><td style="padding:4px 0"><strong>Sent at:</strong></td><td>${new Date().toLocaleString()}</td></tr>
  </table>
</div>`;

            const success = await sendEmail(tier as MailTier, {
                to,
                subject: `[TopShelf] Test email — ${tier} tier`,
                html,
                text: `TopShelf mail test.\nTier: ${tier}\nHost: ${config.host}\nSent at: ${new Date().toLocaleString()}`,
            }, { emailType: 'test' });

            if (!success) {
                return NextResponse.json({ error: 'Email send failed. Check System Logs for the SMTP error.' }, { status: 500 });
            }

            return NextResponse.json({ ok: true });
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    } catch (err: any) {
        console.error('[cron-analyzer POST]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// PUT — update SMTP settings for a tier
export async function PUT(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { tier, host, port, user, pass, secure } = await req.json();
        const validTiers: MailTier[] = ['reporting', 'support', 'admin', 'notifications'];
        if (!validTiers.includes(tier)) {
            return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
        }

        const upsert = async (key: string, value: string) => {
            await db.execute(
                "INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2",
                [key, value]
            );
        };

        await upsert(`${tier}_smtp_host`, host ?? '');
        await upsert(`${tier}_smtp_port`, String(port ?? '587'));
        await upsert(`${tier}_smtp_user`, user ?? '');
        await upsert(`${tier}_smtp_secure`, secure ? 'true' : 'false');

        // Only update password if non-empty
        if (pass && String(pass).trim() !== '') {
            await upsert(`${tier}_smtp_pass`, pass);
        }

        return NextResponse.json({ ok: true });
    } catch (err: any) {
        console.error('[cron-analyzer PUT]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// Helpers

async function getSmtpHealth() {
    const tiers: MailTier[] = ['reporting', 'support', 'admin', 'notifications'];
    const result: Record<string, { configured: boolean; host: string; user: string }> = {};
    for (const tier of tiers) {
        try {
            const cfg = await getSmtpConfig(tier);
            result[tier] = {
                configured: !!(cfg.host && cfg.auth.user),
                host: cfg.host || '(not set)',
                user: cfg.auth.user
                    ? cfg.auth.user.replace(/(.{2}).+(@.+)/, '$1***$2')
                    : '(not set)',
            };
        } catch {
            result[tier] = { configured: false, host: '(error)', user: '(error)' };
        }
    }
    return result;
}

async function getRecentEmailLog() {
    try {
        return await db.query(`
            SELECT id, email_type, tier, subject, status, error_message, scheduled, sent_at,
                   COALESCE(org_name, (SELECT name FROM organizations WHERE id = organization_id)) AS org_display
            FROM email_log
            ORDER BY sent_at DESC NULLS LAST
            LIMIT 50
        `);
    } catch {
        return [];
    }
}
