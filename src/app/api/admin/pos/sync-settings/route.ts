import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
    const session = await getSession();
    if (!session?.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const settings = await db.query(
            `SELECT id, pos_type, sync_enabled, sync_frequency,
                    credentials, config, last_synced_at, updated_at
             FROM pos_sync_settings WHERE organization_id = $1`,
            [session.organizationId]
        );
        // Mask secret fields before returning
        const masked = settings.map((s: any) => {
            const creds = s.credentials || {};
            return {
                ...s,
                credentials: {
                    ...creds,
                    client_secret: creds.client_secret ? '••••••••' : '',
                    access_token: creds.access_token ? '••••••••' : '',
                },
            };
        });
        return NextResponse.json({ settings: masked });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.organizationId || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { pos_type, sync_enabled, sync_frequency, credentials, config } = await req.json();
        if (!['toast', 'clover'].includes(pos_type)) {
            return NextResponse.json({ error: 'Invalid pos_type' }, { status: 400 });
        }

        // Fetch existing to preserve masked secrets
        const existing = await db.one(
            `SELECT credentials FROM pos_sync_settings WHERE organization_id = $1 AND pos_type = $2`,
            [session.organizationId, pos_type]
        ).catch(() => null);

        const existingCreds = existing?.credentials || {};
        const mergedCreds: Record<string, string> = { ...existingCreds };

        // Only overwrite a secret field if a real value (not masked) was provided
        for (const [k, v] of Object.entries(credentials || {})) {
            if (typeof v === 'string' && v && !v.startsWith('••')) {
                mergedCreds[k] = v;
            }
        }

        await db.execute(
            `INSERT INTO pos_sync_settings (organization_id, pos_type, sync_enabled, sync_frequency, credentials, config)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (organization_id, pos_type) DO UPDATE SET
                sync_enabled   = EXCLUDED.sync_enabled,
                sync_frequency = EXCLUDED.sync_frequency,
                credentials    = EXCLUDED.credentials,
                config         = EXCLUDED.config,
                updated_at     = NOW()`,
            [
                session.organizationId, pos_type,
                sync_enabled ?? true,
                sync_frequency || 'hourly',
                JSON.stringify(mergedCreds),
                JSON.stringify(config || {}),
            ]
        );

        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: 'Error saving settings' }, { status: 500 });
    }
}
