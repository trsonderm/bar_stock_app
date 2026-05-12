/**
 * POST   /api/super-admin/recipes/:id/image  — upload image for a global recipe
 * DELETE /api/super-admin/recipes/:id/image  — remove image from a global recipe
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { saveFile } from '@/lib/upload';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const id = parseInt(params.id);
    const formData = await req.formData();
    const file = formData.get('image') as File | null;
    if (!file) return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
    if (!ALLOWED.has(file.type)) return NextResponse.json({ error: 'Only jpeg, png, gif, and webp images are allowed' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image must be under 5 MB' }, { status: 400 });

    const url = await saveFile(file);
    const result = await db.execute(
        `UPDATE recipes SET image_url = $1, updated_at = NOW() WHERE id = $2`,
        [url, id]
    );
    if ((result as any).rowCount === 0) return NextResponse.json({ error: 'Recipe not found' }, { status: 404 });

    return NextResponse.json({ ok: true, image_url: url });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await db.execute(`UPDATE recipes SET image_url = NULL, updated_at = NOW() WHERE id = $1`, [parseInt(params.id)]);
    return NextResponse.json({ ok: true });
}
