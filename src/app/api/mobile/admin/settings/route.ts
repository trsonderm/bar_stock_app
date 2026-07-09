/**
 * GET   /api/mobile/admin/settings  — retrieve all org settings (admin only)
 * PATCH /api/mobile/admin/settings  — update one or more settings (admin only)
 */
import { NextRequest, NextResponse } from 'next/server';
import { db, pool } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';

function requireAdmin(session: any) {
    if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return null;
}

const KV_KEYS = [
    'report_emails', 'report_schedule', 'report_title', 'report_per_location',
    'backup_time', 'track_bottle_levels',
    'low_stock_threshold', 'use_global_low_stock',
    'low_stock_alert_enabled', 'low_stock_alert_emails', 'low_stock_alert_schedule', 'low_stock_alert_title',
    'shift_report_enabled', 'shift_report_emails', 'shift_report_schedule', 'shift_report_title',
    'audit_alert_enabled', 'audit_alert_emails', 'audit_alert_actions',
    'workday_start',
];

const ORG_JSON_KEYS = [
    'stock_count_mode', 'allow_custom_increment', 'smart_order_per_location',
    'show_items_at_all_locations', 'shared_inventory_count',
    'recipes_enabled', 'recipe_search_source', 'recipe_search_primary',
    'package_sale_enabled', 'export_format', 'pricing_bands_enabled',
    'organization_mode', 'per_location_pricing',
];

export async function GET(req: NextRequest) {
    const session = await verifyMobileToken(req);
    const err = requireAdmin(session);
    if (err) return err;

    try {
        // Key-value settings
        const kvRows = await db.query(
            `SELECT key, value FROM settings WHERE organization_id = $1`,
            [session.organizationId]
        );
        const kv: Record<string, any> = {};
        for (const row of kvRows) {
            try { kv[row.key] = JSON.parse(row.value); } catch { kv[row.key] = row.value; }
        }

        // Org-level JSON settings
        const orgRow = await db.one(
            `SELECT settings, name, subdomain FROM organizations WHERE id = $1`,
            [session.organizationId]
        );
        const orgSettings = orgRow?.settings || {};

        // AI ordering config
        let aiConfig: any = { enabled: false, require_confirmation: true, cc_user_ids: [], supplier_ids: [] };
        try {
            const aiRow = await db.one(
                `SELECT value FROM settings WHERE organization_id = $1 AND key = 'ai_ordering_config' LIMIT 1`,
                [session.organizationId]
            );
            if (aiRow?.value) aiConfig = JSON.parse(aiRow.value);
        } catch { }

        return NextResponse.json({
            settings: {
                // Organization identity
                org_name: orgRow?.name,
                subdomain: orgRow?.subdomain,

                // Report settings (stored in KV)
                report_emails: kv.report_emails || { to: [], cc: [], bcc: [] },
                report_schedule: kv.report_schedule || { frequency: 'daily', time: '08:00' },
                report_title: kv.report_title || 'Daily Stock Report',
                report_per_location: kv.report_per_location === 'true' || kv.report_per_location === true,
                backup_time: kv.backup_time || '06:00',
                track_bottle_levels: kv.track_bottle_levels !== 'false' && kv.track_bottle_levels !== false,

                // Low stock
                low_stock_threshold: kv.low_stock_threshold ? Number(kv.low_stock_threshold) : 5,
                use_global_low_stock: kv.use_global_low_stock === 'true' || kv.use_global_low_stock === true,
                low_stock_alert_enabled: kv.low_stock_alert_enabled === 'true' || kv.low_stock_alert_enabled === true,
                low_stock_alert_emails: kv.low_stock_alert_emails || { to: [], cc: [], bcc: [] },
                low_stock_alert_schedule: kv.low_stock_alert_schedule || { frequency: 'daily', time: '14:00' },
                low_stock_alert_title: kv.low_stock_alert_title || 'URGENT: Low Stock Alert',

                // Shift report
                shift_report_enabled: kv.shift_report_enabled === 'true' || kv.shift_report_enabled === true,
                shift_report_emails: kv.shift_report_emails || { to: [], cc: [], bcc: [] },
                shift_report_schedule: kv.shift_report_schedule || { frequency: 'per_shift', time: '00:00' },
                shift_report_title: kv.shift_report_title || 'Shift Close Report',

                // Audit alerts
                audit_alert_enabled: kv.audit_alert_enabled === 'true' || kv.audit_alert_enabled === true,
                audit_alert_emails: kv.audit_alert_emails || { to: [], cc: [], bcc: [] },
                audit_alert_actions: kv.audit_alert_actions || 'both',

                // Org JSON settings
                organization_mode: orgSettings.organization_mode || 'bar_and_food',
                stock_count_mode: orgSettings.stock_count_mode || 'CATEGORY',
                allow_custom_increment: orgSettings.allow_custom_increment === true || orgSettings.allow_custom_increment === 'true',
                smart_order_per_location: orgSettings.smart_order_per_location === true || orgSettings.smart_order_per_location === 'true',
                show_items_at_all_locations: orgSettings.show_items_at_all_locations !== false && orgSettings.show_items_at_all_locations !== 'false',
                shared_inventory_count: orgSettings.shared_inventory_count === true || orgSettings.shared_inventory_count === 'true',
                recipes_enabled: orgSettings.recipes_enabled === true || orgSettings.recipes_enabled === 'true',
                recipe_search_source: orgSettings.recipe_search_source || 'both',
                recipe_search_primary: orgSettings.recipe_search_primary || 'local',
                package_sale_enabled: orgSettings.package_sale_enabled === true || orgSettings.package_sale_enabled === 'true',
                export_format: orgSettings.export_format || 'xlsx',
                pricing_bands_enabled: orgSettings.pricing_bands_enabled === true || orgSettings.pricing_bands_enabled === 'true',
                per_location_pricing: orgSettings.per_location_pricing === true || orgSettings.per_location_pricing === 'true',

                // AI ordering
                ai_ordering_enabled: aiConfig.enabled === true,
                ai_ordering_require_confirmation: aiConfig.require_confirmation !== false,
                ai_ordering_cc_user_ids: aiConfig.cc_user_ids || [],
                ai_ordering_supplier_ids: aiConfig.supplier_ids || [],

                // Workday
                workday_start: kv.workday_start || '00:00',
            }
        });
    } catch (err) {
        console.error('[Mobile admin settings GET]', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    const session = await verifyMobileToken(req);
    const err = requireAdmin(session);
    if (err) return err;

    try {
        const body = await req.json();

        const BOOLEAN_KV = ['track_bottle_levels', 'report_per_location', 'use_global_low_stock',
            'low_stock_alert_enabled', 'shift_report_enabled', 'audit_alert_enabled'];
        const STRING_KV = ['report_title', 'backup_time', 'workday_start', 'low_stock_alert_title',
            'shift_report_title', 'audit_alert_actions'];
        const JSON_KV = ['report_emails', 'report_schedule', 'low_stock_alert_emails', 'low_stock_alert_schedule',
            'shift_report_emails', 'shift_report_schedule', 'audit_alert_emails'];
        const NUMBER_KV = ['low_stock_threshold'];

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // KV settings
            for (const key of [...BOOLEAN_KV, ...STRING_KV, ...JSON_KV, ...NUMBER_KV]) {
                if (body[key] === undefined) continue;
                let val = body[key];
                if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
                else val = String(val);
                await client.query(
                    `INSERT INTO settings (organization_id, key, value) VALUES ($1, $2, $3)
                     ON CONFLICT (organization_id, key) DO UPDATE SET value = $3`,
                    [session.organizationId, key, val]
                );
            }

            // Org JSON settings
            const orgKeys = ORG_JSON_KEYS.filter(k => body[k] !== undefined);
            if (orgKeys.length > 0) {
                const orgRow = await client.query(
                    `SELECT settings FROM organizations WHERE id = $1 FOR UPDATE`,
                    [session.organizationId]
                );
                const current = orgRow.rows[0]?.settings || {};
                for (const k of orgKeys) {
                    if (k === 'stock_count_mode') {
                        if (!['CATEGORY', 'PRODUCT'].includes(body[k])) {
                            await client.query('ROLLBACK');
                            return NextResponse.json({ error: 'stock_count_mode must be "CATEGORY" or "PRODUCT"' }, { status: 400 });
                        }
                        current[k] = body[k];
                    } else if (k === 'recipe_search_source') {
                        if (!['local', 'global', 'both'].includes(body[k])) {
                            await client.query('ROLLBACK');
                            return NextResponse.json({ error: 'recipe_search_source must be "local", "global", or "both"' }, { status: 400 });
                        }
                        current[k] = body[k];
                    } else if (k === 'recipe_search_primary') {
                        if (!['local', 'global'].includes(body[k])) {
                            await client.query('ROLLBACK');
                            return NextResponse.json({ error: 'recipe_search_primary must be "local" or "global"' }, { status: 400 });
                        }
                        current[k] = body[k];
                    } else if (k === 'export_format') {
                        current[k] = body[k] === 'csv' ? 'csv' : 'xlsx';
                    } else if (k === 'organization_mode') {
                        if (!['bar_and_food', 'bar_with_food', 'food_only'].includes(body[k])) {
                            await client.query('ROLLBACK');
                            return NextResponse.json({ error: 'organization_mode must be "bar_and_food", "bar_with_food", or "food_only"' }, { status: 400 });
                        }
                        current[k] = body[k];
                    } else {
                        // Boolean coercion for all other org keys
                        current[k] = body[k] === true || body[k] === 'true';
                    }
                }
                await client.query(
                    `UPDATE organizations SET settings = $1 WHERE id = $2`,
                    [JSON.stringify(current), session.organizationId]
                );
            }

            // AI ordering config
            const aiFields = ['ai_ordering_enabled', 'ai_ordering_require_confirmation', 'ai_ordering_cc_user_ids', 'ai_ordering_supplier_ids'];
            if (aiFields.some(f => body[f] !== undefined)) {
                const aiRow = await client.query(
                    `SELECT value FROM settings WHERE organization_id = $1 AND key = 'ai_ordering_config' LIMIT 1`,
                    [session.organizationId]
                );
                let aiConfig: any = { enabled: false, require_confirmation: true, cc_user_ids: [], supplier_ids: [] };
                if (aiRow.rows[0]?.value) {
                    try { aiConfig = JSON.parse(aiRow.rows[0].value); } catch { }
                }
                if (body.ai_ordering_enabled !== undefined) aiConfig.enabled = body.ai_ordering_enabled === true;
                if (body.ai_ordering_require_confirmation !== undefined) aiConfig.require_confirmation = body.ai_ordering_require_confirmation !== false;
                if (body.ai_ordering_cc_user_ids !== undefined) aiConfig.cc_user_ids = Array.isArray(body.ai_ordering_cc_user_ids) ? body.ai_ordering_cc_user_ids : [];
                if (body.ai_ordering_supplier_ids !== undefined) aiConfig.supplier_ids = Array.isArray(body.ai_ordering_supplier_ids) ? body.ai_ordering_supplier_ids : [];
                await client.query(
                    `INSERT INTO settings (organization_id, key, value) VALUES ($1, 'ai_ordering_config', $2)
                     ON CONFLICT (organization_id, key) DO UPDATE SET value = $2`,
                    [session.organizationId, JSON.stringify(aiConfig)]
                );
            }

            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        return NextResponse.json({ ok: true });
    } catch (err: any) {
        console.error('[Mobile admin settings PATCH]', err);
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}
