import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { theme } = await request.json();

        if (!['light', 'dark', 'blue', 'default'].includes(theme)) {
            return NextResponse.json({ error: 'Invalid theme provided.' }, { status: 400 });
        }

        const newTheme = theme === 'default' ? null : theme;

        await db.execute('UPDATE users SET ui_theme = $1 WHERE id = $2', [newTheme, session.id]);

        return NextResponse.json({ success: true, theme: newTheme });
    } catch (e) {
        console.error('Theme Update Error:', e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
