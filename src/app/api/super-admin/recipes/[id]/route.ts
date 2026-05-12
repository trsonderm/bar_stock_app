import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const id = parseInt(params.id);
    const body = await req.json();
    const allowed = ['name', 'description', 'ingredients', 'instructions', 'category_id', 'category', 'tags', 'is_active'];
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
    vals.push(id);

    const result = await db.execute(
        `UPDATE recipes SET ${sets.join(', ')} WHERE id = $${idx}`,
        vals
    );
    if ((result as any).rowCount === 0) return NextResponse.json({ error: 'Recipe not found' }, { status: 404 });

    return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const result = await db.execute(`DELETE FROM recipes WHERE id = $1`, [parseInt(params.id)]);
    if ((result as any).rowCount === 0) return NextResponse.json({ error: 'Recipe not found' }, { status: 404 });

    return NextResponse.json({ ok: true });
}
