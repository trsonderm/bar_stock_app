import { NextRequest, NextResponse } from 'next/server';
import { db, pool } from '@/lib/db';
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
            // pg returns JSONB columns as parsed JS objects already
            if (org.ai_ordering_config) aiConfig = typeof org.ai_ordering_config === 'string' ? JSON.parse(org.ai_ordering_config) : org.ai_ordering_config;
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
        settingsObj['smart_order_per_location'] = generalSettings.smart_order_per_location ? 'true' : 'false';
        settingsObj['per_location_pricing'] = generalSettings.per_location_pricing ? 'true' : 'false';
        settingsObj['show_items_at_all_locations'] = generalSettings.show_items_at_all_locations === false ? 'false' : 'true';
        settingsObj['shared_inventory_count'] = generalSettings.shared_inventory_count ? 'true' : 'false';
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
        'report_emails', 'report_time', 'report_schedule', 'low_stock_threshold',
        'backup_time', 'low_stock_alert_enabled', 'low_stock_alert_emails',
        'low_stock_alert_time', 'low_stock_alert_schedule', 'report_title',
        'low_stock_alert_title',
        'company_name', 'billing_email', 'track_bottle_levels', 'report_per_location',
        'shift_report_emails', 'shift_report_schedule', 'shift_report_enabled', 'shift_report_title',
        'audit_alert_enabled', 'audit_alert_emails', 'audit_alert_actions',
        'workday_start', 'order_confirmation_recipients',
    ];

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        for (const k of keys) {
            if (body[k] !== undefined) {
                let val = body[k];
                if (typeof val === 'object' && val !== null) {
                    val = JSON.stringify(val);
                } else {
                    val = String(val);
                }
                await client.query(`
                    INSERT INTO settings (organization_id, key, value)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (key, organization_id)
                    DO UPDATE SET value = EXCLUDED.value
                `, [organizationId, k, val]);
            }
        }

        // Handle Subdomain Update
        if (body.subdomain !== undefined) {
            const desired = body.subdomain.trim().toLowerCase();
            const existing = await client.query('SELECT id FROM organizations WHERE subdomain = $1 AND id != $2', [desired, organizationId]);
            if (existing.rows.length > 0) {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: 'Subdomain ID already taken' }, { status: 400 });
            }
            await client.query('UPDATE organizations SET subdomain = $1 WHERE id = $2', [desired || null, organizationId]);
        }

        // Handle AI Ordering config fields
        if (body.ai_ordering_enabled !== undefined || body.ai_ordering_email !== undefined || body.ai_ordering_phone !== undefined) {
            const orgRow = await client.query('SELECT ai_ordering_config FROM organizations WHERE id = $1', [organizationId]);
            const raw = orgRow.rows[0]?.ai_ordering_config;
            let config: { enabled?: boolean; email?: string; phone?: string } = {};
            try {
                if (raw) config = typeof raw === 'string' ? JSON.parse(raw) : raw;
            } catch { }

            if (body.ai_ordering_enabled !== undefined) config.enabled = body.ai_ordering_enabled === 'true' || body.ai_ordering_enabled === true;
            if (body.ai_ordering_email !== undefined) config.email = body.ai_ordering_email;
            if (body.ai_ordering_phone !== undefined) config.phone = body.ai_ordering_phone;

            await client.query('UPDATE organizations SET ai_ordering_config = $1 WHERE id = $2', [config, organizationId]);
        }

        // Handle General Settings (JSONB on organizations.settings)
        const generalSettingsKeys = ['stock_count_mode', 'allow_custom_increment', 'smart_order_per_location', 'per_location_pricing', 'show_items_at_all_locations', 'shared_inventory_count'];
        if (generalSettingsKeys.some(k => body[k] !== undefined)) {
            const orgRow = await client.query('SELECT settings FROM organizations WHERE id = $1', [organizationId]);
            const currentSettings = orgRow.rows[0]?.settings || {};
            if (body.stock_count_mode !== undefined) currentSettings.stock_count_mode = body.stock_count_mode;
            if (body.allow_custom_increment !== undefined) currentSettings.allow_custom_increment = body.allow_custom_increment === 'true' || body.allow_custom_increment === true;
            if (body.smart_order_per_location !== undefined) currentSettings.smart_order_per_location = body.smart_order_per_location === 'true' || body.smart_order_per_location === true;
            if (body.per_location_pricing !== undefined) currentSettings.per_location_pricing = body.per_location_pricing === 'true' || body.per_location_pricing === true;
            if (body.show_items_at_all_locations !== undefined) currentSettings.show_items_at_all_locations = body.show_items_at_all_locations === 'true' || body.show_items_at_all_locations === true;
            if (body.shared_inventory_count !== undefined) currentSettings.shared_inventory_count = body.shared_inventory_count === 'true' || body.shared_inventory_count === true;
            await client.query('UPDATE organizations SET settings = $1 WHERE id = $2', [currentSettings, organizationId]);
        }

        await client.query('INSERT INTO activity_logs (organization_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
            [organizationId, session.id, 'UPDATE_SETTINGS', JSON.stringify({ keys: Object.keys(body) })]);

        await client.query('COMMIT');
        return NextResponse.json({ success: true });

    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    } finally {
        client.release();
    }
}
