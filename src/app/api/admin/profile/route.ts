import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET() {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await db.one(`
        SELECT id, first_name, last_name, email, phone, bio, display_name,
               profile_picture, notification_preferences
        FROM users WHERE id = $1
    `, [session.id]);

    return NextResponse.json({ user });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { display_name, phone, bio, profile_picture, notification_preferences } = body;

    await db.execute(`
        UPDATE users SET
            display_name = COALESCE($1, display_name),
            phone = COALESCE($2, phone),
            bio = COALESCE($3, bio),
            profile_picture = COALESCE($4, profile_picture),
            notification_preferences = COALESCE($5::jsonb, notification_preferences)
        WHERE id = $6
    `, [
        display_name ?? null,
        phone ?? null,
        bio ?? null,
        profile_picture ?? null,
        notification_preferences ? JSON.stringify(notification_preferences) : null,
        session.id,
    ]);

    return NextResponse.json({ ok: true });
}
