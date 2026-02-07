'use client';

import { useState, useEffect } from 'react';
import styles from '../admin.module.css';

interface Item {
    id: number;
    name: string;
    quantity: number;
    type: string;
    include_in_audit?: boolean; // New field
}

export default function AuditPage() {
    const [items, setItems] = useState<Item[]>([]);
    const [loading, setLoading] = useState(true);
    const [counts, setCounts] = useState<Record<number, string>>({});
    const [auditNote, setAuditNote] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [processing, setProcessing] = useState(false);

    // Default to YES
    const [filterAuditOnly, setFilterAuditOnly] = useState(true);

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
            // Include in audit check not needed for changes commit, 
            // but we only show what is filtered usually. 
            // However, if user filtered OUT an item but still entered a count for it (before filtering), 
            // should we count it? 
            // Let's just process ALL items that have a count entered, regardless of visibility.

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

    // Filter Items Logic
    const filteredItems = items.filter(i => {
        if (filterAuditOnly) {
            // If include_in_audit is undefined, assume true (legacy)
            return i.include_in_audit !== false;
        }
        return true;
    });

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 style={{ color: '#fbbf24', margin: 0 }}>Inventory Audit</h1>

                <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                    {/* Filter Toggle */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#1f2937', padding: '0.5rem 1rem', borderRadius: '0.5rem' }}>
                        <label className={styles.statLabel} style={{ marginBottom: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input
                                type="checkbox"
                                checked={filterAuditOnly}
                                onChange={e => setFilterAuditOnly(e.target.checked)}
                                style={{ width: '1.2rem', height: '1.2rem' }}
                            />
                            <span style={{ color: 'white' }}>Audit Items Only</span>
                        </label>
                    </div>

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
                            const diff = (val !== '') ? (num - item.quantity) : 0;
                            const hasDiff = val !== '' && Math.abs(diff) > 0;

                            return (
                                <tr key={item.id} style={hasDiff ? { background: 'rgba(245, 158, 11, 0.1)' } : { borderBottom: '1px solid #374151' }}>
                                    <td style={{ fontWeight: 'bold', padding: '10px' }}>{item.name}</td>
                                    <td style={{ padding: '10px', color: '#9ca3af' }}>{Math.floor(item.quantity)}</td>
                                    <td style={{ padding: '10px' }}>
                                        <div className="print-input-container">
                                            <span className="print-only-value">{counts[item.id]}</span>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={counts[item.id]}
                                                onChange={(e) => setCounts({ ...counts, [item.id]: e.target.value })}
                                                className="audit-input"
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

            {/* Print Only CSS */}
            <style jsx global>{`
                @media print {
                    @page {
                        margin: 1cm;
                        size: auto; 
                    }
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
                        padding: 0;
                        margin: 0;
                        width: 100%;
                        background: white !important;
                        color: black !important;
                        box-shadow: none !important;
                        border: none !important;
                        overflow: visible !important;
                    }
                    
                    /* Hide header/nav/buttons */
                    .no-print, .header, nav, button {
                        display: none !important;
                    }

                    /* Table Styling */
                    table {
                        width: 100% !important;
                        border-collapse: collapse !important;
                    }
                    
                    th, td {
                        color: black !important;
                        border-bottom: 1px solid #ccc !important;
                        padding: 8px 4px !important;
                        font-family: sans-serif;
                    }
                    
                    th {
                        font-weight: bold;
                        text-transform: uppercase;
                        font-size: 0.9em;
                        border-bottom: 2px solid #000 !important;
                    }
                    
                    tr {
                        background: transparent !important; /* Remove change highlight */
                    }

                    /* Input Handling */
                    .audit-input {
                        display: none !important; /* Hide the actual input field */
                    }
                    
                    .print-input-container {
                        height: 25px;
                        border-bottom: 1px solid #000;
                        width: 100%;
                        position: relative;
                    }
                    .print-only-value {
                        display: block !important;
                        position: absolute;
                        bottom: 2px;
                        left: 0;
                        width: 100%;
                        font-weight: bold;
                        font-size: 1.1em;
                        color: black;
                    }
                }
                .print-only-value {
                    display: none;
                }
            `}</style>

            {/* Modal Logic remains same */}
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
