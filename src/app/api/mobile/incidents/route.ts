/**
 * GET /api/mobile/incidents  — list recent incident reports
 * POST /api/mobile/incidents — file a new incident report
 *
 * GET requires: add_incident OR review_incidents OR admin
 * POST requires: add_incident OR admin
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';

function checkPerms(session: any): { canView: boolean; canAdd: boolean } {
    const perms: string[] = session.permissions || [];
    const isAdmin = session.role === 'admin';
    const hasAll = isAdmin || perms.includes('all');
    return {
        canView: hasAll || perms.includes('review_incidents') || perms.includes('add_incident'),
        canAdd: hasAll || perms.includes('add_incident'),
    };
}

export async function GET(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { canView } = checkPerms(session);
    if (!canView) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });

    try {
        const rows = await db.query(
            `SELECT si.id, si.person_name, si.description, si.submitted_by_name, si.created_at,
                    sb.name AS barred_person_name
             FROM security_incidents si
             LEFT JOIN security_barred sb ON sb.id = si.barred_person_id
             WHERE si.organization_id = $1
             ORDER BY si.created_at DESC
             LIMIT 50`,
            [session.organizationId]
        );
        return NextResponse.json({ incidents: rows });
    } catch (err) {
        console.error('[Mobile incidents GET]', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { canAdd } = checkPerms(session);
    if (!canAdd) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });

    try {
        const { person_name, description } = await req.json();
        if (!description?.trim()) {
            return NextResponse.json({ error: 'Description is required' }, { status: 400 });
        }

        const submittedByName = `${session.firstName} ${session.lastName}`;
        const rows = await db.query(
            `INSERT INTO security_incidents
                (organization_id, person_name, description, submitted_by_user_id, submitted_by_name, media)
             VALUES ($1, $2, $3, $4, $5, '[]')
             RETURNING id, person_name, description, submitted_by_name, created_at`,
            [
                session.organizationId,
                person_name?.trim() || null,
                description.trim(),
                session.id,
                submittedByName,
            ]
        );
        return NextResponse.json({ incident: rows[0] });
    } catch (err) {
        console.error('[Mobile incidents POST]', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
