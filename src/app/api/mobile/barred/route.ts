import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';

// GET /api/mobile/barred?trespassed_only=true
export async function GET(req: NextRequest) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Auto-archive expired
        await db.execute(
            `UPDATE security_barred SET is_archived = TRUE, archived_at = NOW()
             WHERE organization_id = $1 AND barred_until IS NOT NULL AND barred_until < NOW() AND is_archived = FALSE`,
            [session.organizationId]
        );

        const trespassedOnly = req.nextUrl.searchParams.get('trespassed_only') === 'true';
        const rows = await db.query(
            `SELECT id, name, aliases, photo, description, barred_by_name, trespassed, barred_until, created_at
             FROM security_barred
             WHERE organization_id = $1
               AND COALESCE(is_archived, FALSE) = FALSE
               ${trespassedOnly ? 'AND trespassed = TRUE' : ''}
             ORDER BY trespassed DESC, created_at DESC`,
            [session.organizationId]
        );
        return NextResponse.json({ barred: rows, total: rows.length });
    } catch (err) {
        console.error('Mobile barred GET error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST /api/mobile/barred — add a barred person from mobile
export async function POST(req: NextRequest) {
    try {
        const session = await verifyMobileToken(req);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const perms: string[] = (session.permissions as string[]) || [];
        const isAdmin = session.role === 'admin';
        if (!isAdmin && !perms.includes('all') && !perms.includes('add_barred')) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const { name, aliases, photo, description, trespassed, barred_until } = await req.json();
        if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

        const barredByName = `${session.firstName} ${session.lastName}`;
        const rows = await db.query(
            `INSERT INTO security_barred
                (organization_id, name, aliases, photo, description, barred_by_user_id, barred_by_name, trespassed, barred_until)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [
                session.organizationId,
                name.trim(),
                JSON.stringify(Array.isArray(aliases) ? aliases : []),
                photo || null,
                description || null,
                session.id,
                barredByName,
                trespassed === true,
                barred_until || null,
            ]
        );
        return NextResponse.json({ barred: rows[0] });
    } catch (err) {
        console.error('Mobile barred POST error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
