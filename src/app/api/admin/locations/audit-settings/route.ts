import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { markChanged } from '@/lib/markChanged';

// GET  ?locationId=N
export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const locationId = parseInt(new URL(req.url).searchParams.get('locationId') || '0');
    if (!locationId) return NextResponse.json({ error: 'locationId required' }, { status: 400 });

    const loc = await db.one(
        'SELECT id, name, COALESCE(settings, \'{}\') AS settings FROM locations WHERE id = $1 AND organization_id = $2',
        [locationId, session.organizationId]
    );
    if (!loc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ settings: loc.settings });
}

// PATCH  — merges provided audit settings into locations.settings JSONB
export async function PATCH(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { locationId, settings } = await req.json();
    if (!locationId) return NextResponse.json({ error: 'locationId required' }, { status: 400 });

    // Allowed keys for audit settings
    const ALLOWED = [
        'shift_audit_enabled',
        'shift_begin_audit_enabled',
        'shift_end_audit_enabled',
        'shift_begin_audit_all',
        'shift_end_audit_all',
    ];

    const patch: Record<string, any> = {};
    for (const key of ALLOWED) {
        if (key in settings) patch[key] = Boolean(settings[key]);
    }

    await db.execute(
        `UPDATE locations
         SET settings = COALESCE(settings, '{}')::jsonb || $1::jsonb
         WHERE id = $2 AND organization_id = $3`,
        [JSON.stringify(patch), locationId, session.organizationId]
    );

    markChanged(session.organizationId, locationId, 'locations');
    return NextResponse.json({ ok: true });
}
