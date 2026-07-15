/**
 * GET /api/mobile/incidents/:id/media/:index
 *
 * Downloads a single incident-level media item (photo or video) as binary.
 * :index is the zero-based position in the incident's media array.
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
    { params }: { params: { id: string; index: string } }
) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!checkPerms(session)) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });

    const id = parseInt(params.id, 10);
    const idx = parseInt(params.index, 10);
    if (!id || isNaN(idx) || idx < 0) return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });

    try {
        const rows = await db.query(
            `SELECT media FROM security_incidents WHERE id = $1 AND organization_id = $2`,
            [id, session.organizationId]
        );
        if (rows.length === 0) return NextResponse.json({ error: 'Incident not found' }, { status: 404 });

        const mediaArr: any[] = rows[0].media || [];
        if (idx >= mediaArr.length) return NextResponse.json({ error: 'Media item not found' }, { status: 404 });

        const item = mediaArr[idx];
        const isVideo = (item?.type === 'video') || String(item?.data || item || '').startsWith('data:video/');
        const ext = isVideo ? 'mp4' : 'jpg';
        const res = mediaResponse(item, `incident-${id}-media-${idx}.${ext}`);
        if (!res) return NextResponse.json({ error: 'Media item not found' }, { status: 404 });

        return res;
    } catch (err) {
        console.error('[Mobile incidents/:id/media/:index GET]', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
