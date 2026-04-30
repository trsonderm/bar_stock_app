import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const q = req.nextUrl.searchParams.get('q') || '';
    if (q.length < 1) return NextResponse.json({ results: [] });

    const results = await db.query(
        `SELECT id, name, category_name, order_size, barcodes
         FROM global_products
         WHERE name ILIKE $1
         ORDER BY
           CASE WHEN name ILIKE $2 THEN 0 ELSE 1 END,
           name ASC
         LIMIT 10`,
        [`%${q}%`, `${q}%`]
    );

    return NextResponse.json({ results });
}
