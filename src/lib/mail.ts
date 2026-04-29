import nodemailer from 'nodemailer';
import { db } from './db';
import { syslog } from './syslog';

type MailTier = 'reporting' | 'support' | 'admin' | 'notifications';

export type EmailType =
    | 'low_stock_alert'
    | 'scheduled_report'
    | 'smart_order'
    | 'shift_report'
    | 'activity_report'
    | 'test'
    | 'manual'
    | 'order_received'
    | 'verification'
    | 'registration'
    | 'other';

export interface EmailContext {
    emailType?: EmailType;
    organizationId?: number;
    orgName?: string;
    scheduled?: boolean;
}

export async function getSmtpConfig(tier: MailTier) {
    const settings = await db.query('SELECT key, value FROM system_settings');
    const config: Record<string, string> = {};
    settings.forEach((r: any) => config[r.key] = r.value);

    const port = parseInt(config[`${tier}_smtp_port`] || '587');

    // Port 465 = implicit SSL (secure: true).
    // Port 587 / 25 / anything else = STARTTLS (secure: false, nodemailer upgrades automatically).
    const secureStored = config[`${tier}_smtp_secure`] === 'true';
    const secure = port === 465 ? true : port === 587 || port === 25 ? false : secureStored;

    return {
        host: config[`${tier}_smtp_host`] || '',
        port,
        secure,
        auth: {
            user: config[`${tier}_smtp_user`] || '',
            pass: config[`${tier}_smtp_pass`] || '',
        },
    };
}

export async function enqueuePendingEmail(
    tier: MailTier,
    options: { to: string | string[]; subject: string; text?: string; html?: string },
    context?: EmailContext
): Promise<number | null> {
    const toArr = Array.isArray(options.to) ? options.to : [options.to];
    try {
        const row = await db.one(
            `INSERT INTO email_log
                (organization_id, org_name, email_type, tier, subject, recipients, html_body, text_body, status, scheduled)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9)
             RETURNING id`,
            [
                context?.organizationId ?? null,
                context?.orgName ?? null,
                context?.emailType ?? 'other',
                tier,
                options.subject ?? null,
                JSON.stringify({ to: toArr }),
                options.html ?? null,
                options.text ?? null,
                context?.scheduled ?? false,
            ]
        );
        return row?.id ?? null;
    } catch (e) {
        console.error('[mail] Failed to enqueue pending email:', e);
        return null;
    }
}

export async function sendEmail(
    tier: MailTier,
    options: { to: string | string[]; subject: string; text?: string; html?: string },
    context?: EmailContext,
    pendingLogId?: number
): Promise<boolean> {
    const toArr = Array.isArray(options.to) ? options.to : [options.to];

    const logAttempt = async (status: 'sent' | 'failed' | 'skipped', errorMessage?: string) => {
        try {
            if (pendingLogId) {
                await db.execute(
                    `UPDATE email_log SET status=$1, error_message=$2, sent_at=NOW() WHERE id=$3`,
                    [status, errorMessage ?? null, pendingLogId]
                );
            } else {
                await db.execute(
                    `INSERT INTO email_log
                        (organization_id, org_name, email_type, tier, subject, recipients, html_body, text_body, status, error_message, scheduled)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
                    [
                        context?.organizationId ?? null,
                        context?.orgName ?? null,
                        context?.emailType ?? 'other',
                        tier,
                        options.subject ?? null,
                        JSON.stringify({ to: toArr }),
                        options.html ?? null,
                        options.text ?? null,
                        status,
                        errorMessage ?? null,
                        context?.scheduled ?? false,
                    ]
                );
            }
        } catch (e) {
            console.error('[mail] Failed to write email_log:', e);
        }
    };

    const config = await getSmtpConfig(tier);

    if (!config.host || !config.auth.user) {
        await syslog.warn('email', `Cannot send email — SMTP not configured for tier "${tier}"`, {
            tier,
            subject: options.subject,
            to: toArr.join(', '),
            reason: 'missing host or user',
        });
        await logAttempt('skipped', `SMTP not configured for tier "${tier}"`);
        return false;
    }

    const meta = {
        tier,
        subject: options.subject,
        to: toArr.join(', '),
        host: config.host,
        port: config.port,
        user: config.auth.user,
        secure: config.secure,
    };

    try {
        const transporter = nodemailer.createTransport({
            host:   config.host,
            port:   config.port,
            secure: config.secure,
            auth: {
                user: config.auth.user,
                pass: config.auth.pass,
            },
        });

        const info = await transporter.sendMail({
            from: `"TopShelf" <${config.auth.user}>`,
            ...options,
        });

        await syslog.info('email', `Email sent — ${tier} tier — "${options.subject}"`, {
            ...meta,
            messageId: info.messageId,
        });
        await logAttempt('sent');
        return true;
    } catch (e: any) {
        await syslog.error('email', `SMTP send failed — ${tier} tier — "${options.subject}"`, {
            ...meta,
            error:    e.message,
            code:     e.code,
            command:  e.command,
            response: e.response,
            stack:    e.stack?.split('\n').slice(0, 5).join('\n'),
        });
        await logAttempt('failed', e.message);
        return false;
    }
}
