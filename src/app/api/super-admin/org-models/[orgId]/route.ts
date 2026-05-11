/**
 * GET    /api/super-admin/org-models/:orgId  — full model details + item params
 * PATCH  /api/super-admin/org-models/:orgId  — update config without retraining
 * DELETE /api/super-admin/org-models/:orgId  — wipe model (reset to untrained)
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import {
    ensureOrgModelsTable,
    DEFAULT_ORG_ML_CONFIG,
    generatePlainEnglishSummary,
    OrgMLConfig,
} from '@/lib/org-ml';

export const dynamic = 'force-dynamic';

export async function GET(
    _req: NextRequest,
    { params }: { params: { orgId: string } }
) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await ensureOrgModelsTable();

    const orgId = parseInt(params.orgId);
    const row = await db.one(
        `SELECT
            m.*,
            o.name AS org_name
         FROM org_ml_models m
         JOIN organizations o ON o.id = m.organization_id
         WHERE m.organization_id = $1`,
        [orgId]
    );

    if (!row) {
        const org = await db.one(`SELECT id, name FROM organizations WHERE id = $1`, [orgId]);
        if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
        const config = DEFAULT_ORG_ML_CONFIG;
        return NextResponse.json({
            org_id: orgId,
            org_name: org.name,
            status: 'untrained',
            config,
            params: [],
            performance: {},
            trained_at: null,
            training_duration_ms: null,
            error_message: null,
            plain_english: generatePlainEnglishSummary({} as any, config, null),
        });
    }

    const config: OrgMLConfig = { ...DEFAULT_ORG_ML_CONFIG, ...(row.config ?? {}) };
    return NextResponse.json({
        org_id: orgId,
        org_name: row.org_name,
        status: row.status,
        config,
        params: row.params ?? [],
        performance: row.performance ?? {},
        trained_at: row.trained_at,
        training_duration_ms: row.training_duration_ms,
        error_message: row.error_message,
        plain_english: generatePlainEnglishSummary(row.performance ?? {}, config, row.trained_at),
    });
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: { orgId: string } }
) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await ensureOrgModelsTable();

    const orgId = parseInt(params.orgId);
    const body = await req.json();
    const config: OrgMLConfig = { ...DEFAULT_ORG_ML_CONFIG, ...body };

    await db.execute(
        `INSERT INTO org_ml_models (organization_id, config, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (organization_id) DO UPDATE
         SET config = $2, updated_at = NOW()`,
        [orgId, JSON.stringify(config)]
    );

    return NextResponse.json({ ok: true, config });
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: { orgId: string } }
) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await ensureOrgModelsTable();

    const orgId = parseInt(params.orgId);
    await db.execute(
        `INSERT INTO org_ml_models (organization_id, status, config, params, performance, trained_at, training_duration_ms, error_message, updated_at)
         VALUES ($1, 'untrained', '{}', '[]', '{}', NULL, NULL, NULL, NOW())
         ON CONFLICT (organization_id) DO UPDATE
         SET status = 'untrained', params = '[]', performance = '{}',
             trained_at = NULL, training_duration_ms = NULL, error_message = NULL, updated_at = NOW()`,
        [orgId]
    );

    return NextResponse.json({ ok: true });
}
