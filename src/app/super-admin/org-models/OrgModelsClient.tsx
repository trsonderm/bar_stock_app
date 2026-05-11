'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Brain, ChevronDown, ChevronRight, RefreshCw, Trash2, Zap,
    CheckCircle, AlertCircle, Clock, HelpCircle, TrendingUp,
    BarChart3, Settings2, Database,
} from 'lucide-react';
import { DEFAULT_ORG_ML_CONFIG, OrgMLConfig, ItemMLParams, OrgMLPerformance, OrgMLStatus } from '@/lib/org-ml';
import { MLModelType } from '@/lib/ml';

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
    updated_at: string | null;
}

interface Summary {
    total: number;
    trained: number;
    untrained: number;
    failed: number;
    avg_coverage_pct: number;
}

interface DetailData {
    params: ItemMLParams[];
    performance: OrgMLPerformance;
    plain_english: string;
    config: OrgMLConfig;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const MODEL_INFO: Record<MLModelType, { label: string; color: string }> = {
    SMA: { label: 'Simple Moving Average', color: 'text-blue-400' },
    EMA: { label: 'Exponential Moving Average', color: 'text-purple-400' },
    WMA: { label: 'Weighted Moving Average', color: 'text-green-400' },
    LINEAR_REGRESSION: { label: 'Linear Regression', color: 'text-yellow-400' },
};
const ALL_MODELS: MLModelType[] = ['SMA', 'EMA', 'WMA', 'LINEAR_REGRESSION'];

function StatusBadge({ status }: { status: OrgMLStatus }) {
    const map: Record<OrgMLStatus, { label: string; cls: string; Icon: any }> = {
        trained: { label: 'Trained', cls: 'bg-emerald-900/40 text-emerald-400 border-emerald-700/40', Icon: CheckCircle },
        training: { label: 'Training…', cls: 'bg-blue-900/40 text-blue-400 border-blue-700/40 animate-pulse', Icon: RefreshCw },
        failed: { label: 'Failed', cls: 'bg-red-900/40 text-red-400 border-red-700/40', Icon: AlertCircle },
        untrained: { label: 'Untrained', cls: 'bg-slate-800 text-slate-400 border-slate-700', Icon: HelpCircle },
    };
    const { label, cls, Icon } = map[status] ?? map.untrained;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${cls}`}>
            <Icon className="w-3 h-3" />
            {label}
        </span>
    );
}

function ConfidenceBar({ score }: { score: number }) {
    const color = score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-blue-500' : score >= 40 ? 'bg-amber-500' : 'bg-red-500';
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
            </div>
            <span className="text-xs text-slate-400 w-8 text-right">{score}/100</span>
        </div>
    );
}

function SliderRow({
    label, value, min, max, step = 1, onChange, hint,
}: {
    label: string; value: number; min: number; max: number; step?: number;
    onChange: (v: number) => void; hint?: string;
}) {
    return (
        <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center">
                <label className="text-xs font-medium text-slate-300">{label}</label>
                <span className="text-xs font-bold text-white bg-slate-700 px-2 py-0.5 rounded">{value}</span>
            </div>
            <input
                type="range" min={min} max={max} step={step} value={value}
                onChange={e => onChange(Number(e.target.value))}
                className="w-full accent-blue-500 h-1"
            />
            {hint && <p className="text-xs text-slate-500">{hint}</p>}
        </div>
    );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function OrgModelsClient() {
    const [orgs, setOrgs] = useState<OrgRow[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | OrgMLStatus>('all');

    const [expanded, setExpanded] = useState<Record<number, boolean>>({});
    const [detail, setDetail] = useState<Record<number, DetailData>>({});
    const [detailLoading, setDetailLoading] = useState<Record<number, boolean>>({});

    const [localConfig, setLocalConfig] = useState<Record<number, OrgMLConfig>>({});
    const [saving, setSaving] = useState<Record<number, boolean>>({});
    const [training, setTraining] = useState<Record<number, boolean>>({});
    const [wiping, setWiping] = useState<Record<number, boolean>>({});
    const [actionMsg, setActionMsg] = useState<Record<number, { type: 'ok' | 'err'; text: string }>>({});

    const fetchList = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch('/api/super-admin/org-models');
            const d = await r.json();
            setOrgs(d.orgs ?? []);
            setSummary(d.summary ?? null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchList(); }, [fetchList]);

    const toggleExpand = async (org: OrgRow) => {
        const isOpen = expanded[org.id];
        setExpanded(prev => ({ ...prev, [org.id]: !isOpen }));
        if (!isOpen && !detail[org.id]) {
            setDetailLoading(prev => ({ ...prev, [org.id]: true }));
            try {
                const r = await fetch(`/api/super-admin/org-models/${org.id}`);
                const d = await r.json();
                setDetail(prev => ({ ...prev, [org.id]: d }));
                setLocalConfig(prev => ({ ...prev, [org.id]: d.config ?? DEFAULT_ORG_ML_CONFIG }));
            } finally {
                setDetailLoading(prev => ({ ...prev, [org.id]: false }));
            }
        } else if (!isOpen) {
            setLocalConfig(prev => ({ ...prev, [org.id]: detail[org.id]?.config ?? org.config }));
        }
    };

    const setConf = (orgId: number, key: keyof OrgMLConfig, val: any) => {
        setLocalConfig(prev => ({ ...prev, [orgId]: { ...prev[orgId], [key]: val } }));
    };

    const toggleModel = (orgId: number, m: MLModelType) => {
        const cfg = localConfig[orgId];
        if (!cfg) return;
        const current = cfg.enabled_models;
        if (current.includes(m)) {
            if (current.length <= 1) return;
            const next = current.filter(x => x !== m);
            const patch: Partial<OrgMLConfig> = { enabled_models: next };
            if (!next.includes(cfg.smart_order_model)) patch.smart_order_model = next[0];
            if (!next.includes(cfg.insights_model)) patch.insights_model = next[0];
            setLocalConfig(prev => ({ ...prev, [orgId]: { ...prev[orgId], ...patch } }));
        } else {
            setConf(orgId, 'enabled_models', [...current, m]);
        }
    };

    const flash = (orgId: number, type: 'ok' | 'err', text: string) => {
        setActionMsg(prev => ({ ...prev, [orgId]: { type, text } }));
        setTimeout(() => setActionMsg(prev => { const n = { ...prev }; delete n[orgId]; return n; }), 4000);
    };

    const saveConfig = async (orgId: number) => {
        setSaving(prev => ({ ...prev, [orgId]: true }));
        try {
            const r = await fetch(`/api/super-admin/org-models/${orgId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(localConfig[orgId]),
            });
            if (r.ok) flash(orgId, 'ok', 'Config saved');
            else flash(orgId, 'err', 'Save failed');
        } finally {
            setSaving(prev => ({ ...prev, [orgId]: false }));
        }
    };

    const trainModel = async (orgId: number, wipe = false) => {
        if (training[orgId]) return;
        setTraining(prev => ({ ...prev, [orgId]: true }));
        setOrgs(prev => prev.map(o => o.id === orgId ? { ...o, status: 'training' } : o));
        try {
            const r = await fetch(`/api/super-admin/org-models/${orgId}/train`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wipe }),
            });
            const d = await r.json();
            if (r.ok) {
                flash(orgId, 'ok', `Trained ${d.items_trained} items in ${((d.duration_ms || 0) / 1000).toFixed(1)}s`);
                // Refresh detail
                const dr = await fetch(`/api/super-admin/org-models/${orgId}`);
                const dd = await dr.json();
                setDetail(prev => ({ ...prev, [orgId]: dd }));
                setLocalConfig(prev => ({ ...prev, [orgId]: dd.config }));
            } else {
                flash(orgId, 'err', d.error || 'Training failed');
            }
            await fetchList();
        } finally {
            setTraining(prev => ({ ...prev, [orgId]: false }));
        }
    };

    const wipeModel = async (orgId: number) => {
        if (!confirm('Wipe all trained parameters for this organization? The config will be kept.')) return;
        setWiping(prev => ({ ...prev, [orgId]: true }));
        try {
            await fetch(`/api/super-admin/org-models/${orgId}`, { method: 'DELETE' });
            setDetail(prev => { const n = { ...prev }; delete n[orgId]; return n; });
            flash(orgId, 'ok', 'Model wiped');
            await fetchList();
        } finally {
            setWiping(prev => ({ ...prev, [orgId]: false }));
        }
    };

    const filtered = orgs.filter(o => {
        const matchSearch = !search || o.name.toLowerCase().includes(search.toLowerCase());
        const matchStatus = statusFilter === 'all' || o.status === statusFilter;
        return matchSearch && matchStatus;
    });

    if (loading) {
        return (
            <div className="p-8 text-slate-400 animate-pulse flex items-center gap-2">
                <Brain className="w-5 h-5" /> Loading organization models…
            </div>
        );
    }

    return (
        <div className="p-6 max-w-6xl">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Brain className="w-6 h-6 text-purple-400" />
                        Organization ML Models
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">
                        Per-organization consumption models trained on historical stock activity. Each model learns usage patterns unique to that bar.
                    </p>
                </div>
                <button
                    onClick={fetchList}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition-colors border border-slate-700"
                >
                    <RefreshCw className="w-3.5 h-3.5" /> Refresh
                </button>
            </div>

            {/* Summary stats */}
            {summary && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                    {[
                        { label: 'Total Orgs', value: summary.total, color: 'text-slate-300' },
                        { label: 'Trained', value: summary.trained, color: 'text-emerald-400' },
                        { label: 'Untrained', value: summary.untrained, color: 'text-slate-400' },
                        { label: 'Failed', value: summary.failed, color: 'text-red-400' },
                        { label: 'Avg Coverage', value: `${summary.avg_coverage_pct}%`, color: 'text-blue-400' },
                    ].map(({ label, value, color }) => (
                        <div key={label} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{label}</p>
                            <p className={`text-2xl font-bold ${color}`}>{value}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
                <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search organizations…"
                    className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-sm placeholder-slate-500 w-56"
                />
                <div className="flex gap-1">
                    {(['all', 'trained', 'untrained', 'failed'] as const).map(s => (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(s)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${statusFilter === s ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'}`}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            </div>

            {/* Org list */}
            <div className="space-y-2">
                {filtered.length === 0 && (
                    <div className="text-center py-12 text-slate-500">No organizations match your filter.</div>
                )}
                {filtered.map(org => {
                    const isOpen = expanded[org.id];
                    const det = detail[org.id];
                    const cfg = localConfig[org.id] ?? org.config;
                    const isTraining = training[org.id] || org.status === 'training';
                    const msg = actionMsg[org.id];
                    const perf = det?.performance ?? org.performance;

                    return (
                        <div key={org.id} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                            {/* Row header */}
                            <button
                                onClick={() => toggleExpand(org)}
                                className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-750 transition-colors text-left"
                            >
                                {isOpen
                                    ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                                    : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                                }
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-semibold text-white">{org.name}</span>
                                        {org.disabled && (
                                            <span className="text-xs text-slate-500 bg-slate-700 px-1.5 py-0.5 rounded">Disabled</span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-4 shrink-0">
                                    {perf?.coverage_pct !== undefined && org.status === 'trained' && (
                                        <div className="hidden md:flex items-center gap-1.5">
                                            <BarChart3 className="w-3.5 h-3.5 text-slate-500" />
                                            <span className="text-sm text-slate-300">{perf.coverage_pct}% coverage</span>
                                        </div>
                                    )}
                                    {perf?.model_used && org.status === 'trained' && (
                                        <span className={`hidden md:block text-xs font-mono ${MODEL_INFO[perf.model_used]?.color ?? 'text-slate-400'}`}>
                                            {perf.model_used}
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

                            {/* Expanded detail */}
                            {isOpen && (
                                <div className="border-t border-slate-700 p-5 space-y-5">
                                    {detailLoading[org.id] && (
                                        <div className="text-slate-400 animate-pulse text-sm">Loading model details…</div>
                                    )}

                                    {det && (
                                        <>
                                            {/* Plain English Summary */}
                                            <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Brain className="w-4 h-4 text-purple-400" />
                                                    <span className="text-sm font-semibold text-slate-200">Model Summary</span>
                                                </div>
                                                <p className="text-sm text-slate-300 leading-relaxed">{det.plain_english}</p>
                                            </div>

                                            {/* Performance metrics + Config side by side */}
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                                {/* Performance */}
                                                <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700">
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <TrendingUp className="w-4 h-4 text-blue-400" />
                                                        <span className="text-sm font-semibold text-slate-200">Performance</span>
                                                    </div>
                                                    {perf?.items_covered !== undefined ? (
                                                        <div className="space-y-3">
                                                            <div className="grid grid-cols-2 gap-3">
                                                                {[
                                                                    { label: 'Items Covered', value: `${perf.items_covered} / ${perf.total_items}` },
                                                                    { label: 'Data Points', value: (perf.total_data_points ?? 0).toLocaleString() },
                                                                    { label: 'Avg R²', value: (perf.avg_r2 ?? 0).toFixed(3) },
                                                                    { label: 'Training Window', value: `${perf.training_window_days ?? cfg.training_window_days}d` },
                                                                ].map(({ label, value }) => (
                                                                    <div key={label}>
                                                                        <p className="text-xs text-slate-500">{label}</p>
                                                                        <p className="text-sm font-semibold text-white">{value}</p>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            <div>
                                                                <p className="text-xs text-slate-500 mb-1">Confidence Score</p>
                                                                <ConfidenceBar score={perf.confidence_score ?? 0} />
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <p className="text-sm text-slate-500">No performance data — model not yet trained.</p>
                                                    )}
                                                </div>

                                                {/* Config controls */}
                                                <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700">
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <Settings2 className="w-4 h-4 text-amber-400" />
                                                        <span className="text-sm font-semibold text-slate-200">Model Config</span>
                                                    </div>
                                                    <div className="space-y-4">
                                                        {/* Active models */}
                                                        <div>
                                                            <p className="text-xs text-slate-400 mb-2 font-medium">Active Models</p>
                                                            <div className="flex flex-wrap gap-2">
                                                                {ALL_MODELS.map(m => {
                                                                    const active = cfg.enabled_models?.includes(m);
                                                                    return (
                                                                        <button
                                                                            key={m}
                                                                            onClick={() => toggleModel(org.id, m)}
                                                                            className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${active ? 'bg-blue-900/40 border-blue-600/60 text-blue-300' : 'bg-slate-800 border-slate-700 text-slate-500'}`}
                                                                        >
                                                                            {m}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>

                                                        {/* Smart order model */}
                                                        <div className="grid grid-cols-2 gap-3">
                                                            <div>
                                                                <label className="text-xs text-slate-400 block mb-1">Smart Order Model</label>
                                                                <select
                                                                    value={cfg.smart_order_model}
                                                                    onChange={e => setConf(org.id, 'smart_order_model', e.target.value as MLModelType)}
                                                                    className="w-full bg-slate-800 border border-slate-600 text-white rounded px-2 py-1.5 text-xs"
                                                                >
                                                                    {cfg.enabled_models?.map(m => (
                                                                        <option key={m} value={m}>{m}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                            <div>
                                                                <label className="text-xs text-slate-400 block mb-1">Insights Model</label>
                                                                <select
                                                                    value={cfg.insights_model}
                                                                    onChange={e => setConf(org.id, 'insights_model', e.target.value as MLModelType)}
                                                                    className="w-full bg-slate-800 border border-slate-600 text-white rounded px-2 py-1.5 text-xs"
                                                                >
                                                                    {cfg.enabled_models?.map(m => (
                                                                        <option key={m} value={m}>{m}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        </div>

                                                        {/* Sliders */}
                                                        <SliderRow
                                                            label="Training Window (days)"
                                                            value={cfg.training_window_days}
                                                            min={30} max={365}
                                                            onChange={v => setConf(org.id, 'training_window_days', v)}
                                                            hint="How much history to use for training"
                                                        />
                                                        <SliderRow
                                                            label="Forecast Horizon (days)"
                                                            value={cfg.forecast_days}
                                                            min={7} max={90}
                                                            onChange={v => setConf(org.id, 'forecast_days', v)}
                                                        />
                                                        <div className="grid grid-cols-2 gap-3">
                                                            <SliderRow
                                                                label="SMA Window"
                                                                value={cfg.sma_window}
                                                                min={3} max={30}
                                                                onChange={v => setConf(org.id, 'sma_window', v)}
                                                            />
                                                            <SliderRow
                                                                label="EMA Alpha"
                                                                value={cfg.ema_alpha}
                                                                min={0.05} max={0.95} step={0.05}
                                                                onChange={v => setConf(org.id, 'ema_alpha', v)}
                                                            />
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-3">
                                                            <SliderRow
                                                                label="WMA Window"
                                                                value={cfg.wma_window}
                                                                min={3} max={30}
                                                                onChange={v => setConf(org.id, 'wma_window', v)}
                                                            />
                                                            <div>
                                                                <label className="text-xs text-slate-400 block mb-1">Min Data Points</label>
                                                                <input
                                                                    type="number" min={1} max={30}
                                                                    value={cfg.min_data_points}
                                                                    onChange={e => setConf(org.id, 'min_data_points', Number(e.target.value))}
                                                                    className="w-full bg-slate-800 border border-slate-600 text-white rounded px-2 py-1 text-xs"
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* Anomaly detection */}
                                                        <div className="flex items-center gap-3 pt-1">
                                                            <label className="flex items-center gap-2 cursor-pointer">
                                                                <div
                                                                    onClick={() => setConf(org.id, 'anomaly_iqr_enabled', !cfg.anomaly_iqr_enabled)}
                                                                    className={`relative w-8 h-4 rounded-full transition-colors cursor-pointer ${cfg.anomaly_iqr_enabled ? 'bg-blue-600' : 'bg-slate-600'}`}
                                                                >
                                                                    <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${cfg.anomaly_iqr_enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                                                                </div>
                                                                <span className="text-xs text-slate-400">IQR Anomaly Detection</span>
                                                            </label>
                                                        </div>
                                                        <SliderRow
                                                            label={`Z-Score Threshold (${cfg.anomaly_z_threshold})`}
                                                            value={cfg.anomaly_z_threshold}
                                                            min={1.0} max={4.0} step={0.1}
                                                            onChange={v => setConf(org.id, 'anomaly_z_threshold', v)}
                                                            hint="Lower = more sensitive anomaly detection"
                                                        />

                                                        {/* Auto-retrain */}
                                                        <div className="pt-1 border-t border-slate-700">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <label className="flex items-center gap-2 cursor-pointer">
                                                                    <div
                                                                        onClick={() => setConf(org.id, 'auto_retrain', !cfg.auto_retrain)}
                                                                        className={`relative w-8 h-4 rounded-full transition-colors cursor-pointer ${cfg.auto_retrain ? 'bg-blue-600' : 'bg-slate-600'}`}
                                                                    >
                                                                        <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${cfg.auto_retrain ? 'translate-x-4' : 'translate-x-0'}`} />
                                                                    </div>
                                                                    <span className="text-xs text-slate-400">Auto-retrain</span>
                                                                </label>
                                                            </div>
                                                            {cfg.auto_retrain && (
                                                                <div>
                                                                    <label className="text-xs text-slate-400 block mb-1">Retrain every (days)</label>
                                                                    <select
                                                                        value={cfg.auto_retrain_interval_days}
                                                                        onChange={e => setConf(org.id, 'auto_retrain_interval_days', Number(e.target.value))}
                                                                        className="bg-slate-800 border border-slate-600 text-white rounded px-2 py-1 text-xs"
                                                                    >
                                                                        {[7, 14, 30, 60, 90].map(d => (
                                                                            <option key={d} value={d}>{d} days</option>
                                                                        ))}
                                                                    </select>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Top items table */}
                                            {det.params?.length > 0 && (
                                                <div className="bg-slate-900/60 rounded-xl border border-slate-700 overflow-hidden">
                                                    <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700">
                                                        <Database className="w-4 h-4 text-slate-400" />
                                                        <span className="text-sm font-semibold text-slate-200">
                                                            Top Items by Burn Rate
                                                        </span>
                                                        <span className="ml-auto text-xs text-slate-500">
                                                            {det.params.length} item{det.params.length !== 1 ? 's' : ''} trained
                                                        </span>
                                                    </div>
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full text-sm">
                                                            <thead>
                                                                <tr className="border-b border-slate-700 text-left">
                                                                    <th className="px-4 py-2 text-xs text-slate-500 font-medium">Item</th>
                                                                    <th className="px-4 py-2 text-xs text-slate-500 font-medium">Burn Rate/day</th>
                                                                    <th className="px-4 py-2 text-xs text-slate-500 font-medium">7-day Forecast</th>
                                                                    <th className="px-4 py-2 text-xs text-slate-500 font-medium">30-day Forecast</th>
                                                                    <th className="px-4 py-2 text-xs text-slate-500 font-medium">R²</th>
                                                                    <th className="px-4 py-2 text-xs text-slate-500 font-medium">Events</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {det.params.slice(0, 15).map((p: ItemMLParams) => (
                                                                    <tr key={p.item_id} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/40">
                                                                        <td className="px-4 py-2 text-slate-200 font-medium">{p.item_name}</td>
                                                                        <td className="px-4 py-2 text-blue-300 font-mono">{p.burn_rate}</td>
                                                                        <td className="px-4 py-2 text-slate-300 font-mono">{p.forecast_next_7}</td>
                                                                        <td className="px-4 py-2 text-slate-300 font-mono">{p.forecast_next_30}</td>
                                                                        <td className="px-4 py-2">
                                                                            <span className={`text-xs font-mono ${p.r2 >= 0.7 ? 'text-emerald-400' : p.r2 >= 0.4 ? 'text-amber-400' : 'text-red-400'}`}>
                                                                                {p.r2.toFixed(3)}
                                                                            </span>
                                                                        </td>
                                                                        <td className="px-4 py-2 text-slate-400 text-xs">{p.data_points}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                        {det.params.length > 15 && (
                                                            <p className="px-4 py-2 text-xs text-slate-500 border-t border-slate-700">
                                                                + {det.params.length - 15} more items not shown
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Error message */}
                                            {org.error_message && (
                                                <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-3">
                                                    <p className="text-xs text-red-400 font-medium mb-1">Last Training Error</p>
                                                    <p className="text-xs text-red-300 font-mono">{org.error_message}</p>
                                                </div>
                                            )}

                                            {/* Action buttons */}
                                            <div className="flex items-center gap-3 flex-wrap pt-2">
                                                <button
                                                    onClick={() => saveConfig(org.id)}
                                                    disabled={saving[org.id]}
                                                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 text-sm font-medium transition-colors border border-slate-600"
                                                >
                                                    <Settings2 className="w-4 h-4" />
                                                    {saving[org.id] ? 'Saving…' : 'Save Config'}
                                                </button>
                                                <button
                                                    onClick={() => trainModel(org.id, false)}
                                                    disabled={isTraining}
                                                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-colors shadow-lg shadow-blue-500/20"
                                                >
                                                    <Zap className="w-4 h-4" />
                                                    {isTraining ? 'Training…' : 'Train Model'}
                                                </button>
                                                <button
                                                    onClick={() => trainModel(org.id, true)}
                                                    disabled={isTraining}
                                                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                                                >
                                                    <RefreshCw className="w-4 h-4" />
                                                    Wipe &amp; Rebuild
                                                </button>
                                                <button
                                                    onClick={() => wipeModel(org.id)}
                                                    disabled={wiping[org.id]}
                                                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-900/40 hover:bg-red-800/60 disabled:opacity-50 text-red-400 text-sm font-medium border border-red-700/40 transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                    {wiping[org.id] ? 'Wiping…' : 'Wipe Model'}
                                                </button>

                                                {org.trained_at && (
                                                    <span className="ml-auto text-xs text-slate-500 flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        Trained {new Date(org.trained_at).toLocaleString()}
                                                        {org.training_duration_ms && ` · ${(org.training_duration_ms / 1000).toFixed(1)}s`}
                                                    </span>
                                                )}

                                                {msg && (
                                                    <span className={`text-xs font-semibold ${msg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        {msg.type === 'ok' ? '✓' : '✗'} {msg.text}
                                                    </span>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
