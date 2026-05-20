import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get('orgId');

    if (orgId) {
        const id = parseInt(orgId, 10);
        const recipes = await db.query(
            `SELECT id, name, description, ingredients, instructions, category, glass, amount, tags
             FROM org_recipes
             WHERE organization_id = $1
             ORDER BY name ASC`,
            [id]
        );
        return NextResponse.json({ recipes });
    }

    const orgs = await db.query(
        `SELECT o.id, o.name, COUNT(r.id)::int AS recipe_count
         FROM organizations o
         JOIN org_recipes r ON r.organization_id = o.id
         GROUP BY o.id, o.name
         HAVING COUNT(r.id) > 0
         ORDER BY o.name ASC`
    );

    return NextResponse.json({ orgs });
}
