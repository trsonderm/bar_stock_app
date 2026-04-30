#!/usr/bin/env node
/**
 * notify-deploy.js — Send deploy lifecycle emails to super admin recipients.
 * Usage: node scripts/notify-deploy.js <event> [json-details-string]
 *
 * Events:
 *   backup_complete    — pre-deploy backup finished
 *   migration_complete — schema migrations applied successfully
 *   migration_warning  — migrations completed with warnings
 */

const { Pool } = require('pg');
const nodemailer = require('nodemailer');

const event = process.argv[2] || 'unknown';
let details = {};
try { details = JSON.parse(process.argv[3] || '{}'); } catch {}

const EVENT_META = {
    backup_complete: {
        subject: '✅ TopShelf: Pre-Deploy Backup Complete',
        color: '#059669',
        icon: '💾',
        title: 'Database Backup Successful',
    },
    migration_complete: {
        subject: '✅ TopShelf: Schema Migrations Applied',
        color: '#1d4ed8',
        icon: '🔄',
        title: 'Schema Migrations Complete',
    },
    migration_warning: {
        subject: '⚠️ TopShelf: Migration Completed With Warnings',
        color: '#d97706',
        icon: '⚠️',
        title: 'Migration Warnings Detected',
    },
};

const meta = EVENT_META[event] || {
    subject: `TopShelf Deploy Event: ${event}`,
    color: '#374151',
    icon: '📋',
    title: event,
};

function buildHtml(meta, details) {
    const rows = Object.entries(details)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `
            <tr>
                <td style="padding:6px 12px;color:#9ca3af;font-size:13px;white-space:nowrap;">${k.replace(/_/g, ' ')}</td>
                <td style="padding:6px 12px;color:#f9fafb;font-size:13px;">${v}</td>
            </tr>`).join('');

    return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#1f2937;border-radius:12px;overflow:hidden;border:1px solid #374151;">
    <div style="background:${meta.color};padding:20px 24px;">
      <h1 style="margin:0;color:white;font-size:18px;font-weight:700;">${meta.icon} ${meta.title}</h1>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">${new Date().toUTCString()}</p>
    </div>
    <div style="padding:24px;">
      ${rows ? `<table style="width:100%;border-collapse:collapse;background:#111827;border-radius:8px;overflow:hidden;">
        ${rows}
      </table>` : ''}
      <p style="margin:20px 0 0;color:#6b7280;font-size:12px;border-top:1px solid #374151;padding-top:16px;">
        Sent automatically by TopShelf deploy system.
      </p>
    </div>
  </div>
</body>
</html>`;
}

async function main() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        // Get SMTP settings
        const settingsRes = await pool.query('SELECT key, value FROM system_settings');
        const cfg = {};
        settingsRes.rows.forEach(r => { cfg[r.key] = r.value; });

        const tier = 'admin';
        const host = cfg[`${tier}_smtp_host`] || '';
        const user = cfg[`${tier}_smtp_user`] || '';
        const pass = cfg[`${tier}_smtp_pass`] || '';
        const port = parseInt(cfg[`${tier}_smtp_port`] || '587');

        if (!host || !user) {
            console.log('[notify-deploy] No SMTP configured — skipping email.');
            return;
        }

        // Get super admin emails
        const adminsRes = await pool.query(
            "SELECT email FROM users WHERE permissions::jsonb ? 'super_admin' AND email IS NOT NULL AND email != ''"
        );
        const recipients = adminsRes.rows.map(r => r.email).filter(Boolean);

        if (!recipients.length) {
            console.log('[notify-deploy] No super admin recipients — skipping email.');
            return;
        }

        const secure = port === 465;
        const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });

        await transporter.sendMail({
            from: `"TopShelf System" <${user}>`,
            to: recipients.join(', '),
            subject: meta.subject,
            html: buildHtml(meta, details),
        });

        console.log(`[notify-deploy] Email sent to: ${recipients.join(', ')}`);
    } catch (e) {
        // Never fail the deploy over a notification error
        console.error('[notify-deploy] Email failed (non-fatal):', e.message);
    } finally {
        await pool.end();
    }
}

main().catch(e => {
    console.error('[notify-deploy] Fatal (non-fatal to deploy):', e.message);
    process.exit(0);
});
