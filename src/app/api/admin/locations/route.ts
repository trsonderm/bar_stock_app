/**
 * /api/admin/locations — bar locations of an organization.
 *
 *  GET    list (admin; super admins may pass ?orgId=)
 *  POST   create { name, address } (admin)
 *  PUT    rename { id, name, address } (admin)
 *  DELETE ?id= (admin) — cascades to that location's inventory rows
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || (session.role !== 'admin' && !session.isSuperAdmin)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { searchParams } = new URL(req.url);
        let organizationId = session.organizationId;
        if (session.isSuperAdmin && searchParams.get('orgId')) {
            organizationId = parseInt(searchParams.get('orgId') as string, 10);
        }

        const locations = await db.query(
            'SELECT * FROM locations WHERE organization_id = $1 ORDER BY name ASC',
            [organizationId]
        );
        return NextResponse.json({ locations });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { name, address } = await req.json();
        if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });

        const res = await db.one(
            'INSERT INTO locations (name, address, organization_id) VALUES ($1, $2, $3) RETURNING id',
            [name, address || '', session.organizationId]
        );
        return NextResponse.json({ success: true, id: res.id });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { id, name, address } = await req.json();
        if (!id || !name) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

        const result = await db.execute(
            'UPDATE locations SET name = $1, address = $2 WHERE id = $3 AND organization_id = $4',
            [name, address || '', id, session.organizationId]
        );

        if (result.rowCount === 0) {
            return NextResponse.json({ error: 'Location not found or no changes made' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

        // inventory.location_id is ON DELETE CASCADE, so the location's stock rows go with it.

        await db.execute('DELETE FROM locations WHERE id = $1 AND organization_id = $2', [id, session.organizationId]);
        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
