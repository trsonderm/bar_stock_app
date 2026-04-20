import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const locationId = searchParams.get('locationId');

    try {
        let shifts;
        if (locationId) {
            // Return global shifts (location_id IS NULL) + this location's shifts
            shifts = await db.query(
                `SELECT * FROM shifts
                 WHERE organization_id = $1
                   AND (location_id IS NULL OR location_id = $2)
                 ORDER BY location_id NULLS FIRST, start_time ASC`,
                [session.organizationId, parseInt(locationId)]
            );
        } else {
            shifts = await db.query(
                'SELECT * FROM shifts WHERE organization_id = $1 ORDER BY location_id NULLS FIRST, start_time ASC',
                [session.organizationId]
            );
        }
        return NextResponse.json({ shifts });
    } catch (e) {
        console.error('Failed to fetch shifts:', e);
        return NextResponse.json({ error: 'Failed to fetch shifts' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { label, start_time, end_time, color, assigned_user_ids, location_id } = await req.json();

        if (!label || !start_time || !end_time) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const usersJson = assigned_user_ids ? JSON.stringify(assigned_user_ids) : '[]';
        const shiftColor = color || '#3b82f6';
        const locId = location_id ? parseInt(location_id) : null;

        const res = await db.one(
            `INSERT INTO shifts (organization_id, label, start_time, end_time, color, assigned_user_ids, location_id)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) RETURNING id`,
            [session.organizationId, label, start_time, end_time, shiftColor, usersJson, locId]
        );

        return NextResponse.json({ success: true, id: res.id });
    } catch (e) {
        console.error('Failed to create shift:', e);
        return NextResponse.json({ error: 'Failed to create shift' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { id, label, start_time, end_time, color, assigned_user_ids, location_id } = await req.json();

        if (!id || !label || !start_time || !end_time) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const usersJson = assigned_user_ids ? JSON.stringify(assigned_user_ids) : '[]';
        const shiftColor = color || '#3b82f6';
        const locId = location_id !== undefined ? (location_id ? parseInt(location_id) : null) : undefined;

        const setClauses = [
            'label = $1', 'start_time = $2', 'end_time = $3',
            'color = $4', 'assigned_user_ids = $5::jsonb',
        ];
        const params: any[] = [label, start_time, end_time, shiftColor, usersJson];

        if (locId !== undefined) {
            setClauses.push(`location_id = $${params.length + 1}`);
            params.push(locId);
        }
        params.push(id, session.organizationId);

        const result = await db.execute(
            `UPDATE shifts SET ${setClauses.join(', ')}
             WHERE id = $${params.length - 1} AND organization_id = $${params.length}`,
            params
        );

        if (result.rowCount === 0) {
            return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('Failed to update shift:', e);
        return NextResponse.json({ error: 'Failed to update shift' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { id } = await req.json();
        await db.execute('DELETE FROM shifts WHERE id = $1 AND organization_id = $2', [id, session.organizationId]);
        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('Failed to delete shift:', e);
        return NextResponse.json({ error: 'Failed to delete shift' }, { status: 500 });
    }
}
