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
                <h1 className={styles.pageTitle}>Custom Activity Report</h1>

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
                                {report.map(user => (
                                    <div key={user.user} style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', overflow: 'hidden' }}>
                                        <div style={{ background: '#f3f4f6', padding: '1rem', borderBottom: '1px solid #e5e7eb', fontWeight: 'bold', fontSize: '1.1rem', color: '#111827' }}>
                                            User: {user.user}
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                                            <div style={{ padding: '1rem', borderRight: '1px solid #e5e7eb' }}>
                                                <h3 style={{ margin: '0 0 0.5rem 0', color: '#ef4444', fontSize: '0.9rem', textTransform: 'uppercase' }}>Removed</h3>
                                                {user.removed.length === 0 ? <em style={{ color: '#9ca3af' }}>None</em> : (
                                                    <table style={{ width: '100%', fontSize: '0.9rem' }}>
                                                        {user.removed.map(item => (
                                                            <tr key={item.name}>
                                                                <td style={{ padding: '4px 0', color: '#374151' }}>{item.name}</td>
                                                                <td style={{ padding: '4px 0', fontWeight: 'bold', textAlign: 'right' }}>{item.qty}</td>
                                                            </tr>
                                                        ))}
                                                    </table>
                                                )}
                                            </div>
                                            <div style={{ padding: '1rem' }}>
                                                <h3 style={{ margin: '0 0 0.5rem 0', color: '#10b981', fontSize: '0.9rem', textTransform: 'uppercase' }}>Added</h3>
                                                {user.added.length === 0 ? <em style={{ color: '#9ca3af' }}>None</em> : (
                                                    <table style={{ width: '100%', fontSize: '0.9rem' }}>
                                                        {user.added.map(item => (
                                                            <tr key={item.name}>
                                                                <td style={{ padding: '4px 0', color: '#374151' }}>{item.name}</td>
                                                                <td style={{ padding: '4px 0', fontWeight: 'bold', textAlign: 'right' }}>{item.qty}</td>
                                                            </tr>
                                                        ))}
                                                    </table>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}
