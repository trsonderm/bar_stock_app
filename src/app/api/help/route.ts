import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export interface HelpBlock {
    type: 'heading' | 'text' | 'image' | 'divider' | 'callout';
    content?: string;
    level?: 1 | 2 | 3;
    src?: string;
    alt?: string;
    style?: 'info' | 'warning' | 'tip';
}

export interface HelpArticle {
    id: number;
    category: string; // 'faq' | 'how-to' | 'getting-started'
    title: string;
    slug: string;
    blocks: HelpBlock[];
    sort_order: number;
    published: boolean;
    created_at: string;
    updated_at: string;
}

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const category = req.nextUrl.searchParams.get('category');
    const slug = req.nextUrl.searchParams.get('slug');
    const all = req.nextUrl.searchParams.get('all') === '1' && session.isSuperAdmin;

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (!all) {
        conditions.push(`published = TRUE`);
    }
    if (category) {
        conditions.push(`category = $${idx++}`);
        params.push(category);
    }
    if (slug) {
        conditions.push(`slug = $${idx++}`);
        params.push(slug);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    try {
        const rows = await db.query(
            `SELECT * FROM help_articles ${where} ORDER BY category ASC, sort_order ASC, id ASC`,
            params
        );
        const articles = rows.map((r: any) => ({
            ...r,
            blocks: typeof r.blocks === 'string' ? JSON.parse(r.blocks) : (r.blocks || []),
        }));
        return NextResponse.json({ articles });
    } catch {
        return NextResponse.json({ articles: [] });
    }
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const body = await req.json();
    const { category, title, slug, blocks, sort_order, published } = body;

    if (!title || !category) {
        return NextResponse.json({ error: 'title and category are required' }, { status: 400 });
    }

    const safeSlug = (slug || title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    try {
        const res = await db.one(
            `INSERT INTO help_articles (category, title, slug, blocks, sort_order, published)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [category, title, safeSlug, JSON.stringify(blocks || []), sort_order || 0, published !== false]
        );
        return NextResponse.json({ success: true, id: res.id });
    } catch (e: any) {
        if (e.message?.includes('unique') || e.message?.includes('UNIQUE')) {
            return NextResponse.json({ error: 'Slug already exists' }, { status: 409 });
        }
        return NextResponse.json({ error: 'Failed to create' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const body = await req.json();
    const { id, category, title, slug, blocks, sort_order, published } = body;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const safeSlug = (slug || title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    try {
        await db.execute(
            `UPDATE help_articles SET category=$1, title=$2, slug=$3, blocks=$4, sort_order=$5, published=$6, updated_at=NOW()
             WHERE id=$7`,
            [category, title, safeSlug, JSON.stringify(blocks || []), sort_order || 0, published !== false, id]
        );
        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    await db.execute('DELETE FROM help_articles WHERE id = $1', [parseInt(id)]);
    return NextResponse.json({ success: true });
}
