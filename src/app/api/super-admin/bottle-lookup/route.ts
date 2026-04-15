import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { BottleLookupConfig, DEFAULT_BOTTLE_LOOKUP_CONFIG } from '@/lib/bottle-lookup-config';

const SETTINGS_KEY = 'bottle_lookup_config';

export async function GET(_req: NextRequest) {
    const session = await getSession();
    if (!session || !session.isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const row = await db.one(`SELECT value FROM system_settings WHERE key = $1 LIMIT 1`, [SETTINGS_KEY]);
        if (!row) return NextResponse.json({ config: DEFAULT_BOTTLE_LOOKUP_CONFIG });
        const config = { ...DEFAULT_BOTTLE_LOOKUP_CONFIG, ...JSON.parse(row.value) };
        return NextResponse.json({ config });
    } catch (e) {
        return NextResponse.json({ config: DEFAULT_BOTTLE_LOOKUP_CONFIG });
    }
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const config: BottleLookupConfig = { ...DEFAULT_BOTTLE_LOOKUP_CONFIG, ...body };

        await db.execute(`
            INSERT INTO system_settings (key, value) VALUES ($1, $2)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        `, [SETTINGS_KEY, JSON.stringify(config)]);

        return NextResponse.json({ success: true, config });
    } catch (e) {
        console.error('[bottle-lookup POST]', e);
        return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
    }
}
