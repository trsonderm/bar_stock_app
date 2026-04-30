import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = req.nextUrl;
    const withUser = searchParams.get('with');

    if (withUser) {
        // Fetch conversation between me and another user
        const otherId = parseInt(withUser);
        const msgs = await db.query(`
            SELECT m.id, m.sender_id, m.recipient_id, m.content, m.is_read, m.created_at,
                   COALESCE(u.display_name, u.first_name || ' ' || u.last_name) AS sender_name,
                   u.profile_picture AS sender_avatar
            FROM messages m
            LEFT JOIN users u ON u.id = m.sender_id
            WHERE m.organization_id = $1
              AND ((m.sender_id = $2 AND m.recipient_id = $3) OR (m.sender_id = $3 AND m.recipient_id = $2))
            ORDER BY m.created_at ASC
            LIMIT 100
        `, [session.organizationId, session.id, otherId]);

        // Mark incoming messages as read
        await db.execute(`
            UPDATE messages SET is_read = true
            WHERE organization_id = $1 AND sender_id = $2 AND recipient_id = $3 AND is_read = false
        `, [session.organizationId, otherId, session.id]);

        return NextResponse.json({ messages: msgs });
    }

    // Return conversation list — one row per person I've messaged or received from
    const convos = await db.query(`
        SELECT DISTINCT ON (other_id)
            other_id,
            COALESCE(u.display_name, u.first_name || ' ' || u.last_name) AS other_name,
            u.profile_picture AS other_avatar,
            last_msg, last_at,
            unread_count
        FROM (
            SELECT
                CASE WHEN m.sender_id = $1 THEN m.recipient_id ELSE m.sender_id END AS other_id,
                m.content AS last_msg,
                m.created_at AS last_at,
                COUNT(*) FILTER (WHERE m.recipient_id = $1 AND m.is_read = false) OVER (
                    PARTITION BY CASE WHEN m.sender_id = $1 THEN m.recipient_id ELSE m.sender_id END
                ) AS unread_count
            FROM messages m
            WHERE m.organization_id = $2
              AND (m.sender_id = $1 OR m.recipient_id = $1)
        ) sub
        LEFT JOIN users u ON u.id = sub.other_id
        ORDER BY other_id, last_at DESC
    `, [session.id, session.organizationId]);

    const unreadTotal = await db.one(`
        SELECT COUNT(*) AS cnt FROM messages
        WHERE organization_id = $1 AND recipient_id = $2 AND is_read = false
    `, [session.organizationId, session.id]);

    // All org users for new conversation
    const orgUsers = await db.query(`
        SELECT id, COALESCE(display_name, first_name || ' ' || last_name) AS name, profile_picture
        FROM users
        WHERE organization_id = $1 AND id != $2 AND COALESCE(is_archived, false) = false
        ORDER BY first_name
    `, [session.organizationId, session.id]);

    return NextResponse.json({
        conversations: convos,
        unreadTotal: parseInt(unreadTotal?.cnt || '0'),
        orgUsers,
    });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { recipient_id, content } = await req.json();
    if (!recipient_id || !content?.trim()) {
        return NextResponse.json({ error: 'recipient_id and content required' }, { status: 400 });
    }

    const row = await db.one(`
        INSERT INTO messages (organization_id, sender_id, recipient_id, content)
        VALUES ($1, $2, $3, $4) RETURNING id, created_at
    `, [session.organizationId, session.id, recipient_id, content.trim()]);

    return NextResponse.json({ ok: true, id: row.id });
}
