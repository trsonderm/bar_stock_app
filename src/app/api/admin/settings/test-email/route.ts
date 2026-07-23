import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getSession } from '@/lib/auth';
import { getSmtpConfig } from '@/lib/mail';

const TIERS = ['reporting', 'support', 'admin', 'notifications'] as const;

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const tier = TIERS.includes(body.tier) ? body.tier : 'reporting';
        const to = (body.to as string | undefined)?.trim();

        if (!to) {
            return NextResponse.json({ error: 'Recipient email (to) is required.' }, { status: 400 });
        }

        const config = await getSmtpConfig(tier);

        // Return diagnostic info even before trying to send
        const diagnostic = {
            tier,
            host: config.host || '(not set)',
            port: config.port,
            secure: config.secure,
            user: config.auth.user || '(not set)',
            hasPassword: !!config.auth.pass,
            to,
        };

        if (!config.host || !config.auth.user) {
            return NextResponse.json({
                success: false,
                diagnostic,
                error: `SMTP not configured for the "${tier}" tier. Go to Super Admin → Mail Accounts to set up SMTP credentials.`,
            }, { status: 422 });
        }

        const transporter = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.secure,
            auth: { user: config.auth.user, pass: config.auth.pass },
        });

        // Verify connection first — this catches auth errors before attempting delivery
        await transporter.verify();

        const info = await transporter.sendMail({
            from: `"TopShelf" <${config.auth.user}>`,
            to,
            subject: `SMTP Test — TopShelf ${tier} tier — ${new Date().toLocaleTimeString()}`,
            html: `
                <div style="font-family:sans-serif;padding:20px;border:1px solid #eee;border-radius:6px;max-width:560px;margin:0 auto;">
                    <h2 style="color:#10b981;margin:0 0 12px">✓ SMTP Working</h2>
                    <p>This test email confirms that the <strong>${tier}</strong> SMTP account is configured and reachable.</p>
                    <table style="font-size:0.85em;color:#555;border-collapse:collapse;width:100%;margin-top:16px">
                        <tr><td style="padding:4px 8px;font-weight:600;width:110px">Host</td><td style="padding:4px 8px">${config.host}</td></tr>
                        <tr><td style="padding:4px 8px;font-weight:600">Port</td><td style="padding:4px 8px">${config.port} (${config.secure ? 'SSL' : 'STARTTLS'})</td></tr>
                        <tr><td style="padding:4px 8px;font-weight:600">From</td><td style="padding:4px 8px">${config.auth.user}</td></tr>
                        <tr><td style="padding:4px 8px;font-weight:600">To</td><td style="padding:4px 8px">${to}</td></tr>
                    </table>
                    <p style="margin-top:16px;font-size:0.8em;color:#999">
                        If this landed in spam, add an SPF record for ${config.host} and enable DKIM signing on your email provider.
                    </p>
                </div>`,
            text: `SMTP test from TopShelf — ${tier} tier.\nHost: ${config.host}:${config.port}\nFrom: ${config.auth.user}\nTo: ${to}`,
        });

        return NextResponse.json({
            success: true,
            diagnostic,
            messageId: info.messageId,
            message: `Test email sent to ${to} via ${config.host}:${config.port}`,
        });

    } catch (e: any) {
        // Parse common SMTP errors into human-readable explanations
        let hint = '';
        const msg: string = e.message || '';
        const code: string = e.code || '';
        const resp: string = e.response || '';

        if (code === 'ECONNREFUSED') hint = 'Connection refused — check the host and port. Port 25 is blocked by most cloud providers; use 587 (STARTTLS) or 465 (SSL).';
        else if (code === 'ENOTFOUND') hint = 'Host not found — verify the SMTP hostname.';
        else if (code === 'ETIMEDOUT' || code === 'ECONNRESET') hint = 'Connection timed out — the host is unreachable. Outbound port 25 is commonly blocked; try port 587 or 465.';
        else if (resp.includes('535') || resp.includes('Authentication') || msg.includes('Invalid login')) hint = 'Authentication failed — check the SMTP username and password. For Gmail/Microsoft you need an App Password, not your account password.';
        else if (resp.includes('550')) hint = 'Recipient rejected by the server — verify the recipient address and that your SMTP account is allowed to send externally.';
        else if (resp.includes('553') || resp.includes('from address')) hint = 'The "from" address is rejected by the SMTP server — it must match an address authorised on your account.';
        else if (resp.includes('454') || resp.includes('TLS')) hint = 'TLS negotiation failed — try toggling the Secure (SSL) setting or use a different port.';

        return NextResponse.json({
            success: false,
            error: msg,
            code,
            response: resp,
            hint: hint || 'Check Super Admin → System Logs for full SMTP error details.',
        }, { status: 500 });
    }
}
