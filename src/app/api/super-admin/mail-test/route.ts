import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { sendEmail, getSmtpConfig } from '@/lib/mail';

type MailTier = 'reporting' | 'support' | 'admin' | 'notifications';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { tier, to } = await req.json();
        const validTiers: MailTier[] = ['reporting', 'support', 'admin', 'notifications'];
        if (!validTiers.includes(tier)) {
            return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
        }
        if (!to) {
            return NextResponse.json({ error: 'Recipient email required' }, { status: 400 });
        }

        const config = await getSmtpConfig(tier as MailTier);
        if (!config.host || !config.auth.user) {
            return NextResponse.json({ error: `SMTP not configured for "${tier}" tier. Please save settings first.` }, { status: 400 });
        }

        const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:500px;margin:0 auto;padding:32px;background:white;border-radius:12px;border:1px solid #e2e8f0">
  <h2 style="margin:0 0 16px;color:#0f172a">✅ TopShelf Mail Test Successful</h2>
  <p style="color:#475569;margin:0 0 16px">
    The <strong>${tier}</strong> SMTP route is working correctly.
  </p>
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
            text: `TopShelf mail test successful.\nTier: ${tier}\nHost: ${config.host}\nSent at: ${new Date().toLocaleString()}`,
        });

        if (!success) {
            return NextResponse.json({ error: 'Email send failed. Check server logs for SMTP error details.' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error('[mail-test]', e);
        return NextResponse.json({ error: e.message || 'Internal Error' }, { status: 500 });
    }
}
