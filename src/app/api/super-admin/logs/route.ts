import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    // Simplified Super Admin check:
    const isSuperAdmin = session?.isSuperAdmin || (session?.permissions as any)?.includes('super_admin');
    if (!isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { searchParams } = new URL(req.url);
        const limit = parseInt(searchParams.get('limit') || '100');
        const offset = parseInt(searchParams.get('offset') || '0');

        // Fetch Settings
        const settingsRes = await db.query("SELECT key, value FROM system_settings WHERE key IN ('logging_enabled', 'log_retention_days')");
        const settings: any = { logging_enabled: 'true', log_retention_days: '30' }; // Defaults
        settingsRes.forEach((r: any) => settings[r.key] = r.value);

        // Fetch Logs with User/Org details
        const logs = await db.query(`
            SELECT l.*, u.first_name, u.last_name, u.email, o.name as org_name
            FROM activity_logs l
            LEFT JOIN users u ON l.user_id = u.id
            LEFT JOIN organizations o ON l.organization_id = o.id
            ORDER BY l.timestamp DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        const total = await db.one('SELECT COUNT(*) as count FROM activity_logs');

        return NextResponse.json({
            logs,
            total: parseInt(total.count),
            settings: {
                logging_enabled: settings.logging_enabled === 'true',
                log_retention_days: settings.log_retention_days
            }
        });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    const isSuperAdmin = session?.isSuperAdmin || (session?.permissions as any)?.includes('super_admin');
    if (!isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const body = await req.json();
        const { logging_enabled, log_retention_days } = body;

        if (logging_enabled !== undefined) {
            await db.execute("INSERT INTO system_settings (key, value) VALUES ('logging_enabled', $1) ON CONFLICT(key) DO UPDATE SET value = $1", [String(logging_enabled)]);
        }
        if (log_retention_days) {
            await db.execute("INSERT INTO system_settings (key, value) VALUES ('log_retention_days', $1) ON CONFLICT(key) DO UPDATE SET value = $1", [String(log_retention_days)]);
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const session = await getSession();
    const isSuperAdmin = session?.isSuperAdmin || (session?.permissions as any)?.includes('super_admin');
    if (!isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        // Fetch retention period
        const res = await db.one("SELECT value FROM system_settings WHERE key = 'log_retention_days'");
        const days = parseInt(res?.value || '30');

        await db.execute(`
            DELETE FROM activity_logs 
            WHERE timestamp < NOW() - INTERVAL '${days} days'
        `);

        return NextResponse.json({ success: true, message: `Pruned logs older than ${days} days` });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
