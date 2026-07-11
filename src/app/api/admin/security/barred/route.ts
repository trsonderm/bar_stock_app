import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { markChanged } from '@/lib/markChanged';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Auto-archive anyone whose barred_until has passed
    await db.execute(
        `UPDATE security_barred SET is_archived = TRUE, archived_at = NOW()
         WHERE organization_id = $1 AND barred_until IS NOT NULL AND barred_until < NOW() AND is_archived = FALSE`,
        [session.organizationId]
    );

    const archived = req.nextUrl.searchParams.get('archived') === 'true';
    const rows = await db.query(
        `SELECT sb.*, u.first_name || ' ' || u.last_name AS barred_by_display
         FROM security_barred sb
         LEFT JOIN users u ON u.id = sb.barred_by_user_id
         WHERE sb.organization_id = $1 AND COALESCE(sb.is_archived, FALSE) = $2
         ORDER BY sb.created_at DESC`,
        [session.organizationId, archived]
    );
    return NextResponse.json({ barred: rows });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const perms: string[] = session.permissions || [];
    const isAdmin = session.role === 'admin';
    if (!isAdmin && !perms.includes('all') && !perms.includes('add_barred')) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { name, aliases, photo, media, description, trespassed, barred_until } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

    const barredByName = `${session.firstName} ${session.lastName}`;
    const rows = await db.query(
        `INSERT INTO security_barred
            (organization_id, name, aliases, photo, media, description, barred_by_user_id, barred_by_name, trespassed, barred_until)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [
            session.organizationId,
            name.trim(),
            JSON.stringify(Array.isArray(aliases) ? aliases : []),
            photo || null,
            JSON.stringify(Array.isArray(media) ? media : []),
            description || null,
            session.id,
            barredByName,
            trespassed === true,
            barred_until || null,
        ]
    );
    markChanged(session.organizationId, 0, 'security');
    return NextResponse.json({ barred: rows[0] });
}

// PUT — edit an existing barred person's details
export async function PUT(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const perms: string[] = session.permissions || [];
    const isAdmin = session.role === 'admin';
    if (!isAdmin && !perms.includes('all') && !perms.includes('add_barred')) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { id, name, aliases, photo, media, description, trespassed, barred_until } = await req.json();
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

    await db.execute(
        `UPDATE security_barred
         SET name = $1, aliases = $2, photo = $3, media = $4, description = $5,
             trespassed = $6, barred_until = $7, updated_at = NOW()
         WHERE id = $8 AND organization_id = $9`,
        [
            name.trim(),
            JSON.stringify(Array.isArray(aliases) ? aliases : []),
            photo ?? null,
            JSON.stringify(Array.isArray(media) ? media : []),
            description ?? null,
            trespassed === true,
            barred_until ?? null,
            id,
            session.organizationId,
        ]
    );
    markChanged(session.organizationId, 0, 'security');
    return NextResponse.json({ ok: true });
}

// PATCH — restore an archived person back to active
export async function PATCH(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const perms: string[] = session.permissions || [];
    const isAdmin = session.role === 'admin';
    if (!isAdmin && !perms.includes('all') && !perms.includes('add_barred')) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { id, barred_until } = await req.json();
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    await db.execute(
        `UPDATE security_barred SET is_archived = FALSE, archived_at = NULL, barred_until = $1
         WHERE id = $2 AND organization_id = $3`,
        [barred_until || null, id, session.organizationId]
    );
    markChanged(session.organizationId, 0, 'security');
    return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const perms: string[] = session.permissions || [];
    const isAdmin = session.role === 'admin';
    if (!isAdmin && !perms.includes('all') && !perms.includes('delete_barred')) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const id = parseInt(req.nextUrl.searchParams.get('id') || '0');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    await db.execute('DELETE FROM security_barred WHERE id = $1 AND organization_id = $2', [id, session.organizationId]);
    markChanged(session.organizationId, 0, 'security');
    return NextResponse.json({ ok: true });
}
