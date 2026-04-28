import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

async function ensureDisableColumns() {
    await db.execute(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ`);
    await db.execute(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS disable_reason TEXT`);
    await db.execute(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS pre_disable_billing_status TEXT`);
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const { orgId, action, reason } = await req.json();
    if (!orgId || !action) return NextResponse.json({ error: 'orgId and action required' }, { status: 400 });

    await ensureDisableColumns();

    if (action === 'disable') {
        const org = await db.one('SELECT billing_status FROM organizations WHERE id = $1', [orgId]);
        if (!org) return NextResponse.json({ error: 'Org not found' }, { status: 404 });

        const preStatus = org.billing_status !== 'disabled' ? org.billing_status : 'active';

        await db.execute(
            `UPDATE organizations
             SET billing_status = 'disabled',
                 disabled_at = NOW(),
                 disable_reason = $1,
                 pre_disable_billing_status = $2
             WHERE id = $3`,
            [reason || 'Disabled by super admin', preStatus, orgId]
        );

        // Log to activity_logs if we can
        try {
            await db.execute(
                `INSERT INTO activity_logs (organization_id, user_id, action, details)
                 VALUES ($1, $2, 'ORG_DISABLED', $3)`,
                [orgId, session.id, JSON.stringify({ reason: reason || 'Disabled by super admin', disabledBy: session.id })]
            );
        } catch { /* non-fatal */ }

        return NextResponse.json({ success: true, action: 'disabled' });

    } else if (action === 'enable') {
        const org = await db.one('SELECT pre_disable_billing_status FROM organizations WHERE id = $1', [orgId]);
        const restoreStatus = org?.pre_disable_billing_status || 'active';

        await db.execute(
            `UPDATE organizations
             SET billing_status = $1,
                 disabled_at = NULL,
                 disable_reason = NULL,
                 pre_disable_billing_status = NULL
             WHERE id = $2`,
            [restoreStatus, orgId]
        );

        try {
            await db.execute(
                `INSERT INTO activity_logs (organization_id, user_id, action, details)
                 VALUES ($1, $2, 'ORG_ENABLED', $3)`,
                [orgId, session.id, JSON.stringify({ restoredStatus: restoreStatus, enabledBy: session.id })]
            );
        } catch { /* non-fatal */ }

        return NextResponse.json({ success: true, action: 'enabled', restoredStatus: restoreStatus });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    await ensureDisableColumns();

    const disabled = await db.query(`
        SELECT id, name, billing_status, subscription_plan, disabled_at, disable_reason, pre_disable_billing_status
        FROM organizations
        WHERE billing_status = 'disabled'
        ORDER BY disabled_at DESC
    `);

    return NextResponse.json({ disabled });
}
