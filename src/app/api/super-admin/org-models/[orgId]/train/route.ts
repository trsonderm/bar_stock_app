/**
 * POST /api/super-admin/org-models/:orgId/train
 *
 * Body (all optional):
 *   wipe: boolean          — clear params before training (always replaces)
 *   force_replace: boolean — skip comparison mode; replace regardless of delta
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import {
    ensureOrgModelsTable,
    DEFAULT_ORG_ML_CONFIG,
    trainOrgModel,
    generateImprovementReasons,
    OrgMLConfig,
    OrgMLPerformance,
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
    const { wipe = false, force_replace = false } = body;

    const org = await db.one(`SELECT id, name FROM organizations WHERE id = $1`, [orgId]);
    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

    const existing = await db.one(
        `SELECT status, config, performance, trained_at FROM org_ml_models WHERE organization_id = $1`,
        [orgId]
    );

    if (existing?.status === 'training') {
        return NextResponse.json({ error: 'Training already in progress for this organization' }, { status: 409 });
    }

    const config: OrgMLConfig = { ...DEFAULT_ORG_ML_CONFIG, ...(existing?.config ?? {}) };
    const prevPerf: OrgMLPerformance | null = existing?.performance?.items_covered > 0
        ? existing.performance
        : null;

    // Mark as training
    await db.execute(
        `INSERT INTO org_ml_models (organization_id, status, config, params, performance, updated_at)
         VALUES ($1, 'training', $2, '[]', '{}', NOW())
         ON CONFLICT (organization_id) DO UPDATE
         SET status = 'training', error_message = NULL, updated_at = NOW()`,
        [orgId, JSON.stringify(config)]
    );

    const startMs = Date.now();

    try {
        const { params: itemParams, performance } = await trainOrgModel(orgId, config);
        const durationMs = Date.now() - startMs;

        const reasons = generateImprovementReasons(performance, prevPerf, itemParams, config);

        // Comparison mode: decide whether to replace
        const useComparisonMode = config.comparison_mode && prevPerf && !wipe && !force_replace;
        const confidenceDelta = performance.confidence_score - (prevPerf?.confidence_score ?? 0);
        const r2Delta         = performance.avg_r2 - (prevPerf?.avg_r2 ?? 0);
        const coverageDelta   = performance.coverage_pct - (prevPerf?.coverage_pct ?? 0);
        const mapeDelta       = (performance.holdout?.mape ?? 0) - (prevPerf?.holdout?.mape ?? 0);

        let replaced = true;
        let comparisonResult: string;

        if (useComparisonMode) {
            if (confidenceDelta >= config.replacement_threshold) {
                replaced = true;
                comparisonResult =
                    `Challenger accepted: confidence improved from ${prevPerf!.confidence_score} to ` +
                    `${performance.confidence_score} (+${confidenceDelta.toFixed(1)} pts, threshold ${config.replacement_threshold}).`;
            } else {
                replaced = false;
                comparisonResult =
                    `Challenger rejected: confidence ${performance.confidence_score} did not beat current ` +
                    `${prevPerf!.confidence_score} by the required ${config.replacement_threshold} pts (Δ = ${confidenceDelta.toFixed(1)}).`;
            }
        } else {
            comparisonResult = wipe ? 'Forced rebuild — previous model wiped.' : 'Direct replace (comparison mode off).';
        }

        const comparison = prevPerf ? {
            confidence_delta: Math.round(confidenceDelta * 10) / 10,
            r2_delta:         Math.round(r2Delta * 1000) / 1000,
            coverage_delta:   Math.round(coverageDelta * 10) / 10,
            mape_delta:       Math.round(mapeDelta * 10) / 10,
            replaced,
            reason: comparisonResult,
        } : null;

        // Log to history regardless of replacement decision
        await db.execute(
            `INSERT INTO org_ml_model_history
                (organization_id, status, config, performance, comparison, improvement_reasons, replaced_previous, trained_at, duration_ms)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)`,
            [
                orgId,
                replaced ? 'trained' : 'rejected',
                JSON.stringify(config),
                JSON.stringify(performance),
                comparison ? JSON.stringify(comparison) : null,
                reasons,
                replaced,
                durationMs,
            ]
        );

        if (replaced) {
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
        } else {
            // Revert to previous trained status
            await db.execute(
                `UPDATE org_ml_models SET status = 'trained', updated_at = NOW() WHERE organization_id = $1`,
                [orgId]
            );
        }

        return NextResponse.json({
            ok: true,
            replaced,
            comparison,
            improvement_reasons: reasons,
            performance,
            items_trained: itemParams.length,
            duration_ms: durationMs,
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

        await db.execute(
            `INSERT INTO org_ml_model_history
                (organization_id, status, config, performance, improvement_reasons, replaced_previous, trained_at, duration_ms)
             VALUES ($1, 'failed', $2, '{}', '{}', FALSE, NOW(), $3)`,
            [orgId, JSON.stringify(config), durationMs]
        );

        return NextResponse.json({ error: message }, { status: 500 });
    }
}
