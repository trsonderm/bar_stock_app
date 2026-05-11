import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await getSession();
    if (!session || !session.organizationId || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const id = parseInt(params.id);
    const exists = await db.one(
        `SELECT id FROM org_drink_recipes WHERE id = $1 AND organization_id = $2`,
        [id, session.organizationId]
    );
    if (!exists) return NextResponse.json({ error: 'Recipe not found' }, { status: 404 });

    const body = await req.json();
    const allowed = ['name', 'description', 'ingredients', 'instructions', 'category', 'tags', 'is_active'];
    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;

    for (const field of allowed) {
        if (body[field] !== undefined) {
            sets.push(`${field} = $${idx++}`);
            vals.push(field === 'ingredients' ? JSON.stringify(body[field]) : body[field]);
        }
    }
    if (sets.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    sets.push(`updated_at = NOW()`);
    vals.push(id, session.organizationId);

    await db.execute(
        `UPDATE org_drink_recipes SET ${sets.join(', ')} WHERE id = $${idx} AND organization_id = $${idx + 1}`,
        vals
    );

    return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await getSession();
    if (!session || !session.organizationId || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const id = parseInt(params.id);
    const result = await db.execute(
        `DELETE FROM org_drink_recipes WHERE id = $1 AND organization_id = $2`,
        [id, session.organizationId]
    );
    if ((result as any).rowCount === 0) return NextResponse.json({ error: 'Recipe not found' }, { status: 404 });

    return NextResponse.json({ ok: true });
}
