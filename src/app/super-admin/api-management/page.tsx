'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
    Activity, Globe, RefreshCw, Search, CheckCircle, XCircle, Clock,
    ChevronDown, ChevronRight, Play, Wifi, WifiOff, AlertTriangle,
    Copy, Check, Terminal, Layers,
} from 'lucide-react';

// ── Endpoint catalog ──────────────────────────────────────────────────────────

const ENDPOINTS = [
    // AUTH
    {
        group: 'Authentication',
        method: 'POST', path: '/api/mobile/auth',
        description: 'Login with email+password or PIN. Returns a 7-day JWT Bearer token.',
        body: JSON.stringify({ organization_subdomain: 'your-bar', email: 'admin@bar.com', password: 'pass' }, null, 2),
        healthMethod: 'POST',
    },
    {
        group: 'Authentication',
        method: 'GET', path: '/api/mobile/register',
        description: 'Validate an invite token before registration.',
        body: null,
        healthMethod: 'GET',
        healthPath: '/api/mobile/register?token=test',
    },
    {
        group: 'Authentication',
        method: 'POST', path: '/api/mobile/register',
        description: 'Complete registration using an invite token.',
        body: JSON.stringify({ token: 'invite-token', firstName: 'Alex', lastName: 'Smith', password: 'pass123', pin: '1234' }, null, 2),
        healthMethod: 'POST',
    },

    // DEVICE TOKENS
    {
        group: 'Push Notifications',
        method: 'POST', path: '/api/mobile/device-token',
        description: 'Register a device FCM/APNs token for push notifications.',
        body: JSON.stringify({ token: 'fcm-token-here', platform: 'ios' }, null, 2),
        healthMethod: 'POST',
    },
    {
        group: 'Push Notifications',
        method: 'DELETE', path: '/api/mobile/device-token',
        description: 'Unregister device token on logout.',
        body: JSON.stringify({ token: 'fcm-token-here' }, null, 2),
        healthMethod: 'DELETE',
    },

    // NOTIFICATIONS
    {
        group: 'Notifications',
        method: 'GET', path: '/api/mobile/notifications',
        description: 'List in-app notifications for the authenticated user.',
        body: null,
        healthMethod: 'GET',
        healthPath: '/api/mobile/notifications',
    },
    {
        group: 'Notifications',
        method: 'PATCH', path: '/api/mobile/notifications',
        description: 'Mark notification(s) as read.',
        body: JSON.stringify({ id: 10 }, null, 2),
        healthMethod: 'PATCH',
    },

    // FEED
    {
        group: 'Feed',
        method: 'GET', path: '/api/mobile/feed',
        description: 'Dashboard feed with posts, likes, and comments.',
        body: null,
        healthMethod: 'GET',
        healthPath: '/api/mobile/feed?page=1&limit=5',
    },
    {
        group: 'Feed',
        method: 'POST', path: '/api/mobile/feed',
        description: 'Create a post with optional images and user tags.',
        body: JSON.stringify({ content: 'Test post!', images: [], tagged_user_ids: [] }, null, 2),
        healthMethod: 'POST',
    },
    {
        group: 'Feed',
        method: 'POST', path: '/api/mobile/feed/like',
        description: 'Toggle like on a post. Returns { liked, count }.',
        body: null,
        healthMethod: 'POST',
        healthPath: '/api/mobile/feed/like?id=1',
    },
    {
        group: 'Feed',
        method: 'GET', path: '/api/mobile/feed/comments',
        description: 'Load comments for a specific post.',
        body: null,
        healthMethod: 'GET',
        healthPath: '/api/mobile/feed/comments?postId=1',
    },
    {
        group: 'Feed',
        method: 'POST', path: '/api/mobile/feed/comments',
        description: 'Add a comment to a post.',
        body: JSON.stringify({ content: 'Great work!' }, null, 2),
        healthMethod: 'POST',
        healthPath: '/api/mobile/feed/comments?postId=1',
    },

    // MESSAGING
    {
        group: 'Messaging',
        method: 'GET', path: '/api/mobile/messages',
        description: 'List all message threads (inbox) with unread counts.',
        body: null,
        healthMethod: 'GET',
    },
    {
        group: 'Messaging',
        method: 'POST', path: '/api/mobile/messages',
        description: 'Start a new thread or send first message. Finds existing 1-on-1 thread.',
        body: JSON.stringify({ user_ids: [55], message: 'Hey!' }, null, 2),
        healthMethod: 'POST',
    },
    {
        group: 'Messaging',
        method: 'GET', path: '/api/mobile/messages/[threadId]',
        description: 'Get paginated messages in a thread. Marks thread as read.',
        body: null,
        healthMethod: 'GET',
        healthPath: '/api/mobile/messages/1',
    },
    {
        group: 'Messaging',
        method: 'POST', path: '/api/mobile/messages/[threadId]',
        description: 'Send a message to an existing thread.',
        body: JSON.stringify({ message: 'On my way!' }, null, 2),
        healthMethod: 'POST',
        healthPath: '/api/mobile/messages/1',
    },
    {
        group: 'Messaging',
        method: 'DELETE', path: '/api/mobile/messages/[threadId]',
        description: 'Leave a thread (removes you from members).',
        body: null,
        healthMethod: 'DELETE',
        healthPath: '/api/mobile/messages/1',
    },
    {
        group: 'Messaging',
        method: 'GET', path: '/api/mobile/messages/poll',
        description: 'Poll for new messages since a timestamp. Use server_time as next cursor.',
        body: null,
        healthMethod: 'GET',
        healthPath: '/api/mobile/messages/poll?since=2024-01-01T00:00:00.000Z',
    },

    // PROFILE
    {
        group: 'Profile',
        method: 'GET', path: '/api/mobile/profile',
        description: 'Get authenticated user profile. Never returns password or PIN.',
        body: null,
        healthMethod: 'GET',
    },
    {
        group: 'Profile',
        method: 'PATCH', path: '/api/mobile/profile',
        description: 'Update display_name, email, phone, bio, first_name, last_name.',
        body: JSON.stringify({ display_name: 'Alex S.', phone: '5550009999' }, null, 2),
        healthMethod: 'PATCH',
    },
    {
        group: 'Profile',
        method: 'POST', path: '/api/mobile/profile/picture',
        description: 'Upload profile picture as base64 data-URI (max 5 MB, JPEG/PNG/WebP/GIF).',
        body: JSON.stringify({ image: 'data:image/jpeg;base64,...' }, null, 2),
        healthMethod: 'POST',
    },
    {
        group: 'Profile',
        method: 'DELETE', path: '/api/mobile/profile/picture',
        description: 'Remove profile picture (sets to null).',
        body: null,
        healthMethod: 'DELETE',
    },

    // SETTINGS
    {
        group: 'Settings',
        method: 'GET', path: '/api/mobile/settings',
        description: 'Get notification preferences and address. Creates defaults on first call.',
        body: null,
        healthMethod: 'GET',
    },
    {
        group: 'Settings',
        method: 'PATCH', path: '/api/mobile/settings',
        description: 'Update notification flags and/or address fields.',
        body: JSON.stringify({ notifications_enabled: true, notify_messages: true, city: 'New York' }, null, 2),
        healthMethod: 'PATCH',
    },

    // SCHEDULE
    {
        group: 'Schedule',
        method: 'GET', path: '/api/mobile/schedule',
        description: 'Full org schedule with shift details, pending swaps, overnight support.',
        body: null,
        healthMethod: 'GET',
        healthPath: '/api/mobile/schedule?view=week',
    },
    {
        group: 'Schedule',
        method: 'GET', path: '/api/mobile/schedule/swap',
        description: 'List shift swap requests involving the authenticated user.',
        body: null,
        healthMethod: 'GET',
    },
    {
        group: 'Schedule',
        method: 'POST', path: '/api/mobile/schedule/swap',
        description: 'Create a shift swap request.',
        body: JSON.stringify({ my_schedule_id: 301, their_schedule_id: 402, target_user_id: 55 }, null, 2),
        healthMethod: 'POST',
    },
    {
        group: 'Schedule',
        method: 'PATCH', path: '/api/mobile/schedule/swap',
        description: 'Accept or decline a swap request (target employee only).',
        body: JSON.stringify({ swap_id: 10, action: 'accept' }, null, 2),
        healthMethod: 'PATCH',
    },
    {
        group: 'Schedule',
        method: 'GET', path: '/api/mobile/schedule/time-off',
        description: 'List the user\'s time-off requests.',
        body: null,
        healthMethod: 'GET',
    },
    {
        group: 'Schedule',
        method: 'POST', path: '/api/mobile/schedule/time-off',
        description: 'Submit a time-off request.',
        body: JSON.stringify({ start_date: '2026-06-01', end_date: '2026-06-03', reason: 'Vacation' }, null, 2),
        healthMethod: 'POST',
    },
    {
        group: 'Schedule',
        method: 'PATCH', path: '/api/mobile/schedule/time-off',
        description: 'Approve or decline a time-off request (admin only).',
        body: JSON.stringify({ id: 5, action: 'approve' }, null, 2),
        healthMethod: 'PATCH',
    },

    // BARRED
    {
        group: 'Barred List',
        method: 'GET', path: '/api/mobile/barred',
        description: 'Get list of persons barred from the venue.',
        body: null,
        healthMethod: 'GET',
    },
    {
        group: 'Barred List',
        method: 'POST', path: '/api/mobile/barred',
        description: 'Add a barred person (admin or add_barred permission required).',
        body: JSON.stringify({ name: 'John Doe', description: 'Incident details', trespassed: false }, null, 2),
        healthMethod: 'POST',
    },

    // INVENTORY
    {
        group: 'Inventory',
        method: 'GET', path: '/api/mobile/out-of-stock',
        description: 'Get out-of-stock and low-stock items.',
        body: null,
        healthMethod: 'GET',
    },
];

// ── Types ─────────────────────────────────────────────────────────────────────

type TabId = 'logs' | 'endpoints';
type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
    id: number;
    level: LogLevel;
    category: string;
    message: string;
    details: any;
    created_at: string;
}

interface HealthResult {
    path: string;
    method: string;
    status: number;
    ms: number;
    up: boolean;
    error?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const METHOD_COLOR: Record<string, string> = {
    GET: 'text-green-400 bg-green-400/10',
    POST: 'text-blue-400 bg-blue-400/10',
    PATCH: 'text-yellow-400 bg-yellow-400/10',
    DELETE: 'text-red-400 bg-red-400/10',
    PUT: 'text-purple-400 bg-purple-400/10',
};

const LEVEL_COLOR: Record<string, string> = {
    info: 'text-blue-400',
    warn: 'text-yellow-400',
    error: 'text-red-400',
};

const LEVEL_DOT: Record<string, string> = {
    info: 'bg-blue-400',
    warn: 'bg-yellow-400',
    error: 'bg-red-400',
};

function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    return new Date(iso).toLocaleTimeString();
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
        >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
    );
}

// ── Endpoint Card ─────────────────────────────────────────────────────────────

function EndpointCard({ ep, healthResult, onTest }: {
    ep: typeof ENDPOINTS[number];
    healthResult: HealthResult | null;
    onTest: () => void;
}) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="border border-slate-800 rounded-lg overflow-hidden">
            <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-800/50 transition-colors"
                onClick={() => setExpanded(e => !e)}
            >
                <span className={`text-xs font-bold px-2 py-0.5 rounded font-mono ${METHOD_COLOR[ep.method] ?? 'text-slate-400 bg-slate-700'}`}>
                    {ep.method}
                </span>
                <span className="font-mono text-sm text-slate-200 flex-1">{ep.path}</span>

                {healthResult ? (
                    <div className="flex items-center gap-2 text-xs">
                        {healthResult.up ? (
                            <span className="flex items-center gap-1 text-green-400">
                                <CheckCircle className="w-4 h-4" /> {healthResult.status} · {healthResult.ms}ms
                            </span>
                        ) : (
                            <span className="flex items-center gap-1 text-red-400">
                                <XCircle className="w-4 h-4" /> {healthResult.status || 'ERR'} · {healthResult.ms}ms
                            </span>
                        )}
                    </div>
                ) : null}

                <button
                    className="ml-2 flex items-center gap-1.5 px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
                    onClick={e => { e.stopPropagation(); onTest(); }}
                >
                    <Play className="w-3 h-3" /> Test
                </button>

                {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
            </div>

            {expanded && (
                <div className="border-t border-slate-800 bg-slate-900/60 px-4 py-4 space-y-4">
                    <p className="text-sm text-slate-300">{ep.description}</p>

                    {ep.body && (
                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Example Request Body</span>
                                <CopyButton text={ep.body} />
                            </div>
                            <pre className="text-xs bg-slate-950 text-green-300 p-3 rounded-lg overflow-x-auto font-mono">{ep.body}</pre>
                        </div>
                    )}

                    {healthResult && (
                        <div className={`rounded-lg px-4 py-3 text-sm ${healthResult.up ? 'bg-green-900/20 border border-green-800/50 text-green-300' : 'bg-red-900/20 border border-red-800/50 text-red-300'}`}>
                            {healthResult.up
                                ? `✓ Endpoint responded with HTTP ${healthResult.status} in ${healthResult.ms}ms — route is reachable.`
                                : `✗ ${healthResult.error ?? `HTTP ${healthResult.status}`} — endpoint may be down or misconfigured.`
                            }
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ApiManagementPage() {
    const [tab, setTab] = useState<TabId>('logs');

    // ── Logs state ──────────────────────────────────────────────────────────
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [logsTotal, setLogsTotal] = useState(0);
    const [logsLoading, setLogsLoading] = useState(false);
    const [liveMode, setLiveMode] = useState(true);
    const [logSearch, setLogSearch] = useState('');
    const [logLevel, setLogLevel] = useState('');
    const [logCategory, setLogCategory] = useState('');
    const [logCategories, setLogCategories] = useState<string[]>([]);
    const liveRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchLogs = useCallback(async () => {
        setLogsLoading(true);
        const params = new URLSearchParams({ limit: '100' });
        if (logLevel) params.set('level', logLevel);
        if (logCategory) params.set('category', logCategory);
        if (logSearch) params.set('search', logSearch);
        try {
            const res = await fetch(`/api/super-admin/system-logs?${params}`);
            const data = await res.json();
            setLogs(data.logs ?? []);
            setLogsTotal(parseInt(data.total ?? 0));
            const cats = [...new Set((data.categoryCounts ?? []).map((c: any) => c.category as string))];
            setLogCategories(cats);
        } catch {}
        setLogsLoading(false);
    }, [logLevel, logCategory, logSearch]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    useEffect(() => {
        if (liveMode && tab === 'logs') {
            liveRef.current = setInterval(fetchLogs, 4000);
        }
        return () => { if (liveRef.current) clearInterval(liveRef.current); };
    }, [liveMode, tab, fetchLogs]);

    // ── Health state ─────────────────────────────────────────────────────────
    const [healthResults, setHealthResults] = useState<Record<string, HealthResult>>({});
    const [checkingAll, setCheckingAll] = useState(false);
    const [epSearch, setEpSearch] = useState('');

    const testEndpoint = useCallback(async (ep: typeof ENDPOINTS[number]) => {
        const key = `${ep.method}:${ep.path}`;
        const checkPath = (ep as any).healthPath ?? ep.path;
        try {
            const res = await fetch('/api/super-admin/api-health', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoints: [{ method: ep.healthMethod, path: checkPath }] }),
            });
            const data = await res.json();
            if (data.checks?.[0]) {
                setHealthResults(prev => ({ ...prev, [key]: data.checks[0] }));
            }
        } catch {}
    }, []);

    const testAll = useCallback(async () => {
        setCheckingAll(true);
        const batch = ENDPOINTS.map(ep => ({
            method: ep.healthMethod,
            path: (ep as any).healthPath ?? ep.path,
        }));
        try {
            const res = await fetch('/api/super-admin/api-health', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoints: batch }),
            });
            const data = await res.json();
            const map: Record<string, HealthResult> = {};
            (data.checks ?? []).forEach((c: HealthResult, i: number) => {
                const ep = ENDPOINTS[i];
                map[`${ep.method}:${ep.path}`] = c;
            });
            setHealthResults(map);
        } catch {}
        setCheckingAll(false);
    }, []);

    // Group endpoints
    const groups = ENDPOINTS.reduce<Record<string, typeof ENDPOINTS>>((acc, ep) => {
        const filtered = epSearch
            ? ep.path.toLowerCase().includes(epSearch.toLowerCase()) || ep.description.toLowerCase().includes(epSearch.toLowerCase())
            : true;
        if (!filtered) return acc;
        (acc[ep.group] ??= []).push(ep);
        return acc;
    }, {});

    const upCount = Object.values(healthResults).filter(r => r.up).length;
    const downCount = Object.values(healthResults).filter(r => !r.up).length;

    return (
        <div className="p-6 max-w-7xl mx-auto text-white">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Globe className="w-6 h-6 text-blue-400" /> API Management
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">Live logs and endpoint health monitoring for the mobile API.</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-6 border-b border-slate-800">
                {([['logs', 'Live Logs', Terminal], ['endpoints', 'Endpoints', Layers]] as const).map(([id, label, Icon]) => (
                    <button
                        key={id}
                        onClick={() => setTab(id)}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === id
                            ? 'border-blue-500 text-blue-400'
                            : 'border-transparent text-slate-400 hover:text-white'}`}
                    >
                        <Icon className="w-4 h-4" /> {label}
                    </button>
                ))}
            </div>

            {/* ── LOGS TAB ── */}
            {tab === 'logs' && (
                <div className="space-y-4">
                    {/* Toolbar */}
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative flex-1 min-w-48">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                value={logSearch}
                                onChange={e => setLogSearch(e.target.value)}
                                placeholder="Search logs…"
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                            />
                        </div>
                        <select value={logLevel} onChange={e => setLogLevel(e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                            <option value="">All levels</option>
                            <option value="info">Info</option>
                            <option value="warn">Warn</option>
                            <option value="error">Error</option>
                        </select>
                        <select value={logCategory} onChange={e => setLogCategory(e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                            <option value="">All categories</option>
                            {logCategories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <button
                            onClick={() => setLiveMode(l => !l)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${liveMode ? 'bg-green-600/20 text-green-400 border border-green-600/40' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}
                        >
                            {liveMode ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
                            {liveMode ? 'Live' : 'Paused'}
                        </button>
                        <button onClick={fetchLogs} className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 hover:text-white transition-colors">
                            <RefreshCw className={`w-4 h-4 ${logsLoading ? 'animate-spin' : ''}`} /> Refresh
                        </button>
                        <span className="text-xs text-slate-500">{logsTotal.toLocaleString()} total</span>
                    </div>

                    {/* Log list */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden font-mono text-xs">
                        {logs.length === 0 ? (
                            <div className="text-center py-12 text-slate-500">
                                {logsLoading ? 'Loading…' : 'No logs found.'}
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-800/60 max-h-[70vh] overflow-y-auto">
                                {logs.map(log => (
                                    <LogRow key={log.id} log={log} />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── ENDPOINTS TAB ── */}
            {tab === 'endpoints' && (
                <div className="space-y-4">
                    {/* Status bar */}
                    {Object.keys(healthResults).length > 0 && (
                        <div className="flex items-center gap-6 px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-sm">
                            <div className="flex items-center gap-2 text-green-400">
                                <CheckCircle className="w-4 h-4" /> <span className="font-bold">{upCount}</span> Up
                            </div>
                            <div className="flex items-center gap-2 text-red-400">
                                <XCircle className="w-4 h-4" /> <span className="font-bold">{downCount}</span> Down
                            </div>
                            <div className="flex items-center gap-2 text-slate-400">
                                <Activity className="w-4 h-4" /> {ENDPOINTS.length} total endpoints
                            </div>
                            <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-green-500 rounded-full transition-all"
                                    style={{ width: `${(upCount / ENDPOINTS.length) * 100}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Toolbar */}
                    <div className="flex items-center gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                value={epSearch}
                                onChange={e => setEpSearch(e.target.value)}
                                placeholder="Filter endpoints…"
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                            />
                        </div>
                        <button
                            onClick={testAll}
                            disabled={checkingAll}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                            {checkingAll ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                            {checkingAll ? 'Checking…' : 'Test All'}
                        </button>
                    </div>

                    {/* Grouped endpoint cards */}
                    <div className="space-y-6">
                        {Object.entries(groups).map(([group, eps]) => (
                            <div key={group}>
                                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2 pl-1">{group}</h2>
                                <div className="space-y-2">
                                    {eps.map(ep => (
                                        <EndpointCard
                                            key={`${ep.method}:${ep.path}`}
                                            ep={ep}
                                            healthResult={healthResults[`${ep.method}:${ep.path}`] ?? null}
                                            onTest={() => testEndpoint(ep)}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Log Row ───────────────────────────────────────────────────────────────────

function LogRow({ log }: { log: LogEntry }) {
    const [expanded, setExpanded] = useState(false);
    const hasDetails = log.details && Object.keys(log.details).length > 0;

    return (
        <div
            className={`px-4 py-2.5 hover:bg-slate-800/40 transition-colors ${hasDetails ? 'cursor-pointer' : ''}`}
            onClick={() => hasDetails && setExpanded(e => !e)}
        >
            <div className="flex items-start gap-3">
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${LEVEL_DOT[log.level] ?? 'bg-slate-400'}`} />
                <span className={`w-10 flex-shrink-0 ${LEVEL_COLOR[log.level] ?? 'text-slate-400'}`}>
                    {log.level.toUpperCase().slice(0, 4)}
                </span>
                <span className="w-20 flex-shrink-0 text-slate-500 truncate">{log.category}</span>
                <span className="flex-1 text-slate-200 break-all">{log.message}</span>
                <span className="text-slate-600 flex-shrink-0">{timeAgo(log.created_at)}</span>
                {hasDetails && (
                    <span className="text-slate-600">
                        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </span>
                )}
            </div>
            {expanded && hasDetails && (
                <pre className="mt-2 ml-10 text-slate-400 bg-slate-950 p-2 rounded overflow-x-auto text-[11px] leading-relaxed">
                    {JSON.stringify(log.details, null, 2)}
                </pre>
            )}
        </div>
    );
}
