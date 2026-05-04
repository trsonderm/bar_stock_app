import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';

// POST /api/mobile/feed/like?id=<postId> — toggle like
export async function POST(req: NextRequest) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const postId = req.nextUrl.searchParams.get('id');
        if (!postId) return NextResponse.json({ error: 'Post id required' }, { status: 400 });

        // Verify post belongs to same org
        const post = await db.one(
            'SELECT id FROM org_posts WHERE id = $1 AND organization_id = $2',
            [postId, session.organizationId]
        );
        if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

        const existing = await db.one(
            'SELECT id FROM post_likes WHERE post_id = $1 AND user_id = $2',
            [postId, session.id]
        );

        let liked: boolean;
        if (existing) {
            await db.execute('DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2', [postId, session.id]);
            liked = false;
        } else {
            await db.execute(
                'INSERT INTO post_likes (post_id, user_id, organization_id) VALUES ($1, $2, $3)',
                [postId, session.id, session.organizationId]
            );
            liked = true;
        }

        const countRow = await db.one('SELECT COUNT(*) AS count FROM post_likes WHERE post_id = $1', [postId]);
        return NextResponse.json({ liked, count: parseInt(countRow?.count || '0') });
    } catch (err) {
        console.error('Mobile feed like error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
