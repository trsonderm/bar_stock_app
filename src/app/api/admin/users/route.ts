/**
 * /api/admin/users — manage the users of an organization (admin only).
 *
 *  GET    list users (optional ?locationId= filter for the scheduler)
 *  POST   create a user (PIN and/or email + password)
 *  PUT    update a user, their locations and shift assignments
 *  DELETE remove a user
 *
 * Super admins may target another organization with ?orgId=.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hashPin, hashPassword, UserSession } from '@/lib/auth';

/**
 * Only a super admin may grant the platform-wide `super_admin` permission;
 * otherwise any tenant admin could escalate a user (or themselves) to it.
 */
function sanitizePermissions(permissions: unknown, session: UserSession): string[] {
    const list = Array.isArray(permissions) ? permissions.filter((p): p is string => typeof p === 'string') : [];
    return session.isSuperAdmin ? list : list.filter(p => p !== 'super_admin');
}

/** True if a users row carries the platform-wide super_admin permission. */
function isSuperAdminUser(user: { permissions: unknown }): boolean {
    let perms = user.permissions;
    if (typeof perms === 'string') {
        try { perms = JSON.parse(perms); } catch { perms = []; }
    }
    return Array.isArray(perms) && perms.includes('super_admin');
}

/** Keeps only the location ids that belong to the given organization. */
async function filterOrgLocations(locationIds: unknown, organizationId: number): Promise<number[]> {
    if (!Array.isArray(locationIds) || locationIds.length === 0) return [];
    const rows = await db.query(
        'SELECT id FROM locations WHERE id = ANY($1::int[]) AND organization_id = $2',
        [locationIds.map(Number), organizationId]
    );
    return rows.map((r: any) => Number(r.id));
}

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.organizationId || session.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        let organizationId = session.organizationId;
        if (session.isSuperAdmin && searchParams.get('orgId')) {
            organizationId = parseInt(searchParams.get('orgId') as string, 10);
        }

        // Check if user_locations table exists to prevent 500s if schema is wrong
        // actually just wrapping in try/catch is enough to return json error

        const filterLocationId = searchParams.get('locationId') ? parseInt(searchParams.get('locationId') as string) : null;

        // When locationId is provided, restrict to users assigned to that location
        const locationJoin = filterLocationId
            ? `JOIN user_locations ul2 ON u.id = ul2.user_id AND ul2.location_id = ${filterLocationId}`
            : '';

        // When locationId filter is provided AND hide_from_scheduler is desired, exclude hidden users
        const hideSchedulerFilter = filterLocationId ? `AND COALESCE(u.hide_from_scheduler, false) = false` : '';

        const users = await db.query(`
            SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.permissions, u.pin_hash, u.created_at, u.phone, u.bio, u.notes,
            COALESCE(u.hide_from_scheduler, false) as hide_from_scheduler,
            json_agg(DISTINCT ul.location_id) as assigned_locations,
            (
                SELECT json_agg(s.id)
                FROM shifts s
                WHERE s.organization_id = $1
                AND s.assigned_user_ids::jsonb @> to_jsonb(u.id)
            ) as assigned_shifts
            FROM users u
            LEFT JOIN user_locations ul ON u.id = ul.user_id
            ${locationJoin}
            WHERE u.organization_id = $1
            ${hideSchedulerFilter}
            GROUP BY u.id
            ORDER BY u.first_name ASC
        `, [organizationId]);

        // PG driver parses json/jsonb columns automatically
        const parsed = users.map((u: any) => ({
            ...u,
            assigned_locations: (u.assigned_locations || []).filter((id: any) => id !== null)
        }));

        return NextResponse.json({
            users: parsed,
            debug: {
                orgId: organizationId,
                count: parsed.length
            }
        });
    } catch (e: any) {
        console.error('Error fetching users API:', e);
        return NextResponse.json({ error: 'Database Error: ' + e.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.organizationId || session.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        let organizationId = session.organizationId;
        if (session.isSuperAdmin && searchParams.get('orgId')) {
            organizationId = parseInt(searchParams.get('orgId') as string, 10);
        }
        const body = await req.json();
        const { firstName, lastName, pin, email, password, permissions = [], role = 'user', phone, bio, notes, assignedLocations = [], hideFromScheduler = false } = body;

        if (!firstName || !lastName) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        if (!pin && (!email || !password)) {
            return NextResponse.json({ error: 'Must provide either PIN or Email/Password' }, { status: 400 });
        }

        if (pin && (pin.length !== 4 || isNaN(Number(pin)))) {
            return NextResponse.json({ error: 'PIN must be 4 numbers' }, { status: 400 });
        }

        const finalRole = role === 'admin' ? 'admin' : 'user';

        const pinHash = pin ? hashPin(pin) : 'N/A';
        const passwordHash = password ? hashPassword(password) : null;

        const res = await db.one(`
            INSERT INTO users (first_name, last_name, pin_hash, email, password_hash, role, permissions, organization_id, phone, bio, notes, hide_from_scheduler)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING id
        `, [firstName, lastName, pinHash, email || null, passwordHash, finalRole, JSON.stringify(sanitizePermissions(permissions, session)), organizationId, phone || null, bio || null, notes || null, hideFromScheduler]);

        const userId = res.id;

        // Save Locations
        const locationIds = await filterOrgLocations(assignedLocations, organizationId);
        if (locationIds.length > 0) {
            for (const locId of locationIds) {
                await db.execute(
                    'INSERT INTO user_locations (user_id, location_id, organization_id) VALUES ($1, $2, $3)',
                    [userId, locId, organizationId]
                );
            }
        }

        // Shift Assignment (POST)
        const { assignedShifts } = body;
        if (assignedShifts && Array.isArray(assignedShifts) && assignedShifts.length > 0) {
            const allShifts = await db.query('SELECT id, assigned_user_ids FROM shifts WHERE organization_id = $1', [organizationId]);
            for (const shift of allShifts) {
                // If this shift is in the assigned list, add user
                if (assignedShifts.includes(shift.id)) {
                    let currentUsers: number[] = [];
                    try {
                        if (typeof shift.assigned_user_ids === 'string') currentUsers = JSON.parse(shift.assigned_user_ids);
                        else if (Array.isArray(shift.assigned_user_ids)) currentUsers = shift.assigned_user_ids;
                    } catch { }

                    if (!currentUsers.includes(userId)) {
                        currentUsers.push(userId);
                        await db.execute(
                            'UPDATE shifts SET assigned_user_ids = $1 WHERE id = $2',
                            [JSON.stringify(currentUsers), shift.id]
                        );
                    }
                }
            }
        }

        // Log
        await db.execute('INSERT INTO activity_logs (organization_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
            [organizationId, session.id, 'CREATE_USER', JSON.stringify({ firstName, lastName, email, assignedLocations })]);

        return NextResponse.json({ success: true, id: userId });
    } catch (e: any) {
        console.error(e);
        if (e.message && (e.message.includes('unique constraint') || e.message.includes('UNIQUE'))) {
            return NextResponse.json({ error: 'Email already exists' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Failed to create user: ' + e.message }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.organizationId || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(req.url);
        let organizationId = session.organizationId;
        if (session.isSuperAdmin && searchParams.get('orgId')) {
            organizationId = parseInt(searchParams.get('orgId') as string, 10);
        }
        const body = await req.json(); // Read once
        const { id, firstName, lastName, pin, email, password, permissions = [], role = 'user', phone, bio, notes, assignedLocations, hideFromScheduler } = body;

        if (!id || !firstName || !lastName) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Authorization
        const user = await db.one('SELECT id, permissions FROM users WHERE id = $1 AND organization_id = $2', [id, organizationId]);
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
        if (isSuperAdminUser(user) && !session.isSuperAdmin) {
            return NextResponse.json({ error: 'Only a super admin can modify this account' }, { status: 403 });
        }

        const updates = [];
        const params = [];
        let pIdx = 1;

        updates.push(`first_name = $${pIdx++}`); params.push(firstName);
        updates.push(`last_name = $${pIdx++}`); params.push(lastName);
        if (pin) {
            updates.push(`pin_hash = $${pIdx++}`); params.push(hashPin(pin));
        }
        if (email !== undefined) {
            updates.push(`email = $${pIdx++}`); params.push(email || null);
        }
        if (password) {
            updates.push(`password_hash = $${pIdx++}`); params.push(hashPassword(password));
        }
        updates.push(`role = $${pIdx++}`); params.push(role === 'admin' ? 'admin' : 'user');
        updates.push(`permissions = $${pIdx++}`); params.push(JSON.stringify(sanitizePermissions(permissions, session)));
        if (phone !== undefined) {
            updates.push(`phone = $${pIdx++}`); params.push(phone || null);
        }
        if (bio !== undefined) {
            updates.push(`bio = $${pIdx++}`); params.push(bio || null);
        }
        if (notes !== undefined) {
            updates.push(`notes = $${pIdx++}`); params.push(notes || null);
        }
        if (hideFromScheduler !== undefined) {
            updates.push(`hide_from_scheduler = $${pIdx++}`); params.push(Boolean(hideFromScheduler));
        }

        if (updates.length > 0) {
            params.push(id);
            params.push(organizationId);
            await db.execute(
                `UPDATE users SET ${updates.join(', ')} WHERE id = $${pIdx} AND organization_id = $${pIdx + 1}`,
                params
            );
        }

        // Replace the user's location assignments
        if (assignedLocations !== undefined && Array.isArray(assignedLocations)) {
            await db.execute('DELETE FROM user_locations WHERE user_id = $1 AND organization_id = $2', [id, organizationId]);
            for (const locId of await filterOrgLocations(assignedLocations, organizationId)) {
                await db.execute(
                    'INSERT INTO user_locations (user_id, location_id, organization_id) VALUES ($1, $2, $3)',
                    [id, locId, organizationId]
                );
            }
        }

        // Shift Assignment Logic
        // We accept 'assignedShifts' which is an array of shift IDs that THIS user should be in.
        // We need to sync this with the 'shifts' table 'assigned_user_ids' column.
        const { assignedShifts } = body;
        if (assignedShifts !== undefined && Array.isArray(assignedShifts)) {
            const allShifts = await db.query('SELECT id, assigned_user_ids FROM shifts WHERE organization_id = $1', [organizationId]);

            for (const shift of allShifts) {
                let currentUsers: number[] = [];
                try {
                    if (typeof shift.assigned_user_ids === 'string') currentUsers = JSON.parse(shift.assigned_user_ids);
                    else if (Array.isArray(shift.assigned_user_ids)) currentUsers = shift.assigned_user_ids;
                } catch { }

                const shouldBeIn = assignedShifts.includes(shift.id);
                const isIn = currentUsers.includes(id);

                let changed = false;
                if (shouldBeIn && !isIn) {
                    currentUsers.push(id);
                    changed = true;
                } else if (!shouldBeIn && isIn) {
                    currentUsers = currentUsers.filter(uid => uid !== id);
                    changed = true;
                }

                if (changed) {
                    await db.execute(
                        'UPDATE shifts SET assigned_user_ids = $1 WHERE id = $2',
                        [JSON.stringify(currentUsers), shift.id]
                    );
                }
            }
        }

        await db.execute(
            'INSERT INTO activity_logs (organization_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
            [organizationId, session.id, 'UPDATE_USER', JSON.stringify({ userId: id })]
        );

        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error(e);
        return NextResponse.json({ error: 'Failed to update user: ' + e.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.organizationId || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(req.url);
        let organizationId = session.organizationId;
        if (session.isSuperAdmin && searchParams.get('orgId')) {
            organizationId = parseInt(searchParams.get('orgId') as string, 10);
        }
        const { id } = await req.json();
        if (id === session.id) return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 });

        const target = await db.one('SELECT id, permissions FROM users WHERE id = $1 AND organization_id = $2', [id, organizationId]);
        if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
        if (isSuperAdminUser(target) && !session.isSuperAdmin) {
            return NextResponse.json({ error: 'Only a super admin can delete this account' }, { status: 403 });
        }

        const result = await db.execute('DELETE FROM users WHERE id = $1 AND organization_id = $2', [id, organizationId]);

        if (result.rowCount === 0) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        await db.execute(
            'INSERT INTO activity_logs (organization_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
            [organizationId, session.id, 'DELETE_USER', JSON.stringify({ userId: id })]
        );

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: 'Failed to delete: ' + e.message }, { status: 500 });
    }
}
