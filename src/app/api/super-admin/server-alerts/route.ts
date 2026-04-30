import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ALERT_DEFAULTS = [
    { alert_type: 'cpu_high',          threshold_value: 85, threshold_unit: '%',   label: 'CPU Usage High' },
    { alert_type: 'memory_high',       threshold_value: 90, threshold_unit: '%',   label: 'Memory Usage High' },
    { alert_type: 'disk_high',         threshold_value: 80, threshold_unit: '%',   label: 'Disk Usage High' },
    { alert_type: 'db_size_limit',     threshold_value: 5,  threshold_unit: 'GB',  label: 'Database Size Approaching Limit' },
    { alert_type: 'error_rate_spike',  threshold_value: 50, threshold_unit: 'errors/min', label: 'Error Rate Spike' },
    { alert_type: 'login_failures',    threshold_value: 10, threshold_unit: 'per hour', label: 'Excessive Login Failures' },
    { alert_type: 'new_org_signup',    threshold_value: 1,  threshold_unit: 'count', label: 'New Organization Signup' },
    { alert_type: 'trial_expiring',    threshold_value: 3,  threshold_unit: 'days', label: 'Trial Expiring Soon' },
    { alert_type: 'billing_failed',    threshold_value: 1,  threshold_unit: 'count', label: 'Billing/Payment Failed' },
    { alert_type: 'unusual_activity',  threshold_value: 100, threshold_unit: 'actions/hour', label: 'Unusual Activity Volume' },
    { alert_type: 'orgs_approaching_limit', threshold_value: 90, threshold_unit: '%', label: 'Org Approaching User/Product Limit' },
    { alert_type: 'email_failures',    threshold_value: 5, threshold_unit: 'per hour', label: 'Email Delivery Failures' },
];

async function auth() {
    const session = await getSession();
    return session?.isSuperAdmin;
}

export async function GET() {
    if (!await auth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const rows = await db.query('SELECT * FROM server_alert_configs ORDER BY alert_type ASC');
    const configMap: Record<string, any> = {};
    rows.forEach((r: any) => { configMap[r.alert_type] = r; });

    const merged = ALERT_DEFAULTS.map(def => ({
        ...def,
        ...(configMap[def.alert_type] || {}),
        label: def.label,
    }));

    // Get super admins for recipient selection
    const superAdmins = await db.query(`
        SELECT id, first_name, last_name, email
        FROM users WHERE permissions::jsonb ? 'super_admin' ORDER BY first_name ASC
    `);

    return NextResponse.json({ alerts: merged, superAdmins });
}

export async function POST(req: NextRequest) {
    if (!await auth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const { alert_type, enabled, threshold_value, threshold_unit, recipients_json } = await req.json();
    if (!alert_type) return NextResponse.json({ error: 'Missing alert_type' }, { status: 400 });

    await db.execute(`
        INSERT INTO server_alert_configs (alert_type, enabled, threshold_value, threshold_unit, recipients_json, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (alert_type) DO UPDATE SET
            enabled = EXCLUDED.enabled,
            threshold_value = EXCLUDED.threshold_value,
            threshold_unit = EXCLUDED.threshold_unit,
            recipients_json = EXCLUDED.recipients_json,
            updated_at = NOW()
    `, [alert_type, enabled ?? true, threshold_value ?? null, threshold_unit ?? null, JSON.stringify(recipients_json ?? [])]);

    return NextResponse.json({ ok: true });
}
