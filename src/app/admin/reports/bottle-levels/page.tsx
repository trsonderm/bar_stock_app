'use client';

import { useState, useEffect } from 'react';
import styles from '../../admin.module.css';

interface ShiftData {
    date: string;
    counts: { [key: string]: number };
}

export default function BottleLevelReport() {
    const [shifts, setShifts] = useState<ShiftData[]>([]);
    const [columns, setColumns] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [showPreview, setShowPreview] = useState(false);

    useEffect(() => {
        const timestamp = new Date().getTime();
        fetch(`/api/admin/reports/bottle-levels-data?t=${timestamp}`)
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    alert('Error loading report: ' + data.error);
                }
                setShifts(data.shifts || []);
                setColumns(data.options || []);
                if (data.debug) {
                    alert(`DEBUG: OrgID=${data.debug.orgId}, LogsFound=${data.debug.logsFound}`);
                }
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                alert('Network Error: ' + err.message);
                setLoading(false);
            });
    }, []);

    // Mock Data for Preview
    const MOCK_COLUMNS = ['0-25%', '25-50%', '50-75%', '75-100%'];
    const MOCK_DATA: ShiftData[] = [
        { date: '2023-10-25', counts: { '0-25%': 5, '25-50%': 12, '50-75%': 8, '75-100%': 20 } },
        { date: '2023-10-26', counts: { '0-25%': 3, '25-50%': 15, '50-75%': 5, '75-100%': 22 } },
        { date: '2023-10-27', counts: { '0-25%': 7, '25-50%': 10, '50-75%': 10, '75-100%': 18 } },
        { date: '2023-10-28', counts: { '0-25%': 4, '25-50%': 14, '50-75%': 7, '75-100%': 25 } },
        { date: '2023-10-29', counts: { '0-25%': 6, '25-50%': 11, '50-75%': 9, '75-100%': 21 } },
    ];

    const displayShifts = showPreview ? MOCK_DATA : shifts;
    const displayColumns = showPreview ? MOCK_COLUMNS : columns;

    console.log('UseEffect State:', { loading, showPreview, shiftsLen: shifts.length, displayLen: displayShifts.length });

    if (loading) return <div className={styles.container}>Loading Report...</div>;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Low Bottle Levels by Shift</h1>
                <div className={styles.nav} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', background: '#374151', padding: '0.25rem 0.75rem', borderRadius: '0.5rem' }}>
                        <input
                            type="checkbox"
                            checked={showPreview}
                            onChange={e => setShowPreview(e.target.checked)}
                        />
                        <span style={{ fontSize: '0.875rem', color: '#e5e7eb' }}>Show Preview</span>
                    </label>
                    <a href="/admin/dashboard" className={styles.navItem}>Back to Dashboard</a>
                </div>
            </div>

            <div className={styles.card}>
                <p style={{ marginBottom: '1rem', color: '#9ca3af' }}>
                    Count of bottle replacements recorded with specific remaining levels. Grouped by Business Day (7am - 5am).
                </p>
                <div className={styles.tableContainer}>
                    {displayColumns.length === 0 && (
                        <div style={{ padding: '1rem', color: '#ef4444', background: '#374151', borderRadius: '0.5rem', marginBottom: '1rem' }}>
                            Warning: No Columns Defined. Data exists but cannot be displayed without columns.
                            {showPreview && ' (Mock Columns should be visible!)'}
                        </div>
                    )}
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Shift Date</th>
                                {displayColumns.map(col => <th key={col}>{col}</th>)}
                                <th>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {displayShifts.map(shift => {
                                const total = Object.values(shift.counts).reduce((a, b) => a + b, 0);
                                return (
                                    <tr key={shift.date}>
                                        <td style={{ fontWeight: 'bold', color: 'white' }}>{shift.date}</td>
                                        {displayColumns.map(col => (
                                            <td key={col} style={{ textAlign: 'center', color: shift.counts[col] ? '#fbbf24' : '#4b5563' }}>
                                                {shift.counts[col] || '-'}
                                            </td>
                                        ))}
                                        <td style={{ fontWeight: 'bold' }}>{total}</td>
                                    </tr>
                                );
                            })}
                            {!showPreview && shifts.length === 0 && (
                                <tr>
                                    <td colSpan={columns.length + 2} style={{ textAlign: 'center', padding: '2rem' }}>No data recorded yet.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Debug Info */}
                <div style={{ marginTop: '2rem', padding: '1rem', background: '#1f2937', color: '#9ca3af', fontSize: '0.75rem', borderRadius: '0.5rem', fontFamily: 'monospace' }}>
                    <strong>DEBUG INFO:</strong><br />
                    Loading: {loading.toString()}<br />
                    Preview Mode: {showPreview.toString()}<br />
                    Data Rows: {shifts.length} (Real), {displayShifts.length} (Displayed)<br />
                    Columns: {columns.length} (Real), {displayColumns.length} (Displayed)<br />
                    Sample Column: {displayColumns[0] || 'None'}
                </div>
            </div>
        </div>
    );
}
