import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';

// ── GET /api/mobile/messages/poll?since=<ISO> ────────────────────────────────
// Long-poll / short-poll endpoint for live messaging.
// Returns all messages across the user's threads created after `since`.
// Also returns updated unread counts per thread.
//
// Recommended polling interval: 5–10 seconds while app is in foreground.
// Use FCM push (new_message notification data) to wake from background.
//
// Example: GET /api/mobile/messages/poll?since=2024-01-15T12:00:00.000Z
export async function GET(req: NextRequest) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const since = req.nextUrl.searchParams.get('since');
        if (!since) return NextResponse.json({ error: 'since param required (ISO timestamp)' }, { status: 400 });

        // Validate timestamp
        const sinceDate = new Date(since);
        if (isNaN(sinceDate.getTime()))
            return NextResponse.json({ error: 'since must be a valid ISO timestamp' }, { status: 400 });

        // New messages in any thread the user belongs to
        const messages = await db.query(
            `SELECT dm.id, dm.thread_id, dm.sender_id, dm.content, dm.image, dm.created_at,
                    COALESCE(u.display_name, u.first_name || ' ' || u.last_name) AS sender_name,
                    u.profile_picture AS sender_avatar
             FROM direct_messages dm
             JOIN message_thread_members mtm ON mtm.thread_id = dm.thread_id AND mtm.user_id = $1
             JOIN message_threads mt ON mt.id = dm.thread_id AND mt.organization_id = $2
             JOIN users u ON u.id = dm.sender_id
             WHERE dm.created_at > $3
             ORDER BY dm.created_at ASC`,
            [session.id, session.organizationId, since]
        );

        // Current unread counts per thread (only threads that have new activity)
        const threadIds: number[] = [...new Set(messages.map((m: any) => m.thread_id))];
        let unread: any[] = [];
        if (threadIds.length > 0) {
            unread = await db.query(
                `SELECT mtm.thread_id,
                        COUNT(dm.id) FILTER (
                            WHERE dm.sender_id != $1
                              AND dm.created_at > COALESCE(mtm.last_read_at, '1970-01-01')
                        ) AS unread_count
                 FROM message_thread_members mtm
                 LEFT JOIN direct_messages dm ON dm.thread_id = mtm.thread_id
                 WHERE mtm.thread_id = ANY($2::int[]) AND mtm.user_id = $1
                 GROUP BY mtm.thread_id`,
                [session.id, threadIds]
            );
        }

        return NextResponse.json({
            messages,
            unread,
            server_time: new Date().toISOString(),
        });
    } catch (err: any) {
        console.error('GET /api/mobile/messages/poll error:', err?.message);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
