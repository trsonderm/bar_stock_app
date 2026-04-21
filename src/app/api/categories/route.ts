import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const categories = await db.query(
            `SELECT c.*,
                COALESCE(
                    json_agg(sc.name ORDER BY sc.display_order, sc.name)
                    FILTER (WHERE sc.name IS NOT NULL),
                    '[]'
                ) AS sub_categories
             FROM categories c
             LEFT JOIN sub_categories sc ON sc.category_id = c.id
             WHERE c.organization_id = $1
             GROUP BY c.id
             ORDER BY c.name ASC`,
            [session.organizationId]
        );

        const parsed = categories.map((c: any) => ({
            ...c,
            stock_options: c.stock_options || [1],
            sub_categories: Array.isArray(c.sub_categories) ? c.sub_categories : [],
        }));

        return NextResponse.json({ categories: parsed });
    } catch (e) {
        console.error('Get Categories Error:', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
