/**
 * GET /api/user/locations
 *
 * Locations the signed-in user is assigned to (admins with no assignments get
 * every location of the organization).
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const organizationId = session.organizationId;
    const userId = session.id;

    try {
        // Locations come from explicit user_locations assignments.
        const assigned = await db.query(`
            SELECT l.id, l.name 
            FROM locations l
            JOIN user_locations ul ON l.id = ul.location_id
            WHERE ul.user_id = $1 AND l.organization_id = $2
            ORDER BY l.name ASC
        `, [userId, organizationId]);

        // An admin with no assignments sees every location of the organization.
        if (assigned.length === 0) {
            if (session.role === 'admin') {
                const all = await db.query('SELECT id, name FROM locations WHERE organization_id = $1 ORDER BY name ASC', [organizationId]);
                return NextResponse.json({ locations: all });
            }
        }

        return NextResponse.json({ locations: assigned });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
