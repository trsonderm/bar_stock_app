'use client';

import { useState, useEffect, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface EmailRow {
    id: number;
    organization_id: number | null;
    org_name: string | null;
    email_type: string;
    tier: string;
    subject: string | null;
    recipients: any;
    status: string;
    error_message?: string | null;
    sent_at: string;
}

interface PushRow {
    id: number;
    user_id: number;
    title: string;
    body: string;
    status: string;
    created_at: string;
}

interface ScheduleRow {
    id: number;
    report_id: string;
    frequency: string;
    active: boolean;
    next_run_at: string;
    org_name: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const EMAIL_TYPE_LABELS: Record<string, string> = {
    low_stock_alert: 'Low Stock Alert',
    scheduled_report: 'Scheduled Report',
    smart_order: 'Smart Order',
    shift_report: 'Shift Report',
    activity_report: 'Activity Report',
    test: 'Test Email',
    manual: 'Manual Send',
    other: 'Other',
};

const STATUS_PILL: Record<string, { bg: string; text: string }> = {
    pending:  { bg: '#1e3a5f', text: '#93c5fd' },
    sent:     { bg: '#064e3b', text: '#6ee7b7' },
    failed:   { bg: '#7f1d1d', text: '#fca5a5' },
    skipped:  { bg: '#1c1917', text: '#a8a29e' },
    delivered:{ bg: '#064e3b', text: '#6ee7b7' },
    error:    { bg: '#7f1d1d', text: '#fca5a5' },
};

function Pill({ label, status }: { label?: string; status: string }) {
    const c = STATUS_PILL[status] ?? { bg: '#1f2937', text: '#9ca3af' };
    return (
        <span style={{ background: c.bg, color: c.text, borderRadius: 12, padding: '2px 10px', fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
            {(label ?? status).toUpperCase()}
        </span>
    );
}

function fmtTime(iso: string) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div style={{ background: '#111827', border: `1px solid ${color}44`, borderRadius: 10, padding: '1rem 1.25rem', minWidth: 110 }}>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color }}>{value}</div>
            <div style={{ color: '#9ca3af', fontSize: '0.8rem', marginTop: 2 }}>{label}</div>
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function QueueClient() {
    const [tab, setTab] = useState<'email' | 'push' | 'scheduler'>('email');
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [actionMsg, setActionMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const [triggering, setTriggering] = useState<string | null>(null);
    const [retrying, setRetrying] = useState<number | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/super-admin/queue-management');
            const d = await res.json();
            setData(d);
        } catch (e: any) {
            setActionMsg({ ok: false, text: 'Failed to load: ' + e.message });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const doAction = async (body: any, successMsg: string) => {
        const res = await fetch('/api/super-admin/queue-management', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const d = await res.json();
        const msg = res.ok ? successMsg : (d.error || 'Action failed');
        setActionMsg({ ok: res.ok, text: msg });
        setTimeout(() => setActionMsg(null), 5000);
        if (res.ok) load();
        return res.ok;
    };

    const trigger = async (task: string) => {
        setTriggering(task);
        await doAction({ action: 'trigger', task }, `Scheduler triggered: ${task}`);
        setTriggering(null);
    };

    const retryEmail = async (id: number) => {
        setRetrying(id);
        await doAction({ action: 'retry', emailId: id }, `Email #${id} queued for retry`);
        setRetrying(null);
    };

    const clearEmails = async (status: string) => {
        if (!confirm(`Delete all ${status} emails? This cannot be undone.`)) return;
        const res = await doAction({ action: 'clear', status }, `Cleared all ${status} emails`);
        return res;
    };

    const tabBtn = (t: string, label: string) => ({
        padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem',
        background: tab === t ? '#2563eb' : 'transparent',
        color: tab === t ? 'white' : '#9ca3af',
    } as React.CSSProperties);

    const stats = data?.emailStats || {};
    const pushStats = data?.pushStats || {};

    return (
        <div style={{ padding: '1.5rem', maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ marginBottom: '1.5rem' }}>
                <h1 style={{ color: 'white', fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Queue Management</h1>
                <p style={{ color: '#9ca3af', marginTop: '0.4rem', fontSize: '0.9rem' }}>
                    Monitor queues, retry failures, and manually trigger scheduled operations.
                </p>
            </div>

            {actionMsg && (
                <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: 8, background: actionMsg.ok ? '#064e3b' : '#7f1d1d', color: actionMsg.ok ? '#6ee7b7' : '#fca5a5', border: `1px solid ${actionMsg.ok ? '#065f46' : '#991b1b'}` }}>
                    {actionMsg.text}
                </div>
            )}

            {/* Summary stat row */}
            {data && (
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                    <StatCard label="Pending Emails" value={stats.pending || 0} color="#60a5fa" />
                    <StatCard label="Sent (all time)" value={stats.sent || 0} color="#34d399" />
                    <StatCard label="Failed Emails" value={stats.failed || 0} color="#f87171" />
                    <StatCard label="Skipped Emails" value={stats.skipped || 0} color="#9ca3af" />
                    {Object.keys(pushStats).length > 0 && (
                        <StatCard label="Push Sent" value={pushStats.sent || pushStats.delivered || 0} color="#a78bfa" />
                    )}
                    <StatCard label="Active Schedules" value={data.schedules?.length || 0} color="#fbbf24" />
                </div>
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 6, marginBottom: '1.25rem', background: '#111827', borderRadius: 10, padding: 4, width: 'fit-content' }}>
                <button style={tabBtn('email', 'Email Queue')} onClick={() => setTab('email')}>✉ Email Queue</button>
                <button style={tabBtn('push', 'Push Notifications')} onClick={() => setTab('push')}>🔔 Push Notifications</button>
                <button style={tabBtn('scheduler', 'Scheduler')} onClick={() => setTab('scheduler')}>⚙ Scheduler</button>
            </div>

            {loading && <p style={{ color: '#9ca3af' }}>Loading…</p>}

            {/* ── EMAIL QUEUE TAB ── */}
            {!loading && tab === 'email' && data && (
                <div>
                    {/* Action row */}
                    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <button
                            onClick={() => doAction({ action: 'retry_all_failed' }, 'All failed emails queued for retry')}
                            style={{ padding: '6px 16px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: 7, fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}
                        >
                            ↺ Retry All Failed
                        </button>
                        <button
                            onClick={() => clearEmails('failed')}
                            style={{ padding: '6px 16px', background: '#7f1d1d', color: '#fca5a5', border: '1px solid #991b1b', borderRadius: 7, fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}
                        >
                            🗑 Clear All Failed
                        </button>
                        <button
                            onClick={() => clearEmails('skipped')}
                            style={{ padding: '6px 16px', background: '#1c1917', color: '#a8a29e', border: '1px solid #292524', borderRadius: 7, fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}
                        >
                            🗑 Clear All Skipped
                        </button>
                        <button
                            onClick={load}
                            style={{ padding: '6px 16px', background: '#1f2937', color: '#d1d5db', border: '1px solid #374151', borderRadius: 7, fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}
                        >
                            ↻ Refresh
                        </button>
                    </div>

                    {/* Pending emails */}
                    {data.pendingEmails?.length > 0 && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <div style={{ color: '#60a5fa', fontWeight: 700, fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                                Pending Queue ({data.pendingEmails.length})
                            </div>
                            <EmailTable rows={data.pendingEmails} onRetry={retryEmail} retrying={retrying} />
                        </div>
                    )}

                    {/* Failed/skipped emails */}
                    {data.failedEmails?.length > 0 && (
                        <div>
                            <div style={{ color: '#f87171', fontWeight: 700, fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                                Failed & Skipped ({data.failedEmails.length} most recent)
                            </div>
                            <EmailTable rows={data.failedEmails} onRetry={retryEmail} retrying={retrying} showError />
                        </div>
                    )}

                    {data.failedEmails?.length === 0 && data.pendingEmails?.length === 0 && (
                        <div style={{ background: '#064e3b', border: '1px solid #065f46', borderRadius: 10, padding: '2rem', textAlign: 'center', color: '#6ee7b7' }}>
                            No failed or pending emails. Queue is healthy.
                        </div>
                    )}
                </div>
            )}

            {/* ── PUSH NOTIFICATIONS TAB ── */}
            {!loading && tab === 'push' && data && (
                <div>
                    {data.recentPush?.length === 0 && (
                        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 10, padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                            No push notification records found.
                        </div>
                    )}
                    {data.recentPush?.length > 0 && (
                        <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #1f2937' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: '#0f172a', color: '#9ca3af', textAlign: 'left' }}>
                                        <th style={{ padding: '10px 14px' }}>Time</th>
                                        <th style={{ padding: '10px 14px' }}>User</th>
                                        <th style={{ padding: '10px 14px' }}>Title</th>
                                        <th style={{ padding: '10px 14px' }}>Body</th>
                                        <th style={{ padding: '10px 14px' }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.recentPush.map((r: PushRow) => (
                                        <tr key={r.id} style={{ borderTop: '1px solid #1f2937' }}>
                                            <td style={{ padding: '10px 14px', color: '#9ca3af', whiteSpace: 'nowrap' }}>{fmtTime(r.created_at)}</td>
                                            <td style={{ padding: '10px 14px', color: '#d1d5db' }}>User #{r.user_id}</td>
                                            <td style={{ padding: '10px 14px', color: '#e5e7eb', fontWeight: 600 }}>{r.title}</td>
                                            <td style={{ padding: '10px 14px', color: '#9ca3af', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.body}</td>
                                            <td style={{ padding: '10px 14px' }}><Pill status={r.status} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ── SCHEDULER TAB ── */}
            {!loading && tab === 'scheduler' && (
                <div>
                    {/* Manual trigger buttons */}
                    <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
                        <div style={{ color: 'white', fontWeight: 700, fontSize: '1rem', marginBottom: '0.75rem' }}>Manual Trigger</div>
                        <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '1rem' }}>
                            Manually fire scheduler tasks without waiting for the next cron cycle.
                        </p>
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                            {[
                                { task: 'reports', label: '📋 Run Reports', color: '#1d4ed8' },
                                { task: 'low_stock', label: '⚠️ Low Stock Alerts', color: '#d97706' },
                                { task: 'shift_reports', label: '📅 Shift Reports', color: '#0891b2' },
                                { task: 'all', label: '⚡ Run All Tasks', color: '#7c3aed' },
                            ].map(({ task, label, color }) => (
                                <button
                                    key={task}
                                    onClick={() => trigger(task)}
                                    disabled={!!triggering}
                                    style={{ padding: '8px 18px', background: color, color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, cursor: triggering ? 'not-allowed' : 'pointer', opacity: triggering ? 0.7 : 1, fontSize: '0.875rem' }}
                                >
                                    {triggering === task ? 'Running…' : label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Active schedules */}
                    {data?.schedules?.length > 0 && (
                        <div>
                            <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                                Active Report Schedules ({data.schedules.length})
                            </div>
                            <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #1f2937' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr style={{ background: '#0f172a', color: '#9ca3af', textAlign: 'left' }}>
                                            <th style={{ padding: '10px 14px' }}>Organization</th>
                                            <th style={{ padding: '10px 14px' }}>Report</th>
                                            <th style={{ padding: '10px 14px' }}>Frequency</th>
                                            <th style={{ padding: '10px 14px' }}>Next Run</th>
                                            <th style={{ padding: '10px 14px' }}>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.schedules.map((s: ScheduleRow) => {
                                            const isOverdue = new Date(s.next_run_at) < new Date();
                                            return (
                                                <tr key={s.id} style={{ borderTop: '1px solid #1f2937', background: isOverdue ? '#2d1515' : 'transparent' }}>
                                                    <td style={{ padding: '10px 14px', color: '#d1d5db' }}>{s.org_name || '—'}</td>
                                                    <td style={{ padding: '10px 14px', color: '#e5e7eb', fontWeight: 600 }}>{s.report_id}</td>
                                                    <td style={{ padding: '10px 14px', color: '#9ca3af', textTransform: 'capitalize' }}>{s.frequency}</td>
                                                    <td style={{ padding: '10px 14px', color: isOverdue ? '#f87171' : '#9ca3af', whiteSpace: 'nowrap' }}>
                                                        {fmtTime(s.next_run_at)} {isOverdue && '⚠ overdue'}
                                                    </td>
                                                    <td style={{ padding: '10px 14px' }}>
                                                        <Pill status={s.active ? 'sent' : 'skipped'} label={s.active ? 'active' : 'inactive'} />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {(!data?.schedules || data.schedules.length === 0) && (
                        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 10, padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                            No active report schedules found. Schedules are created automatically when organizations configure report settings.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Email table sub-component ─────────────────────────────────────────────────

function EmailTable({ rows, onRetry, retrying, showError = false }: {
    rows: EmailRow[];
    onRetry: (id: number) => void;
    retrying: number | null;
    showError?: boolean;
}) {
    return (
        <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #1f2937' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                    <tr style={{ background: '#0f172a', color: '#9ca3af', textAlign: 'left' }}>
                        <th style={{ padding: '10px 14px' }}>Time</th>
                        <th style={{ padding: '10px 14px' }}>Org</th>
                        <th style={{ padding: '10px 14px' }}>Type</th>
                        <th style={{ padding: '10px 14px' }}>Subject</th>
                        <th style={{ padding: '10px 14px' }}>Tier</th>
                        <th style={{ padding: '10px 14px' }}>Status</th>
                        {showError && <th style={{ padding: '10px 14px' }}>Error</th>}
                        <th style={{ padding: '10px 14px' }}></th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(row => {
                        const toList = (() => {
                            try { const p = typeof row.recipients === 'string' ? JSON.parse(row.recipients) : row.recipients; return (p?.to || []).join(', ') || '—'; } catch { return String(row.recipients || '—'); }
                        })();
                        return (
                            <tr key={row.id} style={{ borderTop: '1px solid #1f2937' }}>
                                <td style={{ padding: '10px 14px', color: '#9ca3af', whiteSpace: 'nowrap' }}>{fmtTime(row.sent_at)}</td>
                                <td style={{ padding: '10px 14px', color: '#d1d5db' }}>{row.org_name || '—'}</td>
                                <td style={{ padding: '10px 14px', color: '#e5e7eb' }}>{EMAIL_TYPE_LABELS[row.email_type] ?? row.email_type}</td>
                                <td style={{ padding: '10px 14px', color: '#9ca3af', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.subject || ''}>{row.subject || '—'}</td>
                                <td style={{ padding: '10px 14px', color: '#6b7280', fontSize: '0.75rem' }}>{row.tier}</td>
                                <td style={{ padding: '10px 14px' }}><Pill status={row.status} /></td>
                                {showError && (
                                    <td style={{ padding: '10px 14px', color: '#fca5a5', fontSize: '0.75rem', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.error_message || ''}>{row.error_message || '—'}</td>
                                )}
                                <td style={{ padding: '10px 14px' }}>
                                    {['failed', 'skipped', 'pending'].includes(row.status) && (
                                        <button
                                            onClick={() => onRetry(row.id)}
                                            disabled={retrying === row.id}
                                            style={{ padding: '3px 10px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: 5, cursor: retrying === row.id ? 'not-allowed' : 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                                        >
                                            {retrying === row.id ? '…' : 'Retry'}
                                        </button>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
