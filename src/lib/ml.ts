export type MLModelType = 'SMA' | 'EMA' | 'WMA' | 'LINEAR_REGRESSION';

export interface MLModelConfig {
  enabled_models: MLModelType[];
  smart_order_model: MLModelType;
  sma_window: number;
  ema_alpha: number;
  wma_window: number;
  lr_window: number;
  forecast_days: number;
  training_window_days: number;
  min_data_points: number;
  anomaly_z_threshold: number;
  anomaly_iqr_enabled: boolean;
  insights_model: MLModelType;
}

export const DEFAULT_ML_CONFIG: MLModelConfig = {
  enabled_models: ['SMA', 'EMA', 'WMA', 'LINEAR_REGRESSION'],
  smart_order_model: 'SMA',
  sma_window: 7,
  ema_alpha: 0.3,
  wma_window: 7,
  lr_window: 30,
  forecast_days: 30,
  training_window_days: 90,
  min_data_points: 5,
  anomaly_z_threshold: 2.0,
  anomaly_iqr_enabled: true,
  insights_model: 'EMA',
};

export function computeSMA(values: number[], window: number): number {
  if (values.length === 0) return 0;
  const slice = values.slice(-window);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export function computeEMA(values: number[], alpha: number): number {
  if (values.length === 0) return 0;
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = alpha * values[i] + (1 - alpha) * ema;
  }
  return ema;
}

export function computeWMA(values: number[], window: number): number {
  if (values.length === 0) return 0;
  const slice = values.slice(-window);
  const n = slice.length;
  let weightedSum = 0;
  let weightTotal = 0;
  for (let i = 0; i < n; i++) {
    const weight = i + 1;
    weightedSum += slice[i] * weight;
    weightTotal += weight;
  }
  return weightTotal > 0 ? weightedSum / weightTotal : 0;
}

export function linearRegression(values: number[]): { slope: number; intercept: number; r2: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0, r2: 0 };

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  const meanY = sumY / n;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) {
    ssTot += (values[i] - meanY) ** 2;
    ssRes += (values[i] - (slope * i + intercept)) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  return { slope, intercept, r2 };
}

export function burnRate(values: number[], config: MLModelConfig, model?: MLModelType): number {
  const m = model ?? config.smart_order_model;
  if (values.length < config.min_data_points) {
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  }
  switch (m) {
    case 'SMA': return computeSMA(values, config.sma_window);
    case 'EMA': return computeEMA(values, config.ema_alpha);
    case 'WMA': return computeWMA(values, config.wma_window);
    case 'LINEAR_REGRESSION': {
      const { slope, intercept } = linearRegression(values.slice(-config.lr_window));
      const nextIdx = Math.min(values.length, config.lr_window);
      return Math.max(0, slope * nextIdx + intercept);
    }
    default: return computeSMA(values, config.sma_window);
  }
}

export interface AnomalyPoint {
  index: number;
  value: number;
  zScore: number;
  direction: 'spike' | 'drop';
}

export function detectAnomalies(
  values: number[],
  threshold: number
): { anomalies: AnomalyPoint[]; mean: number; stdDev: number } {
  if (values.length < 2) return { anomalies: [], mean: values[0] ?? 0, stdDev: 0 };

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);

  const anomalies: AnomalyPoint[] = [];
  if (stdDev === 0) return { anomalies, mean, stdDev };

  for (let i = 0; i < values.length; i++) {
    const zScore = Math.abs(values[i] - mean) / stdDev;
    if (zScore > threshold) {
      anomalies.push({
        index: i,
        value: values[i],
        zScore,
        direction: values[i] > mean ? 'spike' : 'drop',
      });
    }
  }
  return { anomalies, mean, stdDev };
}

export function detectOutliersIQR(values: number[]): number[] {
  if (values.length < 4) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;
  return values.filter(v => v < lower || v > upper);
}

export function dowPattern(
  dateValues: { date: string; value: number }[]
): Record<number, { mean: number; count: number }> {
  const buckets: Record<number, { sum: number; count: number }> = {};
  for (const { date, value } of dateValues) {
    const dow = new Date(date).getDay();
    if (!buckets[dow]) buckets[dow] = { sum: 0, count: 0 };
    buckets[dow].sum += value;
    buckets[dow].count += 1;
  }
  const result: Record<number, { mean: number; count: number }> = {};
  for (const [dow, { sum, count }] of Object.entries(buckets)) {
    result[Number(dow)] = { mean: count > 0 ? sum / count : 0, count };
  }
  return result;
}

export function forecastNext(
  values: number[],
  config: MLModelConfig,
  model?: MLModelType,
  steps?: number
): number[] {
  const m = model ?? config.smart_order_model;
  const s = steps ?? config.forecast_days;
  const result: number[] = [];
  const working = [...values];

  for (let i = 0; i < s; i++) {
    const next = Math.max(0, burnRate(working, config, m));
    result.push(next);
    working.push(next);
  }
  return result;
}
