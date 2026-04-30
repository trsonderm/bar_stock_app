import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rows = await db.query(
        `SELECT sb.*, u.first_name || ' ' || u.last_name AS barred_by_display
         FROM security_barred sb
         LEFT JOIN users u ON u.id = sb.barred_by_user_id
         WHERE sb.organization_id = $1
         ORDER BY sb.created_at DESC`,
        [session.organizationId]
    );
    return NextResponse.json({ barred: rows });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const perms: string[] = session.permissions || [];
    const isAdmin = session.role === 'admin';
    const canAdd = isAdmin || perms.includes('all') || perms.includes('add_barred');
    if (!canAdd) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });

    const { name, aliases, photo, description, trespassed } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

    const barredByName = `${session.firstName} ${session.lastName}`;
    const rows = await db.query(
        `INSERT INTO security_barred (organization_id, name, aliases, photo, description, barred_by_user_id, barred_by_name, trespassed)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
            session.organizationId,
            name.trim(),
            JSON.stringify(Array.isArray(aliases) ? aliases : []),
            photo || null,
            description || null,
            session.id,
            barredByName,
            trespassed === true,
        ]
    );
    return NextResponse.json({ barred: rows[0] });
}

export async function DELETE(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const perms: string[] = session.permissions || [];
    const isAdmin = session.role === 'admin';
    const canDelete = isAdmin || perms.includes('all') || perms.includes('delete_barred');
    if (!canDelete) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });

    const { searchParams } = req.nextUrl;
    const id = parseInt(searchParams.get('id') || '0');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    await db.query(
        'DELETE FROM security_barred WHERE id = $1 AND organization_id = $2',
        [id, session.organizationId]
    );
    return NextResponse.json({ ok: true });
}
