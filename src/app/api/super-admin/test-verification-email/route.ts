import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { sendEmail } from '@/lib/mail';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { email } = await req.json();
        if (!email || !email.includes('@')) {
            return NextResponse.json({ error: 'Valid email address required' }, { status: 400 });
        }

        // Find or use the super admin user record for the token
        const userId = session.id;

        // Ensure email_verification_tokens table exists (graceful)
        const token = uuidv4();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        await db.execute(
            `INSERT INTO email_verification_tokens (token, user_id, expires_at)
             VALUES ($1, $2, $3)`,
            [token, userId, expiresAt]
        );

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.topshelfinventory.com';
        const verifyLink = `${appUrl}/api/auth/verify-email?token=${token}`;

        const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <tr>
          <td style="background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);padding:40px 48px;text-align:center">
            <h1 style="margin:0;color:white;font-size:24px;font-weight:700;letter-spacing:-0.5px">TopShelf Inventory</h1>
            <p style="margin:8px 0 0;color:#94a3b8;font-size:14px">Bar Management Platform</p>
          </td>
        </tr>
        <tr>
          <td style="padding:48px">
            <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:600">Verify Your Email Address</h2>
            <p style="margin:0 0 8px;color:#475569;font-size:16px;line-height:1.6">Hi there,</p>
            <p style="margin:0 0 24px;color:#475569;font-size:16px;line-height:1.6">
              Please verify your email address to activate your TopShelf account. Click the button below to complete verification.
            </p>
            <p style="margin:0 0 24px;color:#94a3b8;font-size:13px;background:#f1f5f9;padding:12px 16px;border-radius:8px;border-left:4px solid #d97706">
              ⚠️ This is a test verification email sent from Super Admin. The link will work and redirect you to the login page.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
              <a href="${verifyLink}"
                style="display:inline-block;background:#d97706;color:white;text-decoration:none;padding:16px 40px;border-radius:8px;font-size:16px;font-weight:600">
                Verify Email Address
              </a>
            </td></tr></table>
            <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;text-align:center">
              Or copy this link:<br/>
              <span style="font-family:monospace;font-size:12px;word-break:break-all;color:#64748b">${verifyLink}</span>
            </p>
            <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;text-align:center">
              This link expires in 24 hours.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:24px 48px;border-top:1px solid #e2e8f0;text-align:center">
            <p style="margin:0;color:#94a3b8;font-size:13px">
              Sent by TopShelf Inventory &bull; Super Admin Test
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

        const sent = await sendEmail('notifications', {
            to: email,
            subject: 'Verify your TopShelf email address',
            html,
            text: `Please verify your email address by clicking this link:\n\n${verifyLink}\n\nThis link expires in 24 hours.`,
        });

        if (!sent) {
            return NextResponse.json({ error: 'Failed to send email. Check the Notifications mail account in Mail Accounts settings.' }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: `Verification email sent to ${email}` });
    } catch (e: any) {
        console.error('[test-verification-email] Error:', e);
        return NextResponse.json({ error: 'Failed to send: ' + e.message }, { status: 500 });
    }
}
