import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { ensureRecipeTables } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
    const session = await getSession();
    if (!session?.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await ensureRecipeTables();

    const categories = await db.query(
        `SELECT id, name, slug, org_id, is_system
         FROM recipe_categories
         WHERE org_id IS NULL OR org_id = $1
         ORDER BY is_system DESC, name ASC`,
        [session.organizationId]
    );
    return NextResponse.json({ categories });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.organizationId || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureRecipeTables();

    const { name } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });

    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const row = await db.one(
        `INSERT INTO recipe_categories (name, slug, org_id, is_system)
         VALUES ($1, $2, $3, FALSE) RETURNING id`,
        [name.trim(), slug, session.organizationId]
    ).catch(() => null);

    if (!row) return NextResponse.json({ error: 'A category with that name already exists' }, { status: 409 });
    return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
}
