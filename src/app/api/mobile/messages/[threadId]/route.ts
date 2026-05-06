import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';
import { notify } from '@/lib/push-notifications';

type Ctx = { params: { threadId: string } };

// Verify user is a member of the thread and return member list
async function assertMember(threadId: number, userId: number, organizationId: number) {
    const membership = await db.one(
        `SELECT mtm.user_id FROM message_thread_members mtm
         JOIN message_threads mt ON mt.id = mtm.thread_id
         WHERE mtm.thread_id = $1 AND mtm.user_id = $2 AND mt.organization_id = $3`,
        [threadId, userId, organizationId]
    );
    return !!membership;
}

// ── GET /api/mobile/messages/[threadId] ──────────────────────────────────────
// Returns paginated messages for a thread. Marks thread as read.
// Query params: limit (default 50), before (ISO timestamp cursor for pagination)
export async function GET(req: NextRequest, { params }: Ctx) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const threadId = parseInt(params.threadId);
        if (isNaN(threadId)) return NextResponse.json({ error: 'Invalid thread id' }, { status: 400 });

        const isMember = await assertMember(threadId, session.id, session.organizationId);
        if (!isMember) return NextResponse.json({ error: 'Thread not found' }, { status: 404 });

        const { searchParams } = req.nextUrl;
        const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
        const before = searchParams.get('before');

        const cursorClause = before ? `AND dm.created_at < $3` : '';
        const queryParams: any[] = before ? [threadId, limit, before] : [threadId, limit];

        const messages = await db.query(
            `SELECT dm.id, dm.sender_id, dm.content, dm.image, dm.created_at,
                    COALESCE(u.display_name, u.first_name || ' ' || u.last_name) AS sender_name,
                    u.profile_picture AS sender_avatar
             FROM direct_messages dm
             JOIN users u ON u.id = dm.sender_id
             WHERE dm.thread_id = $1 ${cursorClause}
             ORDER BY dm.created_at DESC LIMIT $2`,
            queryParams
        );

        // Mark as read
        await db.execute(
            `UPDATE message_thread_members SET last_read_at = NOW()
             WHERE thread_id = $1 AND user_id = $2`,
            [threadId, session.id]
        );

        // Thread metadata
        const thread = await db.one(
            `SELECT mt.id, mt.type, mt.name,
                    (
                        SELECT json_agg(json_build_object(
                            'id', u.id,
                            'name', COALESCE(u.display_name, u.first_name || ' ' || u.last_name),
                            'avatar', u.profile_picture,
                            'position', u.position
                        ))
                        FROM message_thread_members m2
                        JOIN users u ON u.id = m2.user_id
                        WHERE m2.thread_id = mt.id AND m2.user_id != $2
                    ) AS members
             FROM message_threads mt
             WHERE mt.id = $1 AND mt.organization_id = $3`,
            [threadId, session.id, session.organizationId]
        );

        return NextResponse.json({
            thread,
            messages: messages.reverse(), // oldest first
            has_more: messages.length === limit,
        });
    } catch (err: any) {
        console.error('GET /api/mobile/messages/[threadId] error:', err?.message);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// ── POST /api/mobile/messages/[threadId] ─────────────────────────────────────
// Send a message to an existing thread.
// Body: { message?: string, image?: string }
export async function POST(req: NextRequest, { params }: Ctx) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const threadId = parseInt(params.threadId);
        if (isNaN(threadId)) return NextResponse.json({ error: 'Invalid thread id' }, { status: 400 });

        const isMember = await assertMember(threadId, session.id, session.organizationId);
        if (!isMember) return NextResponse.json({ error: 'Thread not found' }, { status: 404 });

        const body = await req.json();
        const { message, image } = body as { message?: string; image?: string };

        if (!message?.trim() && !image)
            return NextResponse.json({ error: 'message or image required' }, { status: 400 });
        if (image && !image.startsWith('data:image/'))
            return NextResponse.json({ error: 'image must be a base64 data-URI' }, { status: 400 });

        const msg = await db.one(
            `INSERT INTO direct_messages (thread_id, sender_id, content, image)
             VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
            [threadId, session.id, message?.trim() || null, image || null]
        );

        await db.execute(`UPDATE message_threads SET updated_at = NOW() WHERE id = $1`, [threadId]);
        await db.execute(
            `UPDATE message_thread_members SET last_read_at = NOW() WHERE thread_id = $1 AND user_id = $2`,
            [threadId, session.id]
        );

        const senderName = await db.one(
            `SELECT COALESCE(display_name, first_name || ' ' || last_name) AS name FROM users WHERE id = $1`,
            [session.id]
        );
        const preview = message?.trim()
            ? (message.trim().length > 60 ? message.trim().slice(0, 60) + '…' : message.trim())
            : '📷 Photo';

        const allMembers = await db.query(
            `SELECT user_id FROM message_thread_members WHERE thread_id = $1 AND user_id != $2`,
            [threadId, session.id]
        );
        await Promise.allSettled(allMembers.map((m: any) =>
            notify(m.user_id, session.organizationId, 'new_message',
                `💬 ${senderName?.name ?? 'Someone'}`,
                preview,
                { thread_id: String(threadId), sender_id: String(session.id), type: 'new_message' }
            )
        ));

        return NextResponse.json({ ok: true, message_id: msg.id, created_at: msg.created_at });
    } catch (err: any) {
        console.error('POST /api/mobile/messages/[threadId] error:', err?.message);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// ── DELETE /api/mobile/messages/[threadId] ───────────────────────────────────
// Leave a thread (removes user from members).
export async function DELETE(req: NextRequest, { params }: Ctx) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const threadId = parseInt(params.threadId);
        if (isNaN(threadId)) return NextResponse.json({ error: 'Invalid thread id' }, { status: 400 });

        const isMember = await assertMember(threadId, session.id, session.organizationId);
        if (!isMember) return NextResponse.json({ error: 'Thread not found' }, { status: 404 });

        await db.execute(
            `DELETE FROM message_thread_members WHERE thread_id = $1 AND user_id = $2`,
            [threadId, session.id]
        );

        return NextResponse.json({ ok: true });
    } catch (err: any) {
        console.error('DELETE /api/mobile/messages/[threadId] error:', err?.message);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
