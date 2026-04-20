import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const orgId = session.organizationId;

    try {
        const rows = await db.query(
            `SELECT key, value FROM settings WHERE organization_id = $1 AND key IN ('schedule_global_mode', 'schedule_location_hours')`,
            [orgId]
        );

        const map: Record<string, string> = {};
        rows.forEach((r: any) => { map[r.key] = r.value; });

        const globalMode = map['schedule_global_mode'] !== 'false'; // default: true (global)
        let locationHours: Record<number, { workdayStart: string; workdayEnd: string }> = {};
        try {
            if (map['schedule_location_hours']) locationHours = JSON.parse(map['schedule_location_hours']);
        } catch { }

        const locations = await db.query(
            'SELECT id, name FROM locations WHERE organization_id = $1 ORDER BY name ASC',
            [orgId]
        );

        return NextResponse.json({ globalMode, locationHours, locations });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const orgId = session.organizationId;

    let body: any;
    try { body = await req.json(); } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { globalMode, locationHours } = body;

    try {
        await db.execute(
            `INSERT INTO settings (organization_id, key, value)
             VALUES ($1, 'schedule_global_mode', $2)
             ON CONFLICT (organization_id, key) DO UPDATE SET value = EXCLUDED.value`,
            [orgId, globalMode ? 'true' : 'false']
        );

        if (locationHours !== undefined) {
            await db.execute(
                `INSERT INTO settings (organization_id, key, value)
                 VALUES ($1, 'schedule_location_hours', $2)
                 ON CONFLICT (organization_id, key) DO UPDATE SET value = EXCLUDED.value`,
                [orgId, JSON.stringify(locationHours)]
            );
        }

        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
