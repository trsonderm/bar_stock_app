'use client';

import { useState, useEffect, useCallback } from 'react';
import styles from '../admin.module.css';

interface LogRow {
    id: number;
    timestamp: string;
    user_name: string;
    user_id: number;
    action: string;
    action_label: string;
    item_name: string;
    change: number | null;
    quantity_after: number | null;
    location_name: string;
}

interface MetaOption { id: number; name: string; }

const ACTION_COLORS: Record<string, { bg: string; text: string }> = {
    ADD_STOCK:       { bg: '#d1fae5', text: '#065f46' },
    SUBTRACT_STOCK:  { bg: '#fee2e2', text: '#991b1b' },
    TRANSFER_IN:     { bg: '#dbeafe', text: '#1e40af' },
    TRANSFER_OUT:    { bg: '#ede9fe', text: '#5b21b6' },
    AUDIT:           { bg: '#fef3c7', text: '#92400e' },
    ORDER_SUBMITTED: { bg: '#fce7f3', text: '#9d174d' },
    ORDER_RECEIVED:  { bg: '#d1fae5', text: '#065f46' },
};

const today = () => new Date().toISOString().slice(0, 10);

type SortKey = 'timestamp' | 'user_name' | 'location_name' | 'action_label' | 'item_name' | 'change';

export default function QueryClient() {
    const [startDate, setStartDate] = useState(today());
    const [endDate, setEndDate] = useState(today());
    const [userId, setUserId] = useState('');
    const [action, setAction] = useState('');
    const [locationId, setLocationId] = useState('');
    const [search, setSearch] = useState('');

    const [logs, setLogs] = useState<LogRow[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);

    const [metaUsers, setMetaUsers] = useState<MetaOption[]>([]);
    const [metaActions, setMetaActions] = useState<string[]>([]);
    const [metaLocations, setMetaLocations] = useState<MetaOption[]>([]);

    const [sortKey, setSortKey] = useState<SortKey>('timestamp');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    const [showEmailModal, setShowEmailModal] = useState(false);
    const [emailTo, setEmailTo] = useState('');
    const [emailSubject, setEmailSubject] = useState('Activity Report');
    const [emailSending, setEmailSending] = useState(false);
    const [emailStatus, setEmailStatus] = useState<'idle' | 'ok' | 'error'>('idle');

    useEffect(() => {
        fetch('/api/admin/query?mode=meta')
            .then(r => r.json())
            .then(d => {
                setMetaUsers(d.users || []);
                setMetaActions(d.actions || []);
                setMetaLocations(d.locations || []);
            });
    }, []);

    const handleSearch = useCallback(async (e?: React.FormEvent) => {
        e?.preventDefault();
        setLoading(true);
        try {
            const params = new URLSearchParams({ start: startDate, end: endDate });
            if (userId) params.set('userId', userId);
            if (action) params.set('action', action);
            if (locationId) params.set('locationId', locationId);
            if (search) params.set('search', search);
            const res = await fetch(`/api/admin/query?${params}`);
            const data = await res.json();
            if (res.ok) { setLogs(data.logs || []); setTotal(data.total || 0); }
            else alert(data.error || 'Failed to fetch');
        } catch { alert('Error fetching activity'); }
        finally { setLoading(false); setHasSearched(true); }
    }, [startDate, endDate, userId, action, locationId, search]);

    const sorted = [...logs].sort((a, b) => {
        let av: any = a[sortKey] ?? '';
        let bv: any = b[sortKey] ?? '';
        if (sortKey === 'timestamp') { av = new Date(av).getTime(); bv = new Date(bv).getTime(); }
        if (sortKey === 'change') { av = av ?? -Infinity; bv = bv ?? -Infinity; }
        return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });

    const toggleSort = (key: SortKey) => {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('desc'); }
    };
    const sortIcon = (key: SortKey) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

    const activeFilters = [
        userId && metaUsers.find(u => u.id === parseInt(userId))?.name && { label: 'User', value: metaUsers.find(u => u.id === parseInt(userId))!.name },
        action && { label: 'Action', value: action.replace(/_/g, ' ') },
        locationId && metaLocations.find(l => l.id === parseInt(locationId))?.name && { label: 'Location', value: metaLocations.find(l => l.id === parseInt(locationId))!.name },
        search && { label: 'Search', value: search },
    ].filter(Boolean) as { label: string; value: string }[];

    const handlePrint = () => {
        const filterHtml = activeFilters.map(f =>
            `<span style="background:#f3f4f6;padding:2px 8px;border-radius:10px;font-size:0.8rem;margin-right:6px;">${f.label}: <b>${f.value}</b></span>`
        ).join('');
        const rows = sorted.map(r => {
            const c = ACTION_COLORS[r.action] || { bg: '#f3f4f6', text: '#374151' };
            return `<tr>
                <td>${new Date(r.timestamp).toLocaleString()}</td>
                <td>${r.user_name}</td>
                <td>${r.location_name || '—'}</td>
                <td><span style="background:${c.bg};color:${c.text};padding:2px 8px;border-radius:10px;font-size:0.78rem;font-weight:600;">${r.action_label}</span></td>
                <td>${r.item_name || '—'}</td>
                <td style="text-align:center;font-weight:bold;color:${r.action === 'ADD_STOCK' ? '#059669' : r.action === 'SUBTRACT_STOCK' ? '#dc2626' : '#374151'}">
                    ${r.change != null ? (r.action === 'ADD_STOCK' ? '+' : r.action === 'SUBTRACT_STOCK' ? '−' : '') + r.change : '—'}
                </td>
            </tr>`;
        }).join('');
        const win = window.open('', '', 'width=1100,height=800');
        if (!win) return;
        win.document.write(`<!DOCTYPE html><html><head><title>Activity Report</title>
<style>
  body{font-family:Arial,sans-serif;padding:32px;color:#111827;}
  h1{margin:0 0 4px;font-size:1.4rem;}
  .meta{color:#6b7280;font-size:0.85rem;margin-bottom:12px;}
  .filters{margin-bottom:16px;}
  table{width:100%;border-collapse:collapse;font-size:0.85rem;}
  th{background:#f9fafb;padding:9px 10px;text-align:left;border-bottom:2px solid #e5e7eb;color:#6b7280;text-transform:uppercase;font-size:0.72rem;}
  td{padding:8px 10px;border-bottom:1px solid #f3f4f6;}
  tr:last-child td{border-bottom:none;}
  .footer{margin-top:20px;font-size:0.78rem;color:#9ca3af;text-align:right;}
  @media print{body{padding:16px;}}
</style></head><body>
<h1>Activity Report</h1>
<div class="meta">${startDate}${startDate !== endDate ? ' — ' + endDate : ''} · ${sorted.length} records · Generated ${new Date().toLocaleString()}</div>
${filterHtml ? `<div class="filters">Filters: ${filterHtml}</div>` : ''}
<table>
  <thead><tr><th>Time</th><th>User</th><th>Location</th><th>Action</th><th>Item</th><th>Qty</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="6" style="text-align:center;padding:20px;color:#9ca3af;">No records</td></tr>'}</tbody>
</table>
<div class="footer">Printed from TopShelf · ${new Date().toLocaleString()}</div>
</body></html>`);
        win.document.close();
        win.focus();
        setTimeout(() => { win.print(); }, 400);
    };

    const handleSendEmail = async () => {
        if (!emailTo.trim()) return;
        setEmailSending(true);
        setEmailStatus('idle');
        try {
            const filterLabels: Record<string, string> = {};
            if (userId) filterLabels['User'] = metaUsers.find(u => u.id === parseInt(userId))?.name || userId;
            if (action) filterLabels['Action'] = action.replace(/_/g, ' ');
            if (locationId) filterLabels['Location'] = metaLocations.find(l => l.id === parseInt(locationId))?.name || locationId;
            if (search) filterLabels['Search'] = search;
            filterLabels['Date'] = startDate + (startDate !== endDate ? ' — ' + endDate : '');
            const res = await fetch('/api/admin/query/email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to: emailTo.trim(), subject: emailSubject, logs: sorted, filters: filterLabels }),
            });
            setEmailStatus(res.ok ? 'ok' : 'error');
        } catch { setEmailStatus('error'); }
        finally { setEmailSending(false); }
    };

    const Th = ({ label, k }: { label: string; k: SortKey }) => (
        <th onClick={() => toggleSort(k)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
            {label}{sortIcon(k)}
        </th>
    );

    return (
        <div className={styles.content}>
            <h1 className={styles.pageTitle}>Activity Search</h1>

            {/* ── Filter Bar ─────────────────────────────────────────────────── */}
            <form onSubmit={handleSearch} className={styles.card} style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', alignItems: 'end' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '4px', color: '#9ca3af', fontSize: '0.8rem' }}>Start Date</label>
                        <input type="date" className={styles.input} value={startDate} onChange={e => setStartDate(e.target.value)} required />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '4px', color: '#9ca3af', fontSize: '0.8rem' }}>End Date</label>
                        <input type="date" className={styles.input} value={endDate} onChange={e => setEndDate(e.target.value)} required />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '4px', color: '#9ca3af', fontSize: '0.8rem' }}>User</label>
                        <select className={styles.input} value={userId} onChange={e => setUserId(e.target.value)}>
                            <option value="">All Users</option>
                            {metaUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '4px', color: '#9ca3af', fontSize: '0.8rem' }}>Action</label>
                        <select className={styles.input} value={action} onChange={e => setAction(e.target.value)}>
                            <option value="">All Actions</option>
                            {metaActions.map(a => (
                                <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '4px', color: '#9ca3af', fontSize: '0.8rem' }}>Location</label>
                        <select className={styles.input} value={locationId} onChange={e => setLocationId(e.target.value)}>
                            <option value="">All Locations</option>
                            {metaLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '4px', color: '#9ca3af', fontSize: '0.8rem' }}>Keyword Search</label>
                        <input className={styles.input} placeholder="user, item, action..." value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button type="submit" className={styles.saveBtn} disabled={loading} style={{ flex: 1 }}>
                            {loading ? 'Searching…' : 'Search'}
                        </button>
                        <button type="button" onClick={() => { setUserId(''); setAction(''); setLocationId(''); setSearch(''); }}
                            style={{ background: '#374151', color: '#9ca3af', border: 'none', borderRadius: '6px', padding: '0 12px', cursor: 'pointer', fontSize: '0.8rem' }}>
                            Clear
                        </button>
                    </div>
                </div>

                {/* Active filter chips */}
                {activeFilters.length > 0 && (
                    <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {activeFilters.map(f => (
                            <span key={f.label} style={{ background: '#1e3a5f', color: '#93c5fd', padding: '3px 10px', borderRadius: '12px', fontSize: '0.78rem' }}>
                                {f.label}: <strong>{f.value}</strong>
                            </span>
                        ))}
                    </div>
                )}
            </form>

            {/* ── Results ────────────────────────────────────────────────────── */}
            {hasSearched && (
                <div className={styles.card} style={{ padding: 0, overflow: 'hidden' }}>
                    {/* Toolbar */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.875rem 1.25rem', borderBottom: '1px solid #374151', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                            {total} record{total !== 1 ? 's' : ''} · {startDate}{startDate !== endDate ? ` — ${endDate}` : ''}
                        </span>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={handlePrint} style={{ background: '#374151', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer', fontSize: '0.85rem' }}>
                                🖨️ Print
                            </button>
                            <button onClick={() => { setShowEmailModal(true); setEmailStatus('idle'); }} style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer', fontSize: '0.85rem' }}>
                                ✉️ Email Report
                            </button>
                        </div>
                    </div>

                    {/* Table */}
                    <div style={{ overflowX: 'auto' }}>
                        {sorted.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>No activity found for the selected filters.</div>
                        ) : (
                            <table className={styles.table} style={{ margin: 0 }}>
                                <thead>
                                    <tr>
                                        <Th label="Time" k="timestamp" />
                                        <Th label="User" k="user_name" />
                                        <Th label="Location" k="location_name" />
                                        <Th label="Action" k="action_label" />
                                        <Th label="Item" k="item_name" />
                                        <Th label="Qty" k="change" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {sorted.map(r => {
                                        const c = ACTION_COLORS[r.action] || { bg: '#374151', text: '#d1d5db' };
                                        return (
                                            <tr key={r.id}>
                                                <td style={{ color: '#9ca3af', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                                                    {new Date(r.timestamp).toLocaleString()}
                                                </td>
                                                <td style={{ fontWeight: 500 }}>{r.user_name}</td>
                                                <td style={{ color: '#9ca3af' }}>{r.location_name || '—'}</td>
                                                <td>
                                                    <span style={{ background: c.bg, color: c.text, padding: '2px 9px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 600 }}>
                                                        {r.action_label}
                                                    </span>
                                                </td>
                                                <td>{r.item_name || '—'}</td>
                                                <td style={{ textAlign: 'center', fontWeight: 700, color: r.action === 'ADD_STOCK' ? '#34d399' : r.action === 'SUBTRACT_STOCK' ? '#f87171' : '#9ca3af' }}>
                                                    {r.change != null
                                                        ? (r.action === 'ADD_STOCK' ? '+' : r.action === 'SUBTRACT_STOCK' ? '−' : '') + r.change
                                                        : '—'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* ── Email Modal ───────────────────────────────────────────────── */}
            {showEmailModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
                    <div style={{ background: '#1f2937', borderRadius: '10px', padding: '1.5rem', width: '90%', maxWidth: '460px', border: '1px solid #374151' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h3 style={{ margin: 0, color: 'white' }}>Email Activity Report</h3>
                            <button onClick={() => setShowEmailModal(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div>
                                <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.82rem', marginBottom: '4px' }}>To</label>
                                <input className={styles.input} type="email" placeholder="recipient@example.com" value={emailTo} onChange={e => setEmailTo(e.target.value)} />
                            </div>
                            <div>
                                <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.82rem', marginBottom: '4px' }}>Subject</label>
                                <input className={styles.input} value={emailSubject} onChange={e => setEmailSubject(e.target.value)} />
                            </div>
                            <div style={{ background: '#111827', borderRadius: '6px', padding: '10px 14px', fontSize: '0.82rem', color: '#6b7280' }}>
                                {sorted.length} record{sorted.length !== 1 ? 's' : ''} will be included · {startDate}{startDate !== endDate ? ` — ${endDate}` : ''}
                                {activeFilters.map(f => <span key={f.label} style={{ marginLeft: '8px', color: '#93c5fd' }}>{f.label}: {f.value}</span>)}
                            </div>
                            {emailStatus === 'ok' && <div style={{ color: '#34d399', fontSize: '0.85rem' }}>✓ Report sent successfully.</div>}
                            {emailStatus === 'error' && <div style={{ color: '#f87171', fontSize: '0.85rem' }}>Failed to send. Check email settings.</div>}
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowEmailModal(false)} style={{ background: 'transparent', color: '#9ca3af', border: '1px solid #374151', borderRadius: '6px', padding: '8px 16px', cursor: 'pointer' }}>Cancel</button>
                            <button onClick={handleSendEmail} disabled={emailSending || !emailTo.trim()} style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', padding: '8px 20px', cursor: emailSending ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: emailSending ? 0.7 : 1 }}>
                                {emailSending ? 'Sending…' : 'Send Report'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
