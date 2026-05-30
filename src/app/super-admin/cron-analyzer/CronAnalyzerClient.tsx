'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Play, Mail, ChevronDown, ChevronUp, CheckCircle2, XCircle, Clock } from 'lucide-react';

type TaskStatus = 'SUCCESS' | 'FAILED';

interface TaskInfo {
    name: string;
    cron: string;
    intervalMinutes: number | null;
    lastRun: { status: TaskStatus; ts: string; error: string | null } | null;
}

interface SmtpTierInfo {
    configured: boolean;
    host: string;
    user: string;
}

interface EmailLogEntry {
    id: number;
    email_type: string;
    tier: string;
    subject: string | null;
    status: string;
    error_message: string | null;
    scheduled: boolean;
    sent_at: string | null;
    org_display: string | null;
}

interface AnalyzerData {
    schedulerRunning: boolean;
    tasks: TaskInfo[];
    smtp: Record<string, SmtpTierInfo>;
    recentEmails: EmailLogEntry[];
}

// Maps task name to POST trigger key
const TASK_KEY_MAP: Record<string, string> = {
    'Daily Cleanup': 'cleanup',
    'Billing Check': 'billing',
    'Auto Disable Past Due': 'disable',
    'Auto Backup': 'backup',
    'Report Schedules': 'reports',
    'Low Stock Alerts': 'low_stock',
    'Shift Report Emails': 'shift_reports',
};

const EMAIL_INTERVAL_TASKS = new Set(['Report Schedules', 'Low Stock Alerts', 'Shift Report Emails']);
const INTERVAL_OPTIONS = [1, 2, 3, 4, 5];

function humanCron(cron: string, intervalMinutes?: number | null): string {
    const parts = cron.split(' ');
    if (parts.length < 5) return cron;
    const [min, hr, dom, , dow] = parts;
    if (min === '*' && hr === '*') {
        if (intervalMinutes && intervalMinutes > 1) return `Every ${intervalMinutes} minutes`;
        return 'Every minute';
    }
    if (min !== '*' && hr !== '*' && dom === '*' && dow === '*') {
        const h = parseInt(hr);
        const m = parseInt(min);
        const period = h >= 12 ? 'PM' : 'AM';
        const displayH = h % 12 === 0 ? 12 : h % 12;
        const displayM = String(m).padStart(2, '0');
        return `Daily at ${displayH}:${displayM} ${period}`;
    }
    if (min === '0' && hr !== '*') return 'Every hour';
    return cron;
}

function Toast({ message, type, onClear }: { message: string; type: 'success' | 'error'; onClear: () => void }) {
    useEffect(() => {
        const t = setTimeout(onClear, 3000);
        return () => clearTimeout(t);
    }, [message, onClear]);

    return (
        <div className={`mt-2 text-xs px-3 py-1.5 rounded border ${type === 'success'
            ? 'bg-green-900/30 border-green-700 text-green-400'
            : 'bg-red-900/30 border-red-700 text-red-400'
            }`}>
            {message}
        </div>
    );
}

function TaskCard({
    task,
    onRun,
    onSetInterval,
}: {
    task: TaskInfo;
    onRun: (name: string) => Promise<void>;
    onSetInterval?: (name: string, minutes: number) => Promise<void>;
}) {
    const [loading, setLoading] = useState(false);
    const [intervalSaving, setIntervalSaving] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const isEmailTask = EMAIL_INTERVAL_TASKS.has(task.name);
    const currentInterval = task.intervalMinutes ?? 1;

    const handleRun = async () => {
        setLoading(true);
        setToast(null);
        try {
            await onRun(task.name);
            setToast({ message: 'Task triggered successfully.', type: 'success' });
        } catch (e: any) {
            setToast({ message: e.message || 'Failed to trigger task.', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleIntervalClick = async (n: number) => {
        if (!onSetInterval || n === currentInterval || intervalSaving) return;
        setIntervalSaving(true);
        setToast(null);
        try {
            await onSetInterval(task.name, n);
            setToast({ message: `Interval set to every ${n} minute${n > 1 ? 's' : ''}.`, type: 'success' });
        } catch (e: any) {
            setToast({ message: e.message || 'Failed to update interval.', type: 'error' });
        } finally {
            setIntervalSaving(false);
        }
    };

    const statusBadge = () => {
        if (!task.lastRun) {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-700 text-gray-400 border border-gray-600">
                    <Clock className="w-3 h-3" /> Never
                </span>
            );
        }
        if (task.lastRun.status === 'SUCCESS') {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-900/30 text-green-400 border border-green-700">
                    <CheckCircle2 className="w-3 h-3" /> SUCCESS
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-900/30 text-red-400 border border-red-700">
                <XCircle className="w-3 h-3" /> FAILED
            </span>
        );
    };

    return (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <div className="text-white font-semibold text-sm">{task.name}</div>
                    <div className="text-gray-500 text-xs font-mono mt-0.5">{task.cron}</div>
                    <div className="text-gray-400 text-xs mt-0.5">{humanCron(task.cron, task.intervalMinutes)}</div>
                </div>
                {statusBadge()}
            </div>

            {/* Interval selector — only for the three email-dispatch tasks */}
            {isEmailTask && (
                <div className="border border-gray-700 rounded-lg p-3 bg-gray-900/50">
                    <div className="text-xs text-gray-400 mb-2 font-medium">Run interval</div>
                    <div className="flex gap-1.5 flex-wrap">
                        {INTERVAL_OPTIONS.map(n => {
                            const active = n === currentInterval;
                            return (
                                <button
                                    key={n}
                                    type="button"
                                    onClick={() => handleIntervalClick(n)}
                                    disabled={intervalSaving}
                                    title={n === 1 ? 'Every minute' : `Every ${n} minutes`}
                                    className={`px-3 py-1 rounded text-xs font-semibold border transition-all disabled:opacity-50 ${
                                        active
                                            ? 'bg-blue-600 border-blue-500 text-white'
                                            : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-blue-500 hover:text-blue-300'
                                    }`}
                                >
                                    {n}m
                                </button>
                            );
                        })}
                        <span className="text-gray-600 text-xs self-center ml-1">
                            {intervalSaving ? 'Saving…' : `Active: every ${currentInterval} min`}
                        </span>
                    </div>
                </div>
            )}

            {task.lastRun && (
                <div className="text-gray-500 text-xs">
                    Last run: {new Date(task.lastRun.ts).toLocaleString()}
                    {task.lastRun.error && (
                        <div className="text-red-400 mt-0.5 truncate" title={task.lastRun.error}>
                            {task.lastRun.error}
                        </div>
                    )}
                </div>
            )}

            <button
                onClick={handleRun}
                disabled={loading}
                className="flex items-center gap-1.5 self-start bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded px-3 py-1.5 text-sm font-medium transition-colors"
            >
                <Play className="w-3.5 h-3.5" />
                {loading ? 'Running…' : 'Run Now'}
            </button>

            {toast && (
                <Toast message={toast.message} type={toast.type} onClear={() => setToast(null)} />
            )}
        </div>
    );
}

function SmtpEditForm({
    tier,
    onSave,
    onCancel,
}: {
    tier: string;
    onSave: (data: { host: string; port: string; user: string; pass: string; secure: boolean }) => Promise<void>;
    onCancel: () => void;
}) {
    const [host, setHost] = useState('');
    const [port, setPort] = useState('587');
    const [user, setUser] = useState('');
    const [pass, setPass] = useState('');
    const [secure, setSecure] = useState(false);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const handleSave = async () => {
        setSaving(true);
        setToast(null);
        try {
            await onSave({ host, port, user, pass, secure });
            setToast({ message: 'SMTP settings saved.', type: 'success' });
        } catch (e: any) {
            setToast({ message: e.message || 'Save failed.', type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="mt-3 border-t border-gray-700 pt-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="text-xs text-gray-400 block mb-1">Host</label>
                    <input
                        value={host}
                        onChange={e => setHost(e.target.value)}
                        placeholder="smtp.example.com"
                        className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                    />
                </div>
                <div>
                    <label className="text-xs text-gray-400 block mb-1">Port</label>
                    <input
                        value={port}
                        onChange={e => setPort(e.target.value)}
                        placeholder="587"
                        className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                    />
                </div>
            </div>
            <div>
                <label className="text-xs text-gray-400 block mb-1">Username</label>
                <input
                    value={user}
                    onChange={e => setUser(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
            </div>
            <div>
                <label className="text-xs text-gray-400 block mb-1">Password <span className="text-gray-600">(leave blank to keep current)</span></label>
                <input
                    type="password"
                    value={pass}
                    onChange={e => setPass(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
            </div>
            <div className="flex items-center gap-2">
                <input
                    id={`secure-${tier}`}
                    type="checkbox"
                    checked={secure}
                    onChange={e => setSecure(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-900 text-blue-500 focus:ring-blue-500"
                />
                <label htmlFor={`secure-${tier}`} className="text-xs text-gray-400">Use SSL/TLS (port 465)</label>
            </div>
            <div className="flex items-center gap-2 pt-1">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded px-3 py-1.5 text-sm font-medium transition-colors"
                >
                    {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                    onClick={onCancel}
                    className="text-gray-400 hover:text-white text-sm px-2 py-1.5 transition-colors"
                >
                    Cancel
                </button>
            </div>
            {toast && (
                <Toast message={toast.message} type={toast.type} onClear={() => setToast(null)} />
            )}
        </div>
    );
}

function SmtpTierCard({
    tier,
    info,
    onRefresh,
}: {
    tier: string;
    info: SmtpTierInfo;
    onRefresh: () => void;
}) {
    const [editing, setEditing] = useState(false);
    const [testEmail, setTestEmail] = useState('');
    const [testingEmail, setTestingEmail] = useState(false);
    const [showTestInput, setShowTestInput] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const handleTestEmail = async () => {
        if (!testEmail.trim()) {
            setToast({ message: 'Enter a recipient email address.', type: 'error' });
            return;
        }
        setTestingEmail(true);
        setToast(null);
        try {
            const res = await fetch('/api/super-admin/cron-analyzer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'test_email', tier, to: testEmail.trim() }),
            });
            const data = await res.json();
            if (!res.ok || data.error) throw new Error(data.error || 'Unknown error');
            setToast({ message: `Test email sent to ${testEmail}`, type: 'success' });
            setShowTestInput(false);
            setTestEmail('');
        } catch (e: any) {
            setToast({ message: e.message, type: 'error' });
        } finally {
            setTestingEmail(false);
        }
    };

    const handleSaveSmtp = async (data: { host: string; port: string; user: string; pass: string; secure: boolean }) => {
        const res = await fetch('/api/super-admin/cron-analyzer', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tier, ...data }),
        });
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json.error || 'Save failed');
        setEditing(false);
        onRefresh();
    };

    return (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <div className="text-white font-semibold text-sm capitalize">{tier}</div>
                    <div className="text-gray-400 text-xs mt-0.5">{info.host}</div>
                    <div className="text-gray-500 text-xs">{info.user}</div>
                </div>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${info.configured
                    ? 'bg-green-900/30 text-green-400 border-green-700'
                    : 'bg-gray-700 text-gray-400 border-gray-600'
                    }`}>
                    {info.configured ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                    {info.configured ? 'Configured' : 'Not configured'}
                </span>
            </div>

            <div className="flex items-center gap-2 mt-4 flex-wrap">
                <button
                    onClick={() => { setShowTestInput(v => !v); setToast(null); }}
                    className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded px-3 py-1.5 text-sm font-medium transition-colors"
                >
                    <Mail className="w-3.5 h-3.5" />
                    Test Email
                </button>
                <button
                    onClick={() => { setEditing(v => !v); setToast(null); }}
                    className="flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded px-3 py-1.5 text-sm font-medium transition-colors"
                >
                    {editing ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {editing ? 'Hide' : 'Edit'}
                </button>
            </div>

            {showTestInput && (
                <div className="mt-3 flex items-center gap-2">
                    <input
                        type="email"
                        value={testEmail}
                        onChange={e => setTestEmail(e.target.value)}
                        placeholder="recipient@example.com"
                        onKeyDown={e => e.key === 'Enter' && handleTestEmail()}
                        className="flex-1 bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                    />
                    <button
                        onClick={handleTestEmail}
                        disabled={testingEmail}
                        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap"
                    >
                        {testingEmail ? 'Sending…' : 'Send Test'}
                    </button>
                </div>
            )}

            {editing && (
                <SmtpEditForm
                    tier={tier}
                    onSave={handleSaveSmtp}
                    onCancel={() => setEditing(false)}
                />
            )}

            {toast && (
                <Toast message={toast.message} type={toast.type} onClear={() => setToast(null)} />
            )}
        </div>
    );
}

const STATUS_CLASSES: Record<string, string> = {
    sent: 'text-green-400',
    pending: 'text-yellow-400',
    failed: 'text-red-400',
    skipped: 'text-gray-400',
};

export default function CronAnalyzerClient() {
    const [data, setData] = useState<AnalyzerData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch('/api/super-admin/cron-analyzer');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            if (json.error) throw new Error(json.error);
            setData(json);
            setError(null);
        } catch (e: any) {
            setError(e.message || 'Failed to load data');
        }
    }, []);

    useEffect(() => {
        fetchData().finally(() => setLoading(false));
    }, [fetchData]);

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchData();
        setRefreshing(false);
    };

    const handleRunTask = async (taskName: string) => {
        const taskKey = TASK_KEY_MAP[taskName];
        if (!taskKey) throw new Error(`No task key mapped for: ${taskName}`);
        const res = await fetch('/api/super-admin/cron-analyzer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'trigger', task: taskKey }),
        });
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json.error || 'Trigger failed');
        await fetchData();
    };

    const handleSetInterval = async (taskName: string, minutes: number) => {
        const res = await fetch('/api/super-admin/cron-analyzer', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskName, interval: minutes }),
        });
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json.error || 'Failed to set interval');
        await fetchData();
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-gray-400 text-sm animate-pulse">Loading Cron & Email Analyzer…</div>
            </div>
        );
    }

    if (error && !data) {
        return (
            <div className="p-8">
                <div className="bg-red-900/30 border border-red-700 rounded-xl p-5 text-red-400 text-sm">{error}</div>
            </div>
        );
    }

    const smtpTiers = ['reporting', 'support', 'admin', 'notifications'];

    return (
        <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold text-white">Cron &amp; Email Analyzer</h1>
                    <p className="text-gray-400 text-sm mt-1">Monitor scheduled tasks and email delivery health</p>
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded px-4 py-2 text-sm font-medium transition-colors"
                >
                    <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                    {refreshing ? 'Refreshing…' : 'Refresh'}
                </button>
            </div>

            {/* Scheduler Status Banner */}
            {data && (
                <div className={`flex items-center gap-3 px-5 py-3 rounded-xl border text-sm font-medium ${data.schedulerRunning
                    ? 'bg-green-900/30 border-green-700 text-green-400'
                    : 'bg-red-900/30 border-red-700 text-red-400'
                    }`}>
                    <span className={`w-2.5 h-2.5 rounded-full ${data.schedulerRunning ? 'bg-green-400' : 'bg-red-400'}`} />
                    {data.schedulerRunning ? 'Scheduler Running' : 'Scheduler Stopped'}
                </div>
            )}

            {/* Cron Tasks */}
            {data && (
                <section>
                    <h2 className="text-lg font-semibold text-white mb-4">Cron Tasks</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {data.tasks.map(task => (
                            <TaskCard key={task.name} task={task} onRun={handleRunTask} onSetInterval={handleSetInterval} />
                        ))}
                    </div>
                </section>
            )}

            {/* Email Tier Health */}
            {data && (
                <section>
                    <h2 className="text-lg font-semibold text-white mb-4">Email Tier Health</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {smtpTiers.map(tier => (
                            <SmtpTierCard
                                key={tier}
                                tier={tier}
                                info={data.smtp[tier] ?? { configured: false, host: '(not set)', user: '(not set)' }}
                                onRefresh={handleRefresh}
                            />
                        ))}
                    </div>
                </section>
            )}

            {/* Recent Email Log */}
            {data && data.recentEmails.length > 0 && (
                <section>
                    <h2 className="text-lg font-semibold text-white mb-4">Recent Email Log</h2>
                    <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-700 bg-gray-950">
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">ID</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Type</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Tier</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Subject</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Status</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Error</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Org</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Sent At</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700">
                                    {data.recentEmails.map(entry => (
                                        <tr key={entry.id} className="hover:bg-gray-750 transition-colors">
                                            <td className="px-4 py-3 text-gray-500 font-mono text-xs">{entry.id}</td>
                                            <td className="px-4 py-3 text-gray-300 text-xs">{entry.email_type}</td>
                                            <td className="px-4 py-3">
                                                <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-gray-700 text-gray-300">{entry.tier}</span>
                                            </td>
                                            <td className="px-4 py-3 text-gray-300 text-xs max-w-[220px] truncate" title={entry.subject ?? ''}>
                                                {entry.subject ?? <span className="text-gray-600">—</span>}
                                            </td>
                                            <td className={`px-4 py-3 text-xs font-semibold ${STATUS_CLASSES[entry.status] ?? 'text-gray-400'}`}>
                                                {entry.status}
                                            </td>
                                            <td className="px-4 py-3 text-red-400 text-xs max-w-[160px] truncate" title={entry.error_message ?? ''}>
                                                {entry.error_message ?? <span className="text-gray-600">—</span>}
                                            </td>
                                            <td className="px-4 py-3 text-gray-400 text-xs">{entry.org_display ?? <span className="text-gray-600">—</span>}</td>
                                            <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                                                {entry.sent_at ? new Date(entry.sent_at).toLocaleString() : <span className="text-gray-600">—</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>
            )}

            {data && data.recentEmails.length === 0 && (
                <section>
                    <h2 className="text-lg font-semibold text-white mb-4">Recent Email Log</h2>
                    <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 text-center text-gray-500 text-sm">
                        No email log entries found.
                    </div>
                </section>
            )}
        </div>
    );
}
