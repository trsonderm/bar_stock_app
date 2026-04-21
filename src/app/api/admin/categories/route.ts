import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// ── Shared query: fetch categories with sub_categories aggregated from relational table ──
async function fetchCategoriesForOrg(orgId: number) {
    const rows = await db.query(
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
        [orgId]
    );
    return rows.map((c: any) => ({
        ...c,
        stock_options: typeof c.stock_options === 'string'
            ? JSON.parse(c.stock_options)
            : (c.stock_options || [1]),
        sub_categories: Array.isArray(c.sub_categories) ? c.sub_categories : [],
    }));
}

// ── Sync sub_categories rows for a category (replace all) ──
async function syncSubCategories(categoryId: number, orgId: number, names: string[]) {
    await db.execute(
        'DELETE FROM sub_categories WHERE category_id = $1 AND organization_id = $2',
        [categoryId, orgId]
    );
    for (let i = 0; i < names.length; i++) {
        const name = names[i].trim();
        if (!name) continue;
        await db.execute(
            `INSERT INTO sub_categories (category_id, organization_id, name, display_order)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (category_id, name) DO UPDATE SET display_order = EXCLUDED.display_order`,
            [categoryId, orgId, name, i]
        );
    }
}

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const categories = await fetchCategoriesForOrg(session.organizationId);
        return NextResponse.json({ categories });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        if (session.role !== 'admin' && !session.permissions.includes('all')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { name, stock_options, sub_categories, enable_low_stock_reporting } = await req.json();
        if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

        const options = stock_options ? JSON.stringify(stock_options) : JSON.stringify([1]);
        const enableReporting = enable_low_stock_reporting !== false;

        const res = await db.one(
            'INSERT INTO categories (name, stock_options, enable_low_stock_reporting, organization_id) VALUES ($1, $2, $3, $4) RETURNING id',
            [name, options, enableReporting, session.organizationId]
        );

        if (Array.isArray(sub_categories) && sub_categories.length > 0) {
            await syncSubCategories(res.id, session.organizationId, sub_categories);
        }

        return NextResponse.json({ success: true, id: res.id });
    } catch (e: any) {
        if (e.message?.includes('unique constraint') || e.message?.includes('UNIQUE')) {
            return NextResponse.json({ error: 'Category already exists' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

        const { id, name, stock_options, sub_categories, enable_low_stock_reporting } = await req.json();
        if (!id || !name) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

        const options = stock_options ? JSON.stringify(stock_options) : JSON.stringify([1]);
        const enableReporting = enable_low_stock_reporting !== false;

        await db.execute(
            'UPDATE categories SET name = $1, stock_options = $2, enable_low_stock_reporting = $3 WHERE id = $4 AND organization_id = $5',
            [name, options, enableReporting, id, session.organizationId]
        );

        await syncSubCategories(id, session.organizationId, Array.isArray(sub_categories) ? sub_categories : []);

        return NextResponse.json({ success: true });
    } catch (e: any) {
        if (e.message?.includes('unique constraint') || e.message?.includes('UNIQUE')) {
            return NextResponse.json({ error: 'Category name already exists' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

        const cat = await db.one(
            'SELECT name FROM categories WHERE id = $1 AND organization_id = $2',
            [id, session.organizationId]
        );
        if (!cat) return NextResponse.json({ error: 'Not found' }, { status: 404 });

        const used = await db.one(
            'SELECT COUNT(*) as count FROM items WHERE type = $1 AND organization_id = $2',
            [cat.name, session.organizationId]
        );
        if (parseInt(used.count) > 0) {
            return NextResponse.json({ error: `Cannot delete: ${used.count} items are using this category.` }, { status: 400 });
        }

        // sub_categories rows cascade-delete via FK
        await db.execute(
            'DELETE FROM categories WHERE id = $1 AND organization_id = $2',
            [id, session.organizationId]
        );
        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
