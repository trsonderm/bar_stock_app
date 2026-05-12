import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
    const session = await getSession();
    if (!session?.organizationId || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const id = parseInt(params.id);
    const cat = await db.one(
        `SELECT is_system, org_id FROM recipe_categories WHERE id = $1`,
        [id]
    );
    if (!cat) return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    if (cat.is_system || cat.org_id !== session.organizationId) {
        return NextResponse.json({ error: 'Cannot delete this category' }, { status: 403 });
    }

    await db.execute(`DELETE FROM recipe_categories WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
}
