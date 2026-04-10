import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendEmail } from '@/lib/mail';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    if (!token) {
        return NextResponse.redirect(new URL('/login?verified=invalid', req.url));
    }

    try {
        // Look up the token
        const row = await db.one(`
            SELECT evt.*, u.email, u.first_name, u.last_name, u.is_email_verified
            FROM email_verification_tokens evt
            JOIN users u ON evt.user_id = u.id
            WHERE evt.token = $1
        `, [token]);

        if (!row) {
            return NextResponse.redirect(new URL('/login?verified=invalid', req.url));
        }

        if (row.used_at) {
            // Already used — just redirect to login
            return NextResponse.redirect(new URL('/login?verified=already', req.url));
        }

        if (new Date(row.expires_at) < new Date()) {
            return NextResponse.redirect(new URL('/login?verified=expired', req.url));
        }

        // Mark token as used and user as verified
        await db.execute(
            'UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1',
            [row.id]
        );
        await db.execute(
            'UPDATE users SET is_email_verified = TRUE WHERE id = $1',
            [row.user_id]
        );

        // Send confirmation email
        const html = `
<!DOCTYPE html>
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
            <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding-bottom:32px">
              <div style="width:64px;height:64px;background:#d1fae5;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:32px">✓</div>
            </td></tr></table>
            <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:600;text-align:center">Email Verified!</h2>
            <p style="margin:0 0 8px;color:#475569;font-size:16px;line-height:1.6">Hi ${row.first_name},</p>
            <p style="margin:0 0 24px;color:#475569;font-size:16px;line-height:1.6">
              Your email address has been successfully verified. Your TopShelf account is now active and ready to use.
            </p>
            <p style="margin:0 0 32px;color:#475569;font-size:16px;line-height:1.6">
              Thank you for choosing TopShelf to manage your bar inventory. We're thrilled to have you with us!
            </p>
            <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
              <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://app.topshelfinventory.com'}/login"
                style="display:inline-block;background:#d97706;color:white;text-decoration:none;padding:16px 40px;border-radius:8px;font-size:16px;font-weight:600">
                Log In to Your Account
              </a>
            </td></tr></table>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:24px 48px;border-top:1px solid #e2e8f0;text-align:center">
            <p style="margin:0;color:#94a3b8;font-size:13px">
              Sent by TopShelf Inventory &bull; <a href="mailto:notifications@topshelfinventory.com" style="color:#94a3b8">notifications@topshelfinventory.com</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

        // Send async — don't block the redirect
        sendEmail('notifications', {
            to: row.email,
            subject: `Your TopShelf account is verified`,
            html,
            text: `Hi ${row.first_name},\n\nYour email has been verified and your TopShelf account is now active.\n\nThank you for joining TopShelf!\n\n— The TopShelf Team`,
        }).catch(e => console.error('[verify-email] Confirmation email failed:', e));

        return NextResponse.redirect(new URL('/login?verified=success', req.url));

    } catch (e) {
        console.error('[verify-email] Error:', e);
        return NextResponse.redirect(new URL('/login?verified=error', req.url));
    }
}
