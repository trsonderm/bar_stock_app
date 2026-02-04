import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const categories = await db.query(
            'SELECT * FROM categories WHERE organization_id = $1 ORDER BY name ASC',
            [session.organizationId]
        );

        const parsed = categories.map(c => ({
            ...c,
            stock_options: typeof c.stock_options === 'string' ? JSON.parse(c.stock_options) : (c.stock_options || [1]),
            sub_categories: typeof c.sub_categories === 'string' ? JSON.parse(c.sub_categories) : (c.sub_categories || [])
        }));

        return NextResponse.json({ categories: parsed });
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

        const { name, stock_options, sub_categories } = await req.json();
        if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

        const options = stock_options ? JSON.stringify(stock_options) : JSON.stringify([1]);
        const subCats = sub_categories ? JSON.stringify(sub_categories) : JSON.stringify([]);

        const res = await db.one(
            'INSERT INTO categories (name, stock_options, sub_categories, organization_id) VALUES ($1, $2, $3, $4) RETURNING id',
            [name, options, subCats, session.organizationId]
        );
        return NextResponse.json({ success: true, id: res.id });
    } catch (e: any) {
        if (e.message.includes('unique constraint') || e.message.includes('UNIQUE')) {
            return NextResponse.json({ error: 'Category already exists' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

        const { id, name, stock_options, sub_categories } = await req.json();
        if (!id || !name) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

        const options = stock_options ? JSON.stringify(stock_options) : JSON.stringify([1]);
        const subCats = sub_categories ? JSON.stringify(sub_categories) : JSON.stringify([]);

        await db.execute(
            'UPDATE categories SET name = $1, stock_options = $2, sub_categories = $3 WHERE id = $4 AND organization_id = $5',
            [name, options, subCats, id, session.organizationId]
        );

        return NextResponse.json({ success: true });
    } catch (e: any) {
        if (e.message.includes('unique constraint') || e.message.includes('UNIQUE')) {
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

        // Check if used
        const cat = await db.one('SELECT name FROM categories WHERE id = $1 AND organization_id = $2', [id, session.organizationId]);
        if (!cat) return NextResponse.json({ error: 'Not found' }, { status: 404 });

        const used = await db.one('SELECT COUNT(*) as count FROM items WHERE type = $1', [cat.name]);
        if (parseInt(used.count) > 0) {
            return NextResponse.json({ error: `Cannot delete: ${used.count} items are using this category.` }, { status: 400 });
        }

        await db.execute('DELETE FROM categories WHERE id = $1 AND organization_id = $2', [id, session.organizationId]);
        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
