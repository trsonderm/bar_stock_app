import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// POST /api/admin/feed/like?id=<postId> — toggle like
export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const postId = parseInt(req.nextUrl.searchParams.get('id') || '0');
    if (!postId) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    // Verify post belongs to same org
    const post = await db.one('SELECT id FROM org_posts WHERE id = $1 AND organization_id = $2', [postId, session.organizationId]);
    if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Toggle: insert or delete
    const existing = await db.query('SELECT id FROM post_likes WHERE post_id = $1 AND user_id = $2', [postId, session.id]);
    if (existing.length > 0) {
        await db.execute('DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2', [postId, session.id]);
    } else {
        await db.execute('INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [postId, session.id]);
    }

    const countRow = await db.one('SELECT COUNT(*) AS count FROM post_likes WHERE post_id = $1', [postId]);
    return NextResponse.json({ liked: existing.length === 0, count: parseInt(countRow.count) });
}
