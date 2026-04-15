import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { organizationId } = session;

    let rows = await db.query(
        'SELECT id, name, sort_order FROM payout_types WHERE organization_id = $1 ORDER BY sort_order ASC, id ASC',
        [organizationId]
    );

    if (rows.length === 0) {
        const defaults = ['DJ', 'Karaoke', 'Miscellaneous'];
        for (let i = 0; i < defaults.length; i++) {
            await db.execute(
                'INSERT INTO payout_types (organization_id, name, sort_order) VALUES ($1, $2, $3)',
                [organizationId, defaults[i], i]
            );
        }
        rows = await db.query(
            'SELECT id, name, sort_order FROM payout_types WHERE organization_id = $1 ORDER BY sort_order ASC, id ASC',
            [organizationId]
        );
    }

    return NextResponse.json({ payoutTypes: rows });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { organizationId } = session;

    const body = await req.json();
    const name = (body.name || '').trim();

    if (!name) {
        return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    if (name.length > 100) {
        return NextResponse.json({ error: 'Name must be 100 characters or fewer' }, { status: 400 });
    }

    const maxRow = await db.one(
        'SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM payout_types WHERE organization_id = $1',
        [organizationId]
    );
    const nextOrder = ((maxRow as any)?.max_order ?? -1) + 1;

    const inserted = await db.one(
        'INSERT INTO payout_types (organization_id, name, sort_order) VALUES ($1, $2, $3) RETURNING id, name, sort_order',
        [organizationId, name, nextOrder]
    );

    return NextResponse.json({ payoutType: inserted }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { organizationId } = session;

    const body = await req.json();
    const id = Number(body.id);
    if (!id) {
        return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const result = await db.execute(
        'DELETE FROM payout_types WHERE id = $1 AND organization_id = $2',
        [id, organizationId]
    );

    if (result.rowCount === 0) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
}
