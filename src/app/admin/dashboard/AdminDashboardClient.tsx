'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import styles from '../admin.module.css';

interface Stat {
    todayCount: number;
    topUser: string;
}

interface Log {
    id: number;
    first_name: string;
    action: string;
    details: string;
    timestamp: string;
}

export default function AdminDashboardClient({ subscriptionPlan }: { subscriptionPlan: string }) {
    const [stats, setStats] = useState<Stat | null>(null);
    const [logs, setLogs] = useState<Log[]>([]);
    const [loading, setLoading] = useState(true);
    const [showBanner, setShowBanner] = useState(true);

    useEffect(() => {
        fetch('/api/admin/analytics')
            .then(res => res.json())
            .then(data => {
                if (data.stats) {
                    setStats(data.stats);
                    setLogs(data.logs);
                }
                setLoading(false);
            })
            .catch(e => setLoading(false));
    }, []);

    const formatDetails = (details: string | object) => {
        try {
            const d = typeof details === 'string' ? JSON.parse(details) : details;

            if (d && typeof d === 'object') {
                // ADD_STOCK / SUBTRACT_STOCK
                if ('itemName' in d && 'quantity' in d) {
                    return (
                        <span>
                            <strong>{d.itemName}</strong>
                            <span style={{ opacity: 0.7, marginLeft: '5px' }}>
                                ({d.change && d.change > 0 ? '+' : ''}{d.quantity || d.change})
                            </span>
                            {d.bottleLevel && <div style={{ fontSize: '0.75em', color: '#fbbf24' }}>Level: {d.bottleLevel}</div>}
                        </span>
                    );
                }

                // ORDER
                if ('supplier' in d && 'totalCost' in d) {
                    return <span>Order from <strong>{d.supplier}</strong> (${d.totalCost})</span>;
                }

                // USER CREATE/UPDATE
                if ('firstName' in d) return <span>User: {d.firstName} {d.lastName}</span>;

                // Generic Fallback: Pretty Key-Values
                return (
                    <div style={{ fontSize: '0.8rem', lineHeight: '1.2' }}>
                        {Object.entries(d).map(([k, v]) => (
                            <div key={k} style={{ display: 'flex', gap: '5px' }}>
                                <span style={{ color: '#9ca3af' }}>{k}:</span>
                                <span style={{ color: 'white' }}>{String(v)}</span>
                            </div>
                        ))}
                    </div>
                );
            }

            return typeof details === 'string' ? details : JSON.stringify(details);
        } catch {
            return typeof details === 'string' ? details : 'Invalid Details';
        }
    };

    if (loading) return <div className={styles.container}>Loading Dashboard...</div>;

    if (loading) return <div className={styles.container}>Loading Dashboard...</div>;

    return (
        <>
            <div className={styles.grid}>
                {subscriptionPlan !== 'pro' && subscriptionPlan !== 'free_trial' && showBanner && (
                    <div style={{
                        gridColumn: '1 / -1',
                        background: 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)',
                        padding: '1rem 1.5rem',
                        borderRadius: '0.75rem',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '1rem',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                        position: 'relative'
                    }}>
                        <button
                            onClick={() => setShowBanner(false)}
                            style={{
                                position: 'absolute',
                                top: '0.5rem',
                                right: '0.5rem',
                                background: 'transparent',
                                border: 'none',
                                color: 'white',
                                opacity: 0.8,
                                cursor: 'pointer',
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '50%',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                            <X size={16} />
                        </button>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ background: 'rgba(255,255,255,0.2)', padding: '0.5rem', borderRadius: '0.5rem' }}>
                                <span style={{ fontSize: '1.25rem' }}>🚀</span>
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontWeight: 'bold', fontSize: '1.1rem' }}>Upgrade to Pro</h3>
                                <p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.9 }}>
                                    Unlock <strong>Smart Orders</strong>, <strong>Advanced Reporting</strong>, and <strong>Priority Support</strong>.
                                </p>
                            </div>
                        </div>
                        <a
                            href="mailto:support@topshelf.com?subject=Upgrade to Pro"
                            style={{
                                background: 'white',
                                color: '#d97706',
                                padding: '0.5rem 1.25rem',
                                borderRadius: '0.5rem',
                                fontWeight: 'bold',
                                textDecoration: 'none',
                                fontSize: '0.9rem',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                            }}
                        >
                            Upgrade for $50/yr
                        </a>
                    </div>
                )}
                <div className={styles.card}>
                    <div className={styles.cardTitle}>Activity Today</div>
                    <div className={styles.statValue}>{stats?.todayCount || 0}</div>
                    <div className={styles.statLabel}>Actions recorded</div>
                </div>
                <div className={styles.card}>
                    <div className={styles.cardTitle}>Top Active User</div>
                    <div className={styles.statValue} style={{ fontSize: '1.5rem' }}>{stats?.topUser || '-'}</div>
                    <div className={styles.statLabel}>Most actions today</div>
                </div>
                <div className={styles.card}>
                    <div className={styles.cardTitle}>System Status</div>
                    <div className={styles.statValue} style={{ fontSize: '1.5rem', color: '#34d399' }}>Operational</div>
                    <div className={styles.statLabel}>Cron jobs active</div>
                </div>
            </div>

            <div className={styles.card}>
                <div className={styles.cardTitle}>Recent Activity Log</div>
                <div className={styles.tableContainer}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Time</th>
                                <th>User</th>
                                <th>Action</th>
                                <th>Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map(log => (
                                <tr key={log.id}>
                                    <td>{new Date(log.timestamp).toLocaleString()}</td>
                                    <td>{log.first_name || 'System'}</td>
                                    <td>
                                        <span style={{
                                            padding: '0.25rem 0.5rem',
                                            borderRadius: '0.25rem',
                                            backgroundColor: log.action.includes('ADD') ? '#064e3b' : '#7f1d1d',
                                            fontSize: '0.75rem',
                                            fontWeight: 'bold'
                                        }}>
                                            {log.action}
                                        </span>
                                    </td>
                                    <td>{formatDetails(log.details)}</td>
                                </tr>
                            ))}
                            {logs.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center' }}>No logs yet</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}
