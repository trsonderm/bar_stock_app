/**
 * /api/admin/reporting/subscriptions — who receives each location's daily report (admin only).
 *
 *  GET  locations, org users and current subscribers
 *  POST { locationId, userId, action: 'add' | 'remove' } toggles
 *       user_locations.receive_daily_report (the assignment row is kept on remove)
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const organizationId = session.organizationId;

        // 1. Get all locations
        const locations = await db.query(
            'SELECT id, name FROM locations WHERE organization_id = $1 ORDER BY name ASC',
            [organizationId]
        );

        // 2. Get all users (id, name, email) for dropdown
        const allUsers = await db.query(
            'SELECT id, first_name, last_name, email FROM users WHERE organization_id = $1 ORDER BY first_name ASC',
            [organizationId]
        );

        // 3. Current subscribers: user/location pairs with receive_daily_report enabled
        const subscriptions = await db.query(`
            SELECT ul.user_id, ul.location_id, ul.receive_daily_report, u.first_name, u.last_name, u.email
            FROM user_locations ul
            JOIN users u ON ul.user_id = u.id
            WHERE ul.organization_id = $1 AND ul.receive_daily_report = TRUE
        `, [organizationId]);

        return NextResponse.json({ locations, allUsers, subscriptions });

    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { locationId, userId, action } = await req.json(); // action: 'add', 'remove'

        if (!locationId || !userId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

        const organizationId = session.organizationId;

        // Both the user and the location must belong to the caller's organization.
        const user = await db.one('SELECT id FROM users WHERE id = $1 AND organization_id = $2', [userId, organizationId]);
        const location = await db.one('SELECT id FROM locations WHERE id = $1 AND organization_id = $2', [locationId, organizationId]);
        if (!user || !location) return NextResponse.json({ error: 'User or location not found' }, { status: 404 });

        if (action === 'add') {
            // Upsert: If exists, set true. If not exists, insert with true.
            const existing = await db.one(
                'SELECT id FROM user_locations WHERE user_id = $1 AND location_id = $2',
                [userId, locationId]
            );

            if (existing) {
                await db.execute(
                    'UPDATE user_locations SET receive_daily_report = TRUE WHERE id = $1',
                    [existing.id]
                );
            } else {
                await db.execute(
                    'INSERT INTO user_locations (user_id, location_id, organization_id, receive_daily_report) VALUES ($1, $2, $3, TRUE)',
                    [userId, locationId, organizationId]
                );
            }
        } else if (action === 'remove') {
            // Set false. Do not delete record (preserves access).
            await db.execute(
                'UPDATE user_locations SET receive_daily_report = FALSE WHERE user_id = $1 AND location_id = $2',
                [userId, locationId]
            );
        }

        return NextResponse.json({ success: true });

    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
