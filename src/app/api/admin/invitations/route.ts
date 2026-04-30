import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { sendEmail } from '@/lib/mail';
import crypto from 'crypto';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const invitations = await db.query(
        `SELECT id, email, role, permissions, created_by_name, expires_at, used_at, created_at,
                used_at IS NULL AND expires_at > NOW() AS is_active
         FROM user_invitations
         WHERE organization_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [session.organizationId]
    );
    return NextResponse.json({ invitations });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { email, role = 'user', permissions = [] } = await req.json();
    if (!email?.trim()) return NextResponse.json({ error: 'Email is required' }, { status: 400 });

    const token = crypto.randomBytes(32).toString('hex');
    const createdByName = `${session.firstName} ${session.lastName}`;

    // Get org name for the email
    const orgs = await db.query('SELECT name FROM organizations WHERE id = $1', [session.organizationId]);
    const orgName = orgs[0]?.name || 'TopShelf';

    await db.execute(
        `INSERT INTO user_invitations (organization_id, token, email, role, permissions, created_by_user_id, created_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [session.organizationId, token, email.trim().toLowerCase(), role, JSON.stringify(permissions), session.id, createdByName]
    );

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.topshelfInventory.com';
    const inviteUrl = `${baseUrl}/register/invite?token=${token}`;

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#111827;margin:0;padding:2rem;font-family:sans-serif;color:#f9fafb;">
  <div style="max-width:500px;margin:0 auto;background:#1f2937;border-radius:12px;padding:2rem;border:1px solid #374151;">
    <h1 style="color:white;font-size:1.4rem;margin:0 0 0.5rem;">You're invited to join ${orgName}</h1>
    <p style="color:#9ca3af;margin:0 0 1.5rem;font-size:0.95rem;">${createdByName} has invited you to create your TopShelf Inventory account.</p>
    <a href="${inviteUrl}"
       style="display:inline-block;background:#d97706;color:white;text-decoration:none;padding:0.85rem 1.75rem;border-radius:8px;font-weight:700;font-size:1rem;margin-bottom:1.5rem;">
      Create My Account
    </a>
    <p style="color:#6b7280;font-size:0.8rem;margin:0;">This link expires in 7 days. If you didn't expect this invitation, you can ignore it.</p>
    <hr style="border:none;border-top:1px solid #374151;margin:1.5rem 0;">
    <p style="color:#4b5563;font-size:0.75rem;margin:0;">Or copy this link: <span style="color:#60a5fa;">${inviteUrl}</span></p>
  </div>
</body>
</html>`;

    const sent = await sendEmail(
        'notifications',
        {
            to: email.trim(),
            subject: `You've been invited to join ${orgName} on TopShelf`,
            html,
            text: `You've been invited to join ${orgName} on TopShelf Inventory.\n\nCreate your account here: ${inviteUrl}\n\nThis link expires in 7 days.`,
        },
        { emailType: 'registration', organizationId: session.organizationId, orgName }
    );

    return NextResponse.json({ ok: true, sent, invite_url: inviteUrl, token });
}

export async function DELETE(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = req.nextUrl;
    const id = parseInt(searchParams.get('id') || '0');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    await db.execute(
        'DELETE FROM user_invitations WHERE id = $1 AND organization_id = $2',
        [id, session.organizationId]
    );
    return NextResponse.json({ ok: true });
}
