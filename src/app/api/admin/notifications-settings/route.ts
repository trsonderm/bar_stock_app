import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';

// Returns all notification settings the requesting user has access to see/change.
// Regular non-admin users with no relevant permissions get nothing (empty object).
export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const isAdmin = session.role === 'admin';
    const perms: string[] = (session.permissions as any) || [];
    const canAudit = isAdmin || perms.includes('audit') || perms.includes('all');
    const canInventory = isAdmin || perms.includes('inventory') || perms.includes('add_stock') || perms.includes('all');

    // Non-admin users with no relevant permissions → no org-level notification settings
    if (!isAdmin && !canAudit && !canInventory) {
        return NextResponse.json({ settings: {}, profile: await getProfilePrefs(session.id), access: {} });
    }

    const rows = await db.query(
        `SELECT key, value FROM settings WHERE organization_id = $1`,
        [session.organizationId]
    );
    const s: Record<string, string> = {};
    rows.forEach((r: any) => { s[r.key] = r.value; });

    // Fetch order_confirmation_recipients user details
    let orderRecipients: any[] = [];
    if (isAdmin) {
        try {
            const userIds = JSON.parse(s.order_confirmation_recipients || '[]');
            if (userIds.length) {
                orderRecipients = await db.query(
                    `SELECT id, first_name, last_name, email FROM users WHERE id = ANY($1::int[]) AND organization_id = $2`,
                    [userIds, session.organizationId]
                );
            }
        } catch {}
    }

    // AI ordering config from org
    let aiConfig: any = {};
    if (isAdmin) {
        const org = await db.one(
            `SELECT ai_ordering_config FROM organizations WHERE id = $1`,
            [session.organizationId]
        );
        aiConfig = org?.ai_ordering_config || {};
    }

    const parse = (val: string | undefined, def: any) => {
        try { return val ? JSON.parse(val) : def; } catch { return def; }
    };

    const settings = {
        // Low stock (visible to anyone with inventory access)
        ...(canInventory && {
            low_stock_alert_enabled: s.low_stock_alert_enabled || 'false',
            low_stock_alert_emails: parse(s.low_stock_alert_emails, { to: [], cc: [], bcc: [] }),
            low_stock_alert_schedule: parse(s.low_stock_alert_schedule || s.low_stock_alert_time, { frequency: 'daily', time: '14:00' }),
            low_stock_alert_title: s.low_stock_alert_title || 'URGENT: Low Stock Alert',
            low_stock_threshold: s.low_stock_threshold || '5',
        }),
        // Audit alerts (admin or audit permission)
        ...(canAudit && {
            audit_alert_enabled: s.audit_alert_enabled || 'false',
            audit_alert_emails: parse(s.audit_alert_emails, { to: [], cc: [], bcc: [] }),
            audit_alert_actions: s.audit_alert_actions || 'both',
        }),
        // Admin-only sections
        ...(isAdmin && {
            report_emails: parse(s.report_emails, { to: [], cc: [], bcc: [] }),
            report_schedule: parse(s.report_time || s.report_schedule, { frequency: 'daily', time: '08:00' }),
            report_title: s.report_title || 'Daily Stock Report',
            shift_report_enabled: s.shift_report_enabled || 'false',
            shift_report_emails: parse(s.shift_report_emails, { to: [], cc: [], bcc: [] }),
            shift_report_schedule: parse(s.shift_report_schedule, { frequency: 'per_shift', time: '00:00' }),
            shift_report_title: s.shift_report_title || 'Shift Close Report',
            order_confirmation_recipients: orderRecipients,
            ai_ordering_email: aiConfig.email || '',
            ai_ordering_enabled: aiConfig.enabled || false,
        }),
    };

    return NextResponse.json({
        settings,
        profile: await getProfilePrefs(session.id),
        access: { isAdmin, canAudit, canInventory },
    });
}

async function getProfilePrefs(userId: number) {
    const user = await db.one(
        `SELECT notification_preferences FROM users WHERE id = $1`,
        [userId]
    );
    const prefs = user?.notification_preferences || {};
    return {
        new_message: prefs.new_message ?? true,
        post_tag: prefs.post_tag ?? true,
        low_stock: prefs.low_stock ?? true,
        shift_report: prefs.shift_report ?? true,
    };
}

export async function PATCH(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const isAdmin = session.role === 'admin';
    const perms: string[] = (session.permissions as any) || [];
    const canAudit = isAdmin || perms.includes('audit') || perms.includes('all');
    const canInventory = isAdmin || perms.includes('inventory') || perms.includes('add_stock') || perms.includes('all');

    const body = await req.json();

    // Profile preferences — any user
    if (body.profile) {
        const allowed = ['new_message', 'post_tag', 'low_stock', 'shift_report'];
        const update: Record<string, boolean> = {};
        for (const k of allowed) {
            if (k in body.profile) update[k] = !!body.profile[k];
        }
        if (Object.keys(update).length) {
            const current = await db.one(
                `SELECT notification_preferences FROM users WHERE id = $1`, [session.id]
            );
            const merged = { ...(current?.notification_preferences || {}), ...update };
            await db.execute(
                `UPDATE users SET notification_preferences = $1 WHERE id = $2`,
                [JSON.stringify(merged), session.id]
            );
        }
    }

    // Org-level settings — permission gated
    const orgKeys: string[] = [];
    const orgVals: string[] = [];

    const set = (key: string, val: any) => {
        orgKeys.push(key);
        orgVals.push(typeof val === 'string' ? val : JSON.stringify(val));
    };

    if (canInventory && body.settings) {
        const s = body.settings;
        if ('low_stock_alert_enabled' in s) set('low_stock_alert_enabled', s.low_stock_alert_enabled);
        if ('low_stock_alert_emails' in s) set('low_stock_alert_emails', s.low_stock_alert_emails);
        if ('low_stock_alert_schedule' in s) set('low_stock_alert_schedule', s.low_stock_alert_schedule);
        if ('low_stock_alert_title' in s) set('low_stock_alert_title', s.low_stock_alert_title);
        if ('low_stock_threshold' in s) set('low_stock_threshold', s.low_stock_threshold);
    }

    if (canAudit && body.settings) {
        const s = body.settings;
        if ('audit_alert_enabled' in s) set('audit_alert_enabled', s.audit_alert_enabled);
        if ('audit_alert_emails' in s) set('audit_alert_emails', s.audit_alert_emails);
        if ('audit_alert_actions' in s) set('audit_alert_actions', s.audit_alert_actions);
    }

    if (isAdmin && body.settings) {
        const s = body.settings;
        if ('report_emails' in s) set('report_emails', s.report_emails);
        if ('report_schedule' in s) set('report_schedule', s.report_schedule);
        if ('report_title' in s) set('report_title', s.report_title);
        if ('shift_report_enabled' in s) set('shift_report_enabled', s.shift_report_enabled);
        if ('shift_report_emails' in s) set('shift_report_emails', s.shift_report_emails);
        if ('shift_report_schedule' in s) set('shift_report_schedule', s.shift_report_schedule);
        if ('shift_report_title' in s) set('shift_report_title', s.shift_report_title);
    }

    for (let i = 0; i < orgKeys.length; i++) {
        await db.execute(
            `INSERT INTO settings (organization_id, key, value) VALUES ($1,$2,$3)
             ON CONFLICT (organization_id, key) DO UPDATE SET value = $3`,
            [session.organizationId, orgKeys[i], orgVals[i]]
        );
    }

    // Smart order email update (admin only, directly on org)
    if (isAdmin && body.settings?.ai_ordering_email !== undefined) {
        const org = await db.one(`SELECT ai_ordering_config FROM organizations WHERE id = $1`, [session.organizationId]);
        const cfg = org?.ai_ordering_config || {};
        cfg.email = body.settings.ai_ordering_email;
        if ('ai_ordering_enabled' in body.settings) cfg.enabled = body.settings.ai_ordering_enabled;
        await db.execute(
            `UPDATE organizations SET ai_ordering_config = $1 WHERE id = $2`,
            [JSON.stringify(cfg), session.organizationId]
        );
    }

    return NextResponse.json({ ok: true });
}
