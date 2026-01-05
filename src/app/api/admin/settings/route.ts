import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const settings = db.prepare('SELECT key, value FROM settings').all() as { key: string, value: string }[];
    const settingsObj: Record<string, string> = {};
    settings.forEach(s => settingsObj[s.key] = s.value);

    return NextResponse.json({ settings: settingsObj });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const keys = [
        'report_emails', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'report_time', 'low_stock_threshold',
        'backup_time', 'low_stock_alert_enabled', 'low_stock_alert_emails', 'low_stock_alert_time', 'report_title',
        'low_stock_alert_title'
    ];

    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

    const transaction = db.transaction(() => {
        keys.forEach(k => {
            if (body[k] !== undefined) {
                stmt.run(k, String(body[k]));
            }
        });
    });

    try {
        transaction();
        db.prepare('INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)')
            .run(session.id, 'UPDATE_SETTINGS', JSON.stringify({ keys: Object.keys(body) }));
        return NextResponse.json({ success: true });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
