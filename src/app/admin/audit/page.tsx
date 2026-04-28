'use client';

import { useState, useEffect, useRef } from 'react';
import styles from '../admin.module.css';


interface Item {
    id: number;
    name: string;
    quantity: number;
    type: string;
    include_in_audit?: boolean;
}

interface AuditChange {
    itemId: number;
    itemName: string;
    oldQty: number;
    newQty: number;
    diff: number;
}

interface AuditSession {
    id: string;
    user_name: string;
    timestamp: string;
    note: string | null;
    changes: AuditChange[];
}

// ─── Audit Detail View (view or print a past audit) ──────────────────────────
function AuditDetail({ audit, onClose }: { audit: AuditSession; onClose: () => void }) {
    const printRef = useRef<HTMLDivElement>(null);

    const handlePrint = () => {
        const win = window.open('', '_blank', 'width=900,height=700');
        if (!win || !printRef.current) return;
        win.document.write(`<!DOCTYPE html><html><head><title>Audit ${new Date(audit.timestamp).toLocaleDateString()}</title>
        <style>
            body { font-family: sans-serif; padding: 24px; color: #111; }
            h2 { margin-bottom: 4px; } p { color: #555; margin: 0 0 16px; }
            table { width: 100%; border-collapse: collapse; }
            th { text-align: left; padding: 8px 12px; border-bottom: 2px solid #000; font-size: 0.8rem; text-transform: uppercase; }
            td { padding: 8px 12px; border-bottom: 1px solid #ddd; }
            .pos { color: #16a34a; } .neg { color: #dc2626; }
        </style></head><body>${printRef.current.innerHTML}</body></html>`);
        win.document.close();
        win.focus();
        win.print();
        win.close();
    };

    const added = audit.changes.filter(c => c.diff > 0);
    const removed = audit.changes.filter(c => c.diff < 0);

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '1rem', width: '100%', maxWidth: 760, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid #1e293b' }}>
                    <div>
                        <h2 style={{ margin: 0, color: '#fbbf24', fontSize: '1.1rem' }}>
                            Audit — {new Date(audit.timestamp).toLocaleString()}
                        </h2>
                        <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: '0.85rem' }}>
                            By {audit.user_name}{audit.note ? ` · ${audit.note}` : ''}
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={handlePrint} style={{ padding: '0.4rem 0.9rem', background: '#374151', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                            🖨 Print
                        </button>
                        <button onClick={onClose} style={{ padding: '0.4rem 0.9rem', background: 'transparent', color: '#9ca3af', border: '1px solid #374151', borderRadius: '0.5rem', cursor: 'pointer' }}>
                            Close
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div style={{ overflow: 'auto', flex: 1, padding: '1.25rem 1.5rem' }} ref={printRef}>
                    <div style={{ marginBottom: '0.5rem', color: '#64748b', fontSize: '0.8rem' }}>
                        Audit performed by <strong style={{ color: '#94a3b8' }}>{audit.user_name}</strong> on{' '}
                        <strong style={{ color: '#94a3b8' }}>{new Date(audit.timestamp).toLocaleString()}</strong>
                        {audit.note && <> · Note: <em>{audit.note}</em></>}
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #334155' }}>
                                <th style={{ textAlign: 'left', padding: '8px 12px', color: '#64748b', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' }}>Item</th>
                                <th style={{ textAlign: 'right', padding: '8px 12px', color: '#64748b', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' }}>System</th>
                                <th style={{ textAlign: 'right', padding: '8px 12px', color: '#64748b', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' }}>Counted</th>
                                <th style={{ textAlign: 'right', padding: '8px 12px', color: '#64748b', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' }}>Difference</th>
                            </tr>
                        </thead>
                        <tbody>
                            {audit.changes.map((c, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
                                    <td style={{ padding: '8px 12px', color: 'white', fontWeight: 500 }}>{c.itemName}</td>
                                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#94a3b8' }}>{Number(c.oldQty).toFixed(2)}</td>
                                    <td style={{ padding: '8px 12px', textAlign: 'right', color: 'white', fontWeight: 600 }}>{Number(c.newQty).toFixed(2)}</td>
                                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: c.diff > 0 ? '#4ade80' : '#f87171' }}>
                                        {c.diff > 0 ? '+' : ''}{Number(c.diff).toFixed(2)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1.25rem', padding: '0.75rem 1rem', background: '#1e293b', borderRadius: '0.5rem', fontSize: '0.85rem' }}>
                        <span style={{ color: '#94a3b8' }}>Total changes: <strong style={{ color: 'white' }}>{audit.changes.length}</strong></span>
                        <span style={{ color: '#94a3b8' }}>Additions: <strong style={{ color: '#4ade80' }}>{added.length}</strong></span>
                        <span style={{ color: '#94a3b8' }}>Reductions: <strong style={{ color: '#f87171' }}>{removed.length}</strong></span>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── New Audit Form ────────────────────────────────────────────────────────────
function NewAuditForm({ onComplete }: { onComplete: () => void }) {
    const [items, setItems] = useState<Item[]>([]);
    const [loading, setLoading] = useState(true);
    const [counts, setCounts] = useState<Record<number, string>>({});
    const [auditNote, setAuditNote] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [filterAuditOnly, setFilterAuditOnly] = useState(true);
    const [emailReport, setEmailReport] = useState(false);

    useEffect(() => {
        fetch('/api/inventory?sort=name')
            .then(r => r.json())
            .then(data => {
                if (data.items) {
                    setItems(data.items);
                    const init: Record<number, string> = {};
                    data.items.forEach((i: Item) => { init[i.id] = ''; });
                    setCounts(init);
                }
                setLoading(false);
            });
    }, []);

    const getChanges = () => {
        const changes: any[] = [];
        items.forEach(item => {
            const val = counts[item.id];
            if (val !== '' && val !== undefined) {
                const num = parseFloat(val);
                if (!isNaN(num) && num !== item.quantity) {
                    changes.push({ id: item.id, name: item.name, oldQty: item.quantity, newQty: num, diff: num - item.quantity });
                }
            }
        });
        return changes;
    };

    const handleConfirm = async () => {
        const changes = getChanges();
        if (changes.length === 0) return;
        setProcessing(true);
        try {
            const res = await fetch('/api/admin/audit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ changes, note: auditNote, emailReport }),
            });
            if (res.ok) {
                setShowModal(false);
                onComplete();
            } else {
                alert('Audit Failed.');
            }
        } catch { alert('Error submitting audit.'); }
        finally { setProcessing(false); }
    };

    if (loading) return <div style={{ color: '#94a3b8', padding: '2rem' }}>Loading…</div>;

    const changes = getChanges();
    const filteredItems = items.filter(i => !filterAuditOnly || i.include_in_audit !== false);

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button onClick={onComplete} style={{ background: 'transparent', border: '1px solid #374151', color: '#9ca3af', padding: '0.4rem 0.9rem', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                        ← Back to History
                    </button>
                    <h1 style={{ color: '#fbbf24', margin: 0 }}>New Inventory Audit</h1>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', background: '#1f2937', padding: '0.5rem 1rem', borderRadius: '0.5rem', color: 'white', fontSize: '0.875rem' }}>
                        <input type="checkbox" checked={filterAuditOnly} onChange={e => setFilterAuditOnly(e.target.checked)} style={{ width: '1.1rem', height: '1.1rem' }} />
                        Audit Items Only
                    </label>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button onClick={() => window.print()} style={{ padding: '0.5rem 1rem', background: '#374151', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}>
                            Print Sheet
                        </button>
                        <button
                            onClick={() => setShowModal(true)}
                            disabled={changes.length === 0}
                            style={{ padding: '0.5rem 1rem', background: changes.length > 0 ? '#d97706' : '#374151', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: changes.length > 0 ? 'pointer' : 'not-allowed', fontWeight: 'bold' }}
                        >
                            Review & Finalize ({changes.length})
                        </button>
                    </div>
                </div>
            </div>

            <div className={`${styles.card} print-card`}>
                <table className={styles.table} style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr className="print-header">
                            <th style={{ textAlign: 'left', padding: '10px' }}>Item</th>
                            <th style={{ textAlign: 'left', padding: '10px' }}>System Stock</th>
                            <th style={{ textAlign: 'left', width: '200px', padding: '10px' }}>Actual Count</th>
                            <th className="no-print" style={{ textAlign: 'right', padding: '10px' }}>Difference</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredItems.map(item => {
                            const val = counts[item.id];
                            const num = parseFloat(val || '0');
                            const diff = val !== '' ? num - item.quantity : 0;
                            const hasDiff = val !== '' && Math.abs(diff) > 0;
                            return (
                                <tr key={item.id} style={hasDiff ? { background: 'rgba(245,158,11,0.1)' } : { borderBottom: '1px solid #374151' }}>
                                    <td style={{ fontWeight: 'bold', padding: '10px' }}>{item.name}</td>
                                    <td style={{ padding: '10px', color: '#9ca3af' }}>{Math.floor(item.quantity)}</td>
                                    <td style={{ padding: '10px' }}>
                                        <div className="print-input-container">
                                            <span className="print-only-value">{counts[item.id]}</span>
                                            <input
                                                type="number" step="0.01"
                                                value={counts[item.id]}
                                                onChange={e => setCounts({ ...counts, [item.id]: e.target.value })}
                                                className="audit-input"
                                                style={{ width: '100%', padding: '0.5rem', background: '#111827', border: '1px solid #374151', color: 'white', borderRadius: '0.25rem' }}
                                                placeholder="Enter Count"
                                            />
                                        </div>
                                    </td>
                                    <td className="no-print" style={{ textAlign: 'right', padding: '10px', color: diff < 0 ? '#ef4444' : diff > 0 ? '#10b981' : '#9ca3af' }}>
                                        {val !== '' ? (diff > 0 ? '+' : '') + diff.toFixed(2) : '-'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Print CSS */}
            <style jsx global>{`
                @media print {
                    @page { margin: 1cm; size: auto; }
                    body * { visibility: hidden; }
                    .print-card, .print-card * { visibility: visible; }
                    .print-card { position: absolute; left: 0; top: 0; padding: 0; margin: 0; width: 100%; background: white !important; color: black !important; box-shadow: none !important; border: none !important; overflow: visible !important; }
                    .no-print, .header, nav, button { display: none !important; }
                    table { width: 100% !important; border-collapse: collapse !important; }
                    th, td { color: black !important; border-bottom: 1px solid #ccc !important; padding: 8px 4px !important; font-family: sans-serif; }
                    th { font-weight: bold; text-transform: uppercase; font-size: 0.9em; border-bottom: 2px solid #000 !important; }
                    tr { background: transparent !important; }
                    .audit-input { display: none !important; }
                    .print-input-container { height: 25px; border-bottom: 1px solid #000; width: 100%; position: relative; }
                    .print-only-value { display: block !important; position: absolute; bottom: 2px; left: 0; width: 100%; font-weight: bold; font-size: 1.1em; color: black; }
                }
                .print-only-value { display: none; }
            `}</style>

            {showModal && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modal}>
                        <h2 className={styles.modalTitle}>Confirm Audit Updates</h2>
                        <div style={{ maxHeight: '280px', overflowY: 'auto', marginBottom: '1rem' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #4b5563' }}>
                                        <th style={{ textAlign: 'left', padding: '0.5rem', color: '#9ca3af', fontSize: '0.75rem', textTransform: 'uppercase' }}>Item</th>
                                        <th style={{ textAlign: 'right', padding: '0.5rem', color: '#9ca3af', fontSize: '0.75rem', textTransform: 'uppercase' }}>System</th>
                                        <th style={{ textAlign: 'right', padding: '0.5rem', color: '#9ca3af', fontSize: '0.75rem', textTransform: 'uppercase' }}>Counted</th>
                                        <th style={{ textAlign: 'right', padding: '0.5rem', color: '#9ca3af', fontSize: '0.75rem', textTransform: 'uppercase' }}>Change</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {changes.map(c => (
                                        <tr key={c.id} style={{ borderBottom: '1px solid #374151' }}>
                                            <td style={{ padding: '0.5rem' }}>{c.name}</td>
                                            <td style={{ textAlign: 'right', color: '#9ca3af', padding: '0.5rem' }}>{Number(c.oldQty).toFixed(2)}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 600, padding: '0.5rem' }}>{Number(c.newQty).toFixed(2)}</td>
                                            <td style={{ textAlign: 'right', color: c.diff < 0 ? '#ef4444' : '#10b981', fontWeight: 700, padding: '0.5rem' }}>
                                                {c.diff > 0 ? '+' : ''}{Number(c.diff).toFixed(2)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div style={{ marginBottom: '1rem' }}>
                            <label className={styles.statLabel}>Audit Notes (Optional)</label>
                            <textarea value={auditNote} onChange={e => setAuditNote(e.target.value)} className={styles.input} style={{ width: '100%', height: '70px' }} placeholder="E.g. Monthly reconciliation" />
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', cursor: 'pointer', color: '#d1d5db', fontSize: '0.875rem' }}>
                            <input type="checkbox" checked={emailReport} onChange={e => setEmailReport(e.target.checked)} style={{ width: '1rem', height: '1rem' }} />
                            Email audit report to reporting recipients
                        </label>
                        <div className={styles.modalActions}>
                            <button className={styles.cancelBtn} onClick={() => setShowModal(false)} disabled={processing}>Cancel</button>
                            <button className={styles.submitModalBtn} onClick={handleConfirm} disabled={processing}>
                                {processing ? 'Finalizing…' : 'Finalize Audit'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Main Audit Page (History List) ───────────────────────────────────────────
export default function AuditPage() {
    const [view, setView] = useState<'history' | 'new'>('history');
    const [audits, setAudits] = useState<AuditSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedAudit, setSelectedAudit] = useState<AuditSession | null>(null);

    const loadHistory = () => {
        setLoading(true);
        fetch('/api/admin/audit/history')
            .then(r => r.json())
            .then(data => { if (data.audits) setAudits(data.audits); })
            .catch(() => {})
            .finally(() => setLoading(false));
    };

    useEffect(() => { loadHistory(); }, []);

    if (view === 'new') {
        return <NewAuditForm onComplete={() => { setView('history'); loadHistory(); }} />;
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 style={{ color: '#fbbf24', margin: 0 }}>Inventory Audits</h1>
                <button
                    onClick={() => setView('new')}
                    style={{ padding: '0.6rem 1.5rem', background: '#d97706', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem' }}
                >
                    + New Audit
                </button>
            </div>

            {loading && <div style={{ color: '#94a3b8', padding: '2rem' }}>Loading audit history…</div>}

            {!loading && audits.length === 0 && (
                <div className={styles.card} style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📋</div>
                    <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: '#9ca3af' }}>No audit history yet</p>
                    <p style={{ fontSize: '0.875rem', marginBottom: '1.5rem' }}>Click <strong style={{ color: '#fbbf24' }}>+ New Audit</strong> to perform your first inventory count.</p>
                </div>
            )}

            {!loading && audits.length > 0 && (
                <div className={styles.card} style={{ padding: 0, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                        <thead>
                            <tr style={{ background: '#0f172a', borderBottom: '2px solid #334155' }}>
                                <th style={{ textAlign: 'left', padding: '12px 16px', color: '#64748b', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' }}>Date & Time</th>
                                <th style={{ textAlign: 'left', padding: '12px 16px', color: '#64748b', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' }}>Performed By</th>
                                <th style={{ textAlign: 'left', padding: '12px 16px', color: '#64748b', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' }}>Items Changed</th>
                                <th style={{ textAlign: 'left', padding: '12px 16px', color: '#64748b', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' }}>Note</th>
                                <th style={{ padding: '12px 16px' }} />
                            </tr>
                        </thead>
                        <tbody>
                            {audits.map(audit => {
                                const gained = audit.changes.filter(c => c.diff > 0).length;
                                const lost = audit.changes.filter(c => c.diff < 0).length;
                                return (
                                    <tr key={audit.id} style={{ borderBottom: '1px solid #1e293b', cursor: 'pointer' }}
                                        onMouseEnter={e => (e.currentTarget.style.background = '#1e293b')}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                        onClick={() => setSelectedAudit(audit)}
                                    >
                                        <td style={{ padding: '12px 16px', color: 'white', fontWeight: 500 }}>
                                            {new Date(audit.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            <div style={{ color: '#64748b', fontSize: '0.78rem' }}>{new Date(audit.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>
                                        </td>
                                        <td style={{ padding: '12px 16px', color: '#cbd5e1' }}>{audit.user_name}</td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <span style={{ color: 'white', fontWeight: 600 }}>{audit.changes.length}</span>
                                            {gained > 0 && <span style={{ color: '#4ade80', fontSize: '0.78rem', marginLeft: '0.5rem' }}>+{gained}</span>}
                                            {lost > 0 && <span style={{ color: '#f87171', fontSize: '0.78rem', marginLeft: '0.25rem' }}>−{lost}</span>}
                                        </td>
                                        <td style={{ padding: '12px 16px', color: '#64748b', fontStyle: audit.note ? 'normal' : 'italic', fontSize: '0.875rem' }}>
                                            {audit.note || '—'}
                                        </td>
                                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                            <span style={{ color: '#60a5fa', fontSize: '0.8rem', fontWeight: 600 }}>View →</span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {selectedAudit && <AuditDetail audit={selectedAudit} onClose={() => setSelectedAudit(null)} />}
        </div>
    );
}
