import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';

// GET /api/mobile/feed/comments?postId=<id> — load comments for a post
export async function GET(req: NextRequest) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const postId = req.nextUrl.searchParams.get('postId');
        if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 });

        const comments = await db.query(
            `SELECT pc.id, pc.content, pc.created_at, pc.user_id,
                    COALESCE(u.display_name, u.first_name || ' ' || u.last_name) AS author_name,
                    u.profile_picture AS author_avatar
             FROM post_comments pc
             JOIN users u ON u.id = pc.user_id
             WHERE pc.post_id = $1 AND pc.organization_id = $2
             ORDER BY pc.created_at ASC`,
            [postId, session.organizationId]
        );

        return NextResponse.json({ comments });
    } catch (err) {
        console.error('Mobile feed comments GET error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST /api/mobile/feed/comments?postId=<id> — add a comment
// Body: { content: string }
export async function POST(req: NextRequest) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const postId = req.nextUrl.searchParams.get('postId');
        if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 });

        const { content } = await req.json();
        if (!content?.trim()) return NextResponse.json({ error: 'content required' }, { status: 400 });

        const post = await db.one(
            'SELECT id FROM org_posts WHERE id = $1 AND organization_id = $2',
            [postId, session.organizationId]
        );
        if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

        const row = await db.one(
            `INSERT INTO post_comments (post_id, user_id, organization_id, content)
             VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
            [postId, session.id, session.organizationId, content.trim()]
        );

        const me = await db.one(
            `SELECT COALESCE(display_name, first_name || ' ' || last_name) AS author_name, profile_picture AS author_avatar
             FROM users WHERE id = $1`,
            [session.id]
        );

        return NextResponse.json({
            ok: true,
            comment: {
                id: row.id,
                content: content.trim(),
                created_at: row.created_at,
                user_id: session.id,
                author_name: me?.author_name,
                author_avatar: me?.author_avatar,
            },
        });
    } catch (err) {
        console.error('Mobile feed comments POST error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// DELETE /api/mobile/feed/comments?id=<commentId> — delete own comment
export async function DELETE(req: NextRequest) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const commentId = req.nextUrl.searchParams.get('id');
        if (!commentId) return NextResponse.json({ error: 'id required' }, { status: 400 });

        const comment = await db.one(
            'SELECT id, user_id FROM post_comments WHERE id = $1 AND organization_id = $2',
            [commentId, session.organizationId]
        );
        if (!comment) return NextResponse.json({ error: 'Comment not found' }, { status: 404 });

        // Only the author can delete (admins can also delete)
        if (comment.user_id !== session.id && session.role !== 'admin') {
            return NextResponse.json({ error: 'Cannot delete another user\'s comment' }, { status: 403 });
        }

        await db.execute('DELETE FROM post_comments WHERE id = $1', [commentId]);
        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error('Mobile feed comments DELETE error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
