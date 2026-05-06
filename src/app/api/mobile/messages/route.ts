import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';
import { notify } from '@/lib/push-notifications';

// ── GET /api/mobile/messages ─────────────────────────────────────────────────
// Returns all threads for the current user with last message + unread count.
export async function GET(req: NextRequest) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const threads = await db.query(
            `SELECT
                mt.id,
                mt.type,
                mt.name,
                mt.updated_at,
                -- members (exclude self)
                (
                    SELECT json_agg(json_build_object(
                        'id', u.id,
                        'name', COALESCE(u.display_name, u.first_name || ' ' || u.last_name),
                        'avatar', u.profile_picture,
                        'position', u.position
                    ))
                    FROM message_thread_members m2
                    JOIN users u ON u.id = m2.user_id
                    WHERE m2.thread_id = mt.id AND m2.user_id != $1
                ) AS members,
                -- last message
                (
                    SELECT json_build_object(
                        'id', dm.id,
                        'content', dm.content,
                        'sender_id', dm.sender_id,
                        'created_at', dm.created_at
                    )
                    FROM direct_messages dm
                    WHERE dm.thread_id = mt.id
                    ORDER BY dm.created_at DESC LIMIT 1
                ) AS last_message,
                -- unread count
                (
                    SELECT COUNT(*)
                    FROM direct_messages dm
                    WHERE dm.thread_id = mt.id
                      AND dm.sender_id != $1
                      AND dm.created_at > COALESCE(mtm.last_read_at, '1970-01-01')
                ) AS unread_count
             FROM message_threads mt
             JOIN message_thread_members mtm ON mtm.thread_id = mt.id AND mtm.user_id = $1
             WHERE mt.organization_id = $2
             ORDER BY mt.updated_at DESC`,
            [session.id, session.organizationId]
        );

        return NextResponse.json({ threads });
    } catch (err: any) {
        console.error('GET /api/mobile/messages error:', err?.message);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// ── POST /api/mobile/messages ────────────────────────────────────────────────
// Create a new message thread (or find existing direct thread) and send a message.
//
// Body:
//   { user_ids: number[], message?: string, image?: string }
//   user_ids: who to message (do not include yourself — server adds you)
//   For direct (1-on-1): user_ids has exactly 1 entry.
//   For group:           user_ids has 2+ entries.
//   At least one of message or image must be provided.
export async function POST(req: NextRequest) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { user_ids, message, image, thread_name } = body as {
            user_ids: number[];
            message?: string;
            image?: string;
            thread_name?: string;
        };

        if (!Array.isArray(user_ids) || user_ids.length === 0)
            return NextResponse.json({ error: 'user_ids required' }, { status: 400 });
        if (!message?.trim() && !image)
            return NextResponse.json({ error: 'message or image required' }, { status: 400 });
        if (image && !image.startsWith('data:image/'))
            return NextResponse.json({ error: 'image must be a base64 data-URI' }, { status: 400 });

        // Validate all target users belong to same org
        const allMemberIds = [...new Set([session.id, ...user_ids])];
        const validUsers = await db.query(
            `SELECT id FROM users WHERE id = ANY($1::int[]) AND organization_id = $2`,
            [allMemberIds, session.organizationId]
        );
        if (validUsers.length !== allMemberIds.length)
            return NextResponse.json({ error: 'One or more users not found in your organization' }, { status: 400 });

        const isDirect = user_ids.length === 1;
        let threadId: number;

        if (isDirect) {
            // For 1-on-1: find an existing direct thread with exactly these two members
            const existing = await db.one(
                `SELECT mt.id FROM message_threads mt
                 WHERE mt.organization_id = $1
                   AND mt.type = 'direct'
                   AND (SELECT COUNT(*) FROM message_thread_members WHERE thread_id = mt.id) = 2
                   AND EXISTS (SELECT 1 FROM message_thread_members WHERE thread_id = mt.id AND user_id = $2)
                   AND EXISTS (SELECT 1 FROM message_thread_members WHERE thread_id = mt.id AND user_id = $3)
                 LIMIT 1`,
                [session.organizationId, session.id, user_ids[0]]
            );
            if (existing) {
                threadId = existing.id;
            } else {
                const t = await db.one(
                    `INSERT INTO message_threads (organization_id, type, created_by)
                     VALUES ($1, 'direct', $2) RETURNING id`,
                    [session.organizationId, session.id]
                );
                threadId = t.id;
                for (const uid of allMemberIds) {
                    await db.execute(
                        `INSERT INTO message_thread_members (thread_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                        [threadId, uid]
                    );
                }
            }
        } else {
            // Group thread — always create new
            const t = await db.one(
                `INSERT INTO message_threads (organization_id, type, name, created_by)
                 VALUES ($1, 'group', $2, $3) RETURNING id`,
                [session.organizationId, thread_name || null, session.id]
            );
            threadId = t.id;
            for (const uid of allMemberIds) {
                await db.execute(
                    `INSERT INTO message_thread_members (thread_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                    [threadId, uid]
                );
            }
        }

        // Insert the message
        const msg = await db.one(
            `INSERT INTO direct_messages (thread_id, sender_id, content, image)
             VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
            [threadId, session.id, message?.trim() || null, image || null]
        );

        // Touch thread updated_at
        await db.execute(`UPDATE message_threads SET updated_at = NOW() WHERE id = $1`, [threadId]);

        // Mark sender as read up to now
        await db.execute(
            `UPDATE message_thread_members SET last_read_at = NOW()
             WHERE thread_id = $1 AND user_id = $2`,
            [threadId, session.id]
        );

        // Push notification to all members except sender
        const senderName = await db.one(
            `SELECT COALESCE(display_name, first_name || ' ' || last_name) AS name FROM users WHERE id = $1`,
            [session.id]
        );
        const preview = message?.trim()
            ? (message.trim().length > 60 ? message.trim().slice(0, 60) + '…' : message.trim())
            : '📷 Photo';

        const recipients = allMemberIds.filter(id => id !== session.id);
        await Promise.allSettled(recipients.map(uid =>
            notify(uid, session.organizationId, 'new_message',
                `💬 ${senderName?.name ?? 'Someone'}`,
                preview,
                { thread_id: String(threadId), sender_id: String(session.id), type: 'new_message' }
            )
        ));

        return NextResponse.json({ ok: true, thread_id: threadId, message_id: msg.id, created_at: msg.created_at });
    } catch (err: any) {
        console.error('POST /api/mobile/messages error:', err?.message);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
