'use client';

import { useState, useEffect, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

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
    const [mainTab, setMainTab] = useState<'schedule' | 'history'>('schedule');
    const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');

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

    // Detail modal
    const [detailRow, setDetailRow] = useState<DetailRow | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailPreview, setDetailPreview] = useState<'html' | 'text'>('html');

    const loadSchedule = useCallback(async () => {
        setSchedLoading(true);
        try {
            const res = await fetch(`/api/super-admin/email-log?view=schedule&period=${period}`);
            const data = await res.json();
            if (data.scheduled) setScheduled(data.scheduled);
        } catch (e) { console.error(e); } finally { setSchedLoading(false); }
    }, [period]);

    const loadHistory = useCallback(async () => {
        setHistLoading(true);
        try {
            const params = new URLSearchParams({ view: 'history', period, page: String(histPage) });
            if (filterType) params.set('emailType', filterType);
            if (filterStatus) params.set('status', filterStatus);
            if (filterOrg) params.set('orgId', filterOrg);
            const res = await fetch(`/api/super-admin/email-log?${params}`);
            const data = await res.json();
            if (data.rows) { setHistory(data.rows); setHistTotal(data.total); }
        } catch (e) { console.error(e); } finally { setHistLoading(false); }
    }, [period, histPage, filterType, filterStatus, filterOrg]);

    useEffect(() => {
        if (mainTab === 'schedule') loadSchedule();
    }, [mainTab, loadSchedule]);

    useEffect(() => {
        if (mainTab === 'history') loadHistory();
    }, [mainTab, loadHistory]);

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
            </div>

            {/* Period pills */}
            <div style={{ display: 'flex', gap: 8, marginBottom: '1.25rem', alignItems: 'center' }}>
                <span style={{ color: '#6b7280', fontSize: '0.82rem' }}>Period:</span>
                {(['today', 'week', 'month'] as const).map(p => (
                    <button key={p} style={periodBtn(p)} onClick={() => { setPeriod(p); setHistPage(1); }}>
                        {p === 'today' ? 'Today' : p === 'week' ? 'This Week' : 'This Month'}
                    </button>
                ))}
            </div>

            {/* ── SCHEDULE TAB ── */}
            {mainTab === 'schedule' && (
                <div>
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
