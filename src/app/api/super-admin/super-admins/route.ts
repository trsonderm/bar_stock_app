import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hashPassword } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const rows = await db.query(`
        SELECT id, first_name, last_name, email, permissions, is_active, created_at
        FROM users
        WHERE permissions::jsonb ? 'super_admin'
        ORDER BY created_at ASC
    `);

    return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const { first_name, last_name, email, password } = await req.json();
    if (!email || !password) return NextResponse.json({ error: 'Email and password required' }, { status: 400 });

    const password_hash = hashPassword(password);
    const pin_hash = '$2b$10$dummyhashforsuperadmin00000000000000000000000000000000';

    const existing = await db.one('SELECT id FROM users WHERE email = $1', [email]);
    if (existing) {
        // Promote existing user
        await db.execute(`
            UPDATE users SET permissions = permissions::jsonb || '["super_admin"]'::jsonb
            WHERE id = $1
        `, [existing.id]);
        return NextResponse.json({ ok: true, promoted: true, id: existing.id });
    }

    const row = await db.one(`
        INSERT INTO users (first_name, last_name, email, password_hash, pin_hash, role, permissions, organization_id)
        VALUES ($1, $2, $3, $4, $5, 'admin', '["all","super_admin"]', NULL)
        RETURNING id
    `, [first_name, last_name, email, password_hash, pin_hash]);

    return NextResponse.json({ ok: true, id: row.id });
}

export async function DELETE(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const id = parseInt(req.nextUrl.searchParams.get('id') || '0');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    // Prevent removing yourself
    if ((session as any).userId === id) {
        return NextResponse.json({ error: 'Cannot remove your own super admin access' }, { status: 400 });
    }

    await db.execute(`
        UPDATE users
        SET permissions = (
            SELECT jsonb_agg(elem)
            FROM jsonb_array_elements_text(permissions::jsonb) AS elem
            WHERE elem != 'super_admin'
        )
        WHERE id = $1
    `, [id]);

    return NextResponse.json({ ok: true });
}
