/**
 * GET  /api/v1/recipes  — search recipes (global + org, respects org search settings)
 * POST /api/v1/recipes  — create an org-local recipe
 *
 * GET query params:
 *   q           string   Full-text search term
 *   category    string   Filter by category
 *   source      string   "local" | "global" | "both" — override org default
 *   limit       integer  Page size (default 50, max 200)
 *   offset      integer  Page offset (default 0)
 *
 * POST body:
 *   name          string   required
 *   description   string   optional
 *   ingredients   array    optional  [{ item, amount, unit? }]
 *   instructions  string   optional
 *   category      string   optional  e.g. "Cocktail", "Shot", "Mocktail"
 *   tags          array    optional  string[]
 */
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getApiSession, hasScope, ensureRecipeTables } from '@/lib/api-auth';
import { apiOk, apiList, Err } from '@/lib/api-response';

function buildTextFilter(q: string | null) {
    if (!q || !q.trim()) return { clause: '', param: null };
    return {
        clause: `AND to_tsvector('english', name) @@ plainto_tsquery('english', $PLACEHOLDER)`,
        param: q.trim(),
    };
}

export async function GET(req: NextRequest) {
    const session = await getApiSession(req);
    if (!session) return Err.unauthorized();
    if (!hasScope(session, 'recipes:read')) return Err.forbidden('recipes:read');

    await ensureRecipeTables();

    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') || null;
    const category = searchParams.get('category') || null;
    const sourceOverride = searchParams.get('source') || null;
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
    const offset = parseInt(searchParams.get('offset') || '0');

    // Read org search settings
    const org = await db.one(`SELECT settings FROM organizations WHERE id = $1`, [session.organizationId]);
    const orgSettings = org?.settings || {};
    const searchSource: string = sourceOverride || orgSettings.recipe_search_source || 'both';
    const searchPrimary: string = orgSettings.recipe_search_primary || 'local';

    const fetchLocal = searchSource === 'local' || searchSource === 'both';
    const fetchGlobal = searchSource === 'global' || searchSource === 'both';

    const localResults: any[] = [];
    const globalResults: any[] = [];

    if (fetchLocal) {
        const params: any[] = [session.organizationId];
        let where = `WHERE organization_id = $1 AND is_active = true`;
        if (q) { params.push(q.trim()); where += ` AND to_tsvector('english', name) @@ plainto_tsquery('english', $${params.length})`; }
        if (category) { params.push(category); where += ` AND category = $${params.length}`; }
        const rows = await db.query(
            `SELECT id, name, description, ingredients, instructions, category, glass, amount, tags, created_at FROM org_recipes ${where} ORDER BY name ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
            [...params, limit, offset]
        );
        localResults.push(...rows.map((r: any) => ({ ...r, source: 'local' })));
    }

    if (fetchGlobal) {
        const params: any[] = [];
        let where = `WHERE is_active = true`;
        if (q) { params.push(q.trim()); where += ` AND to_tsvector('english', name) @@ plainto_tsquery('english', $${params.length})`; }
        if (category) { params.push(category); where += ` AND category = $${params.length}`; }
        const rows = await db.query(
            `SELECT id, name, description, ingredients, instructions, category, glass, amount, tags, created_at FROM recipes ${where} ORDER BY name ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
            [...params, limit, offset]
        );
        globalResults.push(...rows.map((r: any) => ({ ...r, source: 'global' })));
    }

    // Merge: primary source first, then secondary, deduplicate by name (case-insensitive)
    let merged: any[];
    if (searchSource === 'both') {
        const primary = searchPrimary === 'local' ? localResults : globalResults;
        const secondary = searchPrimary === 'local' ? globalResults : localResults;
        const seen = new Set<string>();
        merged = [];
        for (const r of [...primary, ...secondary]) {
            const key = r.name.toLowerCase();
            if (!seen.has(key)) { seen.add(key); merged.push(r); }
        }
    } else {
        merged = searchSource === 'local' ? localResults : globalResults;
    }

    const paginated = merged.slice(0, limit);

    return apiList(
        paginated.map(r => ({
            id: r.id,
            name: r.name,
            description: r.description,
            ingredients: r.ingredients || [],
            instructions: r.instructions,
            category: r.category,
            glass: r.glass || null,
            amount: r.amount || null,
            tags: r.tags || [],
            source: r.source,
            created_at: r.created_at,
        })),
        { total: merged.length, limit, offset }
    );
}

export async function POST(req: NextRequest) {
    const session = await getApiSession(req);
    if (!session) return Err.unauthorized();
    if (!hasScope(session, 'recipes:write')) return Err.forbidden('recipes:write');

    await ensureRecipeTables();

    const body = await req.json();
    const { name, description, ingredients, instructions, category, glass, amount, tags } = body;
    if (!name || !name.trim()) return Err.badRequest('name is required');

    const existing = await db.one(
        `SELECT id FROM org_recipes WHERE organization_id = $1 AND LOWER(name) = LOWER($2)`,
        [session.organizationId, name.trim()]
    );
    if (existing) return Err.badRequest('A recipe with that name already exists in your library');

    const row = await db.one(
        `INSERT INTO org_recipes (organization_id, name, description, ingredients, instructions, category, glass, amount, tags)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [session.organizationId, name.trim(), description || null,
         JSON.stringify(ingredients || []), instructions || null,
         category || null, glass || null, amount || null, tags || []]
    );

    return apiOk({ id: row.id, created: true }, {}, 201);
}
