import { db } from './db';

async function ensureDisableColumns() {
    await db.execute(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ`);
    await db.execute(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS disable_reason TEXT`);
    await db.execute(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS pre_disable_billing_status TEXT`);
}

export async function runAutoDisable(): Promise<{ disabled: number; orgs: string[] }> {
    await ensureDisableColumns();

    const graceRow = await db.one(
        `SELECT value FROM system_settings WHERE key = 'billing_auto_disable_grace_days'`
    ).catch(() => null);
    const graceDays = parseInt(graceRow?.value || '7');

    const candidates = await db.query(`
        SELECT DISTINCT ON (o.id)
            o.id, o.name
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
                 disable_reason = $1,
                 pre_disable_billing_status = 'past_due'
             WHERE id = $2`,
            [`Auto-disabled: payment past due for ${graceDays} days`, org.id]
        );
        try {
            await db.execute(
                `INSERT INTO activity_logs (organization_id, user_id, action, details)
                 VALUES ($1, 0, 'ORG_AUTO_DISABLED', $2)`,
                [org.id, JSON.stringify({ reason: `Auto-disabled: payment past due for ${graceDays} days` })]
            );
        } catch { /* non-fatal */ }
        console.log(`[auto-disable] Disabled org: ${org.name} (id=${org.id})`);
        disabledOrgs.push(org.name);
    }

    return { disabled: disabledOrgs.length, orgs: disabledOrgs };
}
