/**
 * /api/super-admin/settings — global key/value system settings (super admin only).
 *
 *  GET  returns every row of system_settings as { config: { key: value } }
 *  POST upserts every key in the JSON body
 */
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

    const payload = await req.json();

    try {
        await db.transaction(async (tx) => {
            for (const [key, value] of Object.entries(payload)) {
                if (value !== undefined) {
                    await tx.execute(
                        "INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value",
                        [key, String(value)]
                    );
                }
            }
        });

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('Failed to save system settings:', e);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
