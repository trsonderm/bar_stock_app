import nodemailer from 'nodemailer';
import { db } from './db';
import { syslog } from './syslog';

type MailTier = 'reporting' | 'support' | 'admin' | 'notifications';

export async function getSmtpConfig(tier: MailTier) {
    const settings = await db.query('SELECT key, value FROM system_settings');
    const config: Record<string, string> = {};
    settings.forEach((r: any) => config[r.key] = r.value);

    const port = parseInt(config[`${tier}_smtp_port`] || '587');

    // Port 465 = implicit SSL (secure: true).
    // Port 587 / 25 / anything else = STARTTLS (secure: false, nodemailer upgrades automatically).
    // Ignore the stored checkbox when the port makes the answer unambiguous — a common
    // misconfiguration is checking "SSL/TLS" while leaving port 587, which causes the
    // "wrong version number" OpenSSL error.
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

export async function sendEmail(
    tier: MailTier,
    options: { to: string | string[]; subject: string; text?: string; html?: string }
) {
    const config = await getSmtpConfig(tier);

    if (!config.host || !config.auth.user) {
        await syslog.warn('email', `Cannot send email — SMTP not configured for tier "${tier}"`, {
            tier,
            subject: options.subject,
            to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
            reason: 'missing host or user',
        });
        return false;
    }

    const meta = {
        tier,
        subject: options.subject,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
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
        return false;
    }
}
