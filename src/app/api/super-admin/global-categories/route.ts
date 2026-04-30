import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || !(session as any).isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const rows = await db.query('SELECT * FROM global_categories ORDER BY name ASC');
    return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !(session as any).isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await req.json();
    const { action } = body;

    if (action === 'import_from_org') {
        const { orgId } = body;
        if (!orgId) return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });

        const cats = await db.query(
            'SELECT name FROM categories WHERE organization_id = $1',
            [parseInt(orgId)]
        );

        let inserted = 0;
        for (const cat of cats) {
            if (!cat.name?.trim()) continue;
            await db.execute(
                'INSERT INTO global_categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
                [cat.name.trim()]
            );
            inserted++;
        }

        return NextResponse.json({ inserted });
    }

    if (action === 'add') {
        const { name } = body;
        if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });
        const row = await db.one(
            'INSERT INTO global_categories (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *',
            [name.trim()]
        );
        return NextResponse.json({ row });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
    const session = await getSession();
    if (!session || !(session as any).isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = req.nextUrl;
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    await db.execute('DELETE FROM global_categories WHERE id = $1', [parseInt(id)]);
    return NextResponse.json({ ok: true });
}
