import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rows = await db.query(
        `SELECT si.*, sb.name AS barred_person_name, sb.photo AS barred_person_photo
         FROM security_incidents si
         LEFT JOIN security_barred sb ON sb.id = si.barred_person_id
         WHERE si.organization_id = $1
         ORDER BY si.created_at DESC`,
        [session.organizationId]
    );
    return NextResponse.json({ incidents: rows });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const perms: string[] = session.permissions || [];
    const isAdmin = session.role === 'admin';
    const canAdd = isAdmin || perms.includes('all') || perms.includes('add_incident');
    if (!canAdd) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });

    const { barred_person_id, person_name, description } = await req.json();
    if (!description?.trim()) return NextResponse.json({ error: 'Description is required' }, { status: 400 });

    const submittedByName = `${session.firstName} ${session.lastName}`;
    const rows = await db.query(
        `INSERT INTO security_incidents (organization_id, barred_person_id, person_name, description, submitted_by_user_id, submitted_by_name)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [
            session.organizationId,
            barred_person_id || null,
            person_name?.trim() || null,
            description.trim(),
            session.id,
            submittedByName,
        ]
    );
    return NextResponse.json({ incident: rows[0] });
}

export async function DELETE(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const isAdmin = session.role === 'admin';
    if (!isAdmin && !session.permissions?.includes('all')) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { searchParams } = req.nextUrl;
    const id = parseInt(searchParams.get('id') || '0');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    await db.query(
        'DELETE FROM security_incidents WHERE id = $1 AND organization_id = $2',
        [id, session.organizationId]
    );
    return NextResponse.json({ ok: true });
}
