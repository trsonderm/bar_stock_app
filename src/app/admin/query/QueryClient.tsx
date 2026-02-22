'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../admin.module.css';

interface ReportData {
    user: string;
    added: { name: string; qty: number }[];
    removed: { name: string; qty: number }[];
}

export default function QueryClient() {
    const router = useRouter();
    // Default to today
    const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
    const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
    const [report, setReport] = useState<ReportData[] | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await fetch(`/api/admin/query?start=${startDate}&end=${endDate}`);
            const data = await res.json();
            if (res.ok) {
                setReport(data.report);
            } else {
                alert('Failed to fetch report');
            }
        } catch (e) {
            alert('Error fetching report');
        } finally {
            setLoading(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <>
            <div className={`${styles.content} ${styles.printContainer}`}>
                <h1 className={styles.pageTitle}>Activity Search</h1>

                <form onSubmit={handleSearch} className={`${styles.card} ${styles.noPrint}`} style={{ marginBottom: '2rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '1rem', alignItems: 'end' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#9ca3af' }}>Start Date</label>
                            <input
                                type="date"
                                className={styles.input}
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                                required
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#9ca3af' }}>End Date</label>
                            <input
                                type="date"
                                className={styles.input}
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                                required
                            />
                        </div>
                        <button type="submit" className={styles.saveBtn} disabled={loading}>
                            {loading ? 'Searching...' : 'Generate Report'}
                        </button>
                    </div>
                </form>

                {report && (
                    <div className={styles.reportResults}>
                        <div className={styles.noPrint} style={{ textAlign: 'right', marginBottom: '1rem' }}>
                            <button onClick={handlePrint} style={{ background: '#374151', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.5rem', border: 'none', cursor: 'pointer' }}>
                                🖨 Print Report
                            </button>
                        </div>

                        <div className={styles.printHeader} style={{ display: 'none', marginBottom: '2rem' }}>
                            <h2 style={{ margin: 0 }}>Inventory Activity Report</h2>
                            <p style={{ margin: 0, color: '#666' }}>{startDate} — {endDate}</p>
                        </div>

                        {report.length === 0 ? (
                            <div style={{ color: '#9ca3af', textAlign: 'center', padding: '2rem' }}>No activity found for this period.</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                {report.map(user => {
                                    // Merge items for unified table
                                    const itemMap = new Map<string, { added: number, removed: number }>();

                                    user.added.forEach(i => {
                                        if (!itemMap.has(i.name)) itemMap.set(i.name, { added: 0, removed: 0 });
                                        itemMap.get(i.name)!.added = i.qty;
                                    });

                                    user.removed.forEach(i => {
                                        if (!itemMap.has(i.name)) itemMap.set(i.name, { added: 0, removed: 0 });
                                        itemMap.get(i.name)!.removed = i.qty;
                                    });

                                    const sortedItems = Array.from(itemMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

                                    return (
                                        <div key={user.user} style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', overflow: 'hidden' }}>
                                            <div style={{ background: '#f3f4f6', padding: '1rem', borderBottom: '1px solid #e5e7eb', fontWeight: 'bold', fontSize: '1.1rem', color: '#111827' }}>
                                                User: {user.user}
                                            </div>
                                            <div style={{ padding: '0' }}>
                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                                    <thead>
                                                        <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', color: '#4b5563', textTransform: 'uppercase', fontSize: '0.75rem' }}>Item Name</th>
                                                            <th style={{ padding: '0.75rem 1rem', textAlign: 'center', color: '#10b981', textTransform: 'uppercase', fontSize: '0.75rem', width: '100px' }}>Added</th>
                                                            <th style={{ padding: '0.75rem 1rem', textAlign: 'center', color: '#ef4444', textTransform: 'uppercase', fontSize: '0.75rem', width: '100px' }}>Removed</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {sortedItems.map(([name, counts], idx) => (
                                                            <tr key={name} style={{ borderBottom: idx < sortedItems.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                                                                <td style={{ padding: '0.75rem 1rem', color: '#374151', fontWeight: '500' }}>{name}</td>
                                                                <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: counts.added > 0 ? '#059669' : '#d1d5db', fontWeight: counts.added > 0 ? 'bold' : 'normal' }}>
                                                                    {counts.added > 0 ? `+${counts.added}` : '-'}
                                                                </td>
                                                                <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: counts.removed > 0 ? '#dc2626' : '#d1d5db', fontWeight: counts.removed > 0 ? 'bold' : 'normal' }}>
                                                                    {counts.removed > 0 ? `-${counts.removed}` : '-'}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                        {sortedItems.length === 0 && (
                                                            <tr>
                                                                <td colSpan={3} style={{ padding: '1rem', textAlign: 'center', color: '#9ca3af' }}>No items recorded.</td>
                                                            </tr>
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}
