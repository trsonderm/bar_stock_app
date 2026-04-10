import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, createSessionToken, COOKIE_OPTIONS } from '@/lib/auth';
import { sendEmail } from '@/lib/mail';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
    try {
        const { companyName, firstName, lastName, email, password } = await req.json();

        if (!companyName || !firstName || !lastName || !email || !password) {
            return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
        }

        // Check if email already exists globally
        const existingUser = await db.one('SELECT id FROM users WHERE email = $1', [email]);
        if (existingUser) {
            return NextResponse.json({ error: 'Email already registered' }, { status: 400 });
        }

        // Check if email verification is required
        const verifySetting = await db.one("SELECT value FROM system_settings WHERE key = 'require_email_verification'");
        const requireVerification = verifySetting?.value === 'true';

        // Begin Transaction
        await db.execute('BEGIN');

        try {
            // 1. Create Organization
            const orgRes = await db.one(`
                INSERT INTO organizations (name, billing_status, created_at)
                VALUES ($1, 'active', DEFAULT)
                RETURNING id
            `, [companyName]);

            const orgId = orgRes.id;

            // 2. Create Default Location
            await db.execute('INSERT INTO locations (name, address, organization_id) VALUES ($1, $2, $3)', ['Main Bar', 'Main Address', orgId]);

            // 3. Create Admin User (unverified if verification required)
            const dummyPinHash = '$2b$10$dummyhashforpureemailuser';

            const adminRes = await db.one(`
                INSERT INTO users (first_name, last_name, email, password_hash, pin_hash, role, permissions, organization_id, is_email_verified)
                VALUES ($1, $2, $3, $4, $5, 'admin', $6, $7, $8)
                RETURNING id
            `, [firstName, lastName, email, hashPassword(password), dummyPinHash, JSON.stringify(["all"]), orgId, !requireVerification]);

            const userId = adminRes.id;

            // 4. Seed Categories
            const defaults = {
                'Liquor': JSON.stringify([1]),
                'Beer': JSON.stringify([1, 6, 24]),
                'Seltzer': JSON.stringify([1, 4, 8]),
                'Wine': JSON.stringify([1]),
                'THC': JSON.stringify([1]),
            };

            for (const [name, options] of Object.entries(defaults)) {
                await db.execute('INSERT INTO categories (name, stock_options, organization_id) VALUES ($1, $2, $3)', [name, options, orgId]);
            }

            // 5. Log
            await db.execute('INSERT INTO activity_logs (organization_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
                [orgId, userId, 'REGISTER_ORG', JSON.stringify({ companyName })]);

            // 6. If verification required, create token and send email
            if (requireVerification) {
                const token = crypto.randomBytes(32).toString('hex');
                const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

                await db.execute(
                    'INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
                    [userId, token, expiresAt]
                );

                // Commit before sending email so the token exists if email is slow
                await db.execute('COMMIT');

                // Get the app URL from settings or env
                const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.topshelfinventory.com';
                const verifyUrl = `${appUrl}/api/auth/verify-email?token=${token}`;

                const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);padding:40px 48px;text-align:center">
            <h1 style="margin:0;color:white;font-size:24px;font-weight:700;letter-spacing:-0.5px">TopShelf Inventory</h1>
            <p style="margin:8px 0 0;color:#94a3b8;font-size:14px">Bar Management Platform</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:48px">
            <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:600">Verify your email address</h2>
            <p style="margin:0 0 8px;color:#475569;font-size:16px;line-height:1.6">Hi ${firstName},</p>
            <p style="margin:0 0 24px;color:#475569;font-size:16px;line-height:1.6">
              Welcome to TopShelf! We're excited to have <strong>${companyName}</strong> on board.
              Please verify your email address to activate your account and start managing your inventory.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 32px">
              <a href="${verifyUrl}"
                style="display:inline-block;background:#d97706;color:white;text-decoration:none;padding:16px 40px;border-radius:8px;font-size:16px;font-weight:600;letter-spacing:0.2px">
                Verify Email Address
              </a>
            </td></tr></table>
            <p style="margin:0 0 8px;color:#64748b;font-size:14px;line-height:1.6">
              This link expires in <strong>24 hours</strong>. If you did not create an account, you can safely ignore this email.
            </p>
            <p style="margin:16px 0 0;color:#94a3b8;font-size:13px;line-height:1.6;word-break:break-all">
              Or copy this link: ${verifyUrl}
            </p>
          </td>
        </tr>
        <!-- Footer -->
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

                await sendEmail('notifications', {
                    to: email,
                    subject: `Verify your TopShelf account`,
                    html,
                    text: `Hi ${firstName},\n\nWelcome to TopShelf! Please verify your email address by visiting:\n${verifyUrl}\n\nThis link expires in 24 hours.\n\n— The TopShelf Team`,
                });

                return NextResponse.json({ success: true, requiresVerification: true, orgId });
            }

            // Commit
            await db.execute('COMMIT');
            return NextResponse.json({ success: true, requiresVerification: false, orgId });

        } catch (err) {
            await db.execute('ROLLBACK');
            throw err;
        }

    } catch (error: any) {
        console.error('Registration error', error);
        if (error.message?.includes('unique constraint') || error.message?.includes('UNIQUE')) {
            return NextResponse.json({ error: 'Registration failed - Organization or Email might exist' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
