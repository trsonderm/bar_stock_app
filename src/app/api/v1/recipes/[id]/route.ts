/**
 * GET    /api/v1/recipes/:id  — get a single recipe (local or global)
 * PUT    /api/v1/recipes/:id  — update an org-local recipe
 * DELETE /api/v1/recipes/:id  — delete an org-local recipe
 *
 * The :id is prefixed: "g:<id>" for global, "l:<id>" for local.
 * Plain integers resolve as local-first, then global.
 */
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getApiSession, hasScope, ensureRecipeTables } from '@/lib/api-auth';
import { apiOk, Err } from '@/lib/api-response';

function parseId(raw: string): { type: 'local' | 'global'; id: number } | null {
    if (raw.startsWith('g:')) return { type: 'global', id: parseInt(raw.slice(2)) };
    if (raw.startsWith('l:')) return { type: 'local', id: parseInt(raw.slice(2)) };
    const n = parseInt(raw);
    if (isNaN(n)) return null;
    return { type: 'local', id: n };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await getApiSession(req);
    if (!session) return Err.unauthorized();
    if (!hasScope(session, 'recipes:read')) return Err.forbidden('recipes:read');

    await ensureRecipeTables();

    const parsed = parseId(params.id);
    if (!parsed) return Err.badRequest('Invalid recipe id');

    if (parsed.type === 'global') {
        const row = await db.one(`SELECT * FROM recipes WHERE id = $1 AND is_active = true`, [parsed.id]);
        if (!row) return Err.notFound('Recipe');
        return apiOk({ ...row, source: 'global' });
    }

    // Try local first
    let row = await db.one(
        `SELECT * FROM org_recipes WHERE id = $1 AND organization_id = $2`,
        [parsed.id, session.organizationId]
    );
    if (row) return apiOk({ ...row, source: 'local' });

    // Fall back to global
    row = await db.one(`SELECT * FROM recipes WHERE id = $1 AND is_active = true`, [parsed.id]);
    if (row) return apiOk({ ...row, source: 'global' });

    return Err.notFound('Recipe');
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await getApiSession(req);
    if (!session) return Err.unauthorized();
    if (!hasScope(session, 'recipes:write')) return Err.forbidden('recipes:write');

    await ensureRecipeTables();

    const parsed = parseId(params.id);
    if (!parsed || parsed.type === 'global') return Err.badRequest('Only org-local recipes can be updated. Use l:<id> or a plain integer.');

    const exists = await db.one(
        `SELECT id FROM org_recipes WHERE id = $1 AND organization_id = $2`,
        [parsed.id, session.organizationId]
    );
    if (!exists) return Err.notFound('Recipe');

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
    if (sets.length === 0) return Err.badRequest('No updatable fields provided');
    sets.push(`updated_at = NOW()`);
    vals.push(parsed.id, session.organizationId);

    await db.execute(
        `UPDATE org_recipes SET ${sets.join(', ')} WHERE id = $${idx} AND organization_id = $${idx + 1}`,
        vals
    );

    return apiOk({ id: parsed.id, updated: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await getApiSession(req);
    if (!session) return Err.unauthorized();
    if (!hasScope(session, 'recipes:write')) return Err.forbidden('recipes:write');

    await ensureRecipeTables();

    const parsed = parseId(params.id);
    if (!parsed || parsed.type === 'global') return Err.badRequest('Only org-local recipes can be deleted.');

    const result = await db.execute(
        `DELETE FROM org_recipes WHERE id = $1 AND organization_id = $2`,
        [parsed.id, session.organizationId]
    );
    if ((result as any).rowCount === 0) return Err.notFound('Recipe');

    return apiOk({ id: parsed.id, deleted: true });
}
