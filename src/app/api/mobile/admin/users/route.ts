/**
 * GET    /api/mobile/admin/users           — list all org users with permissions and locations
 * POST   /api/mobile/admin/users           — create a user
 * PUT    /api/mobile/admin/users           — update a user
 * DELETE /api/mobile/admin/users?id=<id>  — delete a user
 *
 * All methods require admin role.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db, pool } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';
import { hashPin, hashPassword } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const locationId = req.nextUrl.searchParams.get('locationId');

    const locationJoin = locationId
        ? `JOIN user_locations ul2 ON u.id = ul2.user_id AND ul2.location_id = ${parseInt(locationId)}`
        : '';

    const users = await db.query(
        `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.permissions,
                u.phone, u.bio, u.notes, u.is_active, u.is_archived,
                u.display_name, u.profile_picture, u.created_at,
                COALESCE(u.hide_from_scheduler, false) AS hide_from_scheduler,
                json_agg(DISTINCT ul.location_id) AS assigned_locations
         FROM users u
         LEFT JOIN user_locations ul ON u.id = ul.user_id
         ${locationJoin}
         WHERE u.organization_id = $1
           AND u.is_archived = false
         GROUP BY u.id
         ORDER BY u.first_name ASC`,
        [session.organizationId]
    );

    const parsed = users.map((u: any) => ({
        ...u,
        assigned_locations: (u.assigned_locations || []).filter((id: any) => id !== null),
        permissions: Array.isArray(u.permissions) ? u.permissions : [],
    }));

    return NextResponse.json({ users: parsed });
}

export async function POST(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const {
        first_name, last_name, email, pin, password,
        role, permissions, phone, bio, notes,
        assigned_locations, display_name,
    } = await req.json();

    if (!first_name?.trim() || !last_name?.trim()) {
        return NextResponse.json({ error: 'first_name and last_name are required' }, { status: 400 });
    }
    if (!pin && !password) {
        return NextResponse.json({ error: 'pin or password is required' }, { status: 400 });
    }

    const pinHash = pin ? await hashPin(String(pin)) : await hashPin('0000');
    const passwordHash = password ? await hashPassword(password) : null;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const userRes = await client.query(
            `INSERT INTO users
                (organization_id, first_name, last_name, email, pin_hash, password_hash,
                 role, permissions, phone, bio, notes, display_name, is_active)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true) RETURNING id`,
            [
                session.organizationId,
                first_name.trim(), last_name.trim(),
                email?.trim() || null, pinHash, passwordHash,
                role || 'user',
                JSON.stringify(permissions || []),
                phone?.trim() || null, bio?.trim() || null, notes?.trim() || null,
                display_name?.trim() || null,
            ]
        );
        const userId = userRes.rows[0].id;

        if (Array.isArray(assigned_locations) && assigned_locations.length > 0) {
            for (const locId of assigned_locations) {
                await client.query(
                    'INSERT INTO user_locations (organization_id, user_id, location_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
                    [session.organizationId, userId, locId]
                );
            }
        }

        await client.query('COMMIT');
        return NextResponse.json({ ok: true, id: userId });
    } catch (e: any) {
        await client.query('ROLLBACK');
        if (e.code === '23505') return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
        console.error('[mobile/admin/users POST]', e);
        return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
    } finally {
        client.release();
    }
}

export async function PUT(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const {
        id, first_name, last_name, email, pin, password,
        role, permissions, phone, bio, notes,
        assigned_locations, display_name, is_active,
    } = await req.json();
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (first_name !== undefined) { updates.push(`first_name = $${idx++}`); params.push(first_name.trim()); }
    if (last_name !== undefined) { updates.push(`last_name = $${idx++}`); params.push(last_name.trim()); }
    if (email !== undefined) { updates.push(`email = $${idx++}`); params.push(email?.trim() || null); }
    if (display_name !== undefined) { updates.push(`display_name = $${idx++}`); params.push(display_name?.trim() || null); }
    if (role !== undefined) { updates.push(`role = $${idx++}`); params.push(role); }
    if (permissions !== undefined) { updates.push(`permissions = $${idx++}`); params.push(JSON.stringify(permissions)); }
    if (phone !== undefined) { updates.push(`phone = $${idx++}`); params.push(phone?.trim() || null); }
    if (bio !== undefined) { updates.push(`bio = $${idx++}`); params.push(bio?.trim() || null); }
    if (notes !== undefined) { updates.push(`notes = $${idx++}`); params.push(notes?.trim() || null); }
    if (is_active !== undefined) { updates.push(`is_active = $${idx++}`); params.push(is_active); }
    if (pin) { updates.push(`pin_hash = $${idx++}`); params.push(await hashPin(String(pin))); }
    if (password) { updates.push(`password_hash = $${idx++}`); params.push(await hashPassword(password)); }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        if (updates.length > 0) {
            params.push(id, session.organizationId);
            await client.query(
                `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx++} AND organization_id = $${idx}`,
                params
            );
        }

        if (Array.isArray(assigned_locations)) {
            await client.query('DELETE FROM user_locations WHERE user_id = $1', [id]);
            for (const locId of assigned_locations) {
                await client.query(
                    'INSERT INTO user_locations (organization_id, user_id, location_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
                    [session.organizationId, id, locId]
                );
            }
        }

        await client.query('COMMIT');
        return NextResponse.json({ ok: true });
    } catch (e: any) {
        await client.query('ROLLBACK');
        console.error('[mobile/admin/users PUT]', e);
        return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
    } finally {
        client.release();
    }
}

export async function DELETE(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    if (parseInt(id) === session.id) return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });

    await db.execute(
        'DELETE FROM users WHERE id = $1 AND organization_id = $2',
        [id, session.organizationId]
    );
    return NextResponse.json({ ok: true });
}
