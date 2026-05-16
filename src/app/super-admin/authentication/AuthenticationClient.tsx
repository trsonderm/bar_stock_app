'use client';

import { useState, useCallback } from 'react';
import { Eye, EyeOff, Copy, Check, Save, RefreshCw } from 'lucide-react';

type Settings = Record<string, string>;

interface ProviderConfig {
    key: string;
    label: string;
    color: string;
    textColor: string;
    badge: string;
    fields: { key: string; label: string; placeholder: string; secret?: boolean }[];
    extraFields?: { key: string; label: string; placeholder: string; hint?: string }[];
    docsUrl: string;
    docsLabel: string;
}

const PROVIDERS: ProviderConfig[] = [
    {
        key: 'google',
        label: 'Google',
        color: '#1e3a5f',
        textColor: '#60a5fa',
        badge: 'G',
        fields: [
            { key: 'sso_google_client_id', label: 'Client ID', placeholder: '123456789.apps.googleusercontent.com' },
            { key: 'sso_google_client_secret', label: 'Client Secret', placeholder: 'GOCSPX-...', secret: true },
        ],
        docsUrl: 'https://console.cloud.google.com/apis/credentials',
        docsLabel: 'Google Cloud Console',
    },
    {
        key: 'github',
        label: 'GitHub',
        color: '#1a1a2e',
        textColor: '#e2e8f0',
        badge: 'GH',
        fields: [
            { key: 'sso_github_client_id', label: 'Client ID', placeholder: 'Ov23liXXXXXXXXXX' },
            { key: 'sso_github_client_secret', label: 'Client Secret', placeholder: 'github_secret_...', secret: true },
        ],
        docsUrl: 'https://github.com/settings/developers',
        docsLabel: 'GitHub Developer Settings',
    },
    {
        key: 'microsoft',
        label: 'Microsoft',
        color: '#1e293b',
        textColor: '#7dd3fc',
        badge: 'MS',
        fields: [
            { key: 'sso_microsoft_client_id', label: 'Client ID (Application ID)', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
            { key: 'sso_microsoft_client_secret', label: 'Client Secret', placeholder: 'Client secret value', secret: true },
        ],
        extraFields: [
            { key: 'sso_microsoft_tenant_id', label: 'Tenant ID', placeholder: 'common', hint: 'Use "common" to allow any Microsoft account, or your tenant UUID to restrict to your org.' },
        ],
        docsUrl: 'https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
        docsLabel: 'Azure App Registrations',
    },
];

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            type="button"
            onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-slate-700"
        >
            {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied' : 'Copy'}
        </button>
    );
}

function ProviderCard({
    config, settings, callbackBase, onSave, saving,
}: {
    config: ProviderConfig;
    settings: Settings;
    callbackBase: string;
    onSave: (updates: Record<string, string>) => Promise<void>;
    saving: boolean;
}) {
    const enabledKey = `sso_${config.key}_enabled`;
    const isEnabled = settings[enabledKey] === 'true';
    const [local, setLocal] = useState<Record<string, string>>(() => {
        const init: Record<string, string> = { [enabledKey]: settings[enabledKey] || 'false' };
        for (const f of [...config.fields, ...(config.extraFields || [])]) {
            init[f.key] = settings[f.key] || '';
        }
        return init;
    });
    const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});
    const callbackUrl = `${callbackBase}/api/auth/callback/${config.key}`;

    const hasChanges = Object.keys(local).some(k => (local[k] || '') !== (settings[k] || ''));

    return (
        <div className={`rounded-xl border ${isEnabled ? 'border-blue-500/30 bg-slate-800/80' : 'border-slate-700 bg-slate-800/40'} p-5 flex flex-col gap-4`}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold"
                        style={{ background: config.color, color: config.textColor }}>
                        {config.badge}
                    </div>
                    <div>
                        <div className="text-white font-semibold">{config.label}</div>
                        <div className="text-xs text-slate-500">OAuth 2.0</div>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        const next = local[enabledKey] === 'true' ? 'false' : 'true';
                        setLocal(p => ({ ...p, [enabledKey]: next }));
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${local[enabledKey] === 'true' ? 'bg-blue-600' : 'bg-slate-600'}`}
                >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${local[enabledKey] === 'true' ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
            </div>

            {/* Credentials */}
            <div className="flex flex-col gap-3">
                {config.fields.map(f => (
                    <div key={f.key}>
                        <label className="block text-xs font-medium text-slate-400 mb-1">{f.label}</label>
                        <div className="relative">
                            <input
                                type={f.secret && !showSecret[f.key] ? 'password' : 'text'}
                                value={local[f.key] || ''}
                                onChange={e => setLocal(p => ({ ...p, [f.key]: e.target.value }))}
                                placeholder={f.placeholder}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 pr-10"
                            />
                            {f.secret && (
                                <button type="button" onClick={() => setShowSecret(p => ({ ...p, [f.key]: !p[f.key] }))}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                                    {showSecret[f.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            )}
                        </div>
                    </div>
                ))}
                {config.extraFields?.map(f => (
                    <div key={f.key}>
                        <label className="block text-xs font-medium text-slate-400 mb-1">{f.label}</label>
                        <input
                            type="text"
                            value={local[f.key] || ''}
                            onChange={e => setLocal(p => ({ ...p, [f.key]: e.target.value }))}
                            placeholder={f.placeholder}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                        />
                        {f.hint && <p className="text-xs text-slate-500 mt-1">{f.hint}</p>}
                    </div>
                ))}
            </div>

            {/* Callback URL */}
            <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Callback / Redirect URI</label>
                <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2">
                    <span className="text-xs text-slate-300 font-mono flex-1 truncate">{callbackUrl}</span>
                    <CopyButton text={callbackUrl} />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                    Add this URI to your{' '}
                    <a href={config.docsUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">{config.docsLabel}</a>
                </p>
            </div>

            {/* Save */}
            <button
                type="button"
                disabled={saving || !hasChanges}
                onClick={() => onSave(local)}
                className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40"
                style={{ background: hasChanges ? '#2563eb' : '#1e293b', color: 'white' }}
            >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving…' : 'Save Changes'}
            </button>
        </div>
    );
}

export default function AuthenticationClient({
    initialSettings,
    organizations,
}: {
    initialSettings: Settings;
    organizations: { id: number; name: string }[];
}) {
    const [settings, setSettings] = useState<Settings>(initialSettings);
    const [saving, setSaving] = useState<string | null>(null);
    const [generalLocal, setGeneralLocal] = useState({
        sso_allow_new_users: initialSettings['sso_allow_new_users'] || 'false',
        sso_allowed_domains: initialSettings['sso_allowed_domains'] || '',
        sso_default_role: initialSettings['sso_default_role'] || 'user',
        sso_default_org_id: initialSettings['sso_default_org_id'] || '',
    });
    const [generalSaving, setGeneralSaving] = useState(false);
    const [generalSaved, setGeneralSaved] = useState(false);

    const callbackBase = typeof window !== 'undefined' ? window.location.origin : '';

    const saveProvider = useCallback(async (updates: Record<string, string>) => {
        const key = Object.keys(updates)[0]?.replace('sso_', '').split('_')[0] || '';
        setSaving(key);
        try {
            await Promise.all(
                Object.entries(updates).map(([k, v]) =>
                    fetch('/api/super-admin/sso', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ key: k, value: v }),
                    })
                )
            );
            setSettings(prev => ({ ...prev, ...updates }));
        } finally {
            setSaving(null);
        }
    }, []);

    const saveGeneral = async () => {
        setGeneralSaving(true);
        try {
            await Promise.all(
                Object.entries(generalLocal).map(([k, v]) =>
                    fetch('/api/super-admin/sso', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ key: k, value: v }),
                    })
                )
            );
            setSettings(prev => ({ ...prev, ...generalLocal }));
            setGeneralSaved(true);
            setTimeout(() => setGeneralSaved(false), 2500);
        } finally {
            setGeneralSaving(false);
        }
    };

    const enabledCount = PROVIDERS.filter(p => settings[`sso_${p.key}_enabled`] === 'true').length;

    return (
        <div className="p-6 max-w-5xl mx-auto">
            {/* Page header */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-white mb-1">Authentication & SSO</h1>
                <p className="text-slate-400 text-sm">
                    Configure single sign-on providers for your platform. Enabled providers appear as login options on the sign-in page.
                </p>
            </div>

            {/* Status strip */}
            <div className="flex items-center gap-3 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 mb-6 text-sm">
                <span className={`w-2 h-2 rounded-full ${enabledCount > 0 ? 'bg-green-400' : 'bg-slate-500'}`} />
                <span className="text-slate-300">
                    {enabledCount === 0
                        ? 'No SSO providers enabled — only email/password login is active.'
                        : `${enabledCount} SSO provider${enabledCount !== 1 ? 's' : ''} enabled.`}
                </span>
            </div>

            {/* Provider cards */}
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Providers</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                {PROVIDERS.map(p => (
                    <ProviderCard
                        key={p.key}
                        config={p}
                        settings={settings}
                        callbackBase={callbackBase}
                        onSave={saveProvider}
                        saving={saving === p.key}
                    />
                ))}
            </div>

            {/* General settings */}
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">General SSO Settings</h2>
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col gap-5">

                {/* Allow new users */}
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-white font-medium text-sm">Allow new user registration via SSO</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                            When enabled, users signing in via SSO for the first time will have an account created automatically.
                            When disabled, only existing accounts can use SSO.
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setGeneralLocal(p => ({ ...p, sso_allow_new_users: p.sso_allow_new_users === 'true' ? 'false' : 'true' }))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ml-4 ${generalLocal.sso_allow_new_users === 'true' ? 'bg-blue-600' : 'bg-slate-600'}`}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${generalLocal.sso_allow_new_users === 'true' ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>

                {/* Allowed domains */}
                <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                        Allowed Email Domains
                        <span className="text-slate-500 font-normal ml-1">(optional — leave blank to allow all)</span>
                    </label>
                    <input
                        type="text"
                        value={generalLocal.sso_allowed_domains}
                        onChange={e => setGeneralLocal(p => ({ ...p, sso_allowed_domains: e.target.value }))}
                        placeholder="e.g. company.com, partner.org"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                    />
                    <p className="text-xs text-slate-500 mt-1">Comma-separated list. Users from other domains will be rejected at sign-in.</p>
                </div>

                {/* Default role */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Default Role for New SSO Users</label>
                        <select
                            value={generalLocal.sso_default_role}
                            onChange={e => setGeneralLocal(p => ({ ...p, sso_default_role: e.target.value }))}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                        >
                            <option value="user">Staff (user)</option>
                            <option value="admin">Admin</option>
                        </select>
                    </div>

                    {/* Default org */}
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Default Organization for New SSO Users</label>
                        <select
                            value={generalLocal.sso_default_org_id}
                            onChange={e => setGeneralLocal(p => ({ ...p, sso_default_org_id: e.target.value }))}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                        >
                            <option value="">— Select Organization —</option>
                            {organizations.map(o => <option key={o.id} value={String(o.id)}>{o.name}</option>)}
                        </select>
                        <p className="text-xs text-slate-500 mt-1">Required if new user registration is enabled.</p>
                    </div>
                </div>

                {/* Save */}
                <button
                    type="button"
                    onClick={saveGeneral}
                    disabled={generalSaving}
                    className="flex items-center justify-center gap-2 w-full sm:w-auto sm:self-end px-5 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition-colors"
                >
                    {generalSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : generalSaved ? <Check className="w-4 h-4 text-green-300" /> : <Save className="w-4 h-4" />}
                    {generalSaving ? 'Saving…' : generalSaved ? 'Saved!' : 'Save Settings'}
                </button>
            </div>

            {/* Setup guide */}
            <div className="mt-6 bg-slate-900 border border-slate-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-3">Quick Setup Guide</h3>
                <ol className="space-y-2 text-sm text-slate-400">
                    <li><span className="text-blue-400 font-bold mr-2">1.</span>Create an OAuth application at your provider (use the docs link in each card).</li>
                    <li><span className="text-blue-400 font-bold mr-2">2.</span>Copy the <strong className="text-slate-300">Callback / Redirect URI</strong> from the provider card and add it to your OAuth app&apos;s allowed redirect URIs.</li>
                    <li><span className="text-blue-400 font-bold mr-2">3.</span>Paste the <strong className="text-slate-300">Client ID</strong> and <strong className="text-slate-300">Client Secret</strong> into the fields above and save.</li>
                    <li><span className="text-blue-400 font-bold mr-2">4.</span>Toggle the provider <strong className="text-slate-300">on</strong> — it will appear as a login button on the sign-in page immediately.</li>
                    <li><span className="text-blue-400 font-bold mr-2">5.</span>Configure <strong className="text-slate-300">General SSO Settings</strong> to control whether new users can self-register and which organization they land in.</li>
                </ol>
            </div>
        </div>
    );
}
