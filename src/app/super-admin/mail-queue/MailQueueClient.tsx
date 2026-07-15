'use client';

import { useState, useEffect, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DiagnosticsData {
    schedulerRunning: boolean;
    smtp: Record<string, { configured: boolean; host: string; user: string }>;
    dueReports: { id: number; org_name: string; report_name: string; frequency: string; next_run_at: string | null }[];
    lowStockOrgs: { organization_id: number; org_name: string; schedule: string | null; legacy_time: string | null; emails: string | null }[];
    shiftReportOrgs: { organization_id: number; org_name: string; schedule: string | null; emails: string | null }[];
    recentLogs: { id: number; email_type: string; tier: string; subject: string | null; status: string; error_message: string | null; scheduled: boolean; sent_at: string; org_display: string | null }[];
}

interface TriggerResult {
    task: string;
    status: string;
    detail: string;
}

interface HistoryRow {
    id: number;
    organization_id: number | null;
    org_display: string | null;
    email_type: string;
    tier: string;
    subject: string | null;
    recipients: { to: string[] } | null;
    status: 'pending' | 'sent' | 'failed' | 'skipped';
    error_message: string | null;
    scheduled: boolean;
    sent_at: string;
    has_html: boolean;
    has_text: boolean;
}

interface DetailRow extends HistoryRow {
    html_body: string | null;
    text_body: string | null;
}

interface ScheduledItem {
    type: string;
    organization_id: number;
    org_name: string;
    scheduled_at: string;
    frequency: string;
    recipients: string | null;
    label: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
    low_stock_alert: 'Low Stock Alert',
    scheduled_report: 'Scheduled Report',
    smart_order: 'Smart Order',
    shift_report: 'Shift Report',
    activity_report: 'Activity Report',
    test: 'Test Email',
    manual: 'Manual Send',
    order_received: 'Order Received',
    verification: 'Verification',
    registration: 'Registration',
    other: 'Other',
};

const TYPE_COLORS: Record<string, string> = {
    low_stock_alert:  '#f59e0b',
    scheduled_report: '#3b82f6',
    smart_order:      '#8b5cf6',
    shift_report:     '#06b6d4',
    test:             '#6b7280',
    manual:           '#10b981',
    other:            '#6b7280',
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
    pending: { bg: '#1e3a5f', text: '#93c5fd' },
    sent:    { bg: '#064e3b', text: '#6ee7b7' },
    failed:  { bg: '#7f1d1d', text: '#fca5a5' },
    skipped: { bg: '#1c1917', text: '#a8a29e' },
};

function fmtTime(iso: string) {
    return new Date(iso).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
    });
}

function TypeBadge({ type }: { type: string }) {
    const label = TYPE_LABELS[type] ?? type;
    const color = TYPE_COLORS[type] ?? '#6b7280';
    return (
        <span style={{ background: color + '22', color, border: `1px solid ${color}55`, borderRadius: 12, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
            {label}
        </span>
    );
}

function StatusBadge({ status }: { status: string }) {
    const c = STATUS_COLORS[status] ?? STATUS_COLORS.skipped;
    return (
        <span style={{ background: c.bg, color: c.text, borderRadius: 12, padding: '2px 10px', fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
            {status.toUpperCase()}
        </span>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MailQueueClient() {
    const [mainTab, setMainTab] = useState<'schedule' | 'history' | 'diagnostics'>('schedule');
    const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'date_range' | 'specific_date'>('today');
    const [rangeStart, setRangeStart] = useState(() => new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
    const [rangeEnd, setRangeEnd] = useState(() => new Date().toISOString().slice(0, 10));
    const [specificDate, setSpecificDate] = useState(() => new Date().toISOString().slice(0, 10));

    // Schedule state
    const [scheduled, setScheduled] = useState<ScheduledItem[]>([]);
    const [schedLoading, setSchedLoading] = useState(false);

    // History state
    const [history, setHistory] = useState<HistoryRow[]>([]);
    const [histTotal, setHistTotal] = useState(0);
    const [histPage, setHistPage] = useState(1);
    const [histLoading, setHistLoading] = useState(false);
    const [filterType, setFilterType] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterOrg, setFilterOrg] = useState('');

    // Diagnostics state
    const [diagData, setDiagData] = useState<DiagnosticsData | null>(null);
    const [diagLoading, setDiagLoading] = useState(false);
    const [triggerResults, setTriggerResults] = useState<TriggerResult[] | null>(null);
    const [triggerSmtp, setTriggerSmtp] = useState<Record<string, { configured: boolean; host: string; user: string }> | null>(null);
    const [triggering, setTriggering] = useState<string | null>(null);

    // Detail modal
    const [detailRow, setDetailRow] = useState<DetailRow | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailPreview, setDetailPreview] = useState<'html' | 'text'>('html');

    const loadSchedule = useCallback(async () => {
        setSchedLoading(true);
        try {
            const params = new URLSearchParams({ view: 'schedule', period });
            if (period === 'date_range') { params.set('start', rangeStart); params.set('end', rangeEnd); }
            if (period === 'specific_date') params.set('date', specificDate);
            const res = await fetch(`/api/super-admin/email-log?${params}`);
            const data = await res.json();
            if (data.scheduled) setScheduled(data.scheduled);
        } catch (e) { console.error(e); } finally { setSchedLoading(false); }
    }, [period, rangeStart, rangeEnd, specificDate]);

    const loadHistory = useCallback(async () => {
        setHistLoading(true);
        try {
            const params = new URLSearchParams({ view: 'history', period, page: String(histPage) });
            if (period === 'date_range') { params.set('start', rangeStart); params.set('end', rangeEnd); }
            if (period === 'specific_date') params.set('date', specificDate);
            if (filterType) params.set('emailType', filterType);
            if (filterStatus) params.set('status', filterStatus);
            if (filterOrg) params.set('orgId', filterOrg);
            const res = await fetch(`/api/super-admin/email-log?${params}`);
            const data = await res.json();
            if (data.rows) { setHistory(data.rows); setHistTotal(data.total); }
        } catch (e) { console.error(e); } finally { setHistLoading(false); }
    }, [period, rangeStart, rangeEnd, specificDate, histPage, filterType, filterStatus, filterOrg]);

    const loadDiagnostics = useCallback(async () => {
        setDiagLoading(true);
        try {
            const res = await fetch('/api/super-admin/trigger-scheduler', { method: 'GET' });
            const data = await res.json();
            if (!data.error) setDiagData(data);
        } catch (e) { console.error(e); } finally { setDiagLoading(false); }
    }, []);

    const triggerTask = useCallback(async (task: string) => {
        setTriggering(task);
        setTriggerResults(null);
        setTriggerSmtp(null);
        try {
            const res = await fetch('/api/super-admin/trigger-scheduler', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ task }),
            });
            const data = await res.json();
            if (data.results) setTriggerResults(data.results);
            if (data.smtp) setTriggerSmtp(data.smtp);
            // Refresh diagnostics after trigger
            await loadDiagnostics();
        } catch (e) { console.error(e); } finally { setTriggering(null); }
    }, [loadDiagnostics]);

    useEffect(() => {
        if (mainTab === 'schedule') loadSchedule();
    }, [mainTab, loadSchedule]);

    useEffect(() => {
        if (mainTab === 'history') loadHistory();
    }, [mainTab, loadHistory]);

    useEffect(() => {
        if (mainTab === 'diagnostics') loadDiagnostics();
    }, [mainTab, loadDiagnostics]);

    // Auto-refresh history every 15 seconds when there are pending items
    useEffect(() => {
        if (mainTab !== 'history') return;
        const hasPending = history.some(r => r.status === 'pending');
        if (!hasPending) return;
        const t = setInterval(loadHistory, 15000);
        return () => clearInterval(t);
    }, [mainTab, history, loadHistory]);

    const openDetail = async (id: number) => {
        setDetailLoading(true);
        setDetailRow(null);
        try {
            const res = await fetch(`/api/super-admin/email-log?view=detail&id=${id}`);
            const data = await res.json();
            if (data.row) setDetailRow(data.row);
        } catch (e) { console.error(e); } finally { setDetailLoading(false); }
    };

    const tabStyle = (t: string) => ({
        padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem',
        background: mainTab === t ? '#2563eb' : 'transparent',
        color: mainTab === t ? 'white' : '#9ca3af',
    } as React.CSSProperties);

    const periodBtn = (p: string) => ({
        padding: '4px 14px', borderRadius: 6, border: '1px solid', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
        borderColor: period === p ? '#3b82f6' : '#374151',
        background: period === p ? '#1d4ed8' : 'transparent',
        color: period === p ? 'white' : '#9ca3af',
    } as React.CSSProperties);

    // Group scheduled items by date
    const schedByDate: Record<string, ScheduledItem[]> = {};
    for (const item of scheduled) {
        const day = new Date(item.scheduled_at).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
        (schedByDate[day] ||= []).push(item);
    }

    const totalPages = Math.ceil(histTotal / 50);

    return (
        <div style={{ padding: '1.5rem', maxWidth: 1100, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ marginBottom: '1.5rem' }}>
                <h1 style={{ color: 'white', fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>✉ Email Queue</h1>
                <p style={{ color: '#9ca3af', marginTop: '0.4rem', fontSize: '0.9rem' }}>
                    Upcoming scheduled emails and full send history across all organisations.
                </p>
            </div>

            {/* Main tabs */}
            <div style={{ display: 'flex', gap: 6, marginBottom: '1.25rem', background: '#111827', borderRadius: 10, padding: 4, width: 'fit-content' }}>
                <button style={tabStyle('schedule')} onClick={() => setMainTab('schedule')}>📅 Upcoming Schedule</button>
                <button style={tabStyle('history')} onClick={() => setMainTab('history')}>📋 Send History</button>
                <button style={tabStyle('diagnostics')} onClick={() => setMainTab('diagnostics')}>🔧 Diagnostics</button>
            </div>

            {/* Period pills */}
            <div style={{ display: 'flex', gap: 8, marginBottom: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ color: '#6b7280', fontSize: '0.82rem' }}>Period:</span>
                {([
                    { value: 'today', label: 'Day' },
                    { value: 'week', label: 'Week' },
                    { value: 'month', label: 'Month' },
                    { value: 'date_range', label: 'Date Range' },
                    { value: 'specific_date', label: 'Specific Date' },
                ] as const).map(({ value, label }) => (
                    <button key={value} style={periodBtn(value)} onClick={() => { setPeriod(value); setHistPage(1); }}>
                        {label}
                    </button>
                ))}
            </div>
            {period === 'date_range' && (
                <div style={{ display: 'flex', gap: 8, marginBottom: '0.75rem', alignItems: 'center' }}>
                    <span style={{ color: '#6b7280', fontSize: '0.82rem' }}>From:</span>
                    <input type="date" aria-label="Range start date" value={rangeStart} onChange={e => { setRangeStart(e.target.value); setHistPage(1); }}
                        style={{ background: '#1f2937', color: '#d1d5db', border: '1px solid #374151', borderRadius: 6, padding: '4px 8px', fontSize: '0.82rem' }} />
                    <span style={{ color: '#6b7280', fontSize: '0.82rem' }}>To:</span>
                    <input type="date" aria-label="Range end date" value={rangeEnd} onChange={e => { setRangeEnd(e.target.value); setHistPage(1); }}
                        style={{ background: '#1f2937', color: '#d1d5db', border: '1px solid #374151', borderRadius: 6, padding: '4px 8px', fontSize: '0.82rem' }} />
                    <button onClick={() => { loadSchedule(); loadHistory(); }}
                        style={{ background: '#1d4ed8', color: 'white', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
                        Apply
                    </button>
                </div>
            )}
            {period === 'specific_date' && (
                <div style={{ display: 'flex', gap: 8, marginBottom: '0.75rem', alignItems: 'center' }}>
                    <span style={{ color: '#6b7280', fontSize: '0.82rem' }}>Date:</span>
                    <input type="date" aria-label="Specific date" value={specificDate} onChange={e => { setSpecificDate(e.target.value); setHistPage(1); }}
                        style={{ background: '#1f2937', color: '#d1d5db', border: '1px solid #374151', borderRadius: 6, padding: '4px 8px', fontSize: '0.82rem' }} />
                    <button onClick={() => { loadSchedule(); loadHistory(); }}
                        style={{ background: '#1d4ed8', color: 'white', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
                        Apply
                    </button>
                </div>
            )}

            {/* ── SCHEDULE TAB ── */}
            {mainTab === 'schedule' && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                            {scheduled.length > 0 ? `${scheduled.length} scheduled email${scheduled.length !== 1 ? 's' : ''}` : ''}
                        </span>
                        <button
                            disabled={triggering !== null}
                            onClick={() => triggerTask('all')}
                            style={{ background: triggering !== null ? '#374151' : '#059669', color: 'white', border: 'none', borderRadius: 7, padding: '7px 18px', cursor: triggering !== null ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.85rem', opacity: triggering !== null ? 0.6 : 1 }}
                        >
                            {triggering !== null ? '⏳ Running…' : '▶ Send Email Schedule Now'}
                        </button>
                    </div>
                    {triggerResults && mainTab === 'schedule' && (
                        <div style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {triggerResults.map((r, i) => (
                                <div key={i} style={{ background: r.status === 'queued' ? '#064e3b' : '#1c1917', border: `1px solid ${r.status === 'queued' ? '#065f46' : '#292524'}`, borderRadius: 7, padding: '0.5rem 0.9rem', fontSize: '0.82rem', color: r.status === 'queued' ? '#6ee7b7' : '#a8a29e' }}>
                                    {r.status === 'queued' ? '✅' : '⚠️'} <strong>{r.task}</strong> — {r.detail}
                                </div>
                            ))}
                        </div>
                    )}
                    {schedLoading && <p style={{ color: '#9ca3af' }}>Loading schedule…</p>}
                    {!schedLoading && scheduled.length === 0 && (
                        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 10, padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                            No scheduled emails found for this period.
                        </div>
                    )}
                    {Object.entries(schedByDate).map(([day, items]) => (
                        <div key={day} style={{ marginBottom: '1.5rem' }}>
                            <div style={{ color: '#60a5fa', fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                                📅 {day}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {items.map((item, i) => {
                                    const color = TYPE_COLORS[item.type] ?? '#6b7280';
                                    let recipientList = '—';
                                    if (item.recipients) {
                                        try {
                                            const p = JSON.parse(item.recipients);
                                            recipientList = (p?.to || [p]).flat().join(', ');
                                        } catch { recipientList = item.recipients; }
                                    }
                                    return (
                                        <div key={i} style={{ background: '#111827', border: `1px solid ${color}44`, borderLeft: `3px solid ${color}`, borderRadius: 8, padding: '0.75rem 1rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
                                            <div style={{ flexShrink: 0 }}>
                                                <TypeBadge type={item.type} />
                                            </div>
                                            <div style={{ flex: 1, minWidth: 150 }}>
                                                <div style={{ color: 'white', fontWeight: 600, fontSize: '0.9rem' }}>{item.label}</div>
                                                <div style={{ color: '#9ca3af', fontSize: '0.78rem' }}>{item.org_name}</div>
                                            </div>
                                            <div style={{ color: '#d1d5db', fontSize: '0.82rem', minWidth: 100 }}>
                                                🕐 {new Date(item.scheduled_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                                            </div>
                                            <div style={{ color: '#9ca3af', fontSize: '0.78rem', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                To: {recipientList}
                                            </div>
                                            <div style={{ color: '#6b7280', fontSize: '0.75rem', textTransform: 'capitalize' }}>{item.frequency}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── HISTORY TAB ── */}
            {mainTab === 'history' && (
                <div>
                    {/* Filters */}
                    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                        <select value={filterType} onChange={e => { setFilterType(e.target.value); setHistPage(1); }}
                            style={{ background: '#1f2937', color: '#d1d5db', border: '1px solid #374151', borderRadius: 6, padding: '5px 10px', fontSize: '0.82rem' }}>
                            <option value="">All Types</option>
                            {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setHistPage(1); }}
                            style={{ background: '#1f2937', color: '#d1d5db', border: '1px solid #374151', borderRadius: 6, padding: '5px 10px', fontSize: '0.82rem' }}>
                            <option value="">All Statuses</option>
                            <option value="pending">Pending</option>
                            <option value="sent">Sent</option>
                            <option value="failed">Failed</option>
                            <option value="skipped">Skipped</option>
                        </select>
                        <button onClick={loadHistory} style={{ background: '#1d4ed8', color: 'white', border: 'none', borderRadius: 6, padding: '5px 14px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
                            Refresh
                        </button>
                        <span style={{ color: '#6b7280', fontSize: '0.82rem', alignSelf: 'center' }}>{histTotal} records</span>
                    </div>

                    {histLoading && <p style={{ color: '#9ca3af' }}>Loading history…</p>}

                    {!histLoading && (
                        <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #1f2937' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: '#0f172a', color: '#9ca3af', textAlign: 'left' }}>
                                        <th style={{ padding: '10px 14px', fontWeight: 600 }}>Time</th>
                                        <th style={{ padding: '10px 14px', fontWeight: 600 }}>Org</th>
                                        <th style={{ padding: '10px 14px', fontWeight: 600 }}>Type</th>
                                        <th style={{ padding: '10px 14px', fontWeight: 600 }}>Subject</th>
                                        <th style={{ padding: '10px 14px', fontWeight: 600 }}>To</th>
                                        <th style={{ padding: '10px 14px', fontWeight: 600 }}>Tier</th>
                                        <th style={{ padding: '10px 14px', fontWeight: 600 }}>Status</th>
                                        <th style={{ padding: '10px 14px', fontWeight: 600 }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {history.length === 0 && (
                                        <tr><td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>No emails found for this period.</td></tr>
                                    )}
                                    {history.map(row => {
                                        const toList = row.recipients?.to?.join(', ') ?? '—';
                                        return (
                                            <tr key={row.id} style={{ borderTop: '1px solid #1f2937', cursor: 'pointer' }}
                                                onClick={() => openDetail(row.id)}
                                                onMouseEnter={e => (e.currentTarget.style.background = '#1f2937')}
                                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                                <td style={{ padding: '10px 14px', color: '#9ca3af', whiteSpace: 'nowrap' }}>{fmtTime(row.sent_at)}</td>
                                                <td style={{ padding: '10px 14px', color: '#d1d5db' }}>{row.org_display ?? '—'}</td>
                                                <td style={{ padding: '10px 14px' }}><TypeBadge type={row.email_type} /></td>
                                                <td style={{ padding: '10px 14px', color: '#e5e7eb', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.subject ?? '—'}</td>
                                                <td style={{ padding: '10px 14px', color: '#9ca3af', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{toList}</td>
                                                <td style={{ padding: '10px 14px', color: '#6b7280', fontSize: '0.75rem' }}>{row.tier}</td>
                                                <td style={{ padding: '10px 14px' }}>
                                                    <StatusBadge status={row.status} />
                                                    {row.status === 'failed' && row.error_message && (
                                                        <div style={{ color: '#fca5a5', fontSize: '0.72rem', marginTop: 3, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.error_message}>
                                                            {row.error_message}
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={{ padding: '10px 14px' }}>
                                                    {(row.has_html || row.has_text) && (
                                                        <span style={{ color: '#60a5fa', fontSize: '0.78rem' }}>View →</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div style={{ display: 'flex', gap: 8, marginTop: '1rem', justifyContent: 'center', alignItems: 'center' }}>
                            <button disabled={histPage <= 1} onClick={() => setHistPage(p => p - 1)}
                                style={{ background: '#1f2937', color: histPage <= 1 ? '#4b5563' : '#d1d5db', border: '1px solid #374151', borderRadius: 6, padding: '4px 12px', cursor: histPage <= 1 ? 'default' : 'pointer' }}>
                                ← Prev
                            </button>
                            <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Page {histPage} of {totalPages}</span>
                            <button disabled={histPage >= totalPages} onClick={() => setHistPage(p => p + 1)}
                                style={{ background: '#1f2937', color: histPage >= totalPages ? '#4b5563' : '#d1d5db', border: '1px solid #374151', borderRadius: 6, padding: '4px 12px', cursor: histPage >= totalPages ? 'default' : 'pointer' }}>
                                Next →
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* ── DIAGNOSTICS TAB ── */}
            {mainTab === 'diagnostics' && (
                <div>
                    {/* Force Trigger Buttons */}
                    <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 10, padding: '1.25rem 1.5rem', marginBottom: '1.25rem' }}>
                        <div style={{ color: '#e5e7eb', fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.75rem' }}>⚡ Force Run Scheduler Tasks</div>
                        <p style={{ color: '#9ca3af', fontSize: '0.82rem', margin: '0 0 1rem' }}>
                            Runs tasks immediately regardless of scheduled time. Useful for testing that emails send correctly.
                        </p>
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                            {(['reports', 'low_stock', 'shift_reports', 'all'] as const).map(t => (
                                <button key={t} disabled={triggering !== null} onClick={() => triggerTask(t)}
                                    style={{ background: triggering === t ? '#1d4ed8' : '#1f2937', color: 'white', border: '1px solid #374151', borderRadius: 7, padding: '8px 18px', cursor: triggering !== null ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.85rem', opacity: triggering !== null && triggering !== t ? 0.6 : 1 }}>
                                    {triggering === t ? '⏳ Running…' : t === 'all' ? '▶ Run All' : t === 'reports' ? '▶ Reports' : t === 'low_stock' ? '▶ Low Stock' : '▶ Shift Reports'}
                                </button>
                            ))}
                            <button onClick={loadDiagnostics} disabled={diagLoading}
                                style={{ background: 'transparent', color: '#60a5fa', border: '1px solid #374151', borderRadius: 7, padding: '8px 18px', cursor: diagLoading ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
                                {diagLoading ? '⏳' : '↻'} Refresh Status
                            </button>
                        </div>

                        {/* Trigger Results */}
                        {triggerResults && (
                            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {triggerResults.map((r, i) => (
                                    <div key={i} style={{ background: r.status === 'queued' ? '#064e3b' : r.status === 'skipped' ? '#1c1917' : '#1e3a5f', border: `1px solid ${r.status === 'queued' ? '#065f46' : r.status === 'skipped' ? '#292524' : '#1d4ed8'}`, borderRadius: 7, padding: '0.6rem 0.9rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                        <span style={{ fontSize: '1rem', flexShrink: 0 }}>{r.status === 'queued' ? '✅' : r.status === 'skipped' ? '⚠️' : '🔵'}</span>
                                        <div>
                                            <div style={{ color: 'white', fontWeight: 600, fontSize: '0.85rem' }}>{r.task}</div>
                                            <div style={{ color: '#9ca3af', fontSize: '0.8rem', marginTop: 2 }}>{r.detail}</div>
                                        </div>
                                    </div>
                                ))}
                                {triggerSmtp && (
                                    <div style={{ marginTop: '0.5rem' }}>
                                        <div style={{ color: '#6b7280', fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>SMTP Config (from last run)</div>
                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                            {Object.entries(triggerSmtp).map(([tier, cfg]) => (
                                                <div key={tier} style={{ background: cfg.configured ? '#064e3b' : '#1c1917', border: `1px solid ${cfg.configured ? '#065f46' : '#292524'}`, borderRadius: 6, padding: '4px 10px', fontSize: '0.75rem' }}>
                                                    <span style={{ color: cfg.configured ? '#6ee7b7' : '#fca5a5', fontWeight: 700 }}>{tier}</span>
                                                    <span style={{ color: '#6b7280', marginLeft: 6 }}>{cfg.configured ? `✓ ${cfg.user}` : '✗ not configured'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {diagLoading && <p style={{ color: '#9ca3af' }}>Loading diagnostics…</p>}

                    {diagData && !diagLoading && (
                        <>
                            {/* Scheduler + SMTP Status */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                                {/* Scheduler running */}
                                <div style={{ background: '#111827', border: `1px solid ${diagData.schedulerRunning ? '#065f46' : '#7f1d1d'}`, borderRadius: 10, padding: '1rem 1.25rem' }}>
                                    <div style={{ color: '#9ca3af', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Scheduler Status</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: diagData.schedulerRunning ? '#10b981' : '#ef4444', display: 'inline-block', flexShrink: 0 }} />
                                        <span style={{ color: diagData.schedulerRunning ? '#6ee7b7' : '#fca5a5', fontWeight: 700, fontSize: '0.9rem' }}>
                                            {diagData.schedulerRunning ? 'Running' : 'NOT Running'}
                                        </span>
                                    </div>
                                    {!diagData.schedulerRunning && (
                                        <p style={{ color: '#fca5a5', fontSize: '0.78rem', margin: '6px 0 0' }}>
                                            Scheduler is not active — automated emails will not send. Check that the server started with instrumentation hooks enabled.
                                        </p>
                                    )}
                                </div>

                                {/* SMTP tiers */}
                                <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 10, padding: '1rem 1.25rem' }}>
                                    <div style={{ color: '#9ca3af', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>SMTP Tiers</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                        {Object.entries(diagData.smtp).map(([tier, cfg]) => (
                                            <div key={tier} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#d1d5db', fontSize: '0.82rem', fontWeight: 600, textTransform: 'capitalize' }}>{tier}</span>
                                                <span style={{ color: cfg.configured ? '#6ee7b7' : '#6b7280', fontSize: '0.78rem' }}>
                                                    {cfg.configured ? `✓ ${cfg.user}` : '✗ not configured'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Due Report Schedules */}
                            <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '1rem' }}>
                                <div style={{ color: '#e5e7eb', fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.75rem' }}>
                                    📊 Active Report Schedules {diagData.dueReports.length === 0 && <span style={{ color: '#6b7280', fontWeight: 400 }}>(none)</span>}
                                </div>
                                {diagData.dueReports.length === 0 && (
                                    <p style={{ color: '#6b7280', fontSize: '0.82rem', margin: 0 }}>No active report schedules found. Create one in Admin → Reports → Schedule Report.</p>
                                )}
                                {diagData.dueReports.length > 0 && (
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                            <thead>
                                                <tr style={{ color: '#6b7280', textAlign: 'left' }}>
                                                    <th style={{ padding: '5px 10px', fontWeight: 600 }}>Report</th>
                                                    <th style={{ padding: '5px 10px', fontWeight: 600 }}>Org</th>
                                                    <th style={{ padding: '5px 10px', fontWeight: 600 }}>Freq</th>
                                                    <th style={{ padding: '5px 10px', fontWeight: 600 }}>Next Run</th>
                                                    <th style={{ padding: '5px 10px', fontWeight: 600 }}>Due?</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {diagData.dueReports.map(r => {
                                                    const isDue = r.next_run_at ? new Date(r.next_run_at) <= new Date() : false;
                                                    return (
                                                        <tr key={r.id} style={{ borderTop: '1px solid #1f2937' }}>
                                                            <td style={{ padding: '6px 10px', color: '#e5e7eb' }}>{r.report_name ?? '(unlinked)'}</td>
                                                            <td style={{ padding: '6px 10px', color: '#9ca3af' }}>{r.org_name}</td>
                                                            <td style={{ padding: '6px 10px', color: '#9ca3af', textTransform: 'capitalize' }}>{r.frequency}</td>
                                                            <td style={{ padding: '6px 10px', color: r.next_run_at ? '#d1d5db' : '#ef4444' }}>
                                                                {r.next_run_at ? new Date(r.next_run_at).toLocaleString() : 'NULL — will never fire!'}
                                                            </td>
                                                            <td style={{ padding: '6px 10px' }}>
                                                                <span style={{ color: isDue ? '#6ee7b7' : '#f59e0b', fontWeight: 700, fontSize: '0.75rem' }}>
                                                                    {isDue ? '✓ DUE NOW' : '⏳ Not yet'}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            {/* Low Stock Alert Orgs */}
                            <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '1rem' }}>
                                <div style={{ color: '#e5e7eb', fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.75rem' }}>
                                    ⚠️ Low Stock Alert Orgs {diagData.lowStockOrgs.length === 0 && <span style={{ color: '#6b7280', fontWeight: 400 }}>(none enabled)</span>}
                                </div>
                                {diagData.lowStockOrgs.length === 0 && (
                                    <p style={{ color: '#6b7280', fontSize: '0.82rem', margin: 0 }}>No orgs have low stock alerts enabled.</p>
                                )}
                                {diagData.lowStockOrgs.map((s, i) => {
                                    let timeStr = 'N/A';
                                    try {
                                        const raw = s.schedule || s.legacy_time;
                                        const parsed = raw ? JSON.parse(raw) : null;
                                        timeStr = parsed?.time || raw || '14:00';
                                    } catch { timeStr = s.schedule || s.legacy_time || '14:00'; }
                                    return (
                                        <div key={i} style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '5px 0', borderTop: i > 0 ? '1px solid #1f2937' : 'none', flexWrap: 'wrap' }}>
                                            <span style={{ color: '#e5e7eb', fontSize: '0.82rem', fontWeight: 600, minWidth: 140 }}>{s.org_name}</span>
                                            <span style={{ color: '#9ca3af', fontSize: '0.78rem' }}>Fires daily at <strong style={{ color: '#fbbf24' }}>{timeStr}</strong> (exact minute match)</span>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Shift Report Orgs */}
                            <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '1rem' }}>
                                <div style={{ color: '#e5e7eb', fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.75rem' }}>
                                    📋 Shift Report Orgs {diagData.shiftReportOrgs.length === 0 && <span style={{ color: '#6b7280', fontWeight: 400 }}>(none enabled)</span>}
                                </div>
                                {diagData.shiftReportOrgs.length === 0 && (
                                    <p style={{ color: '#6b7280', fontSize: '0.82rem', margin: 0 }}>No orgs have shift report emails enabled.</p>
                                )}
                                {diagData.shiftReportOrgs.map((s, i) => {
                                    let schedParsed: any = {};
                                    try { schedParsed = s.schedule ? JSON.parse(s.schedule) : {}; } catch { }
                                    return (
                                        <div key={i} style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '5px 0', borderTop: i > 0 ? '1px solid #1f2937' : 'none', flexWrap: 'wrap' }}>
                                            <span style={{ color: '#e5e7eb', fontSize: '0.82rem', fontWeight: 600, minWidth: 140 }}>{s.org_name}</span>
                                            <span style={{ color: '#9ca3af', fontSize: '0.78rem' }}>
                                                {schedParsed.frequency === 'per_shift' ? 'Per-shift (fires at shift close)' : `${schedParsed.frequency || 'daily'} at `}
                                                {schedParsed.frequency !== 'per_shift' && <strong style={{ color: '#fbbf24' }}>{schedParsed.time || '08:00'}</strong>}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Recent Email Log */}
                            <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 10, padding: '1rem 1.25rem' }}>
                                <div style={{ color: '#e5e7eb', fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.75rem' }}>📨 Recent Email Log (last 10)</div>
                                {diagData.recentLogs.length === 0 && (
                                    <p style={{ color: '#ef4444', fontSize: '0.82rem', margin: 0 }}>No email log entries at all — scheduler may not be running or no emails have been attempted.</p>
                                )}
                                {diagData.recentLogs.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                        {diagData.recentLogs.map((log, i) => {
                                            const sc = STATUS_COLORS[log.status] ?? STATUS_COLORS.skipped;
                                            return (
                                                <div key={i} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '5px 0', borderTop: i > 0 ? '1px solid #1f2937' : 'none', flexWrap: 'wrap' }}>
                                                    <span style={{ background: sc.bg, color: sc.text, borderRadius: 10, padding: '1px 8px', fontSize: '0.72rem', fontWeight: 700, flexShrink: 0 }}>{log.status.toUpperCase()}</span>
                                                    <TypeBadge type={log.email_type} />
                                                    <span style={{ color: '#9ca3af', fontSize: '0.78rem' }}>{new Date(log.sent_at).toLocaleString()}</span>
                                                    <span style={{ color: '#6b7280', fontSize: '0.78rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.subject ?? '—'}</span>
                                                    {log.error_message && <span style={{ color: '#fca5a5', fontSize: '0.72rem' }} title={log.error_message}>⚠ {log.error_message.slice(0, 60)}</span>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ── DETAIL MODAL ── */}
            {(detailLoading || detailRow) && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
                    onClick={e => { if (e.target === e.currentTarget) setDetailRow(null); }}>
                    <div style={{ background: '#0f172a', border: '1px solid #1f2937', borderRadius: 12, width: '100%', maxWidth: 860, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        {/* Modal header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '1.25rem 1.5rem', borderBottom: '1px solid #1f2937' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                                    {detailRow && <TypeBadge type={detailRow.email_type} />}
                                    {detailRow && <StatusBadge status={detailRow.status} />}
                                    {detailRow?.scheduled && <span style={{ color: '#60a5fa', fontSize: '0.75rem', background: '#1e3a5f', border: '1px solid #1d4ed8', borderRadius: 12, padding: '2px 8px' }}>Scheduled</span>}
                                </div>
                                <h2 style={{ color: 'white', margin: 0, fontSize: '1rem', fontWeight: 700 }}>{detailRow?.subject ?? 'Email Detail'}</h2>
                            </div>
                            <button onClick={() => setDetailRow(null)}
                                style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1, padding: 0, marginTop: 2 }}>✕</button>
                        </div>

                        {detailLoading && <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>Loading…</div>}

                        {detailRow && !detailLoading && (
                            <>
                                {/* Meta grid */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', padding: '1rem 1.5rem', borderBottom: '1px solid #1f2937' }}>
                                    {[
                                        { label: 'Sent At', value: fmtTime(detailRow.sent_at) },
                                        { label: 'Organisation', value: detailRow.org_display ?? '—' },
                                        { label: 'Tier', value: detailRow.tier },
                                        { label: 'Recipients', value: detailRow.recipients?.to?.join(', ') ?? '—' },
                                        ...(detailRow.error_message ? [{ label: 'Error', value: detailRow.error_message }] : []),
                                    ].map(({ label, value }) => (
                                        <div key={label}>
                                            <div style={{ color: '#6b7280', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
                                            <div style={{ color: '#e5e7eb', fontSize: '0.85rem', wordBreak: 'break-all' }}>{value}</div>
                                        </div>
                                    ))}
                                </div>

                                {/* Body preview tabs */}
                                {(detailRow.html_body || detailRow.text_body) && (
                                    <>
                                        <div style={{ display: 'flex', gap: 6, padding: '0.75rem 1.5rem 0', borderBottom: '1px solid #1f2937' }}>
                                            {detailRow.html_body && (
                                                <button onClick={() => setDetailPreview('html')}
                                                    style={{ padding: '5px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem', background: detailPreview === 'html' ? '#2563eb' : '#1f2937', color: detailPreview === 'html' ? 'white' : '#9ca3af' }}>
                                                    HTML Preview
                                                </button>
                                            )}
                                            {detailRow.text_body && (
                                                <button onClick={() => setDetailPreview('text')}
                                                    style={{ padding: '5px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem', background: detailPreview === 'text' ? '#2563eb' : '#1f2937', color: detailPreview === 'text' ? 'white' : '#9ca3af' }}>
                                                    Plain Text
                                                </button>
                                            )}
                                        </div>
                                        <div style={{ flex: 1, overflow: 'auto' }}>
                                            {detailPreview === 'html' && detailRow.html_body && (
                                                <iframe
                                                    srcDoc={detailRow.html_body}
                                                    style={{ width: '100%', height: '100%', minHeight: 400, border: 'none', background: 'white' }}
                                                    sandbox="allow-same-origin"
                                                    title="Email HTML Preview"
                                                />
                                            )}
                                            {detailPreview === 'text' && detailRow.text_body && (
                                                <pre style={{ margin: 0, padding: '1rem 1.5rem', color: '#d1d5db', fontSize: '0.82rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                                    {detailRow.text_body}
                                                </pre>
                                            )}
                                        </div>
                                    </>
                                )}

                                {!detailRow.html_body && !detailRow.text_body && (
                                    <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>No email body stored for this record.</div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
