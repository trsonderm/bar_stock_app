/**
 * GET /api/super-admin/org-models
 * List every organization with its ML model status summary.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { ensureOrgModelsTable, DEFAULT_ORG_ML_CONFIG } from '@/lib/org-ml';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await ensureOrgModelsTable();

    const rows = await db.query(
        `SELECT
            o.id,
            o.name,
            o.billing_status,
            o.disabled_at,
            m.status,
            m.trained_at,
            m.training_duration_ms,
            m.performance,
            m.config,
            m.error_message,
            m.updated_at
         FROM organizations o
         LEFT JOIN org_ml_models m ON m.organization_id = o.id
         ORDER BY o.name ASC`
    );

    const orgs = rows.map(r => ({
        id: r.id,
        name: r.name,
        billing_status: r.billing_status,
        disabled: !!r.disabled_at,
        status: r.status ?? 'untrained',
        trained_at: r.trained_at ?? null,
        training_duration_ms: r.training_duration_ms ?? null,
        performance: r.performance ?? {},
        config: r.config && Object.keys(r.config).length > 0
            ? { ...DEFAULT_ORG_ML_CONFIG, ...r.config }
            : DEFAULT_ORG_ML_CONFIG,
        error_message: r.error_message ?? null,
        updated_at: r.updated_at ?? null,
    }));

    const trained = orgs.filter(o => o.status === 'trained').length;
    const avgCoverage = trained > 0
        ? Math.round(
            orgs
                .filter(o => o.status === 'trained')
                .reduce((sum, o) => sum + (o.performance?.coverage_pct ?? 0), 0) / trained
        )
        : 0;

    return NextResponse.json({
        orgs,
        summary: {
            total: orgs.length,
            trained,
            untrained: orgs.filter(o => o.status === 'untrained').length,
            failed: orgs.filter(o => o.status === 'failed').length,
            avg_coverage_pct: avgCoverage,
        },
    });
}
