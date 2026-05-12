/**
 * POST   /api/v1/recipes/:id/image  — upload image for an org-local recipe
 * DELETE /api/v1/recipes/:id/image  — remove image from an org-local recipe
 *
 * Only org-local recipes are writable via the v1 API.
 * Use prefix l:<id> or a plain integer (resolves local-first) for :id.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getApiSession, hasScope } from '@/lib/api-auth';
import { saveFile } from '@/lib/upload';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024;

function resolveLocalId(raw: string): number | null {
    if (raw.startsWith('l:')) {
        const n = parseInt(raw.slice(2));
        return isNaN(n) ? null : n;
    }
    if (raw.startsWith('g:')) return null; // global recipes not writable via v1
    const n = parseInt(raw);
    return isNaN(n) ? null : n;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
    const api = await getApiSession(req);
    if (!api) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasScope(api, 'recipes:write')) return NextResponse.json({ error: 'Missing scope: recipes:write' }, { status: 403 });

    const localId = resolveLocalId(params.id);
    if (localId === null) return NextResponse.json({ error: 'Image upload is only supported for org-local recipes. Use l:<id> or a plain integer.' }, { status: 400 });

    const exists = await db.one(
        `SELECT id FROM org_recipes WHERE id = $1 AND organization_id = $2`,
        [localId, api.organizationId]
    );
    if (!exists) return NextResponse.json({ error: 'Recipe not found' }, { status: 404 });

    const formData = await req.formData();
    const file = formData.get('image') as File | null;
    if (!file) return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
    if (!ALLOWED.has(file.type)) return NextResponse.json({ error: 'Only jpeg, png, gif, and webp images are allowed' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image must be under 5 MB' }, { status: 400 });

    const url = await saveFile(file);
    await db.execute(
        `UPDATE org_recipes SET image_url = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3`,
        [url, localId, api.organizationId]
    );

    return NextResponse.json({ ok: true, image_url: url });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
    const api = await getApiSession(req);
    if (!api) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasScope(api, 'recipes:write')) return NextResponse.json({ error: 'Missing scope: recipes:write' }, { status: 403 });

    const localId = resolveLocalId(params.id);
    if (localId === null) return NextResponse.json({ error: 'Image removal is only supported for org-local recipes.' }, { status: 400 });

    await db.execute(
        `UPDATE org_recipes SET image_url = NULL, updated_at = NOW() WHERE id = $1 AND organization_id = $2`,
        [localId, api.organizationId]
    );

    return NextResponse.json({ ok: true });
}
