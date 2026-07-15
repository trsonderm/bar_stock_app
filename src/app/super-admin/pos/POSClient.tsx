'use client';

import { useState, useEffect } from 'react';
import { Receipt, Globe, Building2, CheckCircle, XCircle, RefreshCw } from 'lucide-react';

interface Org {
    id: number;
    name: string;
    toast_pos_enabled: boolean;
    clover_pos_enabled: boolean;
    billing_status: string;
}

export default function POSClient() {
    const [globalEnabled, setGlobalEnabled] = useState(false);
    const [orgs, setOrgs] = useState<Org[]>([]);
    const [counts, setCounts] = useState<any[]>([]);
    const [saving, setSaving] = useState(false);
    const [savingOrgId, setSavingOrgId] = useState<number | null>(null);
    const [msg, setMsg] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        const [settingsRes, orgsRes] = await Promise.all([
            fetch('/api/super-admin/pos/settings'),
            fetch('/api/super-admin/organizations'),
        ]);
        const settingsData = await settingsRes.json();
        const orgsData = await orgsRes.json();
        setGlobalEnabled(settingsData.settings?.pos_global_enabled === true || settingsData.settings?.pos_global_enabled === 'true');
        setCounts(settingsData.counts || []);
        setOrgs(orgsData.organizations || []);
    }

    async function saveGlobalEnabled(val: boolean) {
        setSaving(true);
        await fetch('/api/super-admin/pos/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pos_global_enabled: val }),
        });
        setGlobalEnabled(val);
        setSaving(false);
        setMsg(val ? 'POS enabled for all organizations.' : 'POS global setting disabled.');
        setTimeout(() => setMsg(''), 3000);
    }

    async function toggleOrgPOS(orgId: number, field: 'toast_pos_enabled' | 'clover_pos_enabled', val: boolean) {
        setSavingOrgId(orgId);
        await fetch('/api/super-admin/organizations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: orgId, [field]: val }),
        });
        setOrgs(prev => prev.map(o => o.id === orgId ? { ...o, [field]: val } : o));
        setSavingOrgId(null);
    }

    const toastCount = counts.find((c: any) => c.pos_type === 'toast')?.cnt || 0;
    const cloverCount = counts.find((c: any) => c.pos_type === 'clover')?.cnt || 0;

    return (
        <div className="p-8 max-w-6xl">
            <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 bg-green-600/20 rounded-xl flex items-center justify-center">
                    <Receipt className="w-5 h-5 text-green-400" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-white">POS Integration</h1>
                    <p className="text-slate-400 text-sm">Manage Toast and Clover POS connections across all organizations</p>
                </div>
            </div>

            {msg && (
                <div className="mb-6 px-4 py-3 bg-green-900/30 border border-green-700/50 text-green-300 rounded-lg text-sm">{msg}</div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                    <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Toast Connected</p>
                    <p className="text-2xl font-bold text-white">{toastCount}</p>
                    <p className="text-slate-500 text-xs mt-1">organizations</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                    <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Clover Connected</p>
                    <p className="text-2xl font-bold text-white">{cloverCount}</p>
                    <p className="text-slate-500 text-xs mt-1">organizations</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                    <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Total Orgs</p>
                    <p className="text-2xl font-bold text-white">{orgs.length}</p>
                    <p className="text-slate-500 text-xs mt-1">in system</p>
                </div>
            </div>

            {/* Global toggle */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Globe className="w-5 h-5 text-blue-400" />
                        <div>
                            <p className="text-white font-medium">Global POS Access</p>
                            <p className="text-slate-400 text-sm">Enable POS features for ALL active organizations regardless of per-org settings</p>
                        </div>
                    </div>
                    <button
                        onClick={() => saveGlobalEnabled(!globalEnabled)}
                        disabled={saving}
                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                            globalEnabled ? 'bg-blue-600' : 'bg-slate-700'
                        } disabled:opacity-50`}
                    >
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${globalEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>
                {globalEnabled && (
                    <p className="mt-3 text-amber-400 text-xs flex items-center gap-1.5">
                        <span>⚠</span> Global POS is ON — all organizations can see POS navigation and configure sync
                    </p>
                )}
            </div>

            {/* Per-org table */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-slate-400" />
                        <h2 className="text-white font-semibold">Per-Organization POS Access</h2>
                    </div>
                    <button onClick={loadData} className="text-slate-400 hover:text-white p-1">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-800">
                                <th className="text-left text-slate-400 text-xs uppercase tracking-wider px-6 py-3 font-medium">Organization</th>
                                <th className="text-left text-slate-400 text-xs uppercase tracking-wider px-6 py-3 font-medium">Status</th>
                                <th className="text-center text-slate-400 text-xs uppercase tracking-wider px-6 py-3 font-medium">Toast POS</th>
                                <th className="text-center text-slate-400 text-xs uppercase tracking-wider px-6 py-3 font-medium">Clover POS</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {orgs.map(org => {
                                const isSaving = savingOrgId === org.id;
                                return (
                                    <tr key={org.id} className="hover:bg-slate-800/30">
                                        <td className="px-6 py-3 text-white font-medium">{org.name}</td>
                                        <td className="px-6 py-3">
                                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                                org.billing_status === 'active' ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'
                                            }`}>{org.billing_status}</span>
                                        </td>
                                        <td className="px-6 py-3 text-center">
                                            <button
                                                disabled={isSaving}
                                                onClick={() => toggleOrgPOS(org.id, 'toast_pos_enabled', !org.toast_pos_enabled)}
                                                className="disabled:opacity-50"
                                            >
                                                {org.toast_pos_enabled
                                                    ? <CheckCircle className="w-5 h-5 text-green-400 mx-auto" />
                                                    : <XCircle className="w-5 h-5 text-slate-600 mx-auto" />
                                                }
                                            </button>
                                        </td>
                                        <td className="px-6 py-3 text-center">
                                            <button
                                                disabled={isSaving}
                                                onClick={() => toggleOrgPOS(org.id, 'clover_pos_enabled', !org.clover_pos_enabled)}
                                                className="disabled:opacity-50"
                                            >
                                                {org.clover_pos_enabled
                                                    ? <CheckCircle className="w-5 h-5 text-green-400 mx-auto" />
                                                    : <XCircle className="w-5 h-5 text-slate-600 mx-auto" />
                                                }
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
