import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const user = await db.one('SELECT notification_preferences FROM users WHERE id = $1', [session.id]);
        return NextResponse.json({
            preferences: user?.notification_preferences || { price_changes: true, stock_changes: true, system: true }
        });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const body = await req.json();
        // Validate keys if strict, or just trust JSONB
        await db.execute('UPDATE users SET notification_preferences = $1 WHERE id = $2', [JSON.stringify(body), session.id]);
        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
