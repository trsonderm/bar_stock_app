import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const settings = await db.query('SELECT * FROM system_settings');
    const config: Record<string, string> = {};
    settings.forEach((row: any) => {
        config[row.key] = row.value;
    });

    // Add quick_login_enabled with a default of 'false' if not found
    if (!config.hasOwnProperty('quick_login_enabled')) {
        config.quick_login_enabled = 'false';
    }

    return NextResponse.json({ config });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { billing_enabled, maintenance_mode, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure, quick_login_enabled } = await req.json();

    await db.execute('BEGIN');
    try {
        const updateSetting = async (k: string, v: string) => {
            await db.execute("INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value", [k, String(v)]);
        };

        await updateSetting('billing_enabled', billing_enabled);
        await updateSetting('maintenance_mode', maintenance_mode);
        await updateSetting('smtp_host', smtp_host || '');
        await updateSetting('smtp_port', smtp_port || '');
        await updateSetting('smtp_user', smtp_user || '');
        await updateSetting('smtp_pass', smtp_pass || '');
        await updateSetting('smtp_secure', smtp_secure);
        await updateSetting('quick_login_enabled', quick_login_enabled);

        await db.execute('COMMIT');
        return NextResponse.json({ success: true });
    } catch (e) {
        await db.execute('ROLLBACK');
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
