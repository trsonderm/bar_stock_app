/**
 * GET /api/super-admin/org-models/:orgId/history?limit=20
 * Returns the training history for an organization, newest first.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { ensureOrgModelsTable } from '@/lib/org-ml';

export const dynamic = 'force-dynamic';

export async function GET(
    req: NextRequest,
    { params }: { params: { orgId: string } }
) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await ensureOrgModelsTable();

    const orgId = parseInt(params.orgId);
    const limit = Math.min(100, parseInt(req.nextUrl.searchParams.get('limit') ?? '30'));

    const rows = await db.query(
        `SELECT
            id, organization_id, status, config, performance, comparison,
            improvement_reasons, replaced_previous, trained_at, duration_ms
         FROM org_ml_model_history
         WHERE organization_id = $1
         ORDER BY trained_at DESC
         LIMIT $2`,
        [orgId, limit]
    );

    // Build chart-ready time series
    const chartData = [...rows].reverse().map(r => ({
        date: new Date(r.trained_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        trained_at: r.trained_at,
        confidence: r.performance?.confidence_score ?? null,
        coverage: r.performance?.coverage_pct ?? null,
        r2: r.performance?.avg_r2 != null ? Math.round(r.performance.avg_r2 * 100) : null,
        mape: r.performance?.holdout?.mape ?? null,
        accuracy: r.performance?.holdout?.accuracy_pct ?? null,
        data_points: r.performance?.total_data_points ?? null,
        replaced: r.replaced_previous,
        status: r.status,
    }));

    return NextResponse.json({ history: rows, chart_data: chartData });
}
