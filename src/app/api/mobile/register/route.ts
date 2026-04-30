import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, hashPin, createSessionToken } from '@/lib/auth';

// POST /api/mobile/register — complete registration via invite token (no cookie, returns Bearer token)
export async function POST(req: NextRequest) {
    const { token, firstName, lastName, displayName, email, phone, password, pin } = await req.json();

    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    if (!firstName?.trim() || !lastName?.trim()) return NextResponse.json({ error: 'First and last name are required' }, { status: 400 });
    if (!password || password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    if (!pin || !/^\d{4}$/.test(pin)) return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 });

    const rows = await db.query(
        `SELECT ui.*, o.name AS org_name, o.subscription_plan
         FROM user_invitations ui
         JOIN organizations o ON o.id = ui.organization_id
         WHERE ui.token = $1`,
        [token]
    );
    if (!rows.length) return NextResponse.json({ error: 'Invalid invitation token' }, { status: 404 });

    const inv = rows[0];
    if (inv.used_at) return NextResponse.json({ error: 'Invitation already used' }, { status: 410 });
    if (new Date(inv.expires_at) < new Date()) return NextResponse.json({ error: 'Invitation expired' }, { status: 410 });

    const finalEmail = (email?.trim() || inv.email || '').toLowerCase() || null;
    if (finalEmail) {
        const existing = await db.query('SELECT id FROM users WHERE email = $1', [finalEmail]);
        if (existing.length) return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
    }

    let permissions: string[] = [];
    try { permissions = typeof inv.permissions === 'string' ? JSON.parse(inv.permissions) : (inv.permissions || []); } catch { }

    const userRows = await db.query(
        `INSERT INTO users
            (organization_id, first_name, last_name, display_name, email, password_hash, pin_hash, role, permissions, phone, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE) RETURNING id`,
        [
            inv.organization_id,
            firstName.trim(),
            lastName.trim(),
            displayName?.trim() || null,
            finalEmail || null,
            hashPassword(password),
            hashPin(pin),
            inv.role || 'user',
            JSON.stringify(permissions),
            phone?.trim() || null,
        ]
    );

    const userId = userRows[0].id;
    await db.execute('UPDATE user_invitations SET used_at = NOW(), used_by_user_id = $1 WHERE token = $2', [userId, token]);

    const locations = await db.query('SELECT id FROM locations WHERE organization_id = $1', [inv.organization_id]);
    for (const loc of locations) {
        await db.execute('INSERT INTO user_locations (user_id, location_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [userId, loc.id]).catch(() => {});
    }

    const bearerToken = await createSessionToken({
        id: userId, role: inv.role || 'user', permissions,
        firstName: firstName.trim(), lastName: lastName.trim(),
        email: finalEmail || undefined,
        organizationId: inv.organization_id,
        isSuperAdmin: false, subscriptionPlan: inv.subscription_plan,
    });

    return NextResponse.json({
        token: bearerToken,
        expires_in: 604800,
        user: { id: userId, first_name: firstName.trim(), last_name: lastName.trim(), role: inv.role, email: finalEmail },
        organization: { id: inv.organization_id, name: inv.org_name },
    });
}

// GET /api/mobile/register?token=... — validate invite token
export async function GET(req: NextRequest) {
    const token = req.nextUrl.searchParams.get('token');
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

    const rows = await db.query(
        `SELECT ui.email, ui.role, ui.expires_at, ui.used_at, o.name AS org_name
         FROM user_invitations ui
         JOIN organizations o ON o.id = ui.organization_id
         WHERE ui.token = $1`,
        [token]
    );
    if (!rows.length) return NextResponse.json({ error: 'Invalid token' }, { status: 404 });

    const inv = rows[0];
    if (inv.used_at) return NextResponse.json({ error: 'Invitation already used' }, { status: 410 });
    if (new Date(inv.expires_at) < new Date()) return NextResponse.json({ error: 'Invitation expired' }, { status: 410 });

    return NextResponse.json({ valid: true, org_name: inv.org_name, email: inv.email, role: inv.role });
}
