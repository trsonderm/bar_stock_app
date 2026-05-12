import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { ensureRecipeTables } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await ensureRecipeTables();

    const categories = await db.query(
        `SELECT id, name, slug, org_id, is_system, created_at
         FROM recipe_categories
         WHERE org_id IS NULL
         ORDER BY is_system DESC, name ASC`
    );
    return NextResponse.json({ categories });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await ensureRecipeTables();

    const { name, slug } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });

    const finalSlug = (slug || name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const row = await db.one(
        `INSERT INTO recipe_categories (name, slug, is_system)
         VALUES ($1, $2, FALSE) RETURNING id`,
        [name.trim(), finalSlug]
    ).catch(() => null);

    if (!row) return NextResponse.json({ error: 'A category with that slug already exists' }, { status: 409 });
    return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
}
