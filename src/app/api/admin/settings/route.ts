import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.organizationId;
    const settings = await db.query('SELECT key, value FROM settings WHERE organization_id = $1', [organizationId]);
    const settingsObj: Record<string, string> = {};
    settings.forEach(s => settingsObj[s.key] = s.value);

    // Fetch Organization Subdomain
    const org = await db.one('SELECT subdomain FROM organizations WHERE id = $1', [organizationId]);
    if (org) {
        settingsObj['subdomain'] = org.subdomain || '';
    }

    return NextResponse.json({ settings: settingsObj });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.organizationId;
    const body = await req.json();
    const keys = [
        'report_emails', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'report_time', 'low_stock_threshold',
        'backup_time', 'low_stock_alert_enabled', 'low_stock_alert_emails', 'low_stock_alert_time', 'report_title',
        'low_stock_alert_title',
        'company_name', 'billing_email', 'track_bottle_levels'
    ];

    try {
        await db.execute('BEGIN');

        for (const k of keys) {
            if (body[k] !== undefined) {
                await db.execute(`
                    INSERT INTO settings (organization_id, key, value) 
                    VALUES ($1, $2, $3)
                    ON CONFLICT (key, organization_id) 
                    DO UPDATE SET value = EXCLUDED.value
                `, [organizationId, k, String(body[k])]);
            }
        }

        // Handle Subdomain Update
        if (body.subdomain !== undefined) {
            const desired = body.subdomain.trim().toLowerCase();
            // Check uniqueness
            const existing = await db.one('SELECT id FROM organizations WHERE subdomain = $1 AND id != $2', [desired, organizationId]);
            if (existing) {
                await db.execute('ROLLBACK');
                return NextResponse.json({ error: 'Subdomain ID already taken' }, { status: 400 });
            }
            await db.execute('UPDATE organizations SET subdomain = $1 WHERE id = $2', [desired || null, organizationId]);
        }

        await db.execute('INSERT INTO activity_logs (organization_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
            [organizationId, session.id, 'UPDATE_SETTINGS', JSON.stringify({ keys: Object.keys(body) })]);

        await db.execute('COMMIT');
        return NextResponse.json({ success: true });

    } catch (e) {
        await db.execute('ROLLBACK');
        console.error(e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
