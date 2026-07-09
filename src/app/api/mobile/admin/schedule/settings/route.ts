/**
 * GET  /api/mobile/admin/schedule/settings — get schedule display settings
 * POST /api/mobile/admin/schedule/settings — update schedule display settings
 *
 * Requires admin role.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';

export async function GET(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const rows = await db.query(
        `SELECT key, value FROM settings WHERE organization_id = $1
         AND key IN ('schedule_global_mode', 'schedule_location_hours', 'schedule_user_colors')`,
        [session.organizationId]
    );

    const map: Record<string, string> = {};
    rows.forEach((r: any) => { map[r.key] = r.value; });

    const globalMode = map['schedule_global_mode'] !== 'false';
    let locationHours: Record<number, { workdayStart: string; workdayEnd: string }> = {};
    try { if (map['schedule_location_hours']) locationHours = JSON.parse(map['schedule_location_hours']); } catch { }

    let userColors: Record<number, string> = {};
    try { if (map['schedule_user_colors']) userColors = JSON.parse(map['schedule_user_colors']); } catch { }

    const locations = await db.query(
        'SELECT id, name FROM locations WHERE organization_id = $1 ORDER BY name ASC',
        [session.organizationId]
    );

    return NextResponse.json({ globalMode, locationHours, userColors, locations });
}

export async function POST(req: NextRequest) {
    const session = await verifyMobileToken(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { globalMode, locationHours, userColors } = await req.json();

    if (globalMode !== undefined) {
        await db.execute(
            `INSERT INTO settings (organization_id, key, value) VALUES ($1, 'schedule_global_mode', $2)
             ON CONFLICT (organization_id, key) DO UPDATE SET value = EXCLUDED.value`,
            [session.organizationId, globalMode ? 'true' : 'false']
        );
    }
    if (locationHours !== undefined) {
        await db.execute(
            `INSERT INTO settings (organization_id, key, value) VALUES ($1, 'schedule_location_hours', $2)
             ON CONFLICT (organization_id, key) DO UPDATE SET value = EXCLUDED.value`,
            [session.organizationId, JSON.stringify(locationHours)]
        );
    }
    if (userColors !== undefined) {
        await db.execute(
            `INSERT INTO settings (organization_id, key, value) VALUES ($1, 'schedule_user_colors', $2)
             ON CONFLICT (organization_id, key) DO UPDATE SET value = EXCLUDED.value`,
            [session.organizationId, JSON.stringify(userColors)]
        );
    }
    return NextResponse.json({ ok: true });
}
