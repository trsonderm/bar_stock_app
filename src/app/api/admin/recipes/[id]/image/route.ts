/**
 * POST /api/admin/recipes/:id/image  — upload or replace the image for an org recipe
 * DELETE /api/admin/recipes/:id/image — remove the image from an org recipe
 *
 * POST: multipart/form-data with field "image" (jpeg, png, gif, webp — max 5 MB)
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { saveFile } from '@/lib/upload';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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

    const formData = await req.formData();
    const file = formData.get('image') as File | null;
    if (!file) return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
    if (!ALLOWED.has(file.type)) return NextResponse.json({ error: 'Only jpeg, png, gif, and webp images are allowed' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image must be under 5 MB' }, { status: 400 });

    const url = await saveFile(file);
    await db.execute(
        `UPDATE org_drink_recipes SET image_url = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3`,
        [url, id, session.organizationId]
    );

    return NextResponse.json({ ok: true, image_url: url });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await getSession();
    if (!session || !session.organizationId || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const id = parseInt(params.id);
    await db.execute(
        `UPDATE org_drink_recipes SET image_url = NULL, updated_at = NOW() WHERE id = $1 AND organization_id = $2`,
        [id, session.organizationId]
    );

    return NextResponse.json({ ok: true });
}
