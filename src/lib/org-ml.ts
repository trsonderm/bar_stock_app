import { db } from './db';
import { MLModelConfig, DEFAULT_ML_CONFIG, MLModelType, burnRate, linearRegression } from './ml';

export interface OrgMLConfig extends MLModelConfig {
    auto_retrain: boolean;
    auto_retrain_interval_days: number;
}

export const DEFAULT_ORG_ML_CONFIG: OrgMLConfig = {
    ...DEFAULT_ML_CONFIG,
    auto_retrain: false,
    auto_retrain_interval_days: 30,
};

export interface ItemMLParams {
    item_id: number;
    item_name: string;
    burn_rate: number;
    slope: number;
    r2: number;
    mean_daily: number;
    std_dev: number;
    data_points: number;
    first_day: string;
    last_day: string;
    forecast_next_7: number;
    forecast_next_30: number;
}

export interface OrgMLPerformance {
    items_covered: number;
    total_items: number;
    coverage_pct: number;
    total_data_points: number;
    avg_r2: number;
    confidence_score: number;
    training_window_days: number;
    model_used: MLModelType;
}

export type OrgMLStatus = 'untrained' | 'training' | 'trained' | 'failed';

export async function ensureOrgModelsTable(): Promise<void> {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS org_ml_models (
            id                   SERIAL PRIMARY KEY,
            organization_id      INTEGER NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
            status               VARCHAR(20) NOT NULL DEFAULT 'untrained',
            config               JSONB NOT NULL DEFAULT '{}',
            params               JSONB NOT NULL DEFAULT '[]',
            performance          JSONB NOT NULL DEFAULT '{}',
            trained_at           TIMESTAMPTZ,
            training_duration_ms INTEGER,
            error_message        TEXT,
            created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.execute(`CREATE INDEX IF NOT EXISTS org_ml_models_org_idx ON org_ml_models(organization_id)`);
}

export function generatePlainEnglishSummary(
    performance: OrgMLPerformance,
    config: OrgMLConfig,
    trainedAt: string | null
): string {
    if (!trainedAt || performance.items_covered === 0) {
        return 'This organization has no trained model yet. Click "Train Model" to analyze historical consumption patterns and generate per-item predictions.';
    }

    const MODEL_LABELS: Record<MLModelType, string> = {
        SMA: 'Simple Moving Average',
        EMA: 'Exponential Moving Average',
        WMA: 'Weighted Moving Average',
        LINEAR_REGRESSION: 'Linear Regression',
    };

    const confidenceLabel =
        performance.confidence_score >= 80 ? 'high' :
        performance.confidence_score >= 60 ? 'moderate' :
        performance.confidence_score >= 40 ? 'fair' : 'low';

    const r2Label =
        performance.avg_r2 >= 0.7 ? 'strong' :
        performance.avg_r2 >= 0.4 ? 'moderate' : 'weak';

    const trainDate = new Date(trainedAt).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
    });

    let s = `Trained on ${performance.total_data_points.toLocaleString()} consumption events across `;
    s += `${performance.items_covered} of ${performance.total_items} items (${performance.coverage_pct}% coverage) `;
    s += `using the last ${config.training_window_days} days of activity data. `;
    s += `The ${MODEL_LABELS[performance.model_used] ?? performance.model_used} model shows ${r2Label} trend correlation `;
    s += `(R² = ${performance.avg_r2.toFixed(2)}), giving an overall prediction confidence of ${confidenceLabel} `;
    s += `(${performance.confidence_score}/100). `;

    if (performance.total_items > performance.items_covered) {
        const uncovered = performance.total_items - performance.items_covered;
        s += `${uncovered} item${uncovered !== 1 ? 's' : ''} lack${uncovered === 1 ? 's' : ''} sufficient history `;
        s += `(fewer than ${config.min_data_points} recorded events) and will use global default rates instead. `;
    }

    s += `Last trained: ${trainDate}.`;
    return s;
}

export async function trainOrgModel(
    orgId: number,
    config: OrgMLConfig
): Promise<{ params: ItemMLParams[]; performance: OrgMLPerformance }> {
    const logs = await db.query(
        `SELECT
            COALESCE(
                (details->>'item_id')::integer,
                (details->>'itemId')::integer
            ) AS item_id,
            ABS(COALESCE(
                (details->>'quantity')::float,
                (details->>'change')::float,
                (details->>'qty')::float,
                0
            )) AS qty,
            DATE(timestamp) AS day
         FROM activity_logs
         WHERE organization_id = $1
           AND timestamp >= NOW() - ($2 || ' days')::interval
           AND action IN (
               'SUBTRACT_STOCK','CONSUME','CONSUME_STOCK','inventory_adjustment',
               'stock_adjust','AUDIT','stock_out','USE_STOCK'
           )
           AND COALESCE(
               (details->>'item_id')::integer,
               (details->>'itemId')::integer
           ) IS NOT NULL
           AND ABS(COALESCE(
               (details->>'quantity')::float,
               (details->>'change')::float,
               (details->>'qty')::float,
               0
           )) > 0
         ORDER BY item_id, day`,
        [orgId, config.training_window_days]
    );

    const byItem: Record<number, Record<string, number>> = {};
    for (const row of logs) {
        if (!row.item_id) continue;
        const day = row.day instanceof Date
            ? row.day.toISOString().slice(0, 10)
            : String(row.day).slice(0, 10);
        if (!byItem[row.item_id]) byItem[row.item_id] = {};
        byItem[row.item_id][day] = (byItem[row.item_id][day] || 0) + (row.qty || 0);
    }

    const itemIds = Object.keys(byItem).map(Number);
    const itemNames: Record<number, string> = {};
    if (itemIds.length > 0) {
        const nameRows = await db.query(
            `SELECT id, name FROM inventory WHERE id = ANY($1) AND organization_id = $2`,
            [itemIds, orgId]
        );
        for (const r of nameRows) itemNames[r.id] = r.name;
    }

    const countRow = await db.one(
        `SELECT COUNT(*) AS total FROM inventory WHERE organization_id = $1`,
        [orgId]
    );
    const totalItems = parseInt(countRow?.total || '0');

    const params: ItemMLParams[] = [];
    let totalDataPoints = 0;
    const r2Values: number[] = [];

    for (const [itemIdStr, dayMap] of Object.entries(byItem)) {
        const itemId = Number(itemIdStr);
        const days = Object.keys(dayMap).sort();
        const values = days.map(d => dayMap[d]);

        if (values.length < config.min_data_points) continue;

        totalDataPoints += values.length;
        const rate = burnRate(values, config, config.smart_order_model);
        const { slope, r2 } = linearRegression(values);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;

        r2Values.push(Math.max(0, r2));

        params.push({
            item_id: itemId,
            item_name: itemNames[itemId] || `Item #${itemId}`,
            burn_rate: Math.round(rate * 100) / 100,
            slope: Math.round(slope * 10000) / 10000,
            r2: Math.round(Math.max(0, r2) * 1000) / 1000,
            mean_daily: Math.round(mean * 100) / 100,
            std_dev: Math.round(Math.sqrt(variance) * 100) / 100,
            data_points: values.length,
            first_day: days[0],
            last_day: days[days.length - 1],
            forecast_next_7: Math.round(rate * 7 * 100) / 100,
            forecast_next_30: Math.round(rate * 30 * 100) / 100,
        });
    }

    params.sort((a, b) => b.burn_rate - a.burn_rate);

    const itemsCovered = params.length;
    const coveragePct = totalItems > 0 ? Math.round((itemsCovered / totalItems) * 100) : 0;
    const avgR2 = r2Values.length > 0
        ? r2Values.reduce((a, b) => a + b, 0) / r2Values.length
        : 0;
    const confidenceScore = Math.min(100, Math.round(coveragePct * 0.5 + avgR2 * 100 * 0.5));

    return {
        params,
        performance: {
            items_covered: itemsCovered,
            total_items: totalItems,
            coverage_pct: coveragePct,
            total_data_points: totalDataPoints,
            avg_r2: Math.round(avgR2 * 1000) / 1000,
            confidence_score: confidenceScore,
            training_window_days: config.training_window_days,
            model_used: config.smart_order_model,
        },
    };
}
