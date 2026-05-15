import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';
import { ensureRecipeTables } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

// GET /api/mobile/recipes
// Query params: ?q=, ?category=, ?source=local|global|both, ?limit=50, ?offset=0
export async function GET(req: NextRequest) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        await ensureRecipeTables();

        const { searchParams } = req.nextUrl;
        const q = searchParams.get('q')?.trim() || null;
        const category = searchParams.get('category')?.trim() || null;
        const sourceOverride = searchParams.get('source') || null;
        const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
        const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);

        // Read org recipe search settings
        const org = await db.one(
            `SELECT settings FROM organizations WHERE id = $1`,
            [session.organizationId]
        );
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
            if (q) {
                params.push(`%${q}%`);
                where += ` AND (name ILIKE $${params.length} OR description ILIKE $${params.length})`;
            }
            if (category) {
                params.push(category);
                where += ` AND category = $${params.length}`;
            }
            const rows = await db.query(
                `SELECT id, name, description, ingredients, instructions, category, glass, amount, tags, image_url, created_at
                 FROM org_recipes ${where} ORDER BY name ASC`,
                params
            );
            localResults.push(...rows.map((r: any) => ({ ...r, source: 'local' })));
        }

        if (fetchGlobal) {
            const params: any[] = [];
            let where = `WHERE is_active = true`;
            if (q) {
                params.push(`%${q}%`);
                where += ` AND (name ILIKE $${params.length} OR description ILIKE $${params.length})`;
            }
            if (category) {
                params.push(category);
                where += ` AND category = $${params.length}`;
            }
            const rows = await db.query(
                `SELECT id, name, description, ingredients, instructions, category, glass, amount, tags, image_url, created_at
                 FROM recipes ${where} ORDER BY name ASC`,
                params
            );
            globalResults.push(...rows.map((r: any) => ({ ...r, source: 'global' })));
        }

        // Merge: primary source first, deduplicate by name
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

        const total = merged.length;
        const paginated = merged.slice(offset, offset + limit);

        return NextResponse.json({
            recipes: paginated.map(r => ({
                id: r.source === 'local' ? `l:${r.id}` : `g:${r.id}`,
                name: r.name,
                source: r.source,
                description: r.description || null,
                category: r.category || null,
                ingredients: r.ingredients || [],
                instructions: r.instructions || null,
                glass: r.glass || null,
                amount: r.amount || null,
                tags: r.tags || [],
                image_url: r.image_url || null,
                created_at: r.created_at,
            })),
            total,
            limit,
            offset,
        });
    } catch (err) {
        console.error('Mobile recipes error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
