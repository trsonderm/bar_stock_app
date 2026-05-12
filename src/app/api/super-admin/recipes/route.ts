import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { ensureRecipeTables } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await ensureRecipeTables();

    const { searchParams } = req.nextUrl;
    const q = searchParams.get('q') || null;
    const category = searchParams.get('category') || null;

    const params: any[] = [];
    let where = `WHERE 1=1`;
    if (q) { params.push(`%${q}%`); where += ` AND (name ILIKE $${params.length} OR description ILIKE $${params.length})`; }
    if (category) { params.push(category); where += ` AND category = $${params.length}`; }

    const recipes = await db.query(
        `SELECT id, name, description, ingredients, instructions, category_id, category, glass, amount, tags, image_url, is_active, created_at, updated_at
         FROM recipes ${where} ORDER BY name ASC`,
        params
    );

    return NextResponse.json({ recipes });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await ensureRecipeTables();

    const body = await req.json();
    const { name, description, ingredients, instructions, category_id, category, glass, amount, tags } = body;
    if (!name || !name.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });

    const row = await db.one(
        `INSERT INTO recipes (name, description, ingredients, instructions, category_id, category, glass, amount, tags)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [name.trim(), description || null, JSON.stringify(ingredients || []),
         instructions || null, category_id || null, category || null, glass || null, amount || null, tags || []]
    );

    return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
}
