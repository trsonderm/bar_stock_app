import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';
import { ensureRecipeTables } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

// GET /api/mobile/recipes/[id]
// id formats: "l:3" (local), "g:12" (global), or plain integer (local-first)
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        await ensureRecipeTables();

        const rawId = params.id;
        let source: 'local' | 'global' | null = null;
        let numericId: number | null = null;

        if (rawId.startsWith('l:')) {
            source = 'local';
            numericId = parseInt(rawId.slice(2));
        } else if (rawId.startsWith('g:')) {
            source = 'global';
            numericId = parseInt(rawId.slice(2));
        } else {
            numericId = parseInt(rawId);
        }

        if (!numericId || isNaN(numericId)) {
            return NextResponse.json({ error: 'Invalid recipe ID' }, { status: 400 });
        }

        let row: any = null;

        if (source === 'local' || source === null) {
            row = await db.one(
                `SELECT id, name, description, ingredients, instructions, category, glass, amount, tags, image_url, created_at
                 FROM org_recipes
                 WHERE id = $1 AND organization_id = $2 AND is_active = true`,
                [numericId, session.organizationId]
            );
            if (row) row.source = 'local';
        }

        if (!row && (source === 'global' || source === null)) {
            row = await db.one(
                `SELECT id, name, description, ingredients, instructions, category, glass, amount, tags, image_url, created_at
                 FROM recipes
                 WHERE id = $1 AND is_active = true`,
                [numericId]
            );
            if (row) row.source = 'global';
        }

        if (!row) {
            return NextResponse.json({ error: 'Recipe not found' }, { status: 404 });
        }

        return NextResponse.json({
            recipe: {
                id: row.source === 'local' ? `l:${row.id}` : `g:${row.id}`,
                name: row.name,
                source: row.source,
                description: row.description || null,
                category: row.category || null,
                ingredients: row.ingredients || [],
                instructions: row.instructions || null,
                glass: row.glass || null,
                amount: row.amount || null,
                tags: row.tags || [],
                image_url: row.image_url || null,
                created_at: row.created_at,
            },
        });
    } catch (err) {
        console.error('Mobile recipes/[id] error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
