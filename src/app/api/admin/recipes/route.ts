import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { ensureRecipeTables } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await ensureRecipeTables();

    const { searchParams } = req.nextUrl;
    const q = searchParams.get('q') || null;
    const category = searchParams.get('category') || null;
    const source = searchParams.get('source') || 'local'; // 'local' | 'global' | 'both'

    const localRows: any[] = [];
    const globalRows: any[] = [];

    if (source === 'local' || source === 'both') {
        const params: any[] = [session.organizationId];
        let where = `WHERE organization_id = $1`;
        if (q) { params.push(q); where += ` AND (name ILIKE $${params.length} OR description ILIKE $${params.length})`; params[params.length - 1] = `%${q}%`; }
        if (category) { params.push(category); where += ` AND category = $${params.length}`; }
        const rows = await db.query(
            `SELECT id, name, description, ingredients, instructions, category, tags, is_active, created_at, updated_at FROM org_recipes ${where} ORDER BY name ASC`,
            params
        );
        localRows.push(...rows.map((r: any) => ({ ...r, source: 'local' })));
    }

    if (source === 'global' || source === 'both') {
        const params: any[] = [];
        let where = `WHERE is_active = true`;
        if (q) { params.push(`%${q}%`); where += ` AND (name ILIKE $${params.length} OR description ILIKE $${params.length})`; }
        if (category) { params.push(category); where += ` AND category = $${params.length}`; }
        const rows = await db.query(
            `SELECT id, name, description, ingredients, instructions, category, tags, is_active, created_at, updated_at FROM recipes ${where} ORDER BY name ASC`,
            params
        );
        globalRows.push(...rows.map((r: any) => ({ ...r, source: 'global' })));
    }

    return NextResponse.json({ recipes: [...localRows, ...globalRows] });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureRecipeTables();

    const body = await req.json();
    const { name, description, ingredients, instructions, category, tags } = body;
    if (!name || !name.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });

    const row = await db.one(
        `INSERT INTO org_recipes (organization_id, name, description, ingredients, instructions, category, tags)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [session.organizationId, name.trim(), description || null,
         JSON.stringify(ingredients || []), instructions || null,
         category || null, tags || []]
    );

    return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
}
