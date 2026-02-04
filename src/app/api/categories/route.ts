import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Fetch categories visible to this user's organization OR global (NULL)
        const allCategories = await db.query(
            'SELECT * FROM categories WHERE (organization_id = $1 OR organization_id IS NULL) ORDER BY name ASC',
            [session.organizationId]
        );

        // Deduplicate: If an org-specific category exists, use it instead of the global one.
        const catMap = new Map();
        for (const cat of allCategories) {
            // If we already have this category name, and the current one is GLOBAL (id is null), skip it.
            // But wait, the query returns both. We want the org-specific one to overwrite the global one if both exist.
            // Since we iterate, if we key by 'name', we can control precedence.

            // Priority: Org-ID match > Global.
            // If the current is Org-Specific, it always wins.
            if (cat.organization_id === session.organizationId) {
                catMap.set(cat.name, cat);
            } else if (!catMap.has(cat.name)) {
                // It's global, and we don't have an override yet.
                catMap.set(cat.name, cat);
            }
        }

        const categories = Array.from(catMap.values()).sort((a: any, b: any) => a.name.localeCompare(b.name));

        const parsed = categories.map(c => ({
            ...c,
            stock_options: c.stock_options ? JSON.parse(c.stock_options) : [1],
            sub_categories: c.sub_categories ? JSON.parse(c.sub_categories) : []
        }));

        return NextResponse.json({ categories: parsed });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
