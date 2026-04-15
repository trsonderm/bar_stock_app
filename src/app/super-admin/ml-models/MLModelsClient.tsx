'use client';
import { useState, useEffect } from 'react';
import { DEFAULT_ML_CONFIG, MLModelConfig, MLModelType } from '@/lib/ml';

const MODEL_INFO: Record<MLModelType, { label: string; description: string }> = {
  SMA: {
    label: 'Simple Moving Average',
    description: 'Averages the last N days of usage. Best for stable, consistent demand.',
  },
  EMA: {
    label: 'Exponential Moving Average',
    description: 'Weights recent data higher. Best for trending or changing demand.',
  },
  WMA: {
    label: 'Weighted Moving Average',
    description: 'Linear weights, most recent day highest. Balanced approach.',
  },
  LINEAR_REGRESSION: {
    label: 'Linear Regression',
    description: 'Fits a trend line to historical data. Best for long-term trending items.',
  },
};

const ALL_MODELS: MLModelType[] = ['SMA', 'EMA', 'WMA', 'LINEAR_REGRESSION'];

function SliderRow({
  label, value, min, max, step = 1, onChange, hint,
}: {
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center">
        <label className="text-sm font-medium text-gray-300">{label}</label>
        <span className="text-sm font-bold text-white bg-gray-700 px-2 py-0.5 rounded">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-blue-500"
      />
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

export default function MLModelsClient() {
  const [config, setConfig] = useState<MLModelConfig>(DEFAULT_ML_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/super-admin/ml-models')
      .then(r => r.json())
      .then(d => {
        if (d.config) setConfig({ ...DEFAULT_ML_CONFIG, ...d.config });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof MLModelConfig>(key: K, val: MLModelConfig[K]) =>
    setConfig(prev => ({ ...prev, [key]: val }));

  const toggleModel = (m: MLModelType) => {
    const current = config.enabled_models;
    if (current.includes(m)) {
      if (current.length <= 1) return; // at least one
      const next = current.filter(x => x !== m);
      // fix defaults if removed
      const nextConfig: Partial<MLModelConfig> = { enabled_models: next };
      if (!next.includes(config.smart_order_model)) nextConfig.smart_order_model = next[0];
      if (!next.includes(config.insights_model)) nextConfig.insights_model = next[0];
      setConfig(prev => ({ ...prev, ...nextConfig }));
    } else {
      set('enabled_models', [...current, m]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await fetch('/api/super-admin/ml-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        const d = await res.json();
        setError(d.error || 'Failed to save');
      }
    } catch (e) {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-slate-400 animate-pulse">Loading ML configuration...</div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          ML Model Configuration
        </h1>
        <p className="text-slate-400 mt-1 text-sm">
          Configure the machine learning models used for predictive ordering and insights analysis across all organizations.
        </p>
      </div>

      {/* Current Status Card */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 mb-8 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Smart Order Model</p>
          <p className="font-bold text-white">{MODEL_INFO[config.smart_order_model]?.label ?? config.smart_order_model}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Insights Model</p>
          <p className="font-bold text-white">{MODEL_INFO[config.insights_model]?.label ?? config.insights_model}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Forecast Horizon</p>
          <p className="font-bold text-white">{config.forecast_days} days</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Anomaly Detection</p>
          <p className="font-bold text-white">Z ≥ {config.anomaly_z_threshold}</p>
        </div>
      </div>

      <div className="space-y-8">
        {/* 1. Active Models */}
        <section className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-bold text-white mb-1">Active Models</h2>
          <p className="text-slate-400 text-sm mb-5">At least one model must remain enabled. Disabled models will not appear as options in dropdowns.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ALL_MODELS.map(m => {
              const enabled = config.enabled_models.includes(m);
              return (
                <label
                  key={m}
                  className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
                    enabled ? 'border-blue-600/60 bg-blue-900/10' : 'border-slate-700 bg-slate-900/40 opacity-60'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={() => toggleModel(m)}
                    className="mt-1 accent-blue-500 w-4 h-4"
                  />
                  <div>
                    <p className="font-semibold text-white text-sm">{MODEL_INFO[m].label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{MODEL_INFO[m].description}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </section>

        {/* 2. Default Models */}
        <section className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-bold text-white mb-1">Default Models</h2>
          <p className="text-slate-400 text-sm mb-5">Select the default model used per feature. Only enabled models are available.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Smart Order Default Model</label>
              <select
                value={config.smart_order_model}
                onChange={e => set('smart_order_model', e.target.value as MLModelType)}
                className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
              >
                {config.enabled_models.map(m => (
                  <option key={m} value={m}>{MODEL_INFO[m].label}</option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">Used in predictive ordering suggestions</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Insights Analysis Model</label>
              <select
                value={config.insights_model}
                onChange={e => set('insights_model', e.target.value as MLModelType)}
                className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
              >
                {config.enabled_models.map(m => (
                  <option key={m} value={m}>{MODEL_INFO[m].label}</option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">Used in the Insights dashboard burn rate calculation</p>
            </div>
          </div>
        </section>

        {/* 3. Model Parameters */}
        <section className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-bold text-white mb-1">Model Parameters</h2>
          <p className="text-slate-400 text-sm mb-5">Tune each enabled model's parameters. Changes take effect on next data fetch.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {config.enabled_models.includes('SMA') && (
              <div className="bg-slate-900/60 rounded-xl p-5 border border-slate-700">
                <h3 className="font-bold text-blue-400 mb-4 text-sm uppercase tracking-wider">SMA — Simple Moving Average</h3>
                <SliderRow
                  label="Window Size (days)"
                  value={config.sma_window}
                  min={3}
                  max={30}
                  onChange={v => set('sma_window', v)}
                  hint="Number of days to average"
                />
              </div>
            )}
            {config.enabled_models.includes('EMA') && (
              <div className="bg-slate-900/60 rounded-xl p-5 border border-slate-700">
                <h3 className="font-bold text-purple-400 mb-4 text-sm uppercase tracking-wider">EMA — Exponential Moving Average</h3>
                <SliderRow
                  label="Alpha (smoothing factor)"
                  value={config.ema_alpha}
                  min={0.05}
                  max={0.95}
                  step={0.05}
                  onChange={v => set('ema_alpha', v)}
                  hint="Higher = faster response to recent changes"
                />
              </div>
            )}
            {config.enabled_models.includes('WMA') && (
              <div className="bg-slate-900/60 rounded-xl p-5 border border-slate-700">
                <h3 className="font-bold text-green-400 mb-4 text-sm uppercase tracking-wider">WMA — Weighted Moving Average</h3>
                <SliderRow
                  label="Window Size (days)"
                  value={config.wma_window}
                  min={3}
                  max={30}
                  onChange={v => set('wma_window', v)}
                  hint="Most recent day gets highest weight"
                />
              </div>
            )}
            {config.enabled_models.includes('LINEAR_REGRESSION') && (
              <div className="bg-slate-900/60 rounded-xl p-5 border border-slate-700">
                <h3 className="font-bold text-yellow-400 mb-4 text-sm uppercase tracking-wider">Linear Regression</h3>
                <SliderRow
                  label="Training Window (days)"
                  value={config.lr_window}
                  min={14}
                  max={180}
                  onChange={v => set('lr_window', v)}
                  hint="Days of history used to fit the trend line"
                />
              </div>
            )}
          </div>
        </section>

        {/* 4. General Settings */}
        <section className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-bold text-white mb-5">General Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SliderRow
              label="Forecast Horizon (days)"
              value={config.forecast_days}
              min={7}
              max={90}
              onChange={v => set('forecast_days', v)}
              hint="How far ahead to predict usage"
            />
            <SliderRow
              label="Training Window (days)"
              value={config.training_window_days}
              min={30}
              max={365}
              onChange={v => set('training_window_days', v)}
              hint="Historical data window for model training"
            />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-300">Minimum Data Points</label>
              <input
                type="number"
                min={1}
                max={30}
                value={config.min_data_points}
                onChange={e => set('min_data_points', Number(e.target.value))}
                className="bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm w-32"
              />
              <p className="text-xs text-slate-500">Minimum days of data before model activates</p>
            </div>
          </div>
        </section>

        {/* 5. Anomaly Detection */}
        <section className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-bold text-white">Anomaly Detection</h2>
              <p className="text-slate-400 text-sm mt-0.5">Configure how usage anomalies are detected in the Insights dashboard.</p>
            </div>
          </div>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-slate-300">Z-Score Threshold</label>
                <span className="text-sm font-bold text-white bg-slate-700 px-2 py-0.5 rounded">{config.anomaly_z_threshold}</span>
              </div>
              <input
                type="range"
                min={1.0}
                max={4.0}
                step={0.1}
                value={config.anomaly_z_threshold}
                onChange={e => set('anomaly_z_threshold', Number(e.target.value))}
                className="w-full accent-orange-500"
              />
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>1.0 — More sensitive</span>
                <span>4.0 — Less sensitive</span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Lower values flag more events as anomalies. Recommended: 2.0 for most use cases.
              </p>
            </div>

            <label className="flex items-center gap-3 cursor-pointer group">
              <div
                onClick={() => set('anomaly_iqr_enabled', !config.anomaly_iqr_enabled)}
                className={`relative w-11 h-6 rounded-full transition-colors ${config.anomaly_iqr_enabled ? 'bg-blue-600' : 'bg-slate-600'}`}
              >
                <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${config.anomaly_iqr_enabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-300">IQR Detection (fallback)</p>
                <p className="text-xs text-slate-500">Use interquartile range method for datasets with fewer than {config.min_data_points} data points</p>
              </div>
            </label>
          </div>
        </section>
      </div>

      {/* Save Button */}
      <div className="mt-8 flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white px-8 py-3 rounded-xl font-bold text-sm transition-colors shadow-lg shadow-blue-500/20"
        >
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
        {saved && (
          <span className="text-green-400 text-sm font-semibold flex items-center gap-1.5">
            ✓ Configuration saved successfully
          </span>
        )}
        {error && (
          <span className="text-red-400 text-sm font-semibold">{error}</span>
        )}
      </div>
    </div>
  );
}
