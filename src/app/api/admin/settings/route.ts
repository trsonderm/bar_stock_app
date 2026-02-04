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

    // Fetch Organization Subdomain, AI Config, and General Settings
    const org = await db.one('SELECT subdomain, ai_ordering_config, settings FROM organizations WHERE id = $1', [organizationId]);
    if (org) {
        settingsObj['subdomain'] = org.subdomain || '';

        let aiConfig: { enabled?: boolean; email?: string; phone?: string } = { enabled: false };
        try {
            if (org.ai_ordering_config) aiConfig = JSON.parse(org.ai_ordering_config);
        } catch { }
        settingsObj['ai_ordering_enabled'] = aiConfig.enabled ? 'true' : 'false';
        settingsObj['ai_ordering_email'] = aiConfig.email || '';
        settingsObj['ai_ordering_phone'] = aiConfig.phone || '';

        // New Settings JSONB
        let generalSettings: any = {};
        try {
            if (org.settings) generalSettings = org.settings; // Already JSON
        } catch { }
        settingsObj['stock_count_mode'] = generalSettings.stock_count_mode || 'CATEGORY';
        settingsObj['allow_custom_increment'] = generalSettings.allow_custom_increment ? 'true' : 'false';
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

        // Handle AI Ordering Enabled Update (and config fields)
        if (body.ai_ordering_enabled !== undefined || body.ai_ordering_email !== undefined || body.ai_ordering_phone !== undefined) {

            // Get existing config to preserve other fields
            const org = await db.one('SELECT ai_ordering_config FROM organizations WHERE id = $1', [organizationId]);
            let config: { enabled?: boolean; email?: string; phone?: string } = {};
            try {
                if (org.ai_ordering_config) config = JSON.parse(org.ai_ordering_config);
            } catch { }

            if (body.ai_ordering_enabled !== undefined) {
                config.enabled = body.ai_ordering_enabled === 'true' || body.ai_ordering_enabled === true;
            }
            if (body.ai_ordering_email !== undefined) config.email = body.ai_ordering_email;
            if (body.ai_ordering_phone !== undefined) config.phone = body.ai_ordering_phone;

            await db.execute('UPDATE organizations SET ai_ordering_config = $1 WHERE id = $2', [JSON.stringify(config), organizationId]);
        }

        // Handle General Settings (JSONB)
        if (body.stock_count_mode !== undefined || body.allow_custom_increment !== undefined) {
            const org = await db.one('SELECT settings FROM organizations WHERE id = $1', [organizationId]);
            let currentSettings = org.settings || {};
            if (body.stock_count_mode !== undefined) currentSettings.stock_count_mode = body.stock_count_mode;
            if (body.allow_custom_increment !== undefined) currentSettings.allow_custom_increment = body.allow_custom_increment === 'true' || body.allow_custom_increment === true;
            await db.query('UPDATE organizations SET settings = $1 WHERE id = $2', [currentSettings, organizationId]);
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
