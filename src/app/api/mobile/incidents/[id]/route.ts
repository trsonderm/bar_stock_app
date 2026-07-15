/**
 * GET /api/mobile/incidents/:id — full detail for a single incident report
 *
 * Requires: add_incident OR review_incidents OR admin
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';

export const dynamic = 'force-dynamic';

function checkPerms(session: any): boolean {
    const perms: string[] = session.permissions || [];
    const hasAll = session.role === 'admin' || perms.includes('all');
    return hasAll || perms.includes('review_incidents') || perms.includes('add_incident');
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!checkPerms(session)) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });

    const id = parseInt(params.id, 10);
    if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    try {
        const rows = await db.query(
            `SELECT si.*,
                    sb.name  AS barred_person_name,
                    sb.photo AS barred_person_photo
             FROM security_incidents si
             LEFT JOIN security_barred sb ON sb.id = si.barred_person_id
             WHERE si.id = $1 AND si.organization_id = $2`,
            [id, session.organizationId]
        );

        if (rows.length === 0) return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
        const i = rows[0];

        const [persons, timeline] = await Promise.all([
            db.query(
                `SELECT id, incident_id, first_name, last_name, aliases, race,
                        height, weight, hair_color, clothing_description, description,
                        media, sort_order
                 FROM incident_persons
                 WHERE incident_id = $1
                 ORDER BY sort_order ASC, id ASC`,
                [id]
            ),
            db.query(
                `SELECT id, incident_id, segment_date, segment_time, description, sort_order
                 FROM incident_timeline
                 WHERE incident_id = $1
                 ORDER BY sort_order ASC, segment_date ASC NULLS LAST, segment_time ASC NULLS LAST`,
                [id]
            ),
        ]);

        return NextResponse.json({
            incident: {
                id: i.id,
                incident_date: i.incident_date,
                incident_time: i.incident_time,
                description: i.description || null,
                person_name: i.person_name || null,
                barred_person_id: i.barred_person_id || null,
                barred_person_name: i.barred_person_name,
                barred_person_photo: i.barred_person_photo,
                media: i.media || [],
                reported_by_name: i.reported_by_name,
                reported_by_user_id: i.reported_by_user_id || null,
                submitted_by_name: i.submitted_by_name,
                submitted_by_user_id: i.submitted_by_user_id || null,
                created_at: i.created_at,
                persons,
                timeline,
            },
        });
    } catch (err) {
        console.error('[Mobile incidents/:id GET]', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
