'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Activity, Mail, ShieldAlert, Clock, Database, Cpu, Smartphone,
    RefreshCw, ChevronDown, ChevronRight, Trash2, Search, AlertCircle,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Level    = 'info' | 'warn' | 'error';
type Category = 'email' | 'auth' | 'scheduler' | 'api' | 'system' | 'database' | 'device';

interface LogEntry {
    id: number;
    level: Level;
    category: Category;
    message: string;
    details: Record<string, any> | null;
    created_at: string;
}

interface CategoryCount {
    category: string;
    level: string;
    count: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LEVEL_STYLE: Record<Level, { bg: string; text: string; border: string; dot: string }> = {
    info:  { bg: 'rgba(59,130,246,0.12)',  text: '#60a5fa', border: 'rgba(59,130,246,0.25)',  dot: '#3b82f6' },
    warn:  { bg: 'rgba(245,158,11,0.12)',  text: '#fbbf24', border: 'rgba(245,158,11,0.25)',  dot: '#f59e0b' },
    error: { bg: 'rgba(239,68,68,0.12)',   text: '#f87171', border: 'rgba(239,68,68,0.25)',   dot: '#ef4444' },
};

const CATEGORY_META: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
    email:     { icon: <Mail     size={13} />, label: 'Email',     color: '#818cf8' },
    auth:      { icon: <ShieldAlert size={13} />, label: 'Auth',  color: '#34d399' },
    scheduler: { icon: <Clock    size={13} />, label: 'Scheduler', color: '#fb923c' },
    api:       { icon: <Activity size={13} />, label: 'API',       color: '#60a5fa' },
    system:    { icon: <Cpu      size={13} />, label: 'System',    color: '#94a3b8' },
    database:  { icon: <Database size={13} />, label: 'Database',  color: '#a78bfa' },
    device:    { icon: <Smartphone size={13} />, label: 'Device',  color: '#f472b6' },
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function LevelBadge({ level }: { level: Level }) {
    const s = LEVEL_STYLE[level] || LEVEL_STYLE.info;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: s.bg, color: s.text, border: `1px solid ${s.border}`,
            padding: '2px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap',
        }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, display: 'inline-block' }} />
            {level}
        </span>
    );
}

function CategoryBadge({ category }: { category: string }) {
    const m = CATEGORY_META[category];
    if (!m) return <span style={{ color: '#64748b', fontSize: 12 }}>{category}</span>;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            color: m.color, fontSize: 12, fontWeight: 600,
        }}>
            {m.icon} {m.label}
        </span>
    );
}

function DetailPanel({ details }: { details: Record<string, any> | null }) {
    if (!details || Object.keys(details).length === 0) return null;

    const important = ['error', 'code', 'command', 'response', 'reason', 'host', 'port', 'user', 'tier', 'to'];
    const sorted = Object.entries(details).sort(([a], [b]) => {
        const ai = important.indexOf(a), bi = important.indexOf(b);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.localeCompare(b);
    });

    return (
        <div style={{
            marginTop: 8, padding: '10px 14px',
            background: '#0f172a', borderRadius: 6,
            border: '1px solid #1e293b', fontSize: 12,
        }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <tbody>
                    {sorted.map(([k, v]) => {
                        const isError = k === 'error' || k === 'response' || k === 'stack';
                        const val = typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v ?? '—');
                        return (
                            <tr key={k}>
                                <td style={{
                                    color: '#475569', paddingRight: 12, paddingBottom: 4,
                                    fontWeight: 600, whiteSpace: 'nowrap', verticalAlign: 'top',
                                    fontFamily: 'monospace', fontSize: 11,
                                }}>{k}</td>
                                <td style={{
                                    color: isError ? '#f87171' : '#e2e8f0',
                                    paddingBottom: 4, fontFamily: 'monospace', wordBreak: 'break-all',
                                    whiteSpace: isError ? 'pre-wrap' : 'normal',
                                }}>{val}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function LogRow({ log }: { log: LogEntry }) {
    const [open, setOpen] = useState(false);
    const hasDetails = log.details && Object.keys(log.details).length > 0;

    return (
        <div style={{
            borderBottom: '1px solid #1e293b',
            background: log.level === 'error' ? 'rgba(239,68,68,0.03)' :
                        log.level === 'warn'  ? 'rgba(245,158,11,0.03)' : 'transparent',
        }}>
            <div
                onClick={() => hasDetails && setOpen(o => !o)}
                style={{
                    display: 'grid',
                    gridTemplateColumns: '160px 52px 100px 1fr 20px',
                    gap: '0 12px',
                    alignItems: 'center',
                    padding: '9px 16px',
                    cursor: hasDetails ? 'pointer' : 'default',
                    transition: 'background 0.1s',
                }}
                onMouseEnter={e => hasDetails && ((e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)')}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
            >
                <span style={{ color: '#475569', fontSize: 11, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                    {new Date(log.created_at).toLocaleString(undefined, {
                        month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit', second: '2-digit',
                    })}
                </span>
                <LevelBadge level={log.level} />
                <CategoryBadge category={log.category} />
                <span style={{ color: '#cbd5e1', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {log.message}
                </span>
                {hasDetails ? (
                    open
                        ? <ChevronDown  size={14} style={{ color: '#475569', flexShrink: 0 }} />
                        : <ChevronRight size={14} style={{ color: '#334155', flexShrink: 0 }} />
                ) : <span />}
            </div>
            {open && hasDetails && (
                <div style={{ padding: '0 16px 12px' }}>
                    <DetailPanel details={log.details} />
                </div>
            )}
        </div>
    );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function SystemLogsPage() {
    const [logs, setLogs]           = useState<LogEntry[]>([]);
    const [total, setTotal]         = useState(0);
    const [counts, setCounts]       = useState<CategoryCount[]>([]);
    const [loading, setLoading]     = useState(true);
    const [autoRefresh, setAuto]    = useState(false);
    const [migrationNeeded, setMig] = useState(false);

    // Filters
    const [level,    setLevel]    = useState('');
    const [category, setCategory] = useState('');
    const [search,   setSearch]   = useState('');
    const [page,     setPage]     = useState(0);
    const limit = 100;

    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        const params = new URLSearchParams({
            limit:  String(limit),
            offset: String(page * limit),
            ...(level    ? { level }    : {}),
            ...(category ? { category } : {}),
            ...(search   ? { search }   : {}),
        });
        try {
            const res  = await fetch(`/api/super-admin/system-logs?${params}`);
            const data = await res.json();
            if (data.migrationNeeded) { setMig(true); setLoading(false); return; }
            setLogs(data.logs || []);
            setTotal(data.total || 0);
            setCounts(data.categoryCounts || []);
        } catch {}
        setLoading(false);
    }, [level, category, search, page]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (autoRefresh) {
            timerRef.current = setInterval(() => load(true), 5000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
        }
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [autoRefresh, load]);

    // Aggregate counts for summary bar
    const errorCount = counts.filter(c => c.level === 'error').reduce((s, c) => s + parseInt(c.count), 0);
    const warnCount  = counts.filter(c => c.level === 'warn' ).reduce((s, c) => s + parseInt(c.count), 0);

    const handlePrune = async () => {
        const days = prompt('Delete logs older than how many days?', '30');
        if (!days) return;
        const res = await fetch(`/api/super-admin/system-logs?days=${days}${category ? `&category=${category}` : ''}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            alert(`Deleted ${data.deleted} log entries.`);
            load();
        }
    };

    return (
        <div style={{ padding: '2rem', maxWidth: 1400, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.75rem' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Activity size={20} style={{ color: '#818cf8' }} />
                        </div>
                        <h1 style={{ color: 'white', fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>System Logs</h1>
                    </div>
                    <p style={{ color: '#64748b', margin: 0, fontSize: '0.875rem' }}>
                        Persistent server-side event log — email, auth, scheduler, API and system events.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748b', fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                        <div
                            onClick={() => setAuto(a => !a)}
                            style={{
                                width: 36, height: 20, borderRadius: 10,
                                background: autoRefresh ? '#10b981' : '#334155',
                                position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
                            }}
                        >
                            <div style={{
                                position: 'absolute', top: 2, left: autoRefresh ? 18 : 2,
                                width: 16, height: 16, borderRadius: '50%', background: 'white',
                                transition: 'left 0.2s',
                            }} />
                        </div>
                        Live (5s)
                    </label>
                    <button
                        onClick={() => load()}
                        disabled={loading}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}
                    >
                        <RefreshCw size={13} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
                        Refresh
                    </button>
                    <button
                        onClick={handlePrune}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}
                    >
                        <Trash2 size={13} /> Prune
                    </button>
                </div>
            </div>

            {migrationNeeded && (
                <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10, padding: '12px 16px', marginBottom: '1.5rem', display: 'flex', gap: 10, alignItems: 'center' }}>
                    <AlertCircle size={16} style={{ color: '#fbbf24', flexShrink: 0 }} />
                    <span style={{ color: '#fbbf24', fontSize: 13 }}>
                        The <code>system_logs</code> table does not exist yet. Run <strong>migrate.sql</strong> to enable persistent logging.
                    </span>
                </div>
            )}

            {/* Summary Bar */}
            <div style={{ display: 'flex', gap: 10, marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                {errorCount > 0 && (
                    <div style={{ padding: '6px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', fontSize: 13, fontWeight: 600 }}>
                        {errorCount} error{errorCount !== 1 ? 's' : ''}
                    </div>
                )}
                {warnCount > 0 && (
                    <div style={{ padding: '6px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', color: '#fbbf24', fontSize: 13, fontWeight: 600 }}>
                        {warnCount} warning{warnCount !== 1 ? 's' : ''}
                    </div>
                )}
                {/* Category chips */}
                {Object.entries(
                    counts.reduce((acc: Record<string, number>, c) => {
                        acc[c.category] = (acc[c.category] || 0) + parseInt(c.count);
                        return acc;
                    }, {})
                ).map(([cat, n]) => {
                    const m = CATEGORY_META[cat];
                    return (
                        <div
                            key={cat}
                            onClick={() => setCategory(category === cat ? '' : cat)}
                            style={{
                                padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
                                background: category === cat ? 'rgba(129,140,248,0.15)' : '#1e293b',
                                border: category === cat ? '1px solid rgba(129,140,248,0.4)' : '1px solid #334155',
                                color: m?.color ?? '#94a3b8', fontSize: 13, fontWeight: 600,
                                display: 'flex', alignItems: 'center', gap: 5,
                                transition: 'all 0.15s',
                            }}
                        >
                            {m?.icon} {m?.label ?? cat} <span style={{ color: '#475569' }}>({n})</span>
                        </div>
                    );
                })}
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 8, marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                {/* Level */}
                <div style={{ display: 'flex', gap: 4 }}>
                    {(['', 'info', 'warn', 'error'] as const).map(l => (
                        <button
                            key={l || 'all'}
                            onClick={() => { setLevel(l); setPage(0); }}
                            style={{
                                padding: '5px 12px', borderRadius: 6, border: '1px solid',
                                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                background: level === l
                                    ? (l ? LEVEL_STYLE[l as Level].bg : 'rgba(255,255,255,0.07)')
                                    : '#1e293b',
                                borderColor: level === l
                                    ? (l ? LEVEL_STYLE[l as Level].border : '#475569')
                                    : '#334155',
                                color: level === l
                                    ? (l ? LEVEL_STYLE[l as Level].text : 'white')
                                    : '#64748b',
                            }}
                        >
                            {l || 'All levels'}
                        </button>
                    ))}
                </div>

                {/* Search */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '0 12px', flex: '1 1 240px', maxWidth: 360 }}>
                    <Search size={13} style={{ color: '#475569', flexShrink: 0 }} />
                    <input
                        type="text"
                        placeholder="Search messages and details…"
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPage(0); }}
                        style={{ background: 'none', border: 'none', outline: 'none', color: 'white', fontSize: 13, width: '100%', padding: '6px 0' }}
                    />
                </div>
            </div>

            {/* Log Table */}
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, overflow: 'hidden' }}>
                {/* Column headers */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '160px 52px 100px 1fr 20px',
                    gap: '0 12px',
                    padding: '8px 16px',
                    background: '#0f172a',
                    borderBottom: '1px solid #334155',
                }}>
                    {['Time', 'Level', 'Category', 'Message', ''].map(h => (
                        <span key={h} style={{ color: '#475569', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
                    ))}
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', color: '#475569', padding: '3rem' }}>Loading…</div>
                ) : migrationNeeded ? (
                    <div style={{ textAlign: 'center', color: '#475569', padding: '3rem' }}>Run migrate.sql to create the system_logs table.</div>
                ) : logs.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#475569', padding: '3rem' }}>No log entries found.</div>
                ) : (
                    logs.map(log => <LogRow key={log.id} log={log} />)
                )}

                {/* Pagination */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 16px', background: '#0f172a', borderTop: '1px solid #334155',
                }}>
                    <span style={{ color: '#475569', fontSize: 12 }}>
                        {logs.length === 0 ? 'No results' : `${page * limit + 1}–${Math.min(page * limit + logs.length, total)} of ${total.toLocaleString()}`}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button
                            disabled={page === 0}
                            onClick={() => setPage(p => p - 1)}
                            style={{ padding: '4px 12px', background: '#1e293b', border: '1px solid #334155', color: page === 0 ? '#334155' : '#94a3b8', borderRadius: 6, cursor: page === 0 ? 'not-allowed' : 'pointer', fontSize: 12 }}
                        >
                            ← Prev
                        </button>
                        <button
                            disabled={(page + 1) * limit >= total}
                            onClick={() => setPage(p => p + 1)}
                            style={{ padding: '4px 12px', background: '#1e293b', border: '1px solid #334155', color: (page + 1) * limit >= total ? '#334155' : '#94a3b8', borderRadius: 6, cursor: (page + 1) * limit >= total ? 'not-allowed' : 'pointer', fontSize: 12 }}
                        >
                            Next →
                        </button>
                    </div>
                </div>
            </div>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
