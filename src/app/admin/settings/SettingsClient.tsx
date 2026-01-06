'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../admin.module.css';

export default function SettingsClient() {
    const router = useRouter();
    const [settings, setSettings] = useState({
        report_emails: '',
        smtp_host: '',
        smtp_port: '587',
        smtp_user: '',
        smtp_pass: '',
        report_time: '08:00',
        low_stock_threshold: '5',
        report_title: 'Daily Stock Report',
        backup_time: '06:00',
        low_stock_alert_enabled: 'false',
        low_stock_alert_emails: '',
        low_stock_alert_time: '14:00',
        low_stock_alert_title: 'URGENT: Low Stock Alert'
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetch('/api/admin/settings')
            .then(res => res.json())
            .then(data => {
                setSettings(prev => ({ ...prev, ...data.settings }));
                setLoading(false);
            });
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setSettings(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const res = await fetch('/api/admin/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            if (res.ok) alert('Settings Saved');
            else alert('Failed to save');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className={styles.container}>Loading...</div>;

    return (
        <>
            <div className={styles.grid}>
                <div className={styles.card} style={{ gridColumn: 'span 2' }}>
                    <div className={styles.cardTitle}>Daily Reporting Configuration</div>
                    <form onSubmit={handleSubmit}>
                        <div style={{ marginBottom: '1rem' }}>
                            <label className={styles.statLabel}>Recipients (comma separated)</label>
                            <input
                                name="report_emails"
                                value={settings.report_emails}
                                onChange={handleChange}
                                className={styles.table}
                                style={{ background: '#1f2937', color: 'white', padding: '0.5rem', border: '1px solid #374151', borderRadius: '0.25rem', width: '100%' }}
                                placeholder="boss@bar.com, manager@bar.com"
                            />
                        </div>
                        <div style={{ marginBottom: '1rem' }}>
                            <label className={styles.statLabel}>Report Time (HH:MM 24h)</label>
                            <input
                                name="report_time"
                                type="time"
                                value={settings.report_time}
                                onChange={handleChange}
                                className={styles.table}
                                style={{ background: '#1f2937', color: 'white', padding: '0.5rem', border: '1px solid #374151', borderRadius: '0.25rem', width: '100%' }}
                            />
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label className={styles.statLabel}>Low Stock Threshold</label>
                            <input
                                name="low_stock_threshold"
                                type="number"
                                value={settings.low_stock_threshold}
                                onChange={handleChange}
                                className={styles.table}
                                style={{ background: '#1f2937', color: 'white', padding: '0.5rem', border: '1px solid #374151', borderRadius: '0.25rem', width: '100%' }}
                            />
                        </div>

                        <div className={styles.cardTitle} style={{ marginTop: '2rem' }}>Configuration Options</div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label className={styles.statLabel}>Report Title</label>
                            <input
                                name="report_title"
                                value={settings.report_title}
                                onChange={handleChange}
                                className={styles.table}
                                style={{ background: '#1f2937', color: 'white', padding: '0.5rem', border: '1px solid #374151', borderRadius: '0.25rem', width: '100%' }}
                            />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div style={{ marginBottom: '1rem' }}>
                                <label className={styles.statLabel}>Backup Time (Daily)</label>
                                <input
                                    name="backup_time"
                                    type="time"
                                    value={settings.backup_time}
                                    onChange={handleChange}
                                    className={styles.table}
                                    style={{ background: '#1f2937', color: 'white', padding: '0.5rem', border: '1px solid #374151', borderRadius: '0.25rem', width: '100%' }}
                                />
                            </div>
                        </div>

                        <div className={styles.cardTitle} style={{ marginTop: '2rem' }}>Low Stock Alert Email</div>

                        <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input
                                type="checkbox"
                                name="low_stock_alert_enabled"
                                checked={settings.low_stock_alert_enabled === 'true'}
                                onChange={(e) => setSettings(prev => ({ ...prev, low_stock_alert_enabled: e.target.checked ? 'true' : 'false' }))}
                                style={{ width: '20px', height: '20px' }}
                            />
                            <label className={styles.statLabel} style={{ marginBottom: 0 }}>Enable Separate Alert Email</label>
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label className={styles.statLabel}>Email Subject Title</label>
                            <input
                                name="low_stock_alert_title"
                                value={settings.low_stock_alert_title}
                                onChange={handleChange}
                                className={styles.table}
                                style={{ background: '#1f2937', color: 'white', padding: '0.5rem', border: '1px solid #374151', borderRadius: '0.25rem', width: '100%' }}
                                placeholder="URGENT: Low Stock Alert"
                            />
                        </div>

                        {settings.low_stock_alert_enabled === 'true' && (
                            <>
                                <div style={{ marginBottom: '1rem' }}>
                                    <label className={styles.statLabel}>Alert Emails (comma separated)</label>
                                    <input
                                        name="low_stock_alert_emails"
                                        value={settings.low_stock_alert_emails}
                                        onChange={handleChange}
                                        className={styles.table}
                                        style={{ background: '#1f2937', color: 'white', padding: '0.5rem', border: '1px solid #374151', borderRadius: '0.25rem', width: '100%' }}
                                        placeholder="manager@bar.com"
                                    />
                                </div>
                                <div style={{ marginBottom: '1rem' }}>
                                    <label className={styles.statLabel}>Alert Time (HH:MM 24h)</label>
                                    <input
                                        name="low_stock_alert_time"
                                        type="time"
                                        value={settings.low_stock_alert_time}
                                        onChange={handleChange}
                                        className={styles.table}
                                        style={{ background: '#1f2937', color: 'white', padding: '0.5rem', border: '1px solid #374151', borderRadius: '0.25rem', width: '100%' }}
                                    />
                                </div>
                            </>
                        )}

                        <div className={styles.cardTitle} style={{ marginTop: '2rem' }}>Email Server (SMTP)</div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div style={{ marginBottom: '1rem' }}>
                                <label className={styles.statLabel}>Host</label>
                                <input name="smtp_host" value={settings.smtp_host} onChange={handleChange} className={styles.table} style={{ background: '#1f2937', color: 'white', padding: '0.5rem', border: '1px solid #374151', borderRadius: '0.25rem', width: '100%' }} />
                            </div>
                            <div style={{ marginBottom: '1rem' }}>
                                <label className={styles.statLabel}>Port</label>
                                <input name="smtp_port" value={settings.smtp_port} onChange={handleChange} className={styles.table} style={{ background: '#1f2937', color: 'white', padding: '0.5rem', border: '1px solid #374151', borderRadius: '0.25rem', width: '100%' }} />
                            </div>
                            <div style={{ marginBottom: '1rem' }}>
                                <label className={styles.statLabel}>User</label>
                                <input name="smtp_user" value={settings.smtp_user} onChange={handleChange} className={styles.table} style={{ background: '#1f2937', color: 'white', padding: '0.5rem', border: '1px solid #374151', borderRadius: '0.25rem', width: '100%' }} />
                            </div>
                            <div style={{ marginBottom: '1rem' }}>
                                <label className={styles.statLabel}>Password</label>
                                <input name="smtp_pass" type="password" value={settings.smtp_pass} onChange={handleChange} className={styles.table} style={{ background: '#1f2937', color: 'white', padding: '0.5rem', border: '1px solid #374151', borderRadius: '0.25rem', width: '100%' }} />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={saving}
                            style={{ marginTop: '1rem', padding: '0.75rem 2rem', background: '#d97706', color: 'white', borderRadius: '0.5rem', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                            {saving ? 'Saving...' : 'Save Configuration'}
                        </button>
                    </form>
                </div>

                <div className={styles.card} style={{ gridColumn: 'span 2', marginTop: '2rem' }}>
                    <div className={styles.cardTitle}>Report Preview (Mockup)</div>
                    <p style={{ color: '#9ca3af', marginBottom: '1rem' }}>
                        The report covers the <strong>Business Day</strong> and now includes <strong>No Stock</strong> and <strong>Low Stock</strong> alerts based on your threshold.
                    </p>

                    <div style={{ background: 'white', border: '1px solid #ccc', borderRadius: '0.5rem', overflow: 'hidden', fontFamily: 'sans-serif', color: '#1f2937' }}>
                        <div style={{ background: '#111827', color: 'white', padding: '1rem' }}>
                            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Daily Stock Report</h2>
                            <p style={{ margin: '0.25rem 0 0 0', opacity: 0.8, fontSize: '0.875rem' }}>Jan 3, 7:00 AM — Jan 4, 5:00 AM</p>
                        </div>

                        <div style={{ background: '#f8fafc', padding: '15px', margin: '20px 0 0 0', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-around' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '0.85em', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Usage Cost</div>
                                <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: '#ef4444' }}>$52.00</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '0.85em', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Stock Added</div>
                                <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: '#10b981' }}>$350.00</div>
                            </div>
                        </div>

                        <div style={{ padding: '1rem 1rem 0 1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div style={{ background: '#fff', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
                                <h3 style={{ margin: '0 0 0.5rem 0', color: '#1f2937', fontSize: '1rem' }}>Liquor Cost by Bartender</h3>
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', padding: '0.25rem 0' }}><span>Alice</span><strong>$24.00</strong></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', padding: '0.25rem 0' }}><span>Bob</span><strong>$28.00</strong></div>
                            </div>
                        </div>

                        <div style={{ padding: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div style={{ background: '#f3f4f6', padding: '1rem', borderRadius: '0.5rem' }}>
                                <h3 style={{ margin: '0 0 0.5rem 0', color: '#ef4444', fontSize: '1rem' }}>🔻 Usage</h3>
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #ddd', padding: '0.25rem 0' }}><span>Bud Light</span><strong>24</strong></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #ddd', padding: '0.25rem 0' }}><span>Vodka</span><strong>2</strong></div>
                            </div>
                            <div style={{ background: '#ecfdf5', padding: '1rem', borderRadius: '0.5rem' }}>
                                <h3 style={{ margin: '0 0 0.5rem 0', color: '#10b981', fontSize: '1rem' }}>✅ Restock</h3>
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #ddd', padding: '0.25rem 0' }}><span>Jack Daniels</span><strong>12</strong></div>
                            </div>
                        </div>

                        {/* New Reports Section */}
                        <div style={{ padding: '0 1rem 1rem 1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div style={{ background: '#fee2e2', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #fca5a5' }}>
                                <h3 style={{ margin: '0 0 0.5rem 0', color: '#dc2626', fontSize: '1rem' }}>❌ No Stock (0 Qty)</h3>
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #fca5a5', padding: '0.25rem 0' }}><span>Tequila Silver</span><strong>0</strong></div>
                            </div>
                            <div style={{ background: '#ffedd5', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #fdba74' }}>
                                <h3 style={{ margin: '0 0 0.5rem 0', color: '#ea580c', fontSize: '1rem' }}>⚠️ Low Stock (&le; {settings.low_stock_threshold})</h3>
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #fdba74', padding: '0.25rem 0' }}><span>Rum</span><strong>3</strong></div>
                            </div>
                        </div>

                        <div style={{ padding: '1rem' }}>
                            <h3 style={{ borderBottom: '2px solid #eee', paddingBottom: '0.5rem' }}>Detailed Activity</h3>
                            <table style={{ width: '100%', fontSize: '0.875rem' }}>
                                <tr style={{ color: '#666', textAlign: 'left' }}><th>Time</th><th>User</th><th>Item</th><th>Action</th></tr>
                                <tr><td>14:02</td><td>Alice</td><td>Bud Light</td><td style={{ color: '#ef4444' }}>-24 (Stk: 48)</td></tr>
                                <tr><td>16:45</td><td>Bob</td><td>Jack Daniels</td><td style={{ color: '#10b981' }}>+12 (Stk: 20)</td></tr>
                            </table>
                        </div>
                    </div>

                </div>

                <div className={styles.card} style={{ gridColumn: 'span 2', marginTop: '2rem' }}>
                    <div className={styles.cardTitle}>Low Stock Alert Preview (Mockup)</div>
                    <p style={{ color: '#9ca3af', marginBottom: '1rem' }}>
                        This is how the alert email will look. It uses your custom title and threshold.
                    </p>

                    <div style={{ background: 'white', border: '1px solid #ccc', borderRadius: '0.5rem', overflow: 'hidden', fontFamily: 'sans-serif', color: '#1f2937', maxWidth: '600px', margin: '0 auto' }}>
                        <div style={{ background: '#7f1d1d', color: 'white', padding: '1rem' }}>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'white' }}>⚠️ {settings.low_stock_alert_title || 'URGENT: Low Stock Alert'}</h2>
                        </div>
                        <div style={{ padding: '1.5rem' }}>
                            <p style={{ marginTop: 0 }}>The following items are at or below the threshold ({settings.low_stock_threshold}):</p>
                            <ul style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '0.5rem', padding: '1rem 2rem' }}>
                                <li style={{ marginBottom: '0.5rem' }}>Rum: <b>3</b></li>
                                <li style={{ marginBottom: '0.5rem' }}>Tequila Silver: <b>0</b></li>
                            </ul>
                            <div style={{ marginTop: '1.5rem' }}>
                                <a href="#" style={{ background: '#c2410c', color: 'white', textDecoration: 'none', padding: '0.5rem 1rem', borderRadius: '0.25rem', fontSize: '0.9rem' }}>Go to Dashboard</a>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </>
    );
}
