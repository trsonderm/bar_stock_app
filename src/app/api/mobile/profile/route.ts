import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';

// ── GET /api/mobile/profile ──────────────────────────────────────────────────
// Returns the authenticated user's profile. Never returns password or pin fields.
export async function GET(req: NextRequest) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const user = await db.one(
            `SELECT u.id, u.first_name, u.last_name, u.display_name, u.email,
                    u.phone, u.bio, u.role, u.position, u.profile_picture,
                    u.created_at,
                    ms.notifications_enabled, ms.notify_messages, ms.notify_post_likes,
                    ms.notify_post_comments, ms.notify_schedule, ms.notify_swaps,
                    ms.notify_time_off,
                    ms.address, ms.city, ms.state, ms.zip, ms.country
             FROM users u
             LEFT JOIN mobile_user_settings ms ON ms.user_id = u.id
             WHERE u.id = $1 AND u.organization_id = $2`,
            [session.id, session.organizationId]
        );

        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        return NextResponse.json({ profile: user });
    } catch (err: any) {
        console.error('GET /api/mobile/profile error:', err?.message);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// ── PATCH /api/mobile/profile ────────────────────────────────────────────────
// Update editable profile fields. Only whitelisted fields are accepted.
// Body (all optional): { first_name, last_name, display_name, email, phone, bio }
export async function PATCH(req: NextRequest) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const allowed = ['first_name', 'last_name', 'display_name', 'email', 'phone', 'bio'];
        const updates: Record<string, any> = {};

        for (const key of allowed) {
            if (key in body) {
                const val = body[key];
                if (val !== null && typeof val !== 'string')
                    return NextResponse.json({ error: `${key} must be a string or null` }, { status: 400 });
                updates[key] = val === null ? null : (val as string).trim() || null;
            }
        }

        if (Object.keys(updates).length === 0)
            return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 });

        // Email uniqueness check (across org)
        if (updates.email) {
            const conflict = await db.one(
                `SELECT id FROM users WHERE email = $1 AND id != $2`,
                [updates.email, session.id]
            );
            if (conflict)
                return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
        }

        const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 1}`);
        const values = [...Object.values(updates), session.id, session.organizationId];

        await db.execute(
            `UPDATE users SET ${setClauses.join(', ')}
             WHERE id = $${setClauses.length + 1} AND organization_id = $${setClauses.length + 2}`,
            values
        );

        // Return updated profile
        const user = await db.one(
            `SELECT id, first_name, last_name, display_name, email, phone, bio,
                    role, position, profile_picture, created_at
             FROM users WHERE id = $1`,
            [session.id]
        );

        return NextResponse.json({ ok: true, profile: user });
    } catch (err: any) {
        console.error('PATCH /api/mobile/profile error:', err?.message);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
