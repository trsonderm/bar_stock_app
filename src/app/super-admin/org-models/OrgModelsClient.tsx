'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    LineChart, Line, AreaChart, Area, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import {
    Brain, ChevronDown, ChevronRight, RefreshCw, Trash2, Zap, CheckCircle,
    AlertCircle, Clock, HelpCircle, TrendingUp, TrendingDown, BarChart3,
    Settings2, Database, History, ListChecks, AlertTriangle, Target,
} from 'lucide-react';
import { DEFAULT_ORG_ML_CONFIG, OrgMLConfig, ItemMLParams, OrgMLPerformance, OrgMLStatus, HistoryEntry, MLModelType } from '@/lib/org-ml-types';

// ── Types ──────────────────────────────────────────────────────────────────

interface OrgRow {
    id: number;
    name: string;
    billing_status: string;
    disabled: boolean;
    status: OrgMLStatus;
    trained_at: string | null;
    training_duration_ms: number | null;
    performance: Partial<OrgMLPerformance>;
    config: OrgMLConfig;
    error_message: string | null;
}

interface PageSummary { total: number; trained: number; untrained: number; failed: number; avg_coverage_pct: number }

interface DetailData {
    params: ItemMLParams[];
    performance: OrgMLPerformance;
    plain_english: string;
    config: OrgMLConfig;
    trained_at: string | null;
    training_duration_ms: number | null;
    error_message: string | null;
}

interface ChartPoint {
    date: string; trained_at: string;
    confidence: number | null; coverage: number | null;
    r2: number | null; mape: number | null; accuracy: number | null;
    data_points: number | null; replaced: boolean; status: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const MODEL_INFO: Record<MLModelType, { label: string; color: string }> = {
    SMA: { label: 'Simple MA', color: 'text-blue-400' },
    EMA: { label: 'Exponential MA', color: 'text-purple-400' },
    WMA: { label: 'Weighted MA', color: 'text-green-400' },
    LINEAR_REGRESSION: { label: 'Linear Regression', color: 'text-yellow-400' },
};
const ALL_MODELS: MLModelType[] = ['SMA', 'EMA', 'WMA', 'LINEAR_REGRESSION'];

function StatusBadge({ status }: { status: OrgMLStatus | 'rejected' }) {
    const map: Record<string, { label: string; cls: string; Icon: any }> = {
        trained:   { label: 'Trained',   cls: 'bg-emerald-900/40 text-emerald-400 border-emerald-700/40', Icon: CheckCircle },
        training:  { label: 'Training…', cls: 'bg-blue-900/40 text-blue-400 border-blue-700/40 animate-pulse', Icon: RefreshCw },
        failed:    { label: 'Failed',    cls: 'bg-red-900/40 text-red-400 border-red-700/40',     Icon: AlertCircle },
        untrained: { label: 'Untrained', cls: 'bg-slate-800 text-slate-400 border-slate-700',     Icon: HelpCircle },
        rejected:  { label: 'Rejected',  cls: 'bg-amber-900/40 text-amber-400 border-amber-700/40', Icon: AlertTriangle },
    };
    const { label, cls, Icon } = map[status] ?? map.untrained;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${cls}`}>
            <Icon className="w-3 h-3" />{label}
        </span>
    );
}

function ConfidenceBar({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' }) {
    const color = score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-blue-500' : score >= 40 ? 'bg-amber-500' : 'bg-red-500';
    const h = size === 'sm' ? 'h-1' : 'h-1.5';
    return (
        <div className="flex items-center gap-2">
            <div className={`flex-1 ${h} bg-slate-700 rounded-full overflow-hidden`}>
                <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
            </div>
            <span className="text-xs text-slate-400 w-8 text-right tabular-nums">{score}/100</span>
        </div>
    );
}

const ChartTooltipStyle = {
    contentStyle: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 },
    labelStyle: { color: '#94a3b8' },
    itemStyle: { color: '#e2e8f0' },
};

function SliderRow({ label, value, min, max, step = 1, onChange, hint }: {
    label: string; value: number; min: number; max: number; step?: number;
    onChange: (v: number) => void; hint?: string;
}) {
    return (
        <div className="flex flex-col gap-1">
            <div className="flex justify-between">
                <label className="text-xs font-medium text-slate-300">{label}</label>
                <span className="text-xs font-bold text-white bg-slate-700 px-2 py-0.5 rounded tabular-nums">{value}</span>
            </div>
            <input type="range" min={min} max={max} step={step} value={value}
                onChange={e => onChange(Number(e.target.value))}
                aria-label={label} title={label}
                className="w-full accent-blue-500 h-1" />
            {hint && <p className="text-xs text-slate-500">{hint}</p>}
        </div>
    );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
    return (
        <label className="flex items-center gap-2 cursor-pointer select-none">
            <div onClick={onChange}
                className={`relative w-8 h-4 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-slate-600'}`}>
                <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : ''}`} />
            </div>
            <span className="text-xs text-slate-400">{label}</span>
        </label>
    );
}

// ── Overview charts ────────────────────────────────────────────────────────

function OrgHistoryCharts({ orgId }: { orgId: number }) {
    const [chartData, setChartData] = useState<ChartPoint[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`/api/super-admin/org-models/${orgId}/history?limit=20`)
            .then(r => r.json())
            .then(d => setChartData(d.chart_data ?? []))
            .finally(() => setLoading(false));
    }, [orgId]);

    if (loading) return <div className="text-xs text-slate-500 animate-pulse py-4">Loading history charts…</div>;
    if (chartData.length < 2) return (
        <div className="text-xs text-slate-500 py-4 text-center">
            Need at least 2 training runs to show trends. Train this model again to begin tracking.
        </div>
    );

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Confidence + Coverage */}
            <div className="bg-slate-900/60 rounded-xl border border-slate-700 p-4">
                <p className="text-xs font-semibold text-slate-300 mb-3">Confidence &amp; Coverage over Time</p>
                <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} />
                        <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} />
                        <Tooltip {...ChartTooltipStyle} />
                        <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                        <Line type="monotone" dataKey="confidence" name="Confidence" stroke="#3b82f6" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="coverage" name="Coverage %" stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* R² + Accuracy */}
            <div className="bg-slate-900/60 rounded-xl border border-slate-700 p-4">
                <p className="text-xs font-semibold text-slate-300 mb-3">Model Accuracy over Time</p>
                <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} />
                        <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} />
                        <Tooltip {...ChartTooltipStyle} formatter={(v: any, name: string) => [
                            name === 'R² (×100)' ? `${v}%` : `${v}%`, name
                        ]} />
                        <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                        <ReferenceLine y={70} stroke="#374151" strokeDasharray="3 3" />
                        <Line type="monotone" dataKey="r2" name="R² (×100)" stroke="#a855f7" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="accuracy" name="Holdout Accuracy %" stroke="#f59e0b" strokeWidth={2} dot={false} />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* MAPE bar chart */}
            <div className="bg-slate-900/60 rounded-xl border border-slate-700 p-4">
                <p className="text-xs font-semibold text-slate-300 mb-1">Prediction Error (MAPE) — lower is better</p>
                <p className="text-xs text-slate-500 mb-3">Mean Absolute Percentage Error from holdout validation</p>
                <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} />
                        <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                        <Tooltip {...ChartTooltipStyle} formatter={(v: any) => [`${v}%`, 'MAPE']} />
                        <Bar dataKey="mape" name="MAPE %" fill="#f97316" radius={[3, 3, 0, 0]}
                            label={false}
                            className=""
                        />
                        <ReferenceLine y={15} stroke="#ef4444" strokeDasharray="3 3" />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Data points area chart */}
            <div className="bg-slate-900/60 rounded-xl border border-slate-700 p-4">
                <p className="text-xs font-semibold text-slate-300 mb-3">Training Data Volume over Time</p>
                <ResponsiveContainer width="100%" height={140}>
                    <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                        <defs>
                            <linearGradient id="dpGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} />
                        <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                        <Tooltip {...ChartTooltipStyle} formatter={(v: any) => [v?.toLocaleString(), 'Events']} />
                        <Area type="monotone" dataKey="data_points" name="Events" stroke="#06b6d4" fill="url(#dpGrad)" strokeWidth={2} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

// ── History tab ────────────────────────────────────────────────────────────

function HistoryTab({ orgId }: { orgId: number }) {
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<number | null>(null);

    useEffect(() => {
        fetch(`/api/super-admin/org-models/${orgId}/history?limit=30`)
            .then(r => r.json())
            .then(d => setHistory(d.history ?? []))
            .finally(() => setLoading(false));
    }, [orgId]);

    if (loading) return <div className="text-slate-500 text-sm animate-pulse py-4">Loading history…</div>;
    if (!history.length) return <div className="text-slate-500 text-sm py-6 text-center">No training history yet.</div>;

    return (
        <div className="space-y-2">
            {history.map(h => {
                const isOpen = expanded === h.id;
                const perf = h.performance;
                return (
                    <div key={h.id} className="bg-slate-900/60 rounded-lg border border-slate-700 overflow-hidden">
                        <button type="button" onClick={() => setExpanded(isOpen ? null : h.id)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-left">
                            {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                    : <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
                            <span className="text-xs text-slate-400 w-36 shrink-0 tabular-nums">
                                {new Date(h.trained_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <StatusBadge status={h.status as any} />
                            {perf && (
                                <span className="text-xs text-slate-400 ml-2">
                                    conf <span className="text-white font-mono">{perf.confidence_score}</span>
                                    {' · '}cov <span className="text-white font-mono">{perf.coverage_pct}%</span>
                                    {' · '}R² <span className="text-white font-mono">{perf.avg_r2?.toFixed(2)}</span>
                                    {perf.holdout?.items_tested > 0 && (
                                        <> · MAPE <span className="text-white font-mono">{perf.holdout.mape?.toFixed(1)}%</span></>
                                    )}
                                </span>
                            )}
                            {h.replaced_previous && (
                                <span className="ml-auto text-xs text-emerald-400 bg-emerald-900/30 border border-emerald-700/40 px-2 py-0.5 rounded-full">
                                    ✓ Adopted
                                </span>
                            )}
                            {h.status === 'rejected' && (
                                <span className="ml-auto text-xs text-amber-400 bg-amber-900/30 border border-amber-700/40 px-2 py-0.5 rounded-full">
                                    ✗ Not adopted
                                </span>
                            )}
                            {h.duration_ms && (
                                <span className="text-xs text-slate-600 ml-auto shrink-0">{(h.duration_ms / 1000).toFixed(1)}s</span>
                            )}
                        </button>
                        {isOpen && (
                            <div className="border-t border-slate-700 px-4 py-3 space-y-3">
                                {h.comparison && (
                                    <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700">
                                        <p className="text-xs font-semibold text-slate-300 mb-2">Comparison Result</p>
                                        <p className="text-xs text-slate-400 mb-2">{h.comparison.reason}</p>
                                        <div className="grid grid-cols-4 gap-3">
                                            {[
                                                { label: 'Confidence Δ', val: h.comparison.confidence_delta, fmt: (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}` },
                                                { label: 'R² Δ',        val: h.comparison.r2_delta,         fmt: (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(3)}` },
                                                { label: 'Coverage Δ',  val: h.comparison.coverage_delta,   fmt: (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%` },
                                                { label: 'MAPE Δ',      val: h.comparison.mape_delta,       fmt: (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%` },
                                            ].map(({ label, val, fmt }) => (
                                                <div key={label}>
                                                    <p className="text-xs text-slate-500">{label}</p>
                                                    <p className={`text-sm font-bold tabular-nums ${
                                                        label === 'MAPE Δ'
                                                            ? val < 0 ? 'text-emerald-400' : val > 0 ? 'text-red-400' : 'text-slate-400'
                                                            : val > 0 ? 'text-emerald-400' : val < 0 ? 'text-red-400' : 'text-slate-400'
                                                    }`}>{fmt(val)}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {h.improvement_reasons?.length > 0 && (
                                    <div>
                                        <p className="text-xs font-semibold text-slate-300 mb-2">Analysis</p>
                                        <ul className="space-y-1">
                                            {h.improvement_reasons.map((r, i) => (
                                                <li key={i} className="text-xs text-slate-400 flex gap-2">
                                                    <span className="text-blue-500 shrink-0 mt-0.5">›</span>
                                                    {r}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                <div className="text-xs text-slate-600">
                                    Model: {h.config?.smart_order_model} · Window: {h.config?.training_window_days}d ·
                                    Holdout: {Math.round((h.config?.holdout_fraction ?? 0.2) * 100)}% ·
                                    Threshold: +{h.config?.replacement_threshold ?? 2}
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ── Per-item burn rate bar chart ───────────────────────────────────────────

function ItemsBurnChart({ params }: { params: ItemMLParams[] }) {
    const top = params.slice(0, 12).map(p => ({
        name: p.item_name.length > 14 ? p.item_name.slice(0, 13) + '…' : p.item_name,
        burn: p.burn_rate,
        forecast7: p.forecast_next_7,
    }));
    return (
        <ResponsiveContainer width="100%" height={200}>
            <BarChart data={top} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 90 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} width={90} />
                <Tooltip {...ChartTooltipStyle} formatter={(v: any, name: string) => [`${v} units`, name]} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                <Bar dataKey="burn" name="Daily burn rate" fill="#3b82f6" radius={[0, 3, 3, 0]} />
                <Bar dataKey="forecast7" name="7-day forecast" fill="#6366f1" radius={[0, 3, 3, 0]} />
            </BarChart>
        </ResponsiveContainer>
    );
}

// ── Config panel ───────────────────────────────────────────────────────────

function ConfigPanel({ orgId, cfg, setConf, toggleModel }: {
    orgId: number;
    cfg: OrgMLConfig;
    setConf: (k: keyof OrgMLConfig, v: any) => void;
    toggleModel: (m: MLModelType) => void;
}) {
    return (
        <div className="space-y-5">
            <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Active Models</p>
                <div className="flex flex-wrap gap-2">
                    {ALL_MODELS.map(m => {
                        const active = cfg.enabled_models?.includes(m);
                        return (
                            <button type="button" key={m} onClick={() => toggleModel(m)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${active ? 'bg-blue-900/40 border-blue-600/60 text-blue-300' : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'}`}>
                                <span className={MODEL_INFO[m].color}>{m}</span>
                                <span className="text-slate-500 ml-1">— {MODEL_INFO[m].label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-xs text-slate-400 block mb-1">Smart Order Model</label>
                    <select value={cfg.smart_order_model}
                        onChange={e => setConf('smart_order_model', e.target.value as MLModelType)}
                        title="Smart order model" aria-label="Smart order model"
                        className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-1.5 text-sm">
                        {cfg.enabled_models?.map(m => <option key={m} value={m}>{m} — {MODEL_INFO[m].label}</option>)}
                    </select>
                    <p className="text-xs text-slate-500 mt-1">Used for reorder predictions</p>
                </div>
                <div>
                    <label className="text-xs text-slate-400 block mb-1">Insights Model</label>
                    <select value={cfg.insights_model}
                        onChange={e => setConf('insights_model', e.target.value as MLModelType)}
                        title="Insights model" aria-label="Insights model"
                        className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-1.5 text-sm">
                        {cfg.enabled_models?.map(m => <option key={m} value={m}>{m} — {MODEL_INFO[m].label}</option>)}
                    </select>
                    <p className="text-xs text-slate-500 mt-1">Used in burn rate dashboard</p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-5">
                <SliderRow label="Training Window (days)" value={cfg.training_window_days} min={30} max={365}
                    onChange={v => setConf('training_window_days', v)} hint="Historical window used for training" />
                <SliderRow label="Forecast Horizon (days)" value={cfg.forecast_days} min={7} max={90}
                    onChange={v => setConf('forecast_days', v)} hint="How far ahead to predict" />
            </div>

            <div className="grid grid-cols-3 gap-4">
                <SliderRow label="SMA Window" value={cfg.sma_window} min={3} max={30}
                    onChange={v => setConf('sma_window', v)} hint="Days to average" />
                <SliderRow label="EMA Alpha" value={cfg.ema_alpha} min={0.05} max={0.95} step={0.05}
                    onChange={v => setConf('ema_alpha', v)} hint="Higher = more recent weight" />
                <SliderRow label="WMA Window" value={cfg.wma_window} min={3} max={30}
                    onChange={v => setConf('wma_window', v)} hint="Linear-weighted window" />
            </div>

            <div className="grid grid-cols-2 gap-5">
                <SliderRow label="LR Training Window" value={cfg.lr_window} min={14} max={180}
                    onChange={v => setConf('lr_window', v)} hint="Days used to fit trend line" />
                <div>
                    <label className="text-xs text-slate-400 block mb-1">Min Data Points</label>
                    <input type="number" min={1} max={30} value={cfg.min_data_points}
                        onChange={e => setConf('min_data_points', Number(e.target.value))}
                        aria-label="Minimum data points" title="Minimum data points"
                        className="bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-1.5 text-sm w-full" />
                    <p className="text-xs text-slate-500 mt-1">Min events to include an item</p>
                </div>
            </div>

            <div className="border-t border-slate-700 pt-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Anomaly Detection</p>
                <div className="grid grid-cols-2 gap-5">
                    <SliderRow label={`Z-Score Threshold`} value={cfg.anomaly_z_threshold} min={1.0} max={4.0} step={0.1}
                        onChange={v => setConf('anomaly_z_threshold', v)} hint="Lower = more sensitive" />
                    <div className="flex flex-col gap-2 pt-4">
                        <Toggle checked={cfg.anomaly_iqr_enabled} onChange={() => setConf('anomaly_iqr_enabled', !cfg.anomaly_iqr_enabled)}
                            label="IQR detection (sparse data fallback)" />
                    </div>
                </div>
            </div>

            <div className="border-t border-slate-700 pt-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Accuracy &amp; Retraining</p>
                <div className="grid grid-cols-2 gap-5">
                    <SliderRow label="Holdout Fraction" value={Math.round(cfg.holdout_fraction * 100)} min={10} max={30}
                        onChange={v => setConf('holdout_fraction', v / 100)}
                        hint="% of each series reserved for validation" />
                    <SliderRow label="Replacement Threshold (pts)" value={cfg.replacement_threshold} min={0} max={20}
                        onChange={v => setConf('replacement_threshold', v)}
                        hint="Min confidence gain required to adopt challenger" />
                </div>
                <div className="grid grid-cols-2 gap-5 mt-4">
                    <div className="flex flex-col gap-2">
                        <Toggle checked={cfg.comparison_mode} onChange={() => setConf('comparison_mode', !cfg.comparison_mode)}
                            label="Comparison mode (evaluate before replacing)" />
                        <Toggle checked={cfg.auto_retrain} onChange={() => setConf('auto_retrain', !cfg.auto_retrain)}
                            label="Auto-retrain on schedule" />
                    </div>
                    {cfg.auto_retrain && (
                        <div>
                            <label className="text-xs text-slate-400 block mb-1">Retrain every</label>
                            <select value={cfg.auto_retrain_interval_days}
                                onChange={e => setConf('auto_retrain_interval_days', Number(e.target.value))}
                                title="Auto-retrain interval in days" aria-label="Auto-retrain interval in days"
                                className="bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-1.5 text-sm">
                                {[7, 14, 30, 60, 90].map(d => <option key={d} value={d}>{d} days</option>)}
                            </select>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Expanded org sub-tabs ──────────────────────────────────────────────────

type OrgSubTab = 'summary' | 'charts' | 'config' | 'history' | 'items';

function ExpandedOrg({
    org, det, cfg, setConf, toggleModel,
    saving, training, wiping, actionMsg,
    onSave, onTrain, onWipe, onForceReplace,
}: {
    org: OrgRow;
    det: DetailData;
    cfg: OrgMLConfig;
    setConf: (k: keyof OrgMLConfig, v: any) => void;
    toggleModel: (m: MLModelType) => void;
    saving: boolean; training: boolean; wiping: boolean;
    actionMsg: { type: 'ok' | 'err'; text: string } | undefined;
    onSave: () => void;
    onTrain: (wipe?: boolean, forceReplace?: boolean) => void;
    onWipe: () => void;
    onForceReplace: () => void;
}) {
    const [subTab, setSubTab] = useState<OrgSubTab>('summary');
    const perf = det.performance;
    const SUB_TABS: { id: OrgSubTab; label: string; Icon: any }[] = [
        { id: 'summary', label: 'Summary',  Icon: Brain },
        { id: 'charts',  label: 'Charts',   Icon: BarChart3 },
        { id: 'config',  label: 'Config',   Icon: Settings2 },
        { id: 'history', label: 'History',  Icon: History },
        { id: 'items',   label: 'Items',    Icon: ListChecks },
    ];

    return (
        <div className="border-t border-slate-700 p-5">
            {/* Sub-tab nav */}
            <div className="flex gap-1 mb-5 border-b border-slate-700 pb-0">
                {SUB_TABS.map(({ id, label, Icon }) => (
                    <button type="button" key={id} onClick={() => setSubTab(id)}
                        className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                            subTab === id
                                ? 'border-blue-500 text-blue-400'
                                : 'border-transparent text-slate-500 hover:text-slate-300'
                        }`}>
                        <Icon className="w-3.5 h-3.5" />{label}
                    </button>
                ))}
            </div>

            {/* Summary tab */}
            {subTab === 'summary' && (
                <div className="space-y-4">
                    <div className="bg-slate-900/60 rounded-xl border border-slate-700 p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Brain className="w-4 h-4 text-purple-400" />
                            <span className="text-sm font-semibold text-slate-200">Model Summary</span>
                        </div>
                        <p className="text-sm text-slate-300 leading-relaxed">{det.plain_english}</p>
                    </div>

                    {perf?.items_covered !== undefined ? (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            {[
                                { label: 'Confidence', value: `${perf.confidence_score}/100`, sub: <ConfidenceBar score={perf.confidence_score} size="sm" />, color: 'text-blue-400' },
                                { label: 'Items Covered', value: `${perf.items_covered}/${perf.total_items}`, sub: <span className="text-xs text-slate-500">{perf.coverage_pct}% coverage</span>, color: 'text-emerald-400' },
                                { label: 'Avg R²', value: perf.avg_r2?.toFixed(3) ?? '—', sub: <span className="text-xs text-slate-500">{perf.avg_r2 >= 0.7 ? 'Strong' : perf.avg_r2 >= 0.4 ? 'Moderate' : 'Weak'} correlation</span>, color: 'text-purple-400' },
                                { label: 'Holdout Accuracy', value: perf.holdout?.items_tested > 0 ? `${perf.holdout.accuracy_pct?.toFixed(1)}%` : 'N/A', sub: <span className="text-xs text-slate-500">{perf.holdout?.items_tested > 0 ? `MAPE ${perf.holdout.mape?.toFixed(1)}%` : 'No holdout data'}</span>, color: 'text-amber-400' },
                            ].map(({ label, value, sub, color }) => (
                                <div key={label} className="bg-slate-800 rounded-xl border border-slate-700 p-4">
                                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{label}</p>
                                    <p className={`text-xl font-bold ${color} mb-1`}>{value}</p>
                                    {sub}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-slate-500">No performance data yet.</p>
                    )}

                    {perf?.items_covered > 0 && (
                        <div className="grid grid-cols-3 gap-4">
                            {[
                                { label: 'Data Points', value: perf.total_data_points?.toLocaleString() ?? '—' },
                                { label: 'Training Window', value: `${perf.training_window_days ?? cfg.training_window_days} days` },
                                { label: 'Model', value: perf.model_used ?? cfg.smart_order_model },
                            ].map(({ label, value }) => (
                                <div key={label} className="bg-slate-900/40 rounded-lg border border-slate-700 px-4 py-3">
                                    <p className="text-xs text-slate-500">{label}</p>
                                    <p className="text-sm font-semibold text-slate-200">{value}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {org.error_message && (
                        <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-3">
                            <p className="text-xs text-red-400 font-semibold mb-1">Last Training Error</p>
                            <p className="text-xs text-red-300 font-mono">{org.error_message}</p>
                        </div>
                    )}
                </div>
            )}

            {/* Charts tab */}
            {subTab === 'charts' && (
                <div className="space-y-4">
                    {det.params?.length > 0 && (
                        <div className="bg-slate-900/60 rounded-xl border border-slate-700 p-4">
                            <p className="text-xs font-semibold text-slate-300 mb-3">Top Items by Daily Burn Rate &amp; 7-Day Forecast</p>
                            <ItemsBurnChart params={det.params} />
                        </div>
                    )}
                    <OrgHistoryCharts orgId={org.id} />
                </div>
            )}

            {/* Config tab */}
            {subTab === 'config' && (
                <ConfigPanel orgId={org.id} cfg={cfg} setConf={setConf} toggleModel={toggleModel} />
            )}

            {/* History tab */}
            {subTab === 'history' && <HistoryTab orgId={org.id} />}

            {/* Items tab */}
            {subTab === 'items' && det.params?.length > 0 && (
                <div className="bg-slate-900/60 rounded-xl border border-slate-700 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700">
                        <Database className="w-4 h-4 text-slate-400" />
                        <span className="text-sm font-semibold text-slate-200">Per-Item Model Parameters</span>
                        <span className="ml-auto text-xs text-slate-500">{det.params.length} items</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-slate-700 bg-slate-900/40">
                                    {['Item', 'Burn/day', '7d Fcst', '30d Fcst', 'R²', 'Slope', 'Std Dev', 'MAPE', 'Events', 'Last Day'].map(h => (
                                        <th key={h} className="px-3 py-2.5 text-left text-slate-500 font-medium">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {det.params.map(p => (
                                    <tr key={p.item_id} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/40">
                                        <td className="px-3 py-2 text-slate-200 font-medium">{p.item_name}</td>
                                        <td className="px-3 py-2 text-blue-300 font-mono">{p.burn_rate}</td>
                                        <td className="px-3 py-2 text-slate-300 font-mono">{p.forecast_next_7}</td>
                                        <td className="px-3 py-2 text-slate-300 font-mono">{p.forecast_next_30}</td>
                                        <td className="px-3 py-2">
                                            <span className={`font-mono ${p.r2 >= 0.7 ? 'text-emerald-400' : p.r2 >= 0.4 ? 'text-amber-400' : 'text-red-400'}`}>
                                                {p.r2.toFixed(3)}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2">
                                            <span className={`font-mono flex items-center gap-0.5 ${p.slope > 0.05 ? 'text-emerald-400' : p.slope < -0.05 ? 'text-red-400' : 'text-slate-400'}`}>
                                                {p.slope > 0.05 ? <TrendingUp className="w-3 h-3" /> : p.slope < -0.05 ? <TrendingDown className="w-3 h-3" /> : null}
                                                {p.slope.toFixed(4)}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-slate-400 font-mono">{p.std_dev}</td>
                                        <td className="px-3 py-2">
                                            {p.mape > 0
                                                ? <span className={`font-mono ${p.mape < 15 ? 'text-emerald-400' : p.mape < 30 ? 'text-amber-400' : 'text-red-400'}`}>{p.mape.toFixed(1)}%</span>
                                                : <span className="text-slate-600">—</span>
                                            }
                                        </td>
                                        <td className="px-3 py-2 text-slate-500">{p.data_points}</td>
                                        <td className="px-3 py-2 text-slate-500 font-mono">{p.last_day}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Action bar — always visible */}
            <div className="flex items-center gap-3 flex-wrap pt-5 border-t border-slate-700 mt-5">
                {(subTab === 'config') && (
                    <button type="button" onClick={onSave} disabled={saving}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 text-sm font-medium border border-slate-600 transition-colors">
                        <Settings2 className="w-4 h-4" />
                        {saving ? 'Saving…' : 'Save Config'}
                    </button>
                )}
                <button type="button" onClick={() => onTrain(false, false)} disabled={training}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium shadow-lg shadow-blue-500/20 transition-colors">
                    <Zap className="w-4 h-4" />
                    {training ? 'Training…' : cfg.comparison_mode ? 'Run Challenger' : 'Train Model'}
                </button>
                {cfg.comparison_mode && (
                    <button type="button" onClick={onForceReplace} disabled={training}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-white text-sm font-medium transition-colors">
                        <Target className="w-4 h-4" />
                        Force Replace
                    </button>
                )}
                <button type="button" onClick={() => onTrain(true, false)} disabled={training}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium transition-colors">
                    <RefreshCw className="w-4 h-4" />
                    Wipe &amp; Rebuild
                </button>
                <button type="button" onClick={onWipe} disabled={wiping}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-900/40 hover:bg-red-800/60 disabled:opacity-50 text-red-400 text-sm font-medium border border-red-700/40 transition-colors">
                    <Trash2 className="w-4 h-4" />
                    {wiping ? 'Wiping…' : 'Wipe Model'}
                </button>

                {det.trained_at && (
                    <span className="ml-auto text-xs text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(det.trained_at).toLocaleString()}
                        {det.training_duration_ms && ` · ${(det.training_duration_ms / 1000).toFixed(1)}s`}
                    </span>
                )}
                {actionMsg && (
                    <span className={`text-xs font-semibold ${actionMsg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {actionMsg.type === 'ok' ? '✓' : '✗'} {actionMsg.text}
                    </span>
                )}
            </div>
        </div>
    );
}

// ── Main page component ────────────────────────────────────────────────────

type PageTab = 'overview' | 'organizations' | 'analysis';

export default function OrgModelsClient() {
    const [orgs, setOrgs] = useState<OrgRow[]>([]);
    const [summary, setSummary] = useState<PageSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [pageTab, setPageTab] = useState<PageTab>('organizations');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | OrgMLStatus>('all');

    const [expanded, setExpanded] = useState<Record<number, boolean>>({});
    const [detail, setDetail] = useState<Record<number, DetailData>>({});
    const [detailLoading, setDetailLoading] = useState<Record<number, boolean>>({});
    const [localConfig, setLocalConfig] = useState<Record<number, OrgMLConfig>>({});

    const [saving, setSaving]     = useState<Record<number, boolean>>({});
    const [training, setTraining] = useState<Record<number, boolean>>({});
    const [wiping, setWiping]     = useState<Record<number, boolean>>({});
    const [actionMsg, setActionMsg] = useState<Record<number, { type: 'ok' | 'err'; text: string }>>({});

    const fetchList = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch('/api/super-admin/org-models');
            const d = await r.json();
            setOrgs(d.orgs ?? []);
            setSummary(d.summary ?? null);
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchList(); }, [fetchList]);

    const loadDetail = async (org: OrgRow) => {
        if (detail[org.id]) return;
        setDetailLoading(p => ({ ...p, [org.id]: true }));
        try {
            const r = await fetch(`/api/super-admin/org-models/${org.id}`);
            const d = await r.json();
            setDetail(p => ({ ...p, [org.id]: d }));
            setLocalConfig(p => ({ ...p, [org.id]: d.config ?? DEFAULT_ORG_ML_CONFIG }));
        } finally { setDetailLoading(p => ({ ...p, [org.id]: false })); }
    };

    const toggleExpand = (org: OrgRow) => {
        const isOpen = expanded[org.id];
        setExpanded(p => ({ ...p, [org.id]: !isOpen }));
        if (!isOpen) loadDetail(org);
    };

    const setConf = (orgId: number, k: keyof OrgMLConfig, v: any) =>
        setLocalConfig(p => ({ ...p, [orgId]: { ...p[orgId], [k]: v } }));

    const toggleModel = (orgId: number, m: MLModelType) => {
        const cfg = localConfig[orgId];
        if (!cfg) return;
        const cur = cfg.enabled_models;
        if (cur.includes(m)) {
            if (cur.length <= 1) return;
            const next = cur.filter(x => x !== m);
            const patch: Partial<OrgMLConfig> = { enabled_models: next };
            if (!next.includes(cfg.smart_order_model)) patch.smart_order_model = next[0];
            if (!next.includes(cfg.insights_model)) patch.insights_model = next[0];
            setLocalConfig(p => ({ ...p, [orgId]: { ...p[orgId], ...patch } }));
        } else {
            setConf(orgId, 'enabled_models', [...cur, m]);
        }
    };

    const flash = (orgId: number, type: 'ok' | 'err', text: string) => {
        setActionMsg(p => ({ ...p, [orgId]: { type, text } }));
        setTimeout(() => setActionMsg(p => { const n = { ...p }; delete n[orgId]; return n; }), 5000);
    };

    const saveConfig = async (orgId: number) => {
        setSaving(p => ({ ...p, [orgId]: true }));
        try {
            const r = await fetch(`/api/super-admin/org-models/${orgId}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(localConfig[orgId]),
            });
            flash(orgId, r.ok ? 'ok' : 'err', r.ok ? 'Config saved' : 'Save failed');
        } finally { setSaving(p => ({ ...p, [orgId]: false })); }
    };

    const trainModel = async (orgId: number, wipe = false, forceReplace = false) => {
        if (training[orgId]) return;
        setTraining(p => ({ ...p, [orgId]: true }));
        setOrgs(p => p.map(o => o.id === orgId ? { ...o, status: 'training' } : o));
        try {
            const r = await fetch(`/api/super-admin/org-models/${orgId}/train`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wipe, force_replace: forceReplace }),
            });
            const d = await r.json();
            if (r.ok) {
                const label = d.replaced
                    ? `Trained ${d.items_trained} items in ${((d.duration_ms || 0) / 1000).toFixed(1)}s — model adopted`
                    : `Challenger scored ${d.performance?.confidence_score ?? '?'} — not adopted (below threshold)`;
                flash(orgId, 'ok', label);
                // Refresh detail
                const dr = await fetch(`/api/super-admin/org-models/${orgId}`);
                const dd = await dr.json();
                setDetail(p => ({ ...p, [orgId]: dd }));
                setLocalConfig(p => ({ ...p, [orgId]: dd.config }));
            } else {
                flash(orgId, 'err', d.error || 'Training failed');
            }
            await fetchList();
        } finally { setTraining(p => ({ ...p, [orgId]: false })); }
    };

    const wipeModel = async (orgId: number) => {
        if (!confirm('Wipe all trained parameters for this organization?')) return;
        setWiping(p => ({ ...p, [orgId]: true }));
        try {
            await fetch(`/api/super-admin/org-models/${orgId}`, { method: 'DELETE' });
            setDetail(p => { const n = { ...p }; delete n[orgId]; return n; });
            flash(orgId, 'ok', 'Model wiped');
            await fetchList();
        } finally { setWiping(p => ({ ...p, [orgId]: false })); }
    };

    const filtered = orgs.filter(o => {
        const ms = !search || o.name.toLowerCase().includes(search.toLowerCase());
        const st = statusFilter === 'all' || o.status === statusFilter;
        return ms && st;
    });

    // Analysis — orgs needing attention
    const needsAttention = orgs.filter(o =>
        o.status === 'failed' ||
        o.status === 'untrained' ||
        (o.status === 'trained' && (o.performance?.confidence_score ?? 100) < 50) ||
        (o.status === 'trained' && (o.performance?.coverage_pct ?? 100) < 40)
    );

    if (loading) return (
        <div className="p-8 text-slate-400 animate-pulse flex items-center gap-2">
            <Brain className="w-5 h-5" /> Loading organization models…
        </div>
    );

    return (
        <div className="p-6 max-w-7xl">
            {/* Header */}
            <div className="flex items-start justify-between mb-5">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Brain className="w-6 h-6 text-purple-400" /> Organization ML Models
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">
                        Per-organization consumption models trained on historical stock activity, with holdout validation and challenger comparison.
                    </p>
                </div>
                <button type="button" onClick={fetchList}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm border border-slate-700 transition-colors">
                    <RefreshCw className="w-3.5 h-3.5" /> Refresh
                </button>
            </div>

            {/* Summary stats */}
            {summary && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
                    {[
                        { label: 'Total Orgs',    value: summary.total,             color: 'text-slate-300' },
                        { label: 'Trained',        value: summary.trained,           color: 'text-emerald-400' },
                        { label: 'Untrained',      value: summary.untrained,         color: 'text-slate-400' },
                        { label: 'Failed',         value: summary.failed,            color: 'text-red-400' },
                        { label: 'Avg Coverage',   value: `${summary.avg_coverage_pct}%`, color: 'text-blue-400' },
                    ].map(({ label, value, color }) => (
                        <div key={label} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{label}</p>
                            <p className={`text-2xl font-bold ${color}`}>{value}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Page tabs */}
            <div className="flex gap-1 border-b border-slate-700 mb-5">
                {([
                    { id: 'overview', label: 'Overview', Icon: BarChart3 },
                    { id: 'organizations', label: `Organizations (${orgs.length})`, Icon: Brain },
                    { id: 'analysis', label: `Analysis${needsAttention.length > 0 ? ` · ${needsAttention.length} flagged` : ''}`, Icon: AlertTriangle },
                ] as const).map(({ id, label, Icon }) => (
                    <button type="button" key={id} onClick={() => setPageTab(id as PageTab)}
                        className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                            pageTab === id ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-300'
                        }`}>
                        <Icon className="w-4 h-4" />{label}
                    </button>
                ))}
            </div>

            {/* Overview tab — global stats charts */}
            {pageTab === 'overview' && (
                <div className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[
                            { label: 'Trained',        value: summary?.trained ?? 0,               total: summary?.total ?? 1, barCls: 'bg-emerald-500', suffix: '' },
                            { label: 'Avg Confidence', value: Math.round(orgs.filter(o => o.status === 'trained').reduce((s, o) => s + (o.performance?.confidence_score ?? 0), 0) / Math.max(1, orgs.filter(o => o.status === 'trained').length)), total: 100, barCls: 'bg-blue-500', suffix: '/100' },
                            { label: 'Avg Coverage',   value: summary?.avg_coverage_pct ?? 0,      total: 100,                 barCls: 'bg-violet-500', suffix: '%' },
                        ].map(({ label, value, total, barCls, suffix = '' }) => (
                            <div key={label} className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                                <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">{label}</p>
                                <p className="text-3xl font-bold text-white mb-2">{value}{suffix}</p>
                                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full transition-all ${barCls}`} style={{ width: `${Math.round((value / total) * 100)}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                        <p className="text-sm font-semibold text-slate-200 mb-4">Status Distribution</p>
                        <div className="space-y-3">
                            {(['trained', 'untrained', 'failed', 'training'] as const).map(s => {
                                const count = orgs.filter(o => o.status === s).length;
                                const barClasses: Record<string, string> = { trained: 'bg-emerald-500', untrained: 'bg-slate-500', failed: 'bg-red-500', training: 'bg-blue-500' };
                                return (
                                    <div key={s} className="flex items-center gap-3">
                                        <span className="capitalize text-slate-400 text-sm w-20">{s}</span>
                                        <div className="flex-1 h-3 bg-slate-700 rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full transition-all ${barClasses[s] ?? 'bg-slate-500'}`}
                                                style={{ width: `${orgs.length ? Math.round((count / orgs.length) * 100) : 0}%` }} />
                                        </div>
                                        <span className="text-slate-300 text-sm font-semibold tabular-nums w-6 text-right">{count}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <p className="text-sm text-slate-500">
                        Expand individual organizations in the <button type="button" onClick={() => setPageTab('organizations')} className="text-blue-400 hover:underline">Organizations</button> tab to view per-org trend charts.
                    </p>
                </div>
            )}

            {/* Organizations tab */}
            {pageTab === 'organizations' && (
                <div className="space-y-3">
                    <div className="flex flex-wrap gap-3 mb-3">
                        <input value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Search organizations…"
                            className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-sm placeholder-slate-500 w-56" />
                        <div className="flex gap-1">
                            {(['all', 'trained', 'untrained', 'failed'] as const).map(s => (
                                <button type="button" key={s} onClick={() => setStatusFilter(s)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${statusFilter === s ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'}`}>
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>

                    {filtered.length === 0 && (
                        <div className="text-center py-12 text-slate-500">No organizations match your filter.</div>
                    )}

                    {filtered.map(org => {
                        const isOpen     = expanded[org.id];
                        const det        = detail[org.id];
                        const cfg        = localConfig[org.id] ?? org.config;
                        const isTraining = training[org.id] || org.status === 'training';
                        const perf       = det?.performance ?? org.performance;

                        return (
                            <div key={org.id} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                                {/* Row header */}
                                <button type="button" onClick={() => toggleExpand(org)}
                                    className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-750 transition-colors text-left">
                                    {isOpen
                                        ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                                        : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-white">{org.name}</span>
                                            {org.disabled && <span className="text-xs text-slate-500 bg-slate-700 px-1.5 py-0.5 rounded">Disabled</span>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 shrink-0">
                                        {perf?.confidence_score !== undefined && org.status === 'trained' && (
                                            <div className="hidden md:flex items-center gap-2 w-28">
                                                <ConfidenceBar score={perf.confidence_score} size="sm" />
                                            </div>
                                        )}
                                        {perf?.coverage_pct !== undefined && org.status === 'trained' && (
                                            <span className="hidden md:block text-xs text-slate-400 tabular-nums w-16">
                                                {perf.coverage_pct}% cov
                                            </span>
                                        )}
                                        {perf?.model_used && org.status === 'trained' && (
                                            <span className={`hidden lg:block text-xs font-mono ${MODEL_INFO[perf.model_used]?.color ?? 'text-slate-400'}`}>
                                                {perf.model_used}
                                            </span>
                                        )}
                                        {perf?.holdout?.accuracy_pct > 0 && org.status === 'trained' && (
                                            <span className="hidden xl:block text-xs text-slate-500 tabular-nums">
                                                {perf.holdout.accuracy_pct?.toFixed(1)}% acc
                                            </span>
                                        )}
                                        {org.trained_at && org.status === 'trained' && (
                                            <span className="hidden lg:block text-xs text-slate-500">
                                                {new Date(org.trained_at).toLocaleDateString()}
                                            </span>
                                        )}
                                        <StatusBadge status={isTraining ? 'training' : org.status} />
                                    </div>
                                </button>

                                {isOpen && (
                                    detailLoading[org.id]
                                        ? <div className="border-t border-slate-700 p-5 text-slate-400 animate-pulse text-sm">Loading model details…</div>
                                        : det && (
                                            <ExpandedOrg
                                                org={org} det={det} cfg={cfg}
                                                setConf={(k, v) => setConf(org.id, k, v)}
                                                toggleModel={m => toggleModel(org.id, m)}
                                                saving={saving[org.id] ?? false}
                                                training={isTraining}
                                                wiping={wiping[org.id] ?? false}
                                                actionMsg={actionMsg[org.id]}
                                                onSave={() => saveConfig(org.id)}
                                                onTrain={(w, f) => trainModel(org.id, w, f)}
                                                onWipe={() => wipeModel(org.id)}
                                                onForceReplace={() => trainModel(org.id, false, true)}
                                            />
                                        )
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Analysis tab */}
            {pageTab === 'analysis' && (
                <div className="space-y-5">
                    {needsAttention.length === 0 ? (
                        <div className="text-center py-12">
                            <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                            <p className="text-slate-300 font-semibold">All organization models look healthy</p>
                            <p className="text-slate-500 text-sm mt-1">No orgs with failing, untrained, or low-confidence models detected.</p>
                        </div>
                    ) : (
                        <>
                            <p className="text-sm text-slate-400">
                                {needsAttention.length} organization{needsAttention.length !== 1 ? 's' : ''} flagged for attention.
                            </p>
                            <div className="space-y-3">
                                {needsAttention.map(org => {
                                    const issues: { label: string; cls: string }[] = [];
                                    if (org.status === 'failed') issues.push({ label: 'Last training failed', cls: 'bg-red-900/30 text-red-400 border-red-700/40' });
                                    if (org.status === 'untrained') issues.push({ label: 'Never trained', cls: 'bg-slate-800 text-slate-400 border-slate-600' });
                                    if (org.status === 'trained' && (org.performance?.confidence_score ?? 100) < 50)
                                        issues.push({ label: `Low confidence (${org.performance?.confidence_score ?? '?'}/100)`, cls: 'bg-amber-900/30 text-amber-400 border-amber-700/40' });
                                    if (org.status === 'trained' && (org.performance?.coverage_pct ?? 100) < 40)
                                        issues.push({ label: `Low coverage (${org.performance?.coverage_pct ?? '?'}%)`, cls: 'bg-orange-900/30 text-orange-400 border-orange-700/40' });

                                    return (
                                        <div key={org.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-center gap-4">
                                            <div className="flex-1">
                                                <p className="font-semibold text-white">{org.name}</p>
                                                <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                    {issues.map(({ label, cls }) => (
                                                        <span key={label} className={`text-xs px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>
                                                    ))}
                                                </div>
                                                {org.error_message && (
                                                    <p className="text-xs text-red-300 font-mono mt-1 truncate max-w-xl">{org.error_message}</p>
                                                )}
                                            </div>
                                            <button type="button"
                                                onClick={() => { setPageTab('organizations'); setSearch(org.name); setExpanded(p => ({ ...p, [org.id]: true })); loadDetail(org); }}
                                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors shrink-0">
                                                Inspect →
                                            </button>
                                            <button type="button" onClick={() => trainModel(org.id, false, false)} disabled={training[org.id]}
                                                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium rounded-lg transition-colors border border-slate-600 shrink-0 disabled:opacity-50">
                                                {training[org.id] ? 'Training…' : 'Train Now'}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
