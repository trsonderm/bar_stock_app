import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

const PAGE_SIZE = 20;

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = req.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const q = searchParams.get('q') || '';
    const userId = searchParams.get('userId');
    const offset = (page - 1) * PAGE_SIZE;

    const conditions: string[] = ['p.organization_id = $1'];
    const params: any[] = [session.organizationId];
    let idx = 2;

    if (q) { conditions.push(`p.content ILIKE $${idx++}`); params.push(`%${q}%`); }
    if (userId) { conditions.push(`p.user_id = $${idx++}`); params.push(parseInt(userId)); }

    const where = conditions.join(' AND ');

    const [posts, countRow, users] = await Promise.all([
        db.query(`
            SELECT p.id, p.content, p.images, p.tagged_user_ids, p.created_at,
                   p.user_id,
                   COALESCE(u.display_name, u.first_name || ' ' || u.last_name) AS author_name,
                   u.profile_picture AS author_avatar,
                   u.first_name, u.last_name
            FROM org_posts p
            LEFT JOIN users u ON p.user_id = u.id
            WHERE ${where}
            ORDER BY p.created_at DESC
            LIMIT $${idx} OFFSET $${idx + 1}
        `, [...params, PAGE_SIZE, offset]),
        db.one(`SELECT COUNT(*) AS total FROM org_posts p WHERE ${where}`, params),
        db.query(`
            SELECT id, first_name, last_name, COALESCE(display_name, first_name || ' ' || last_name) AS display_name, profile_picture
            FROM users WHERE organization_id = $1 AND COALESCE(is_archived, false) = false ORDER BY first_name
        `, [session.organizationId]),
    ]);

    return NextResponse.json({
        posts,
        total: parseInt(countRow?.total || '0'),
        page,
        pageSize: PAGE_SIZE,
        users,
    });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { content, images, tagged_user_ids } = body;

    if (!content?.trim() && (!images || images.length === 0)) {
        return NextResponse.json({ error: 'Post must have content or an image' }, { status: 400 });
    }

    const row = await db.one(`
        INSERT INTO org_posts (organization_id, user_id, content, images, tagged_user_ids)
        VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at
    `, [
        session.organizationId,
        session.id,
        content?.trim() || null,
        JSON.stringify(images || []),
        JSON.stringify(tagged_user_ids || []),
    ]);

    return NextResponse.json({ ok: true, id: row.id });
}

export async function DELETE(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const id = parseInt(req.nextUrl.searchParams.get('id') || '0');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    // Users can delete their own; admins can delete any in their org
    const post = await db.one('SELECT user_id, organization_id FROM org_posts WHERE id = $1', [id]);
    if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (post.organization_id !== session.organizationId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (post.user_id !== session.id && session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    await db.execute('DELETE FROM org_posts WHERE id = $1', [id]);
    return NextResponse.json({ ok: true });
}
