import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';

// ── GET /api/mobile/settings ─────────────────────────────────────────────────
// Returns mobile-specific settings for the authenticated user.
// Creates a default row if none exists (idempotent).
export async function GET(req: NextRequest) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Upsert default settings row so every user always has one
        await db.execute(
            `INSERT INTO mobile_user_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
            [session.id]
        );

        const settings = await db.one(
            `SELECT user_id, notifications_enabled, notify_messages, notify_post_likes,
                    notify_post_comments, notify_schedule, notify_swaps, notify_time_off,
                    address, city, state, zip, country, updated_at
             FROM mobile_user_settings WHERE user_id = $1`,
            [session.id]
        );

        return NextResponse.json({ settings });
    } catch (err: any) {
        console.error('GET /api/mobile/settings error:', err?.message);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// ── PATCH /api/mobile/settings ───────────────────────────────────────────────
// Update notification preferences and/or address info.
// Body (all optional, send only what you want to change):
// {
//   notifications_enabled: boolean,
//   notify_messages: boolean,
//   notify_post_likes: boolean,
//   notify_post_comments: boolean,
//   notify_schedule: boolean,
//   notify_swaps: boolean,
//   notify_time_off: boolean,
//   address: string,
//   city: string,
//   state: string,
//   zip: string,
//   country: string
// }
export async function PATCH(req: NextRequest) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();

        const boolFields = [
            'notifications_enabled', 'notify_messages', 'notify_post_likes',
            'notify_post_comments', 'notify_schedule', 'notify_swaps', 'notify_time_off',
        ];
        const strFields = ['address', 'city', 'state', 'zip', 'country'];

        const updates: Record<string, any> = {};

        for (const key of boolFields) {
            if (key in body) {
                if (typeof body[key] !== 'boolean')
                    return NextResponse.json({ error: `${key} must be a boolean` }, { status: 400 });
                updates[key] = body[key];
            }
        }

        for (const key of strFields) {
            if (key in body) {
                const val = body[key];
                if (val !== null && typeof val !== 'string')
                    return NextResponse.json({ error: `${key} must be a string or null` }, { status: 400 });
                updates[key] = val === null ? null : (val as string).trim() || null;
            }
        }

        if (Object.keys(updates).length === 0)
            return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 });

        const keys = Object.keys(updates);
        const setClauses = keys.map((k, i) => `${k} = $${i + 2}`);
        const values = [session.id, ...Object.values(updates)];

        await db.execute(
            `INSERT INTO mobile_user_settings (user_id, ${keys.join(', ')})
             VALUES ($1, ${keys.map((_, i) => `$${i + 2}`).join(', ')})
             ON CONFLICT (user_id) DO UPDATE SET ${setClauses.join(', ')}, updated_at = NOW()`,
            values
        );

        const settings = await db.one(
            `SELECT user_id, notifications_enabled, notify_messages, notify_post_likes,
                    notify_post_comments, notify_schedule, notify_swaps, notify_time_off,
                    address, city, state, zip, country, updated_at
             FROM mobile_user_settings WHERE user_id = $1`,
            [session.id]
        );

        return NextResponse.json({ ok: true, settings });
    } catch (err: any) {
        console.error('PATCH /api/mobile/settings error:', err?.message);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
