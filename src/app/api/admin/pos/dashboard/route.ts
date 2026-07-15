import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session?.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { searchParams } = new URL(req.url);
        const view = searchParams.get('view') === 'monthly' ? 'monthly' : 'weekly';

        // Default date range
        const days = view === 'monthly' ? 30 : 7;
        const since = searchParams.get('since') || new Date(Date.now() - days * 86400000).toISOString();
        const until = searchParams.get('until') || new Date().toISOString();

        const orgId = session.organizationId;

        // Get model settings
        const modelRow = await db.one(
            `SELECT sensitivity, padding_pct, oz_per_shot FROM pos_model_settings WHERE organization_id = $1`,
            [orgId]
        ).catch(() => null);
        const sensitivity = parseFloat(modelRow?.sensitivity ?? 0.5);
        const paddingPct = parseFloat(modelRow?.padding_pct ?? 5);
        const defaultOzPerShot = parseFloat(modelRow?.oz_per_shot ?? 1.5);

        // Summary counts
        const summary = await db.one(
            `SELECT
                COUNT(DISTINCT t.id)::int as total_transactions,
                COALESCE(SUM(t.total_amount),0)::numeric as total_revenue,
                COUNT(DISTINCT ti.pos_item_name)::int as unique_items
             FROM pos_transactions t
             LEFT JOIN pos_transaction_items ti ON ti.transaction_id = t.id
             WHERE t.organization_id = $1
               AND t.transaction_at BETWEEN $2 AND $3`,
            [orgId, since, until]
        );

        // Per-item sales aggregation joined to mappings + actual inventory usage
        const itemAnalysis = await db.query(
            `SELECT
                ti.pos_item_name,
                COALESCE(m.inventory_item_id, NULL)::int as inventory_item_id,
                COALESCE(i.name, NULL) as inventory_item_name,
                COALESCE(m.oz_per_serving, $4)::numeric as oz_per_serving,
                COALESCE(m.servings_per_item, 1)::numeric as servings_per_item,
                SUM(ti.quantity)::numeric as qty_sold,
                -- Expected oz used from POS sales
                SUM(ti.quantity) * COALESCE(m.oz_per_serving, $4) * COALESCE(m.servings_per_item, 1) as expected_oz,
                -- Actual stock subtracted from inventory logs
                COALESCE((
                    SELECT SUM(ABS((al.details->>'quantity')::numeric))
                    FROM activity_logs al
                    WHERE al.action = 'SUBTRACT_STOCK'
                      AND al.organization_id = $1
                      AND (al.details->>'itemId')::int = m.inventory_item_id
                      AND al.timestamp BETWEEN $2 AND $3
                ), 0)::numeric as actual_stock_used
             FROM pos_transaction_items ti
             JOIN pos_transactions t ON ti.transaction_id = t.id
             LEFT JOIN pos_item_mappings m
                ON m.organization_id = $1 AND m.pos_item_name = ti.pos_item_name
             LEFT JOIN items i ON i.id = m.inventory_item_id
             WHERE t.organization_id = $1
               AND t.transaction_at BETWEEN $2 AND $3
               AND m.inventory_item_id IS NOT NULL
             GROUP BY ti.pos_item_name, m.inventory_item_id, i.name, m.oz_per_serving, m.servings_per_item
             ORDER BY qty_sold DESC`,
            [orgId, since, until, defaultOzPerShot]
        );

        // Apply padding and anomaly detection
        const deviationThreshold = (1 - sensitivity) * 0.5; // 0% sens → 50% deviation needed; 100% sens → 0%
        const analysisWithAnomalies = itemAnalysis.map((row: any) => {
            const expected = parseFloat(row.expected_oz) * (1 + paddingPct / 100);
            const actual = parseFloat(row.actual_stock_used);
            const deviation = expected > 0 ? Math.abs(actual - expected) / expected : 0;
            return {
                ...row,
                expected_oz_padded: expected,
                deviation_pct: Math.round(deviation * 100),
                is_anomaly: deviation > deviationThreshold,
                anomaly_type: actual > expected * 1.05 ? 'over' : actual < expected * 0.95 ? 'under' : 'normal',
            };
        });

        // Unmapped item count
        const unmappedRow = await db.one(
            `SELECT COUNT(DISTINCT ti.pos_item_name)::int as cnt
             FROM pos_transaction_items ti
             JOIN pos_transactions t ON ti.transaction_id = t.id
             WHERE t.organization_id = $1
               AND t.transaction_at BETWEEN $2 AND $3
               AND NOT EXISTS (
                   SELECT 1 FROM pos_item_mappings m
                   WHERE m.organization_id = $1 AND m.pos_item_name = ti.pos_item_name
               )`,
            [orgId, since, until]
        );

        // Recent sync logs
        const recentLogs = await db.query(
            `SELECT pos_type, started_at, completed_at, status, records_fetched, records_inserted, error_message
             FROM pos_sync_logs WHERE organization_id = $1
             ORDER BY started_at DESC LIMIT 5`,
            [orgId]
        );

        return NextResponse.json({
            summary,
            analysis: analysisWithAnomalies,
            anomalyCount: analysisWithAnomalies.filter((r: any) => r.is_anomaly).length,
            unmappedCount: unmappedRow.cnt,
            recentLogs,
            modelSettings: { sensitivity, paddingPct, defaultOzPerShot },
            dateRange: { since, until, view },
        });
    } catch (e) {
        console.error('[POS Dashboard]', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
