'use client';

import { useState, useEffect } from 'react';
import styles from '../admin.module.css';

interface Item {
    id: number;
    name: string;
    quantity: number;
    type: string;
}

export default function AuditPage() {
    const [items, setItems] = useState<Item[]>([]);
    const [loading, setLoading] = useState(true);
    const [counts, setCounts] = useState<Record<number, string>>({});
    const [auditNote, setAuditNote] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        fetch('/api/inventory?sort=name')
            .then(r => r.json())
            .then(data => {
                if (data.items) {
                    setItems(data.items);
                    // Initialize counts with empty strings
                    const initial: any = {};
                    data.items.forEach((i: Item) => initial[i.id] = '');
                    setCounts(initial);
                }
                setLoading(false);
            })
            .catch(e => {
                alert('Failed to load inventory');
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
                    changes.push({
                        id: item.id,
                        name: item.name,
                        oldQty: item.quantity,
                        newQty: num,
                        diff: num - item.quantity
                    });
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
                body: JSON.stringify({
                    changes,
                    note: auditNote
                })
            });

            if (res.ok) {
                alert('Audit Finalized Successfully.');
                window.location.reload();
            } else {
                alert('Audit Failed.');
            }
        } catch (e) {
            alert('Error submitting audit.');
        } finally {
            setProcessing(false);
            setShowModal(false);
        }
    };

    if (loading) return <div>Loading Audit Data...</div>;

    const changes = getChanges();

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 style={{ color: '#fbbf24', margin: 0 }}>Inventory Audit</h1>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button
                        onClick={() => window.print()}
                        style={{ padding: '0.5rem 1rem', background: '#374151', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}
                    >
                        Print Sheet
                    </button>
                    <button
                        onClick={() => setShowModal(true)}
                        style={{ padding: '0.5rem 1rem', background: '#d97706', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold' }}
                        disabled={changes.length === 0}
                    >
                        Review & Finalize
                    </button>
                </div>
            </div>

            <div className={`${styles.card} print-card`}>
                <table className={styles.table} style={{ width: '100%' }}>
                    <thead>
                        <tr>
                            <th style={{ textAlign: 'left' }}>Item</th>
                            <th style={{ textAlign: 'left' }}>Current System Stock</th>
                            <th style={{ textAlign: 'left', width: '150px' }}>Actual Count</th>
                            <th style={{ textAlign: 'right' }}>Difference</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map(item => {
                            const val = counts[item.id];
                            const num = parseFloat(val || '0');
                            const diff = (val !== '') ? (num - item.quantity) : 0;
                            const hasDiff = val !== '' && Math.abs(diff) > 0;

                            return (
                                <tr key={item.id} style={hasDiff ? { background: 'rgba(245, 158, 11, 0.1)' } : {}}>
                                    <td style={{ fontWeight: 'bold' }}>{item.name}</td>
                                    <td>{Number(item.quantity).toFixed(2)}</td>
                                    <td>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={counts[item.id]}
                                            onChange={(e) => setCounts({ ...counts, [item.id]: e.target.value })}
                                            className="no-print-border"
                                            style={{
                                                width: '100%',
                                                padding: '0.5rem',
                                                background: '#111827',
                                                border: '1px solid #374151',
                                                color: 'white',
                                                borderRadius: '0.25rem'
                                            }}
                                            placeholder="Enter Count"
                                        />
                                    </td>
                                    <td style={{ textAlign: 'right', color: diff < 0 ? '#ef4444' : diff > 0 ? '#10b981' : '#9ca3af' }}>
                                        {val !== '' ? (diff > 0 ? '+' : '') + diff.toFixed(2) : '-'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Print Only CSS */}
            <style jsx global>{`
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    .print-card, .print-card * {
                        visibility: visible;
                    }
                    .print-card {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        background: white !important;
                        color: black !important;
                    }
                    input {
                        border: none !important;
                        border-bottom: 1px solid black !important;
                        background: transparent !important;
                        color: black !important;
                    }
                    th, td {
                        color: black !important;
                        border-bottom: 1px solid #ddd;
                        padding: 8px;
                    }
                }
            `}</style>

            {showModal && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modal}>
                        <h2 className={styles.modalTitle}>Confirm Audit Updates</h2>
                        <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '1rem' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #4b5563' }}>
                                        <th style={{ textAlign: 'left', padding: '0.5rem' }}>Item</th>
                                        <th style={{ textAlign: 'right', padding: '0.5rem' }}>Old</th>
                                        <th style={{ textAlign: 'right', padding: '0.5rem' }}>New</th>
                                        <th style={{ textAlign: 'right', padding: '0.5rem' }}>Change</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {changes.map(c => (
                                        <tr key={c.id} style={{ borderBottom: '1px solid #374151' }}>
                                            <td style={{ padding: '0.5rem' }}>{c.name}</td>
                                            <td style={{ textAlign: 'right', color: '#9ca3af' }}>{Number(c.oldQty).toFixed(2)}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{Number(c.newQty).toFixed(2)}</td>
                                            <td style={{ textAlign: 'right', color: c.diff < 0 ? '#ef4444' : '#10b981' }}>
                                                {c.diff > 0 ? '+' : ''}{Number(c.diff).toFixed(2)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label className={styles.statLabel}>Audit Notes (Optional)</label>
                            <textarea
                                value={auditNote}
                                onChange={e => setAuditNote(e.target.value)}
                                className={styles.input}
                                style={{ width: '100%', height: '80px' }}
                                placeholder="E.g. Monthly reconciliation for Feb"
                            />
                        </div>

                        <div className={styles.modalActions}>
                            <button className={styles.cancelBtn} onClick={() => setShowModal(false)} disabled={processing}>Cancel</button>
                            <button className={styles.submitModalBtn} onClick={handleConfirm} disabled={processing}>
                                {processing ? 'Finalizing...' : 'Finalize Audit'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
