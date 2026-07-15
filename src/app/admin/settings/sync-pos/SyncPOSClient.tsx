'use client';

import { useState, useEffect } from 'react';
import { Save, RefreshCw, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, Play } from 'lucide-react';

interface SyncLog {
    pos_type: string;
    started_at: string;
    completed_at: string | null;
    status: string;
    records_fetched: number;
    records_inserted: number;
    error_message: string | null;
    triggered_by: string;
}

interface SyncSettings {
    pos_type: string;
    sync_enabled: boolean;
    sync_frequency: string;
    credentials: Record<string, string>;
    last_synced_at: string | null;
}

export default function SyncPOSClient({ toastEnabled, cloverEnabled }: { toastEnabled: boolean; cloverEnabled: boolean }) {
    const [activeTab, setActiveTab] = useState<'toast' | 'clover'>(toastEnabled ? 'toast' : 'clover');
    const [settings, setSettings] = useState<Record<string, SyncSettings>>({});
    const [logs, setLogs] = useState<SyncLog[]>([]);
    const [saving, setSaving] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [msg, setMsg] = useState('');
    const [showGuide, setShowGuide] = useState<Record<string, boolean>>({});

    const [toast, setToast] = useState({ restaurant_guid: '', sync_enabled: true, sync_frequency: 'hourly' });
    const [clover, setClover] = useState({ merchant_id: '', access_token: '', sync_enabled: true, sync_frequency: 'hourly' });

    useEffect(() => { load(); }, []);

    async function load() {
        const [settingsRes, logsRes] = await Promise.all([
            fetch('/api/admin/pos/sync-settings'),
            fetch('/api/admin/pos/sync'),
        ]);
        const settingsData = await settingsRes.json();
        const logsData = await logsRes.json();
        setLogs(logsData.logs || []);

        const byType: Record<string, SyncSettings> = {};
        for (const s of (settingsData.settings || [])) {
            byType[s.pos_type] = s;
        }
        setSettings(byType);

        if (byType.toast) {
            const c = byType.toast.credentials || {};
            setToast({ restaurant_guid: c.restaurant_guid || '', sync_enabled: byType.toast.sync_enabled, sync_frequency: byType.toast.sync_frequency || 'hourly' });
        }
        if (byType.clover) {
            const c = byType.clover.credentials || {};
            setClover({ merchant_id: c.merchant_id || '', access_token: c.access_token ? '••••••••' : '', sync_enabled: byType.clover.sync_enabled, sync_frequency: byType.clover.sync_frequency || 'hourly' });
        }
    }

    async function save(posType: 'toast' | 'clover') {
        setSaving(true);
        const payload = posType === 'toast'
            ? { pos_type: 'toast', sync_enabled: toast.sync_enabled, sync_frequency: toast.sync_frequency, credentials: { restaurant_guid: toast.restaurant_guid } }
            : { pos_type: 'clover', sync_enabled: clover.sync_enabled, sync_frequency: clover.sync_frequency, credentials: { merchant_id: clover.merchant_id, access_token: clover.access_token } };

        const res = await fetch('/api/admin/pos/sync-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        setSaving(false);
        if (res.ok) { setMsg('Settings saved.'); setTimeout(() => setMsg(''), 3000); }
    }

    async function triggerSync(posType: string) {
        setSyncing(true);
        await fetch('/api/admin/pos/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pos_type: posType }),
        });
        setSyncing(false);
        setMsg('Sync started — check logs for progress.');
        setTimeout(() => { setMsg(''); load(); }, 5000);
    }

    const lastSync = (posType: string) => {
        const s = settings[posType];
        if (!s?.last_synced_at) return 'Never';
        return new Date(s.last_synced_at).toLocaleString();
    };

    const statusIcon = (s: string) => {
        if (s === 'success') return <CheckCircle className="w-3.5 h-3.5 text-green-500" />;
        if (s === 'error') return <XCircle className="w-3.5 h-3.5 text-red-500" />;
        return <Clock className="w-3.5 h-3.5 text-amber-500" />;
    };

    const Field = ({ label, value, onChange, type = 'text', placeholder = '' }: any) => (
        <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">{label}</label>
            <input
                type={type}
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
            />
        </div>
    );

    const freqOptions = ['hourly', 'every_4h', 'every_12h', 'daily'];

    return (
        <div className="max-w-3xl space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Sync POS</h1>
                <p className="text-gray-400 text-sm mt-1">Configure your Point of Sale integration to automatically import transaction data</p>
            </div>

            {msg && <div className="px-4 py-3 bg-green-900/30 border border-green-700/50 text-green-300 rounded-lg text-sm">{msg}</div>}

            {/* Tab selector */}
            <div className="flex gap-2 bg-gray-900 p-1 rounded-xl w-fit border border-gray-700">
                {toastEnabled && (
                    <button type="button" onClick={() => setActiveTab('toast')}
                        className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'toast' ? 'bg-orange-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                        Toast POS
                    </button>
                )}
                {cloverEnabled && (
                    <button type="button" onClick={() => setActiveTab('clover')}
                        className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'clover' ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                        Clover POS
                    </button>
                )}
            </div>

            {/* Toast Config */}
            {activeTab === 'toast' && toastEnabled && (
                <div className="space-y-5">
                    {/* Guide */}
                    <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
                        <button type="button" onClick={() => setShowGuide(g => ({ ...g, toast: !g.toast }))}
                            className="w-full flex items-center justify-between px-5 py-4 text-left">
                            <span className="text-white font-medium text-sm">How to find your Toast Restaurant GUID</span>
                            {showGuide.toast ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                        </button>
                        {showGuide.toast && (
                            <div className="px-5 pb-5 border-t border-gray-700">
                                <ol className="mt-4 space-y-3">
                                    <li className="text-sm text-gray-300"><span className="text-orange-400 font-bold mr-2">1.</span>Log in to your Toast account at <span className="text-orange-400">toasttab.com</span></li>
                                    <li className="text-sm text-gray-300"><span className="text-orange-400 font-bold mr-2">2.</span>Go to <strong>Settings → Integrations → API Access</strong></li>
                                    <li className="text-sm text-gray-300"><span className="text-orange-400 font-bold mr-2">3.</span>Your <strong>Restaurant GUID</strong> is listed there — copy and paste it below</li>
                                    <li className="text-sm text-gray-300"><span className="text-orange-400 font-bold mr-2">4.</span>Enable API access if prompted and confirm with your Toast account manager</li>
                                </ol>
                            </div>
                        )}
                    </div>

                    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-white font-semibold">Toast Settings</h2>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-400 text-xs">Last sync: {lastSync('toast')}</span>
                            </div>
                        </div>

                        <Field label="Restaurant GUID" value={toast.restaurant_guid}
                            onChange={(v: string) => setToast(s => ({ ...s, restaurant_guid: v }))}
                            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1.5">Sync Frequency</label>
                            <select value={toast.sync_frequency}
                                onChange={e => setToast(s => ({ ...s, sync_frequency: e.target.value }))}
                                className="w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500">
                                {freqOptions.map(f => <option key={f} value={f}>{f.replace(/_/g, ' ')}</option>)}
                            </select>
                        </div>

                        <div className="flex items-center justify-between">
                            <label className="text-sm text-gray-300 font-medium">Auto-sync enabled</label>
                            <button type="button" title={toast.sync_enabled ? 'Disable auto-sync' : 'Enable auto-sync'}
                                onClick={() => setToast(s => ({ ...s, sync_enabled: !s.sync_enabled }))}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${toast.sync_enabled ? 'bg-blue-600' : 'bg-gray-600'}`}>
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${toast.sync_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>

                        <div className="flex gap-3 pt-1">
                            <button type="button" onClick={() => save('toast')} disabled={saving}
                                className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                                <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save'}
                            </button>
                            <button type="button" onClick={() => triggerSync('toast')} disabled={syncing}
                                className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                                <Play className="w-4 h-4" /> {syncing ? 'Starting…' : 'Sync Now'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Clover Config */}
            {activeTab === 'clover' && cloverEnabled && (
                <div className="space-y-5">
                    <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
                        <button type="button" onClick={() => setShowGuide(g => ({ ...g, clover: !g.clover }))}
                            className="w-full flex items-center justify-between px-5 py-4 text-left">
                            <span className="text-white font-medium text-sm">How to get your Clover Merchant ID &amp; API Token</span>
                            {showGuide.clover ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                        </button>
                        {showGuide.clover && (
                            <div className="px-5 pb-5 border-t border-gray-700">
                                <ol className="mt-4 space-y-3">
                                    <li className="text-sm text-gray-300"><span className="text-green-400 font-bold mr-2">1.</span>Log in to your Clover dashboard at <span className="text-green-400">clover.com/dashboard</span></li>
                                    <li className="text-sm text-gray-300"><span className="text-green-400 font-bold mr-2">2.</span>Your <strong>Merchant ID</strong> is shown in the URL: dashboard.clover.com/home/m/<strong className="text-white">YOUR_MID</strong></li>
                                    <li className="text-sm text-gray-300"><span className="text-green-400 font-bold mr-2">3.</span>Go to <strong>Account &amp; Setup → API Tokens</strong> and generate or copy an API token</li>
                                    <li className="text-sm text-gray-300"><span className="text-green-400 font-bold mr-2">4.</span>Paste both values below — the token has full read access to your orders</li>
                                </ol>
                            </div>
                        )}
                    </div>

                    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-white font-semibold">Clover Settings</h2>
                            <span className="text-gray-400 text-xs">Last sync: {lastSync('clover')}</span>
                        </div>

                        <Field label="Merchant ID" value={clover.merchant_id}
                            onChange={(v: string) => setClover(s => ({ ...s, merchant_id: v }))}
                            placeholder="Your Clover Merchant ID" />
                        <Field label="API Access Token" value={clover.access_token} type="password"
                            onChange={(v: string) => setClover(s => ({ ...s, access_token: v }))}
                            placeholder="Enter to update token" />
                        <p className="text-gray-500 text-xs -mt-2">Leave masked to keep existing token</p>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1.5">Sync Frequency</label>
                            <select value={clover.sync_frequency}
                                onChange={e => setClover(s => ({ ...s, sync_frequency: e.target.value }))}
                                className="w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500">
                                {freqOptions.map(f => <option key={f} value={f}>{f.replace(/_/g, ' ')}</option>)}
                            </select>
                        </div>

                        <div className="flex items-center justify-between">
                            <label className="text-sm text-gray-300 font-medium">Auto-sync enabled</label>
                            <button type="button" title={clover.sync_enabled ? 'Disable auto-sync' : 'Enable auto-sync'}
                                onClick={() => setClover(s => ({ ...s, sync_enabled: !s.sync_enabled }))}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${clover.sync_enabled ? 'bg-blue-600' : 'bg-gray-600'}`}>
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${clover.sync_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>

                        <div className="flex gap-3 pt-1">
                            <button type="button" onClick={() => save('clover')} disabled={saving}
                                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                                <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save'}
                            </button>
                            <button type="button" onClick={() => triggerSync('clover')} disabled={syncing}
                                className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                                <Play className="w-4 h-4" /> {syncing ? 'Starting…' : 'Sync Now'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Recent Sync Logs */}
            <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
                    <h2 className="text-white font-semibold">Recent Sync History</h2>
                    <button type="button" onClick={load} className="text-gray-400 hover:text-white">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>
                {logs.length === 0 ? (
                    <p className="px-5 py-6 text-gray-500 text-sm text-center">No sync history yet. Save your credentials and click &ldquo;Sync Now&rdquo; to start.</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-700">
                                <th className="text-left text-gray-400 text-xs uppercase px-5 py-2.5 font-medium">POS</th>
                                <th className="text-left text-gray-400 text-xs uppercase px-5 py-2.5 font-medium">When</th>
                                <th className="text-left text-gray-400 text-xs uppercase px-5 py-2.5 font-medium">Fetched</th>
                                <th className="text-left text-gray-400 text-xs uppercase px-5 py-2.5 font-medium">New</th>
                                <th className="text-left text-gray-400 text-xs uppercase px-5 py-2.5 font-medium">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {logs.map((log, i) => (
                                <tr key={i} className="hover:bg-gray-800/40">
                                    <td className="px-5 py-2.5">
                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${log.pos_type === 'toast' ? 'bg-orange-900/40 text-orange-400' : 'bg-green-900/40 text-green-400'}`}>
                                            {log.pos_type}
                                        </span>
                                    </td>
                                    <td className="px-5 py-2.5 text-gray-400 text-xs">{new Date(log.started_at).toLocaleString()}</td>
                                    <td className="px-5 py-2.5 text-gray-300">{log.records_fetched}</td>
                                    <td className="px-5 py-2.5 text-gray-300">{log.records_inserted}</td>
                                    <td className="px-5 py-2.5">
                                        <div className="flex items-center gap-1.5">
                                            {statusIcon(log.status)}
                                            <span className={`text-xs ${log.status === 'success' ? 'text-green-400' : log.status === 'error' ? 'text-red-400' : 'text-amber-400'}`}>
                                                {log.status}
                                            </span>
                                        </div>
                                        {log.error_message && (
                                            <p className="text-red-400/70 text-xs mt-0.5 max-w-xs truncate" title={log.error_message}>{log.error_message}</p>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
