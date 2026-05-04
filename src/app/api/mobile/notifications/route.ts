import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';

// GET /api/mobile/notifications?unread_only=true&limit=30
export async function GET(req: NextRequest) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const unreadOnly = req.nextUrl.searchParams.get('unread_only') === 'true';
        const limit = Math.min(100, parseInt(req.nextUrl.searchParams.get('limit') || '30'));

        const notifications = await db.query(
            `SELECT id, type, title, message, data, is_read, created_at
             FROM notifications
             WHERE user_id = $1 AND organization_id = $2
             ${unreadOnly ? 'AND is_read = FALSE' : ''}
             ORDER BY created_at DESC
             LIMIT $3`,
            [session.id, session.organizationId, limit]
        );

        const unreadCount = await db.one(
            'SELECT COUNT(*) AS count FROM notifications WHERE user_id = $1 AND organization_id = $2 AND is_read = FALSE',
            [session.id, session.organizationId]
        );

        return NextResponse.json({
            notifications,
            unread_count: parseInt(unreadCount?.count || '0'),
        });
    } catch (err) {
        console.error('Notifications GET error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// PATCH /api/mobile/notifications — mark as read
// Body: { id?: number } — omit id to mark ALL as read
export async function PATCH(req: NextRequest) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const { id } = body;

        if (id) {
            await db.execute(
                'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2',
                [id, session.id]
            );
        } else {
            await db.execute(
                'UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND organization_id = $2',
                [session.id, session.organizationId]
            );
        }

        return NextResponse.json({ ok: true });
    } catch (err) {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
