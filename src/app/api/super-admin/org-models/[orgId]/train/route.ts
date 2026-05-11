/**
 * POST /api/super-admin/org-models/:orgId/train
 * Train (or wipe-and-rebuild) the ML model for a specific organization.
 * Body: { wipe?: boolean }  — if wipe is true, params are wiped before training begins
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import {
    ensureOrgModelsTable,
    DEFAULT_ORG_ML_CONFIG,
    trainOrgModel,
    OrgMLConfig,
} from '@/lib/org-ml';

export const dynamic = 'force-dynamic';

export async function POST(
    req: NextRequest,
    { params }: { params: { orgId: string } }
) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await ensureOrgModelsTable();

    const orgId = parseInt(params.orgId);
    const body = await req.json().catch(() => ({}));

    const org = await db.one(`SELECT id, name FROM organizations WHERE id = $1`, [orgId]);
    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

    const existing = await db.one(
        `SELECT config, status FROM org_ml_models WHERE organization_id = $1`,
        [orgId]
    );

    if (existing?.status === 'training') {
        return NextResponse.json({ error: 'Training already in progress' }, { status: 409 });
    }

    const config: OrgMLConfig = {
        ...DEFAULT_ORG_ML_CONFIG,
        ...(existing?.config ?? {}),
    };

    await db.execute(
        `INSERT INTO org_ml_models (organization_id, status, config, params, performance, updated_at)
         VALUES ($1, 'training', $2, '[]', '{}', NOW())
         ON CONFLICT (organization_id) DO UPDATE
         SET status = 'training', params = '[]', performance = '{}',
             error_message = NULL, updated_at = NOW()`,
        [orgId, JSON.stringify(config)]
    );

    const startMs = Date.now();
    try {
        const { params: itemParams, performance } = await trainOrgModel(orgId, config);
        const durationMs = Date.now() - startMs;

        await db.execute(
            `UPDATE org_ml_models
             SET status = 'trained',
                 params = $1,
                 performance = $2,
                 trained_at = NOW(),
                 training_duration_ms = $3,
                 error_message = NULL,
                 updated_at = NOW()
             WHERE organization_id = $4`,
            [JSON.stringify(itemParams), JSON.stringify(performance), durationMs, orgId]
        );

        return NextResponse.json({
            ok: true,
            org_id: orgId,
            org_name: org.name,
            duration_ms: durationMs,
            performance,
            items_trained: itemParams.length,
        });
    } catch (err: any) {
        const durationMs = Date.now() - startMs;
        const message = err?.message || 'Unknown training error';

        await db.execute(
            `UPDATE org_ml_models
             SET status = 'failed', error_message = $1, training_duration_ms = $2, updated_at = NOW()
             WHERE organization_id = $3`,
            [message, durationMs, orgId]
        );

        return NextResponse.json({ error: message }, { status: 500 });
    }
}
