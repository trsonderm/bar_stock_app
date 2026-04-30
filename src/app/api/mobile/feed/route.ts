import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';

// GET /api/mobile/feed?page=1&limit=20
export async function GET(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = req.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(50, parseInt(searchParams.get('limit') || '20'));
    const offset = (page - 1) * limit;

    const [posts, totals, users] = await Promise.all([
        db.query(
            `SELECT p.id, p.content, p.images, p.tagged_user_ids, p.created_at, p.user_id,
                    COALESCE(u.display_name, u.first_name || ' ' || u.last_name) AS author_name,
                    u.profile_picture AS author_avatar
             FROM org_posts p
             LEFT JOIN users u ON u.id = p.user_id
             WHERE p.organization_id = $1
             ORDER BY p.created_at DESC
             LIMIT $2 OFFSET $3`,
            [session.organizationId, limit, offset]
        ),
        db.query('SELECT COUNT(*) AS count FROM org_posts WHERE organization_id = $1', [session.organizationId]),
        db.query(
            `SELECT id, COALESCE(display_name, first_name || ' ' || last_name) AS display_name, profile_picture
             FROM users WHERE organization_id = $1 AND is_active = TRUE AND is_archived = FALSE`,
            [session.organizationId]
        ),
    ]);

    return NextResponse.json({
        posts,
        total: parseInt(totals[0]?.count || '0'),
        page,
        users,
    });
}
