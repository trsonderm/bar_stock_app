'use client';

import { useState, useEffect } from 'react';
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

export default function AdminDashboardClient() {
    const [stats, setStats] = useState<Stat | null>(null);
    const [logs, setLogs] = useState<Log[]>([]);
    const [loading, setLoading] = useState(true);

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

    const formatDetails = (details: string) => {
        try {
            const d = JSON.parse(details);
            if (d.name) return `Item: ${d.name}`;
            if (d.quantity) return `Qty: ${d.quantity}`;
            return details;
        } catch {
            return details;
        }
    };

    if (loading) return <div className={styles.container}>Loading Dashboard...</div>;

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1 className={styles.title}>Admin Dashboard</h1>
                <nav className={styles.nav}>
                    <span className={styles.navItemActive}>Overview</span>
                    <a href="/admin/users" className={styles.navItem}>Users</a>
                    <a href="/admin/query" className={styles.navItem}>Query</a>
                    <a href="/admin/settings" className={styles.navItem}>Settings</a>
                    <a href="/inventory" className={styles.navItem}>Stock View</a>
                </nav>
            </header>

            <div className={styles.grid}>
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
        </div>
    );
}
