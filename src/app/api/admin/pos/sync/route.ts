import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { runPOSSyncForOrg } from '@/lib/pos-sync';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.organizationId || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { pos_type } = await req.json();

        // Check org has POS enabled
        const org = await db.one(
            'SELECT toast_pos_enabled, clover_pos_enabled FROM organizations WHERE id = $1',
            [session.organizationId]
        );
        const globalRow = await db.one(
            "SELECT value FROM system_settings WHERE key = 'pos_global_enabled'"
        ).catch(() => null);
        const globalEnabled = globalRow?.value === 'true';

        const toastOn = org.toast_pos_enabled || globalEnabled;
        const cloverOn = org.clover_pos_enabled || globalEnabled;

        if (pos_type === 'toast' && !toastOn) return NextResponse.json({ error: 'Toast POS not enabled' }, { status: 403 });
        if (pos_type === 'clover' && !cloverOn) return NextResponse.json({ error: 'Clover POS not enabled' }, { status: 403 });

        // Run async — don't block the response
        runPOSSyncForOrg(session.organizationId, 'manual').catch(e =>
            console.error('[POS Manual Sync]', e)
        );

        return NextResponse.json({ success: true, message: 'Sync started' });
    } catch (e) {
        return NextResponse.json({ error: 'Error triggering sync' }, { status: 500 });
    }
}

// GET: return recent sync logs for this org
export async function GET() {
    const session = await getSession();
    if (!session?.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const logs = await db.query(
            `SELECT pos_type, started_at, completed_at, status,
                    records_fetched, records_inserted, error_message, triggered_by
             FROM pos_sync_logs WHERE organization_id = $1
             ORDER BY started_at DESC LIMIT 20`,
            [session.organizationId]
        );
        return NextResponse.json({ logs });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
