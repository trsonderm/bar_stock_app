import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET: return global POS settings (Toast credentials, Clover credentials, global enable flag)
export async function GET() {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const keys = ['pos_global_enabled', 'pos_toast_settings', 'pos_clover_settings'];
        const rows = await db.query(
            `SELECT key, value FROM system_settings WHERE key = ANY($1)`,
            [keys]
        );
        const settings: Record<string, any> = {};
        for (const r of rows) {
            try { settings[r.key] = JSON.parse(r.value); } catch { settings[r.key] = r.value; }
        }

        // Return counts per type
        const counts = await db.query(
            `SELECT pos_type, COUNT(*) as cnt
             FROM pos_sync_settings GROUP BY pos_type`
        );

        return NextResponse.json({ settings, counts });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

// POST: update global POS settings
export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const body = await req.json();
        const { pos_global_enabled, toast_settings, clover_settings } = body;

        const upsert = async (key: string, value: any) => {
            const v = typeof value === 'string' ? value : JSON.stringify(value);
            await db.execute(
                `INSERT INTO system_settings (key, value) VALUES ($1, $2)
                 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
                [key, v]
            );
        };

        if (pos_global_enabled !== undefined) await upsert('pos_global_enabled', pos_global_enabled ? 'true' : 'false');
        if (toast_settings !== undefined) await upsert('pos_toast_settings', toast_settings);
        if (clover_settings !== undefined) await upsert('pos_clover_settings', clover_settings);

        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: 'Error saving settings' }, { status: 500 });
    }
}
