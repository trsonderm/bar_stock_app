import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Fetch categories for THIS organization only
        const allCategories = await db.query(
            'SELECT * FROM categories WHERE organization_id = $1 ORDER BY name ASC',
            [session.organizationId]
        );

        const parsed = allCategories.map(c => ({
            ...c,
            stock_options: c.stock_options || [1],
            sub_categories: c.sub_categories || []
        }));

        return NextResponse.json({ categories: parsed });
    } catch (e) {
        console.error('Get Categories Error:', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
