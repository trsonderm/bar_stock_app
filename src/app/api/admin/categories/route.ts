
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const categories = db.prepare('SELECT * FROM categories ORDER BY name ASC').all() as any[];

        const parsed = categories.map(c => ({
            ...c,
            stock_options: c.stock_options ? JSON.parse(c.stock_options) : [1]
        }));

        return NextResponse.json({ categories: parsed });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || session.role !== 'admin') {
            const hasPermission = session?.permissions.includes('all');
            if (!hasPermission) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { name, stock_options } = await req.json();
        if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

        const options = stock_options ? JSON.stringify(stock_options) : JSON.stringify([1]);

        const stmt = db.prepare('INSERT INTO categories (name, stock_options) VALUES (?, ?)');
        const res = stmt.run(name, options);
        return NextResponse.json({ success: true, id: res.lastInsertRowid });
    } catch (e: any) {
        if (e.message.includes('UNIQUE')) {
            return NextResponse.json({ error: 'Category already exists' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

        const { id, name, stock_options } = await req.json();
        if (!id || !name) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

        const options = stock_options ? JSON.stringify(stock_options) : JSON.stringify([1]);

        db.prepare('UPDATE categories SET name = ?, stock_options = ? WHERE id = ?').run(name, options);

        return NextResponse.json({ success: true });
    } catch (e: any) {
        if (e.message.includes('UNIQUE')) {
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
        const cat = db.prepare('SELECT name FROM categories WHERE id = ?').get(id) as { name: string } | undefined;
        if (!cat) return NextResponse.json({ error: 'Not found' }, { status: 404 });

        const used = db.prepare('SELECT COUNT(*) as count FROM items WHERE type = ?').get(cat.name) as { count: number };
        if (used.count > 0) {
            return NextResponse.json({ error: `Cannot delete: ${used.count} items are using this category.` }, { status: 400 });
        }

        db.prepare('DELETE FROM categories WHERE id = ?').run(id);
        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
