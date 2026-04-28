import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';

async function ensureDisableColumns() {
    await db.execute(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ`);
    await db.execute(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS disable_reason TEXT`);
    await db.execute(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS pre_disable_billing_status TEXT`);
}

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const rows = await db.query(`
        SELECT key, value FROM system_settings
        WHERE key IN ('billing_auto_disable_enabled', 'billing_auto_disable_grace_days')
    `);

    const settings: Record<string, string> = {};
    rows.forEach((r: any) => { settings[r.key] = r.value; });

    return NextResponse.json({
        enabled: settings['billing_auto_disable_enabled'] === 'true',
        graceDays: parseInt(settings['billing_auto_disable_grace_days'] || '7'),
    });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const { enabled, graceDays, runNow } = await req.json();

    if (enabled !== undefined) {
        await db.execute(
            `INSERT INTO system_settings (key, value) VALUES ('billing_auto_disable_enabled', $1)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
            [enabled ? 'true' : 'false']
        );
    }
    if (graceDays !== undefined) {
        await db.execute(
            `INSERT INTO system_settings (key, value) VALUES ('billing_auto_disable_grace_days', $1)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
            [String(Math.max(1, parseInt(graceDays)))]
        );
    }

    if (runNow) {
        const result = await runAutoDisable();
        return NextResponse.json({ success: true, ...result });
    }

    return NextResponse.json({ success: true });
}

export async function runAutoDisable(): Promise<{ disabled: number; orgs: string[] }> {
    await ensureDisableColumns();

    const graceRow = await db.one(
        `SELECT value FROM system_settings WHERE key = 'billing_auto_disable_grace_days'`
    ).catch(() => null);
    const graceDays = parseInt(graceRow?.value || '7');

    // Find past_due orgs whose last invoice has been FAILED/PENDING for longer than grace period
    // We'll use the invoices table: most recent invoice per org is FAILED or PENDING and older than grace days
    const candidates = await db.query(`
        SELECT DISTINCT ON (o.id)
            o.id, o.name, o.billing_status,
            i.status AS invoice_status,
            i.created_at AS invoice_date
        FROM organizations o
        JOIN invoices i ON i.organization_id = o.id
        WHERE o.billing_status = 'past_due'
          AND i.status IN ('FAILED', 'PENDING')
          AND i.created_at < NOW() - INTERVAL '1 day' * $1
        ORDER BY o.id, i.created_at DESC
    `, [graceDays]);

    const disabledOrgs: string[] = [];

    for (const org of candidates) {
        await db.execute(
            `UPDATE organizations
             SET billing_status = 'disabled',
                 disabled_at = NOW(),
                 disable_reason = 'Auto-disabled: payment past due for ' || $1 || ' days',
                 pre_disable_billing_status = 'past_due'
             WHERE id = $2`,
            [graceDays, org.id]
        );

        try {
            await db.execute(
                `INSERT INTO activity_logs (organization_id, user_id, action, details)
                 VALUES ($1, 0, 'ORG_AUTO_DISABLED', $2)`,
                [org.id, JSON.stringify({ reason: `Auto-disabled: payment past due for ${graceDays} days` })]
            );
        } catch { /* non-fatal */ }

        disabledOrgs.push(org.name);
    }

    return { disabled: disabledOrgs.length, orgs: disabledOrgs };
}
