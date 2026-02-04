import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const organizationId = session.organizationId;
    const userId = session.id;

    try {
        let query = '';
        let params = [];

        // If admin (or specific permission?), maybe they can see all locations?
        // Requirement says "admins... will have a dropdown if they are selected for multiple locations".
        // Use user_locations table for everyone.

        // CHECK if user is Super Admin or has "all" permission? 
        // For now, let's stick to explicit assignment in user_locations.
        // If user_locations has entries, use those. 
        // IF NO entries in user_locations AND role is admin, maybe show all?
        // Let's strictly follow the table. If admin wants access, they assign themselves.

        const assigned = await db.query(`
            SELECT l.id, l.name 
            FROM locations l
            JOIN user_locations ul ON l.id = ul.location_id
            WHERE ul.user_id = $1 AND l.organization_id = $2
            ORDER BY l.name ASC
        `, [userId, organizationId]);

        // Fallback: If no locations assigned, maybe they are legacy admin?
        // Or if table is empty?
        // Let's check if they have NO assignments.
        if (assigned.length === 0) {
            // If admin, maybe return ALL?
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
