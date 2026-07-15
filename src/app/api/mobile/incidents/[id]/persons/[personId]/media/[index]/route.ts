/**
 * GET /api/mobile/incidents/:id/persons/:personId/media/:index
 *
 * Downloads a specific photo or video belonging to a person on the incident.
 * :id        — security_incidents.id
 * :personId  — incident_persons.id
 * :index     — zero-based position in that person's media array
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

function mediaResponse(item: any, fallbackName: string): Response | null {
    const dataUri = typeof item === 'string' ? item : item?.data;
    if (!dataUri) return null;

    const match = dataUri.match(/^data:([^;]+);base64,([\s\S]+)$/);
    if (!match) return null;

    const mimeType = match[1];
    const buffer = Buffer.from(match[2], 'base64');
    const filename = (item?.name as string | undefined) || fallbackName;

    return new Response(buffer, {
        headers: {
            'Content-Type': mimeType,
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': String(buffer.length),
        },
    });
}

export async function GET(
    req: NextRequest,
    { params }: { params: { id: string; personId: string; index: string } }
) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!checkPerms(session)) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });

    const incidentId = parseInt(params.id, 10);
    const personId = parseInt(params.personId, 10);
    const idx = parseInt(params.index, 10);
    if (!incidentId || !personId || isNaN(idx) || idx < 0) {
        return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    try {
        // Verify the incident belongs to this org
        const incRows = await db.query(
            `SELECT id FROM security_incidents WHERE id = $1 AND organization_id = $2`,
            [incidentId, session.organizationId]
        );
        if (incRows.length === 0) return NextResponse.json({ error: 'Incident not found' }, { status: 404 });

        const personRows = await db.query(
            `SELECT media FROM incident_persons
             WHERE id = $1 AND incident_id = $2 AND organization_id = $3`,
            [personId, incidentId, session.organizationId]
        );
        if (personRows.length === 0) return NextResponse.json({ error: 'Person not found' }, { status: 404 });

        const mediaArr: any[] = personRows[0].media || [];
        if (idx >= mediaArr.length) return NextResponse.json({ error: 'Media item not found' }, { status: 404 });

        const item = mediaArr[idx];
        const isVideo = (item?.type === 'video') || String(item?.data || item || '').startsWith('data:video/');
        const ext = isVideo ? 'mp4' : 'jpg';
        const res = mediaResponse(item, `incident-${incidentId}-person-${personId}-media-${idx}.${ext}`);
        if (!res) return NextResponse.json({ error: 'Media item not found' }, { status: 404 });

        return res;
    } catch (err) {
        console.error('[Mobile incidents/:id/persons/:personId/media/:index GET]', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
