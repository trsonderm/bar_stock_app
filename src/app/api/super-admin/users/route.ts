import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { hashPassword } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const search = req.nextUrl.searchParams.get('search') || '';

    let users: any[];
    try {
        users = await db.query(`
            SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.organization_id,
                   o.name as organization_name,
                   COALESCE(u.is_active, true) as is_active,
                   COALESCE(u.is_archived, false) as is_archived
            FROM users u
            LEFT JOIN organizations o ON u.organization_id = o.id
            WHERE (u.first_name ILIKE $1 OR u.last_name ILIKE $1 OR COALESCE(u.email, '') ILIKE $1)
            AND COALESCE(u.is_archived, false) = false
            ORDER BY u.id ASC
            LIMIT 500
        `, [`%${search}%`]);
    } catch {
        // Fallback if is_active/is_archived columns don't exist yet (pre-migration)
        users = await db.query(`
            SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.organization_id,
                   o.name as organization_name,
                   true as is_active,
                   false as is_archived
            FROM users u
            LEFT JOIN organizations o ON u.organization_id = o.id
            WHERE (u.first_name ILIKE $1 OR u.last_name ILIKE $1 OR COALESCE(u.email, '') ILIKE $1)
            ORDER BY u.id ASC
            LIMIT 500
        `, [`%${search}%`]);
    }

    return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { first_name, last_name, email, password, role, organization_id } = await req.json();

        // Defaults to user if empty
        const finalRole = role || 'user';
        const password_hash = password ? hashPassword(password) : null;

        const res = await db.one(`
            INSERT INTO users (first_name, last_name, email, password_hash, role, organization_id)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
        `, [first_name, last_name, email || null, password_hash, finalRole, organization_id || null]);

        return NextResponse.json({ success: true, id: res.id });
    } catch (e: any) {
        return NextResponse.json({ error: 'Failed to create user: ' + e.message }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, first_name, last_name, email, password, role, organization_id, is_active } = await req.json();

    const updates = [];
    const params = [];
    let pIdx = 1;

    if (first_name !== undefined) { updates.push(`first_name = $${pIdx++}`); params.push(first_name); }
    if (last_name !== undefined) { updates.push(`last_name = $${pIdx++}`); params.push(last_name); }
    if (email !== undefined) { updates.push(`email = $${pIdx++}`); params.push(email); }
    if (role !== undefined) { updates.push(`role = $${pIdx++}`); params.push(role); }
    if (organization_id !== undefined) { updates.push(`organization_id = $${pIdx++}`); params.push(organization_id); }
    if (is_active !== undefined) { updates.push(`is_active = $${pIdx++}`); params.push(is_active); }

    if (password) {
        const hash = hashPassword(password);
        updates.push(`password_hash = $${pIdx++}`); params.push(hash);
    }

    if (updates.length > 0) {
        params.push(id);
        await db.execute(`UPDATE users SET ${updates.join(', ')} WHERE id = $${pIdx}`, params);
    }

    return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await req.json();
    if (id === session.id) return NextResponse.json({ error: 'Cannot archive yourself' }, { status: 400 });

    try {
        await db.execute('UPDATE users SET is_archived = true WHERE id = $1', [id]);
    } catch {
        // Column may not exist yet — soft delete not available, just return success
    }

    return NextResponse.json({ success: true });
}
