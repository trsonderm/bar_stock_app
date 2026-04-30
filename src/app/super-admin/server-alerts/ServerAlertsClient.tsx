'use client';

import { useState, useEffect } from 'react';
import { Bell, Server, Database, Shield, TrendingUp, CreditCard, Mail, Save, ChevronRight, Users } from 'lucide-react';

interface AlertConfig {
    id?: number;
    alert_type: string;
    label: string;
    enabled: boolean;
    threshold_value: number;
    threshold_unit: string;
    recipients_json: number[];
}

interface SuperAdmin {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
}

const ALERT_GROUPS = [
    {
        label: 'Server Resources',
        icon: Server,
        color: '#3b82f6',
        types: ['cpu_high', 'memory_high', 'disk_high'],
    },
    {
        label: 'Database',
        icon: Database,
        color: '#7c3aed',
        types: ['db_size_limit', 'error_rate_spike'],
    },
    {
        label: 'Security',
        icon: Shield,
        color: '#ef4444',
        types: ['login_failures', 'unusual_activity'],
    },
    {
        label: 'Business / Growth',
        icon: TrendingUp,
        color: '#059669',
        types: ['new_org_signup', 'trial_expiring', 'orgs_approaching_limit'],
    },
    {
        label: 'Billing',
        icon: CreditCard,
        color: '#f59e0b',
        types: ['billing_failed'],
    },
    {
        label: 'Email Delivery',
        icon: Mail,
        color: '#6366f1',
        types: ['email_failures'],
    },
];

export default function ServerAlertsClient() {
    const [alerts, setAlerts] = useState<AlertConfig[]>([]);
    const [superAdmins, setSuperAdmins] = useState<SuperAdmin[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [savedMsg, setSavedMsg] = useState('');

    useEffect(() => {
        fetch('/api/super-admin/server-alerts')
            .then(r => r.json())
            .then(d => {
                setAlerts(d.alerts || []);
                setSuperAdmins(d.superAdmins || []);
                if (d.alerts?.length > 0) setSelected(d.alerts[0].alert_type);
            });
    }, []);

    const update = (field: string, value: any) => {
        setAlerts(prev => prev.map(a => a.alert_type === selected ? { ...a, [field]: value } : a));
    };

    const toggleRecipient = (userId: number) => {
        const current = alerts.find(a => a.alert_type === selected);
        if (!current) return;
        const existing = current.recipients_json || [];
        const next = existing.includes(userId)
            ? existing.filter((id: number) => id !== userId)
            : [...existing, userId];
        update('recipients_json', next);
    };

    const saveAlert = async (alertType: string) => {
        const alert = alerts.find(a => a.alert_type === alertType);
        if (!alert) return;
        setSaving(true);
        setSavedMsg('');
        await fetch('/api/super-admin/server-alerts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(alert),
        });
        setSavedMsg('Saved');
        setSaving(false);
        setTimeout(() => setSavedMsg(''), 2000);
    };

    const saveAll = async () => {
        setSaving(true);
        setSavedMsg('');
        for (const alert of alerts) {
            await fetch('/api/super-admin/server-alerts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(alert),
            });
        }
        setSavedMsg('All saved');
        setSaving(false);
        setTimeout(() => setSavedMsg(''), 2500);
    };

    const current = alerts.find(a => a.alert_type === selected);

    return (
        <div className="flex h-full min-h-screen text-white" style={{ background: '#0f172a' }}>
            {/* Left sidebar */}
            <aside className="w-64 border-r border-slate-800 flex-shrink-0 bg-slate-950 overflow-y-auto">
                <div className="p-5 border-b border-slate-800">
                    <h2 className="font-bold text-lg flex items-center gap-2 text-white">
                        <Bell size={18} className="text-blue-400" /> Server Alerts
                    </h2>
                    <p className="text-slate-500 text-xs mt-1">Configure thresholds & recipients</p>
                </div>
                <nav className="py-3">
                    {ALERT_GROUPS.map(group => {
                        const Icon = group.icon;
                        const groupAlerts = alerts.filter(a => group.types.includes(a.alert_type));
                        return (
                            <div key={group.label} className="mb-1">
                                <div className="flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                                    <Icon size={12} style={{ color: group.color }} />
                                    {group.label}
                                </div>
                                {groupAlerts.map(alert => (
                                    <button
                                        key={alert.alert_type}
                                        onClick={() => setSelected(alert.alert_type)}
                                        className={`w-full text-left flex items-center justify-between px-6 py-2.5 text-sm transition-colors ${
                                            selected === alert.alert_type
                                                ? 'bg-blue-600/10 text-blue-300 border-r-2 border-blue-500'
                                                : 'text-slate-400 hover:text-white hover:bg-slate-900'
                                        }`}
                                    >
                                        <span className="flex items-center gap-2">
                                            <span className={`w-1.5 h-1.5 rounded-full ${alert.enabled ? 'bg-green-400' : 'bg-slate-600'}`} />
                                            {alert.label}
                                        </span>
                                        <ChevronRight size={12} className="text-slate-600" />
                                    </button>
                                ))}
                            </div>
                        );
                    })}
                </nav>
            </aside>

            {/* Detail panel */}
            <main className="flex-1 p-8 overflow-y-auto">
                <div className="max-w-2xl">
                    <div className="flex items-center justify-between mb-6">
                        <h1 className="text-xl font-bold">{current?.label || 'Select an alert'}</h1>
                        <div className="flex items-center gap-3">
                            {savedMsg && <span className="text-green-400 text-sm font-medium">{savedMsg}</span>}
                            <button
                                onClick={saveAll}
                                disabled={saving}
                                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
                            >
                                <Save size={14} /> Save All
                            </button>
                        </div>
                    </div>

                    {current ? (
                        <div className="space-y-6">
                            {/* Enable/Disable */}
                            <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="font-semibold text-white">Alert Enabled</h3>
                                        <p className="text-slate-400 text-sm mt-0.5">Send notifications when this condition is triggered</p>
                                    </div>
                                    <button
                                        onClick={() => update('enabled', !current.enabled)}
                                        className={`relative w-12 h-6 rounded-full transition-colors ${current.enabled ? 'bg-green-500' : 'bg-slate-700'}`}
                                    >
                                        <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${current.enabled ? 'left-7' : 'left-1'}`} />
                                    </button>
                                </div>
                            </div>

                            {/* Threshold */}
                            <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
                                <h3 className="font-semibold text-white mb-4">Threshold</h3>
                                <div className="flex items-center gap-3">
                                    <div className="flex-1">
                                        <label className="block text-slate-400 text-xs mb-1">Trigger when value exceeds</label>
                                        <input
                                            type="number"
                                            value={current.threshold_value}
                                            onChange={e => update('threshold_value', parseFloat(e.target.value))}
                                            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:border-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-slate-400 text-xs mb-1">Unit</label>
                                        <input
                                            type="text"
                                            value={current.threshold_unit}
                                            onChange={e => update('threshold_unit', e.target.value)}
                                            className="w-32 bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:border-blue-500"
                                        />
                                    </div>
                                </div>

                                {/* Predictive context */}
                                <div className="mt-4 p-3 bg-slate-950 rounded-lg border border-slate-800 text-sm text-slate-400">
                                    <span className="text-yellow-400 font-semibold">Predictive: </span>
                                    {getPredictiveHint(current.alert_type, current.threshold_value, current.threshold_unit)}
                                </div>
                            </div>

                            {/* Recipients */}
                            <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
                                <h3 className="font-semibold text-white mb-1 flex items-center gap-2">
                                    <Users size={15} className="text-blue-400" /> Notify These Super Admins
                                </h3>
                                <p className="text-slate-500 text-sm mb-4">Selected users receive an email alert when triggered.</p>
                                <div className="space-y-2">
                                    {superAdmins.map(sa => {
                                        const checked = (current.recipients_json || []).includes(sa.id);
                                        return (
                                            <label key={sa.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 cursor-pointer transition-colors">
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => toggleRecipient(sa.id)}
                                                    className="w-4 h-4 accent-blue-500"
                                                />
                                                <div className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-600/40 flex items-center justify-center text-blue-400 font-bold text-xs flex-shrink-0">
                                                    {sa.first_name?.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="text-white text-sm font-medium">{sa.first_name} {sa.last_name}</p>
                                                    <p className="text-slate-500 text-xs">{sa.email}</p>
                                                </div>
                                            </label>
                                        );
                                    })}
                                    {superAdmins.length === 0 && (
                                        <p className="text-slate-600 text-sm">No super admins available. Add super admins first.</p>
                                    )}
                                </div>
                            </div>

                            <button
                                onClick={() => saveAlert(current.alert_type)}
                                disabled={saving}
                                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
                            >
                                <Save size={15} /> Save This Alert
                            </button>
                        </div>
                    ) : (
                        <div className="text-slate-600 text-center py-20">Select an alert type from the left menu</div>
                    )}
                </div>
            </main>
        </div>
    );
}

function getPredictiveHint(alertType: string, threshold: number, unit: string): string {
    switch (alertType) {
        case 'cpu_high':
            return `Alert fires when CPU exceeds ${threshold}% sustained. Trend monitoring will warn 15 min before typical saturation based on moving average.`;
        case 'memory_high':
            return `Alert fires when RAM exceeds ${threshold}%. Useful for detecting memory leaks — look for gradual climb patterns.`;
        case 'disk_high':
            return `Alert fires when disk hits ${threshold}%. Consider alerting earlier (e.g. 70%) to give time before service disruption.`;
        case 'db_size_limit':
            return `Fires when DB exceeds ${threshold} ${unit}. Trend: alert at 80% of this value to leave runaway before emergency.`;
        case 'error_rate_spike':
            return `Fires when errors exceed ${threshold} per minute. Sudden spikes often indicate a bad deploy or DB issue.`;
        case 'login_failures':
            return `Fires after ${threshold} failures per hour. May indicate brute-force or a user locked out — cross-check with IP logs.`;
        case 'unusual_activity':
            return `Fires when an org logs more than ${threshold} actions/hour. Could indicate scripted automation or suspicious bulk action.`;
        case 'new_org_signup':
            return `Fires on each new signup. Useful for immediate welcome outreach or fraud detection on trial abuse.`;
        case 'trial_expiring':
            return `Fires ${threshold} days before trial end. Allows proactive outreach to convert to paid plan.`;
        case 'billing_failed':
            return `Fires on any billing failure. Immediate notification lets you reach out before the org loses access.`;
        case 'orgs_approaching_limit':
            return `Fires when an org uses ${threshold}% of their plan limit. Early warning to upsell before they hit a wall.`;
        case 'email_failures':
            return `Fires after ${threshold} email failures per hour. May indicate SMTP misconfiguration or provider issues.`;
        default:
            return `Fires when the metric crosses the threshold of ${threshold} ${unit}.`;
    }
}
