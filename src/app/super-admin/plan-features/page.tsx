'use client';

import { useState, useEffect, useCallback } from 'react';
import { Save, RotateCcw, Eye, EyeOff, CheckCircle, XCircle } from 'lucide-react';
import { AdminPageHeader } from '../components/AdminPageHeader';
import { DEFAULT_FEATURES } from '@/app/api/super-admin/plan-features/route';

type PlanFeature = typeof DEFAULT_FEATURES[number];

const PLANS = [
    { key: 'basic' as const,      label: 'Basic',      color: '#60a5fa' },
    { key: 'pro' as const,        label: 'Pro',        color: '#a78bfa' },
    { key: 'enterprise' as const, label: 'Enterprise', color: '#34d399' },
];

const CATEGORIES = Array.from(new Set(DEFAULT_FEATURES.map(f => f.category)));

export default function PlanFeaturesPage() {
    const [features, setFeatures] = useState<PlanFeature[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            const r = await fetch('/api/super-admin/plan-features');
            const d = await r.json();
            if (d.features) setFeatures(d.features);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const toggle = (id: string, field: keyof PlanFeature) => {
        setFeatures(prev => prev.map(f =>
            f.id === id ? { ...f, [field]: !f[field] } : f
        ));
    };

    const reset = () => {
        if (confirm('Reset all feature flags to defaults?')) setFeatures(DEFAULT_FEATURES);
    };

    const save = async () => {
        setSaving(true); setError(''); setSaved(false);
        try {
            const r = await fetch('/api/super-admin/plan-features', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ features }),
            });
            if (!r.ok) throw new Error('Save failed');
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    };

    const actions = [
        { label: 'Reset Defaults', variant: 'secondary' as const, icon: RotateCcw, onClick: reset },
        { label: saving ? 'Saving…' : 'Save Changes', variant: 'primary' as const, icon: Save, onClick: save },
    ];

    if (loading) return <div className="p-8 text-slate-400">Loading…</div>;

    const byCategory = CATEGORIES.map(cat => ({
        cat,
        items: features.filter(f => f.category === cat),
    })).filter(g => g.items.length > 0);

    return (
        <div className="p-8 max-w-6xl mx-auto space-y-8">
            <AdminPageHeader
                title="Plan Features"
                subtitle="Control which features are available per subscription tier and what appears on the landing page."
                icon={CheckCircle}
                actions={actions}
            />

            {saved && (
                <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 text-green-400 rounded-lg px-4 py-3 text-sm">
                    <CheckCircle className="w-4 h-4" /> Changes saved successfully.
                </div>
            )}
            {error && (
                <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm">
                    <XCircle className="w-4 h-4" /> {error}
                </div>
            )}

            {/* Legend */}
            <div className="flex flex-wrap gap-6 text-sm text-slate-400">
                {PLANS.map(p => (
                    <span key={p.key} className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-sm" style={{ background: p.color }} />
                        {p.label}
                    </span>
                ))}
                <span className="flex items-center gap-1.5">
                    <Eye className="w-4 h-4 text-slate-400" />
                    Shown on landing page
                </span>
            </div>

            {/* Feature table */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                {/* Header row */}
                <div className="grid grid-cols-[1fr_auto_repeat(3,80px)_80px] gap-0 bg-slate-950 border-b border-slate-800 px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    <span>Feature</span>
                    <span className="w-36 text-center">Category</span>
                    {PLANS.map(p => (
                        <span key={p.key} className="text-center" style={{ color: p.color }}>{p.label}</span>
                    ))}
                    <span className="text-center">Landing</span>
                </div>

                {byCategory.map(({ cat, items }, gi) => (
                    <div key={cat}>
                        {/* Category header */}
                        <div className="px-6 py-2 bg-slate-950/50 border-b border-slate-800/50">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{cat}</span>
                        </div>
                        {items.map((feat, i) => (
                            <div
                                key={feat.id}
                                className={`grid grid-cols-[1fr_auto_repeat(3,80px)_80px] gap-0 items-center px-6 py-3 border-b border-slate-800/60 hover:bg-slate-800/20 transition-colors ${i === items.length - 1 ? 'border-b-0' : ''}`}
                            >
                                <div>
                                    <p className="text-sm font-medium text-white">{feat.name}</p>
                                    <p className="text-xs text-slate-500 mt-0.5">{feat.description}</p>
                                </div>
                                <div className="w-36 text-center">
                                    <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400">{feat.category}</span>
                                </div>
                                {PLANS.map(p => (
                                    <div key={p.key} className="flex justify-center">
                                        <button
                                            onClick={() => toggle(feat.id, p.key)}
                                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${feat[p.key]
                                                ? 'text-white'
                                                : 'bg-slate-800/50 text-slate-600 hover:bg-slate-700'
                                            }`}
                                            style={feat[p.key] ? { background: p.color + '30', color: p.color } : {}}
                                            title={`Toggle ${p.label}`}
                                        >
                                            {feat[p.key]
                                                ? <CheckCircle className="w-4 h-4" />
                                                : <XCircle className="w-4 h-4" />
                                            }
                                        </button>
                                    </div>
                                ))}
                                {/* Landing page toggle */}
                                <div className="flex justify-center">
                                    <button
                                        onClick={() => toggle(feat.id, 'showOnLanding')}
                                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${feat.showOnLanding
                                            ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                                            : 'bg-slate-800/50 text-slate-600 hover:bg-slate-700'
                                        }`}
                                        title="Toggle landing page visibility"
                                    >
                                        {feat.showOnLanding ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ))}
            </div>

            <p className="text-xs text-slate-600 text-center">
                Changes affect the feature comparison table on the public landing page and which features are advertised per plan. They do not automatically enforce access control — use per-feature permission checks in code for enforcement.
            </p>
        </div>
    );
}
