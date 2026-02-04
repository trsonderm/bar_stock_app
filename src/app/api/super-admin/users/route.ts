import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { hashPassword } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const search = req.nextUrl.searchParams.get('search') || '';

    // Fetch all users with their Org Name
    // JOIN organizations.
    const users = await db.query(`
        SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.organization_id, o.name as organization_name
        FROM users u
        LEFT JOIN organizations o ON u.organization_id = o.id
        WHERE (u.first_name ILIKE $1 OR u.last_name ILIKE $1 OR u.email ILIKE $1)
        ORDER BY u.id ASC
        LIMIT 100
    `, [`%${search}%`]);

    return NextResponse.json({ users });
}

export async function PUT(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, password, role, organization_id } = await req.json();

    if (password) {
        const hash = await hashPassword(password);
        await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, id]);
    }

    if (role) {
        await db.query('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
    }

    if (organization_id) {
        await db.query('UPDATE users SET organization_id = $1 WHERE id = $2', [organization_id, id]);
    }

    return NextResponse.json({ success: true });
}
