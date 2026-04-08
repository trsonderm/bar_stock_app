import nodemailer from 'nodemailer';
import { db } from './db';

type MailTier = 'reporting' | 'support' | 'admin' | 'notifications';

export async function getSmtpConfig(tier: MailTier) {
    const settings = await db.query('SELECT key, value FROM system_settings');
    const config: Record<string, string> = {};
    settings.forEach((r: any) => config[r.key] = r.value);
    
    return {
        host: config[`${tier}_smtp_host`],
        // Explicitly fallback to 587
        port: parseInt(config[`${tier}_smtp_port`] || '587'),
        secure: config[`${tier}_smtp_secure`] === 'true',
        auth: {
            user: config[`${tier}_smtp_user`],
            pass: config[`${tier}_smtp_pass`]
        }
    };
}

export async function sendEmail(tier: MailTier, options: { to: string | string[], subject: string, text?: string, html?: string }) {
    const config = await getSmtpConfig(tier);
    
    if (!config.host || !config.auth.user) {
        console.warn(`[WARNING] Cannot send email on tier '${tier}': SMTP configuration missing.`);
        return false;
    }
    
    try {
        const transporter = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.secure,
            auth: {
                user: config.auth.user,
                pass: config.auth.pass
            }
        });

        await transporter.sendMail({
            from: `"Bar Stock App" <${config.auth.user}>`,
            ...options
        });
        
        return true;
    } catch (e: any) {
        console.error(`[ERROR] SendEmail failed on tier '${tier}':`, e.message);
        return false;
    }
}
