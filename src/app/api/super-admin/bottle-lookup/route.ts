import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

const SETTINGS_KEY = 'bottle_lookup_config';

export interface BottleLookupConfig {
    local_lookup_enabled: boolean;
    external_lookup_enabled: boolean;
    external_lookup_provider: 'upcitemdb' | 'barcodelookup' | 'open_food_facts' | 'none';
    upcitemdb_api_key: string;
    barcodelookup_api_key: string;
    auto_fill_on_scan: boolean;
    save_scanned_barcodes: boolean;
    fallback_to_manual: boolean;
}

export const DEFAULT_BOTTLE_LOOKUP_CONFIG: BottleLookupConfig = {
    local_lookup_enabled: true,
    external_lookup_enabled: false,
    external_lookup_provider: 'upcitemdb',
    upcitemdb_api_key: '',
    barcodelookup_api_key: '',
    auto_fill_on_scan: true,
    save_scanned_barcodes: true,
    fallback_to_manual: true,
};

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
