import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        // Fetch unread notifications for the user
        // Optional: Limit to last 50?
        const notifications = await db.query(`
            SELECT * FROM notifications 
            WHERE user_id = $1 
            AND is_read = false
            ORDER BY created_at DESC
            LIMIT 50
        `, [session.id]);

        return NextResponse.json({ notifications });
    } catch (e) {
        console.error('Fetch Notifications Error', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const body = await req.json();
        const { id, all } = body;

        if (all) {
            await db.execute(`
                UPDATE notifications 
                SET is_read = true 
                WHERE user_id = $1
            `, [session.id]);
        } else if (id) {
            await db.execute(`
                UPDATE notifications 
                SET is_read = true 
                WHERE id = $1 AND user_id = $2
            `, [id, session.id]);
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
