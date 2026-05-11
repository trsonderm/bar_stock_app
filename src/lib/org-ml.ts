import { db } from './db';
import { MLModelType, burnRate, linearRegression } from './ml';
export {
    OrgMLConfig, DEFAULT_ORG_ML_CONFIG,
    ItemMLParams, HoldoutMetrics, OrgMLPerformance,
    OrgMLStatus, HistoryEntry,
} from './org-ml-types';
import type {
    OrgMLConfig, ItemMLParams, HoldoutMetrics, OrgMLPerformance,
} from './org-ml-types';

// ── DB setup ──────────────────────────────────────────────────────────────────

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

    await db.execute(`
        CREATE TABLE IF NOT EXISTS org_ml_model_history (
            id                   SERIAL PRIMARY KEY,
            organization_id      INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            status               VARCHAR(20) NOT NULL DEFAULT 'trained',
            config               JSONB NOT NULL DEFAULT '{}',
            performance          JSONB NOT NULL DEFAULT '{}',
            comparison           JSONB,
            improvement_reasons  TEXT[] NOT NULL DEFAULT '{}',
            replaced_previous    BOOLEAN NOT NULL DEFAULT FALSE,
            trained_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            duration_ms          INTEGER
        )
    `);
    await db.execute(`CREATE INDEX IF NOT EXISTS org_ml_history_org_idx ON org_ml_model_history(organization_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS org_ml_history_at_idx  ON org_ml_model_history(trained_at DESC)`);
}

// ── Holdout validation ────────────────────────────────────────────────────────

function holdoutValidate(
    values: number[],
    config: OrgMLConfig
): { mape: number; mae: number } {
    const splitIdx = Math.max(2, Math.floor(values.length * (1 - config.holdout_fraction)));
    const trainData = values.slice(0, splitIdx);
    const testData = values.slice(splitIdx);

    if (trainData.length < 2 || testData.length === 0) return { mape: 0, mae: 0 };

    let mapeSum = 0, maeSum = 0, mapeCount = 0;
    const working = [...trainData];

    for (const actual of testData) {
        const pred = Math.max(0, burnRate(working, config, config.smart_order_model));
        const err = Math.abs(actual - pred);
        maeSum += err;
        if (actual > 0) { mapeSum += (err / actual) * 100; mapeCount++; }
        working.push(actual); // walk-forward with actuals
    }

    return {
        mape: mapeCount > 0 ? Math.round(mapeSum / mapeCount * 10) / 10 : 0,
        mae: Math.round(maeSum / testData.length * 100) / 100,
    };
}

// ── Improvement reason analysis ───────────────────────────────────────────────

export function generateImprovementReasons(
    newPerf: OrgMLPerformance,
    prevPerf: OrgMLPerformance | null,
    params: ItemMLParams[],
    config: OrgMLConfig
): string[] {
    const reasons: string[] = [];

    if (!prevPerf || prevPerf.items_covered === 0) {
        reasons.push(
            `Initial training complete: ${newPerf.items_covered} of ${newPerf.total_items} items ` +
            `analyzed across ${newPerf.total_data_points.toLocaleString()} consumption events.`
        );
    } else {
        const coverageDelta = newPerf.coverage_pct - prevPerf.coverage_pct;
        const r2Delta = newPerf.avg_r2 - prevPerf.avg_r2;
        const pointsDelta = newPerf.total_data_points - prevPerf.total_data_points;
        const mapeDelta = (newPerf.holdout?.mape ?? 0) - (prevPerf.holdout?.mape ?? 0);

        if (coverageDelta > 3) {
            reasons.push(
                `Coverage improved by ${coverageDelta}% (${prevPerf.coverage_pct}% → ${newPerf.coverage_pct}%) — ` +
                `${newPerf.items_covered - prevPerf.items_covered} item${newPerf.items_covered - prevPerf.items_covered !== 1 ? 's' : ''} ` +
                `gained enough transaction history.`
            );
        } else if (coverageDelta < -3) {
            reasons.push(
                `Coverage dropped by ${Math.abs(coverageDelta)}% (${prevPerf.coverage_pct}% → ${newPerf.coverage_pct}%) — ` +
                `items may have had low activity during the training window.`
            );
        }

        if (r2Delta > 0.04) {
            reasons.push(
                `Trend correlation improved (R² ${prevPerf.avg_r2.toFixed(2)} → ${newPerf.avg_r2.toFixed(2)}) — ` +
                `usage patterns have become more consistent and predictable.`
            );
        } else if (r2Delta < -0.04) {
            reasons.push(
                `Trend correlation weakened (R² ${prevPerf.avg_r2.toFixed(2)} → ${newPerf.avg_r2.toFixed(2)}) — ` +
                `recent demand is more irregular. Consider a shorter training window.`
            );
        }

        if (pointsDelta > 0) {
            reasons.push(
                `${pointsDelta.toLocaleString()} new consumption events incorporated since last training.`
            );
        } else if (pointsDelta < -50) {
            reasons.push(
                `${Math.abs(pointsDelta).toLocaleString()} fewer events in window — older data has aged out of the ${config.training_window_days}-day window.`
            );
        }

        if (newPerf.holdout && prevPerf.holdout && newPerf.holdout.items_tested > 0) {
            if (mapeDelta < -3) {
                reasons.push(
                    `Holdout accuracy improved: MAPE dropped from ${prevPerf.holdout.mape.toFixed(1)}% to ${newPerf.holdout.mape.toFixed(1)}%.`
                );
            } else if (mapeDelta > 3) {
                reasons.push(
                    `Holdout accuracy degraded: MAPE rose from ${prevPerf.holdout.mape.toFixed(1)}% to ${newPerf.holdout.mape.toFixed(1)}%.`
                );
            }
        }
    }

    // Per-item pattern analysis (always)
    const highVariance = params.filter(p => p.std_dev > p.mean_daily * 1.5 && p.mean_daily > 0.1);
    if (highVariance.length > 0) {
        const names = highVariance.slice(0, 3).map(p => p.item_name).join(', ');
        reasons.push(
            `${highVariance.length} item${highVariance.length !== 1 ? 's' : ''} have highly variable usage ` +
            `(σ > 150% of mean): ${names}${highVariance.length > 3 ? ` +${highVariance.length - 3} more` : ''}. ` +
            `IQR anomaly detection is recommended for these.`
        );
    }

    const trendingDown = params.filter(p => p.slope < -0.08);
    if (trendingDown.length > 0) {
        const names = trendingDown.slice(0, 3).map(p => p.item_name).join(', ');
        reasons.push(
            `${trendingDown.length} item${trendingDown.length !== 1 ? 's' : ''} show declining consumption trends ` +
            `(slope < −0.08/day): ${names}.`
        );
    }

    const trendingUp = params.filter(p => p.slope > 0.08);
    if (trendingUp.length > 0) {
        const names = trendingUp.slice(0, 3).map(p => p.item_name).join(', ');
        reasons.push(
            `${trendingUp.length} item${trendingUp.length !== 1 ? 's' : ''} show rising consumption trends ` +
            `(slope > 0.08/day): ${names}. EMA or Linear Regression may improve accuracy.`
        );
    }

    const lowR2 = params.filter(p => p.r2 < 0.2 && p.data_points >= 10);
    if (lowR2.length > 0) {
        reasons.push(
            `${lowR2.length} item${lowR2.length !== 1 ? 's' : ''} have low predictability (R² < 0.2) — ` +
            `sporadic demand may respond better to a shorter SMA window.`
        );
    }

    return reasons;
}

// ── Plain-English summary ─────────────────────────────────────────────────────

export function generatePlainEnglishSummary(
    performance: OrgMLPerformance,
    config: OrgMLConfig,
    trainedAt: string | null
): string {
    if (!trainedAt || !performance?.items_covered) {
        return 'This organization has no trained model yet. Click "Train Model" to analyze historical consumption patterns and generate per-item predictions.';
    }

    const MODEL_LABELS: Record<MLModelType, string> = {
        SMA: 'Simple Moving Average',
        EMA: 'Exponential Moving Average',
        WMA: 'Weighted Moving Average',
        LINEAR_REGRESSION: 'Linear Regression',
    };

    const confLabel = performance.confidence_score >= 80 ? 'high' : performance.confidence_score >= 60 ? 'moderate' : performance.confidence_score >= 40 ? 'fair' : 'low';
    const r2Label   = performance.avg_r2 >= 0.7 ? 'strong' : performance.avg_r2 >= 0.4 ? 'moderate' : 'weak';
    const trainDate = new Date(trainedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    let s = `Trained on ${performance.total_data_points.toLocaleString()} consumption events across `;
    s += `${performance.items_covered} of ${performance.total_items} items (${performance.coverage_pct}% coverage) `;
    s += `using the last ${config.training_window_days} days of activity. `;
    s += `The ${MODEL_LABELS[performance.model_used] ?? performance.model_used} model shows ${r2Label} trend correlation `;
    s += `(R² = ${performance.avg_r2.toFixed(2)}), giving ${confLabel} overall confidence (${performance.confidence_score}/100). `;

    if (performance.holdout?.items_tested > 0) {
        const acc = performance.holdout.accuracy_pct;
        s += `Holdout validation across ${performance.holdout.items_tested} items shows ${acc.toFixed(1)}% accuracy `;
        s += `(MAPE = ${performance.holdout.mape.toFixed(1)}%). `;
    }

    const uncovered = performance.total_items - performance.items_covered;
    if (uncovered > 0) {
        s += `${uncovered} item${uncovered !== 1 ? 's' : ''} lack${uncovered === 1 ? 's' : ''} sufficient history `;
        s += `(< ${config.min_data_points} events) and fall back to global defaults. `;
    }

    s += `Last trained: ${trainDate}.`;
    return s;
}

// ── Core training function ────────────────────────────────────────────────────

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
    let mapeSum = 0, maeSum = 0, holdoutCount = 0;

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

        // Holdout validation for items with enough data
        let itemMape = 0, itemMae = 0;
        if (values.length >= Math.ceil(config.min_data_points / (1 - config.holdout_fraction)) + 1) {
            const hv = holdoutValidate(values, config);
            itemMape = hv.mape;
            itemMae = hv.mae;
            mapeSum += hv.mape;
            maeSum += hv.mae;
            holdoutCount++;
        }

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
            forecast_next_7:  Math.round(rate * 7  * 100) / 100,
            forecast_next_30: Math.round(rate * 30 * 100) / 100,
            mape: itemMape,
            mae: itemMae,
        });
    }

    params.sort((a, b) => b.burn_rate - a.burn_rate);

    const itemsCovered  = params.length;
    const coveragePct   = totalItems > 0 ? Math.round((itemsCovered / totalItems) * 100) : 0;
    const avgR2         = r2Values.length > 0 ? r2Values.reduce((a, b) => a + b, 0) / r2Values.length : 0;
    const avgMape       = holdoutCount > 0 ? Math.round(mapeSum / holdoutCount * 10) / 10 : 0;
    const avgMae        = holdoutCount > 0 ? Math.round(maeSum / holdoutCount * 100) / 100 : 0;
    const accuracyPct   = Math.max(0, Math.min(100, Math.round((100 - avgMape) * 10) / 10));
    const confidenceScore = Math.min(100, Math.round(
        coveragePct * 0.35 +
        avgR2 * 100 * 0.35 +
        accuracyPct * 0.30
    ));

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
            holdout: {
                mape: avgMape,
                mae: avgMae,
                items_tested: holdoutCount,
                accuracy_pct: accuracyPct,
            },
        },
    };
}
