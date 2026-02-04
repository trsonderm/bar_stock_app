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

        // 3. Get existing subscriptions (user_id, location_id, receive_daily_report)
        // We only care about those with receive_daily_report = 1, OR we return all assignments?
        // Let's return all assignments so we can show who has access but maybe disabled report?
        // Prompt implies "select users then add".
        // Let's return `subscriptions` as list of { location_id, user_id, receive_daily_report }

        const subscriptions = await db.query(`
            SELECT ul.user_id, ul.location_id, ul.receive_daily_report, u.first_name, u.last_name, u.email
            FROM user_locations ul
            JOIN users u ON ul.user_id = u.id
            WHERE ul.organization_id = $1 AND ul.receive_daily_report = 1
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

        if (action === 'add') {
            // Upsert: If exists, set true. If not exists, insert with true.
            const existing = await db.one(
                'SELECT id FROM user_locations WHERE user_id = $1 AND location_id = $2',
                [userId, locationId]
            );

            if (existing) {
                await db.execute(
                    'UPDATE user_locations SET receive_daily_report = 1 WHERE id = $1',
                    [existing.id]
                );
            } else {
                await db.execute(
                    'INSERT INTO user_locations (user_id, location_id, organization_id, receive_daily_report) VALUES ($1, $2, $3, 1)',
                    [userId, locationId, organizationId]
                );
            }
        } else if (action === 'remove') {
            // Set false. Do not delete record (preserves access).
            await db.execute(
                'UPDATE user_locations SET receive_daily_report = 0 WHERE user_id = $1 AND location_id = $2',
                [userId, locationId]
            );
        }

        return NextResponse.json({ success: true });

    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
