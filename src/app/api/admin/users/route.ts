import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hashPin, hashPassword } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.organizationId;
    const users = await db.query(`
        SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.permissions, u.pin_hash, u.created_at, u.phone, u.bio, u.notes,
        json_group_array(ul.location_id) as assigned_locations
        FROM users u
        LEFT JOIN user_locations ul ON u.id = ul.user_id
        WHERE u.organization_id = $1 
        GROUP BY u.id
        ORDER BY u.first_name ASC
    `, [organizationId]);

    // Parse the json string from sqlite
    const parsed = users.map((u: any) => ({
        ...u,
        assigned_locations: JSON.parse(u.assigned_locations).filter((id: any) => id !== null)
    }));

    return NextResponse.json({ users: parsed });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.organizationId;
    const { firstName, lastName, pin, email, password, permissions = [], role = 'user', phone, bio, notes, assignedLocations = [] } = await req.json();

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

    try {
        const res = await db.one(`
            INSERT INTO users (first_name, last_name, pin_hash, email, password_hash, role, permissions, organization_id, phone, bio, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id
        `, [firstName, lastName, pinHash, email || null, passwordHash, finalRole, JSON.stringify(permissions), organizationId, phone || null, bio || null, notes || null]);

        const userId = res.id;

        // Save Locations
        if (Array.isArray(assignedLocations) && assignedLocations.length > 0) {
            for (const locId of assignedLocations) {
                await db.execute(
                    'INSERT INTO user_locations (user_id, location_id, organization_id) VALUES ($1, $2, $3)',
                    [userId, locId, organizationId]
                );
            }
        }

        // Log
        await db.execute('INSERT INTO activity_logs (organization_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
            [organizationId, session.id, 'CREATE_USER', JSON.stringify({ firstName, lastName, email, assignedLocations })]);

        return NextResponse.json({ success: true, id: userId });
    } catch (e: any) {
        console.error(e);
        if (e.message.includes('unique constraint') || e.message.includes('UNIQUE')) {
            return NextResponse.json({ error: 'Email already exists' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const organizationId = session.organizationId;
    const { id, firstName, lastName, pin, email, password, permissions = [], role = 'user', phone, bio, notes } = await req.json();

    if (!id || !firstName || !lastName) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Authorization
    const user = await db.one('SELECT id FROM users WHERE id = $1 AND organization_id = $2', [id, organizationId]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    try {
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
        updates.push(`role = $${pIdx++}`); params.push(role);
        updates.push(`permissions = $${pIdx++}`); params.push(JSON.stringify(permissions));
        if (phone !== undefined) {
            updates.push(`phone = $${pIdx++}`); params.push(phone || null);
        }
        if (bio !== undefined) {
            updates.push(`bio = $${pIdx++}`); params.push(bio || null);
        }
        if (notes !== undefined) {
            updates.push(`notes = $${pIdx++}`); params.push(notes || null);
        }

        if (updates.length > 0) {
            params.push(id);
            params.push(organizationId);
            await db.execute(
                `UPDATE users SET ${updates.join(', ')} WHERE id = $${pIdx} AND organization_id = $${pIdx + 1}`,
                params
            );
        }

        const { assignedLocations } = await req.json(); // Get from body again properly since we destructured above
        if (assignedLocations !== undefined && Array.isArray(assignedLocations)) {
            // Replace locations
            await db.execute('DELETE FROM user_locations WHERE user_id = $1 AND organization_id = $2', [id, organizationId]);
            for (const locId of assignedLocations) {
                await db.execute(
                    'INSERT INTO user_locations (user_id, location_id, organization_id) VALUES ($1, $2, $3)',
                    [id, locId, organizationId]
                );
            }
        }

        await db.execute(
            'INSERT INTO activity_logs (organization_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
            [organizationId, session.id, 'UPDATE_USER', JSON.stringify({ userId: id })]
        );

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const organizationId = session.organizationId;
    const { id } = await req.json();
    if (id === session.id) return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 });

    try {
        const result = await db.execute('DELETE FROM users WHERE id = $1 AND organization_id = $2', [id, organizationId]);

        if (result.rowCount === 0) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        await db.execute(
            'INSERT INTO activity_logs (organization_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
            [organizationId, session.id, 'DELETE_USER', JSON.stringify({ userId: id })]
        );

        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
    }
}
