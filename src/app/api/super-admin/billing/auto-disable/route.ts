import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { runAutoDisable } from '@/lib/billing-auto-disable';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const rows = await db.query(`
        SELECT key, value FROM system_settings
        WHERE key IN ('billing_auto_disable_enabled', 'billing_auto_disable_grace_days')
    `);

    const settings: Record<string, string> = {};
    rows.forEach((r: any) => { settings[r.key] = r.value; });

    return NextResponse.json({
        enabled: settings['billing_auto_disable_enabled'] === 'true',
        graceDays: parseInt(settings['billing_auto_disable_grace_days'] || '7'),
    });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const { enabled, graceDays, runNow } = await req.json();

    if (enabled !== undefined) {
        await db.execute(
            `INSERT INTO system_settings (key, value) VALUES ('billing_auto_disable_enabled', $1)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
            [enabled ? 'true' : 'false']
        );
    }
    if (graceDays !== undefined) {
        await db.execute(
            `INSERT INTO system_settings (key, value) VALUES ('billing_auto_disable_grace_days', $1)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
            [String(Math.max(1, parseInt(graceDays)))]
        );
    }

    if (runNow) {
        const result = await runAutoDisable();
        return NextResponse.json({ success: true, ...result });
    }

    return NextResponse.json({ success: true });
}
