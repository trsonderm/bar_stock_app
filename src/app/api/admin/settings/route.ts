/**
 * /api/admin/settings — organization settings (admin only).
 *
 *  GET  returns key/value settings merged with org-level config
 *       (subdomain, AI ordering config, general settings JSON).
 *  POST saves any subset of those settings in a single transaction.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { parseJsonColumn } from '@/lib/json';

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

        const aiConfig = parseJsonColumn<{ enabled?: boolean; email?: string; phone?: string }>(org.ai_ordering_config, { enabled: false });
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

/** Thrown inside the settings transaction when the requested subdomain is in use. */
class SubdomainTakenError extends Error { }

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.organizationId || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.organizationId;
    const body = await req.json();
    const keys = [
        'report_emails', 'report_time', 'low_stock_threshold',
        'backup_time', 'low_stock_alert_enabled', 'low_stock_alert_emails', 'low_stock_alert_time', 'report_title',
        'low_stock_alert_title',
        'company_name', 'billing_email', 'track_bottle_levels', 'report_per_location',
        'shift_report_emails', 'shift_report_schedule', 'shift_report_enabled', 'shift_report_title',
    ];

    try {
        await db.transaction(async (tx) => {
            for (const k of keys) {
                if (body[k] !== undefined) {
                    let val = body[k];
                    if (typeof val === 'object' && val !== null) {
                        val = JSON.stringify(val);
                    } else {
                        val = String(val);
                    }
                    await tx.execute(`
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
                // Check uniqueness
                const existing = await tx.one('SELECT id FROM organizations WHERE subdomain = $1 AND id != $2', [desired, organizationId]);
                if (existing) {
                    throw new SubdomainTakenError();
                }
                await tx.execute('UPDATE organizations SET subdomain = $1 WHERE id = $2', [desired || null, organizationId]);
            }

            // Handle AI Ordering Enabled Update (and config fields)
            if (body.ai_ordering_enabled !== undefined || body.ai_ordering_email !== undefined || body.ai_ordering_phone !== undefined) {

                // Get existing config to preserve other fields
                const org = await tx.one('SELECT ai_ordering_config FROM organizations WHERE id = $1', [organizationId]);
                const config = parseJsonColumn<{ enabled?: boolean; email?: string; phone?: string }>(org?.ai_ordering_config, {});

                if (body.ai_ordering_enabled !== undefined) {
                    config.enabled = body.ai_ordering_enabled === 'true' || body.ai_ordering_enabled === true;
                }
                if (body.ai_ordering_email !== undefined) config.email = body.ai_ordering_email;
                if (body.ai_ordering_phone !== undefined) config.phone = body.ai_ordering_phone;

                await tx.execute('UPDATE organizations SET ai_ordering_config = $1 WHERE id = $2', [JSON.stringify(config), organizationId]);
            }

            // Handle General Settings (JSONB)
            const generalSettingsKeys = ['stock_count_mode', 'allow_custom_increment', 'smart_order_per_location', 'per_location_pricing', 'show_items_at_all_locations', 'shared_inventory_count'];
            if (generalSettingsKeys.some(k => body[k] !== undefined)) {
                const org = await tx.one('SELECT settings FROM organizations WHERE id = $1', [organizationId]);
                let currentSettings = org.settings || {};
                if (body.stock_count_mode !== undefined) currentSettings.stock_count_mode = body.stock_count_mode;
                if (body.allow_custom_increment !== undefined) currentSettings.allow_custom_increment = body.allow_custom_increment === 'true' || body.allow_custom_increment === true;
                if (body.smart_order_per_location !== undefined) currentSettings.smart_order_per_location = body.smart_order_per_location === 'true' || body.smart_order_per_location === true;
                if (body.per_location_pricing !== undefined) currentSettings.per_location_pricing = body.per_location_pricing === 'true' || body.per_location_pricing === true;
                if (body.show_items_at_all_locations !== undefined) currentSettings.show_items_at_all_locations = body.show_items_at_all_locations === 'true' || body.show_items_at_all_locations === true;
                if (body.shared_inventory_count !== undefined) currentSettings.shared_inventory_count = body.shared_inventory_count === 'true' || body.shared_inventory_count === true;
                await tx.query('UPDATE organizations SET settings = $1 WHERE id = $2', [currentSettings, organizationId]);
            }

            await tx.execute('INSERT INTO activity_logs (organization_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
                [organizationId, session.id, 'UPDATE_SETTINGS', JSON.stringify({ keys: Object.keys(body) })]);
        });

        return NextResponse.json({ success: true });

    } catch (e) {
        if (e instanceof SubdomainTakenError) {
            return NextResponse.json({ error: 'Subdomain ID already taken' }, { status: 400 });
        }
        console.error(e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
