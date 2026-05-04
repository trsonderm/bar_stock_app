import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// GET /api/admin/feed/comments?postId=<id>
export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const postId = parseInt(req.nextUrl.searchParams.get('postId') || '0');
    if (!postId) return NextResponse.json({ error: 'Missing postId' }, { status: 400 });

    const comments = await db.query(`
        SELECT c.id, c.content, c.created_at, c.user_id,
               COALESCE(u.display_name, u.first_name || ' ' || u.last_name) AS author_name,
               u.profile_picture AS author_avatar
        FROM post_comments c
        LEFT JOIN users u ON u.id = c.user_id
        WHERE c.post_id = $1 AND c.organization_id = $2
        ORDER BY c.created_at ASC
    `, [postId, session.organizationId]);

    return NextResponse.json({ comments });
}

// POST /api/admin/feed/comments?postId=<id>
export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const postId = parseInt(req.nextUrl.searchParams.get('postId') || '0');
    if (!postId) return NextResponse.json({ error: 'Missing postId' }, { status: 400 });

    const { content } = await req.json();
    if (!content?.trim()) return NextResponse.json({ error: 'Comment cannot be empty' }, { status: 400 });

    // Verify post belongs to same org
    const post = await db.one('SELECT id FROM org_posts WHERE id = $1 AND organization_id = $2', [postId, session.organizationId]);
    if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const row = await db.one(`
        INSERT INTO post_comments (post_id, user_id, organization_id, content)
        VALUES ($1, $2, $3, $4)
        RETURNING id, created_at
    `, [postId, session.id, session.organizationId, content.trim()]);

    return NextResponse.json({
        comment: {
            id: row.id,
            content: content.trim(),
            created_at: row.created_at,
            user_id: session.id,
            author_name: `${session.firstName} ${session.lastName}`,
            author_avatar: null,
        },
    });
}

// DELETE /api/admin/feed/comments?id=<commentId>
export async function DELETE(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const id = parseInt(req.nextUrl.searchParams.get('id') || '0');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const comment = await db.one('SELECT user_id, organization_id FROM post_comments WHERE id = $1', [id]);
    if (!comment || comment.organization_id !== session.organizationId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (comment.user_id !== session.id && session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    await db.execute('DELETE FROM post_comments WHERE id = $1', [id]);
    return NextResponse.json({ ok: true });
}
