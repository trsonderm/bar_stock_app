'use client';

import { useState, useEffect } from 'react';
import { Receipt, Save, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';

export default function ToastPOSClient() {
    const [settings, setSettings] = useState({ client_id: '', client_secret: '' });
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');
    const [showGuide, setShowGuide] = useState(false);

    useEffect(() => {
        fetch('/api/super-admin/pos/settings').then(r => r.json()).then(d => {
            const ts = d.settings?.pos_toast_settings || {};
            setSettings({ client_id: ts.client_id || '', client_secret: ts.client_secret ? '••••••••' : '' });
        });
    }, []);

    async function save() {
        setSaving(true);
        const payload: Record<string, string> = { client_id: settings.client_id };
        if (settings.client_secret && !settings.client_secret.startsWith('••')) {
            payload.client_secret = settings.client_secret;
        }
        await fetch('/api/super-admin/pos/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ toast_settings: payload }),
        });
        setSaving(false);
        setMsg('Toast POS settings saved.');
        setTimeout(() => setMsg(''), 3000);
    }

    return (
        <div className="p-8 max-w-3xl">
            <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 bg-orange-600/20 rounded-xl flex items-center justify-center">
                    <Receipt className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-white">Toast POS Configuration</h1>
                    <p className="text-slate-400 text-sm">Global developer API credentials for Toast integration</p>
                </div>
            </div>

            {msg && <div className="mb-6 px-4 py-3 bg-green-900/30 border border-green-700/50 text-green-300 rounded-lg text-sm">{msg}</div>}

            {/* Setup Guide */}
            <div className="mb-6 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <button
                    onClick={() => setShowGuide(!showGuide)}
                    className="w-full flex items-center justify-between px-6 py-4 text-left"
                >
                    <span className="text-white font-medium">Setup Guide — Toast API Access</span>
                    {showGuide ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>
                {showGuide && (
                    <div className="px-6 pb-6 space-y-4 border-t border-slate-800">
                        <ol className="space-y-4 mt-4">
                            <li className="flex gap-3">
                                <span className="flex-shrink-0 w-6 h-6 bg-orange-600/20 text-orange-400 rounded-full flex items-center justify-center text-xs font-bold">1</span>
                                <div>
                                    <p className="text-white font-medium text-sm">Register as a Toast Developer Partner</p>
                                    <p className="text-slate-400 text-xs mt-1">Go to <span className="text-orange-400">dev.toasttab.com</span> and create a developer account. Request API access for &ldquo;Machine Client&rdquo; authentication type.</p>
                                </div>
                            </li>
                            <li className="flex gap-3">
                                <span className="flex-shrink-0 w-6 h-6 bg-orange-600/20 text-orange-400 rounded-full flex items-center justify-center text-xs font-bold">2</span>
                                <div>
                                    <p className="text-white font-medium text-sm">Create a Toast Integration</p>
                                    <p className="text-slate-400 text-xs mt-1">In your developer dashboard, create an integration and note the <strong className="text-white">Client ID</strong> and <strong className="text-white">Client Secret</strong>. These are the global credentials entered below.</p>
                                </div>
                            </li>
                            <li className="flex gap-3">
                                <span className="flex-shrink-0 w-6 h-6 bg-orange-600/20 text-orange-400 rounded-full flex items-center justify-center text-xs font-bold">3</span>
                                <div>
                                    <p className="text-white font-medium text-sm">Organization-level setup</p>
                                    <p className="text-slate-400 text-xs mt-1">Each restaurant organization must provide their <strong className="text-white">Restaurant GUID</strong> from their Toast account (Settings → Integrations → API Access). They enter this in Admin → Settings → Sync POS.</p>
                                </div>
                            </li>
                            <li className="flex gap-3">
                                <span className="flex-shrink-0 w-6 h-6 bg-orange-600/20 text-orange-400 rounded-full flex items-center justify-center text-xs font-bold">4</span>
                                <div>
                                    <p className="text-white font-medium text-sm">API Endpoints used</p>
                                    <p className="text-slate-400 text-xs mt-1 font-mono">POST /authentication/v1/authentication/login<br/>GET /orders/v2/ordersBulk?startDate=&amp;endDate=</p>
                                    <p className="text-slate-500 text-xs mt-1">Base URL: ws-api.toasttab.com</p>
                                </div>
                            </li>
                        </ol>
                    </div>
                )}
            </div>

            {/* Credentials Form */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-5">Global Developer Credentials</h2>
                <div className="space-y-4">
                    <div>
                        <label className="block text-slate-400 text-xs font-medium mb-1.5 uppercase tracking-wider">Client ID</label>
                        <input
                            type="text"
                            value={settings.client_id}
                            onChange={e => setSettings(s => ({ ...s, client_id: e.target.value }))}
                            className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500"
                            placeholder="Toast API Client ID"
                        />
                    </div>
                    <div>
                        <label className="block text-slate-400 text-xs font-medium mb-1.5 uppercase tracking-wider">Client Secret</label>
                        <input
                            type="password"
                            value={settings.client_secret}
                            onChange={e => setSettings(s => ({ ...s, client_secret: e.target.value }))}
                            className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500"
                            placeholder="Enter to update secret"
                        />
                        <p className="text-slate-500 text-xs mt-1">Leave masked to keep existing value</p>
                    </div>
                </div>
                <button
                    onClick={save}
                    disabled={saving}
                    className="mt-5 flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                >
                    <Save className="w-4 h-4" />
                    {saving ? 'Saving…' : 'Save Toast Settings'}
                </button>
            </div>

            <div className="mt-4 text-center">
                <a href="https://dev.toasttab.com" target="_blank" rel="noreferrer"
                    className="text-slate-400 hover:text-white text-xs inline-flex items-center gap-1">
                    Toast Developer Portal <ExternalLink className="w-3 h-3" />
                </a>
            </div>
        </div>
    );
}
