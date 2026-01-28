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

    useEffect(() => {
        fetch('/api/admin/reports/bottle-levels')
            .then(res => res.json())
            .then(data => {
                setShifts(data.shifts || []);
                setColumns(data.options || []);
                setLoading(false);
            });
    }, []);

    if (loading) return <div className={styles.container}>Loading Report...</div>;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Low Bottle Levels by Shift</h1>
                <div className={styles.nav}>
                    <a href="/admin/dashboard" className={styles.navItem}>Back to Dashboard</a>
                </div>
            </div>

            <div className={styles.card}>
                <p style={{ marginBottom: '1rem', color: '#9ca3af' }}>
                    Count of bottle replacements recorded with specific remaining levels. Grouped by Business Day (7am - 5am).
                </p>
                <div className={styles.tableContainer}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Shift Date</th>
                                {columns.map(col => <th key={col}>{col}</th>)}
                                <th>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {shifts.map(shift => {
                                const total = Object.values(shift.counts).reduce((a, b) => a + b, 0);
                                return (
                                    <tr key={shift.date}>
                                        <td style={{ fontWeight: 'bold', color: 'white' }}>{shift.date}</td>
                                        {columns.map(col => (
                                            <td key={col} style={{ textAlign: 'center', color: shift.counts[col] ? '#fbbf24' : '#4b5563' }}>
                                                {shift.counts[col] || '-'}
                                            </td>
                                        ))}
                                        <td style={{ fontWeight: 'bold' }}>{total}</td>
                                    </tr>
                                );
                            })}
                            {shifts.length === 0 && (
                                <tr>
                                    <td colSpan={columns.length + 2} style={{ textAlign: 'center', padding: '2rem' }}>No data recorded yet.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
