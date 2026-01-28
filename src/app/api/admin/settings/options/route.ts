import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const options = await db.query('SELECT * FROM bottle_level_options ORDER BY display_order ASC, id ASC');
    return NextResponse.json({ options });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { label } = await req.json();
    if (!label) return NextResponse.json({ error: 'Label required' }, { status: 400 });

    try {
        const count = await db.one('SELECT count(*) as c FROM bottle_level_options');
        const nextOrder = parseInt(count.c) + 1;
        const info = await db.one(
            'INSERT INTO bottle_level_options (label, display_order) VALUES ($1, $2) RETURNING id',
            [label, nextOrder]
        );
        return NextResponse.json({ success: true, id: info.id });
    } catch (e) {
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await req.json();
    await db.execute('DELETE FROM bottle_level_options WHERE id = $1', [id]);
    return NextResponse.json({ success: true });
}
