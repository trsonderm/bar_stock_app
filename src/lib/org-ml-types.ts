import { MLModelConfig, DEFAULT_ML_CONFIG, MLModelType } from './ml';

export type { MLModelType };

export interface OrgMLConfig extends MLModelConfig {
    auto_retrain: boolean;
    auto_retrain_interval_days: number;
    holdout_fraction: number;
    replacement_threshold: number;
    comparison_mode: boolean;
}

export const DEFAULT_ORG_ML_CONFIG: OrgMLConfig = {
    ...DEFAULT_ML_CONFIG,
    auto_retrain: false,
    auto_retrain_interval_days: 30,
    holdout_fraction: 0.2,
    replacement_threshold: 2,
    comparison_mode: true,
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
    mape: number;
    mae: number;
}

export interface HoldoutMetrics {
    mape: number;
    mae: number;
    items_tested: number;
    accuracy_pct: number;
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
    holdout: HoldoutMetrics;
}

export type OrgMLStatus = 'untrained' | 'training' | 'trained' | 'failed';

export interface HistoryEntry {
    id: number;
    organization_id: number;
    status: 'trained' | 'failed' | 'rejected';
    config: OrgMLConfig;
    performance: OrgMLPerformance;
    comparison: {
        confidence_delta: number;
        r2_delta: number;
        coverage_delta: number;
        mape_delta: number;
        replaced: boolean;
        reason: string;
    } | null;
    improvement_reasons: string[];
    trained_at: string;
    duration_ms: number;
}
