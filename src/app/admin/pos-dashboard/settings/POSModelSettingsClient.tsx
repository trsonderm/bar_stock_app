'use client';

import { useState, useEffect } from 'react';
import { Save, Info } from 'lucide-react';
import NextLink from 'next/link';

export default function POSModelSettingsClient() {
    const [settings, setSettings] = useState({
        sensitivity: 0.50,
        padding_pct: 5,
        oz_per_shot: 1.5,
        default_view: 'weekly',
    });
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');

    useEffect(() => {
        fetch('/api/admin/pos/model-settings').then(r => r.json()).then(d => {
            if (d.settings) setSettings({
                sensitivity: parseFloat(d.settings.sensitivity),
                padding_pct: parseFloat(d.settings.padding_pct),
                oz_per_shot: parseFloat(d.settings.oz_per_shot),
                default_view: d.settings.default_view || 'weekly',
            });
        });
    }, []);

    async function save() {
        setSaving(true);
        await fetch('/api/admin/pos/model-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings),
        });
        setSaving(false);
        setMsg('Settings saved.');
        setTimeout(() => setMsg(''), 3000);
    }

    const sensitivityPct = Math.round(settings.sensitivity * 100);

    const Tip = ({ children }: { children: React.ReactNode }) => (
        <p className="flex items-start gap-1.5 text-gray-500 text-xs mt-1.5">
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>{children}</span>
        </p>
    );

    return (
        <div className="max-w-xl space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Model Settings</h1>
                    <p className="text-gray-400 text-sm mt-0.5">Configure how the anomaly detection model analyzes your inventory vs. POS sales</p>
                </div>
                <NextLink href="/admin/pos-dashboard" className="px-3 py-2 bg-gray-800 border border-gray-700 text-gray-300 hover:text-white rounded-lg text-sm transition-colors">
                    ← Dashboard
                </NextLink>
            </div>

            {msg && <div className="px-4 py-3 bg-green-900/30 border border-green-700/50 text-green-300 rounded-lg text-sm">{msg}</div>}

            <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 space-y-7">

                {/* Detection Sensitivity */}
                <div>
                    <div className="flex items-center justify-between mb-1">
                        <label className="text-white font-medium text-sm">Detection Sensitivity</label>
                        <span className="text-blue-400 font-bold">{sensitivityPct}%</span>
                    </div>
                    <input type="range" min={0} max={100} step={5}
                        value={sensitivityPct}
                        onChange={e => setSettings(s => ({ ...s, sensitivity: Number(e.target.value) / 100 }))}
                        className="w-full accent-blue-500" />
                    <div className="flex justify-between text-gray-600 text-xs mt-1">
                        <span>Lenient (major anomalies only)</span>
                        <span>Strict (small deviations flagged)</span>
                    </div>
                    <Tip>At {sensitivityPct}%, the model flags items where actual usage deviates from expected by more than {Math.round((1 - settings.sensitivity) * 50)}%. Increase sensitivity to catch smaller variances; decrease it to reduce noise.</Tip>
                </div>

                {/* Default oz per shot */}
                <div>
                    <label className="block text-white font-medium text-sm mb-2">Default Oz Per Serving</label>
                    <div className="flex items-center gap-3">
                        <input type="number" min={0.25} step={0.25} max={16}
                            value={settings.oz_per_shot}
                            onChange={e => setSettings(s => ({ ...s, oz_per_shot: parseFloat(e.target.value) || 1.5 }))}
                            className="w-28 bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
                        <span className="text-gray-400 text-sm">oz</span>
                    </div>
                    <Tip>Used for POS items that have not been individually mapped. Applies to unmapped items when estimating expected inventory usage. Standard pour is 1.5 oz; double is 3 oz.</Tip>
                </div>

                {/* Padding Percentage */}
                <div>
                    <div className="flex items-center justify-between mb-1">
                        <label className="text-white font-medium text-sm">Estimation Padding</label>
                        <span className="text-white font-bold">{settings.padding_pct.toFixed(0)}%</span>
                    </div>
                    <input type="range" min={0} max={30} step={1}
                        value={settings.padding_pct}
                        onChange={e => setSettings(s => ({ ...s, padding_pct: Number(e.target.value) }))}
                        className="w-full accent-blue-500" />
                    <div className="flex justify-between text-gray-600 text-xs mt-1">
                        <span>0% — exact estimate</span>
                        <span>30% — generous buffer</span>
                    </div>
                    <Tip>Adds a buffer to the expected usage calculation to account for spillage, free pours, and recipe variations. A value of 5% means expected usage is inflated by 5% before comparison.</Tip>
                </div>

                {/* Common pour reference */}
                <div className="bg-gray-800/50 rounded-lg p-4">
                    <p className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-3">Common Pour Reference</p>
                    <div className="grid grid-cols-2 gap-y-2 text-sm">
                        {[['Standard shot', '1.5 oz'], ['Double shot', '3 oz'], ['Wine pour (glass)', '5 oz'], ['Beer (pint)', '16 oz'], ['750ml bottle', '~16.9 shots'], ['1L bottle', '~22.5 shots']].map(([label, val]) => (
                            <div key={label} className="flex gap-2">
                                <span className="text-gray-500">{label}:</span>
                                <span className="text-white">{val}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Default view */}
                <div>
                    <label className="block text-white font-medium text-sm mb-2">Default Dashboard View</label>
                    <div className="flex gap-2">
                        {['weekly', 'monthly'].map(v => (
                            <button key={v} type="button"
                                onClick={() => setSettings(s => ({ ...s, default_view: v }))}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${settings.default_view === v ? 'bg-blue-600 border-blue-600 text-white' : 'bg-gray-800 border-gray-600 text-gray-400 hover:text-white'}`}>
                                {v === 'weekly' ? 'Weekly' : 'Monthly'}
                            </button>
                        ))}
                    </div>
                </div>

                <button type="button" onClick={save} disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                    <Save className="w-4 h-4" />
                    {saving ? 'Saving…' : 'Save Settings'}
                </button>
            </div>
        </div>
    );
}
