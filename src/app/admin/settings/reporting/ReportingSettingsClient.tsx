'use client';

import { useState, useEffect } from 'react';
import styles from '../../admin.module.css';
import RecipientSelector from '@/components/RecipientSelector';
import FrequencyPicker from '@/components/FrequencyPicker';

export default function ReportingSettingsClient() {
    const [settings, setSettings] = useState({
        report_emails: { to: [], cc: [], bcc: [] } as any,
        smtp_host: '',
        smtp_port: '587',
        smtp_user: '',
        smtp_pass: '',
        report_schedule: { frequency: 'daily', time: '08:00' } as any, // Replaces simple report_time
        low_stock_threshold: '5',
        use_global_low_stock: 'false', // New Toggle

        report_title: 'Daily Stock Report',
        backup_time: '06:00',

        low_stock_alert_enabled: 'false',
        low_stock_alert_emails: { to: [], cc: [], bcc: [] } as any,
        low_stock_alert_schedule: { frequency: 'daily', time: '14:00' } as any, // Replaces alert_time
        low_stock_alert_title: 'URGENT: Low Stock Alert',
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Subscription State
    const [locations, setLocations] = useState<any[]>([]);
    const [allUsers, setAllUsers] = useState<any[]>([]);
    const [subscriptions, setSubscriptions] = useState<any[]>([]);

    // Selection state per location (map locationId -> selectedUserId)
    const [selections, setSelections] = useState<Record<number, string>>({});

    useEffect(() => {
        Promise.all([
            fetch('/api/admin/settings').then(r => r.json()),
            fetch('/api/admin/reporting/subscriptions').then(r => r.json()),
            fetch('/api/admin/users').then(r => r.json()) // Fetch users for autocomplete
        ]).then(([settingsData, subData, userData]) => {
            if (settingsData.settings) {
                const s = settingsData.settings;

                // Helper to safe parse or default
                const parseEmails = (val: string) => {
                    try { return JSON.parse(val); } catch { return { to: val ? val.split(',').map((x: string) => x.trim()) : [], cc: [], bcc: [] }; }
                };
                const parseSchedule = (val: string, defaultTime: string) => {
                    try {
                        // If it's a simple time string, convert to daily
                        if (val && !val.startsWith('{')) return { frequency: 'daily', time: val };
                        return JSON.parse(val);
                    } catch { return { frequency: 'daily', time: defaultTime }; }
                };

                setSettings(prev => ({
                    ...prev,
                    ...s,
                    report_emails: parseEmails(s.report_emails),
                    report_schedule: parseSchedule(s.report_time || s.report_schedule, '08:00'), // Handle backward combat
                    low_stock_alert_emails: parseEmails(s.low_stock_alert_emails),
                    low_stock_alert_schedule: parseSchedule(s.low_stock_alert_time || s.low_stock_alert_schedule, '14:00'),
                }));
            }
            if (subData) {
                setLocations(subData.locations || []);
                setAllUsers(subData.allUsers || []);
                setSubscriptions(subData.subscriptions || []);
            }
            // Also merge user data if needed for selector (using allUsers from subData is okay but userData might be more complete)
            if (userData && userData.users) {
                // We can use this list for the RecipientSelector
                setAllUsers(userData.users);
            }
            setLoading(false);
        });
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setSettings(prev => ({ ...prev, [name]: value }));
    };

    const handleAddUser = async (locationId: number) => {
        const userId = selections[locationId];
        if (!userId) return;

        try {
            const res = await fetch('/api/admin/reporting/subscriptions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ locationId, userId, action: 'add' })
            });
            if (res.ok) {
                // Refresh list locally or fetch? Locally is faster.
                // We need details of the added user.
                const user = allUsers.find(u => u.id === parseInt(userId));
                if (user) {
                    setSubscriptions(prev => [
                        ...prev.filter(s => !(s.location_id === locationId && s.user_id === parseInt(userId))),
                        { location_id: locationId, user_id: parseInt(userId), receive_daily_report: 1, first_name: user.first_name, last_name: user.last_name, email: user.email }
                    ]);
                }
                setSelections(prev => ({ ...prev, [locationId]: '' })); // Reset dropdown
            }
        } catch (e) {
            alert('Error adding user');
        }
    };

    const handleRemoveUser = async (locationId: number, userId: number) => {
        try {
            const res = await fetch('/api/admin/reporting/subscriptions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ locationId, userId, action: 'remove' })
            });
            if (res.ok) {
                setSubscriptions(prev => prev.filter(s => !(s.location_id === locationId && s.user_id === userId)));
            }
        } catch (e) {
            alert('Error removing user');
        }
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
            if (res.ok) alert('Reporting Settings Saved');
            else alert('Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const handleTestEmail = async () => {
        if (!settings.report_emails || !settings.smtp_host) {
            alert('Please configure SMTP settings and Report Emails first.');
            return;
        }
        if (!confirm(`Send test emails to ${settings.report_emails}?`)) return;

        try {
            const res = await fetch('/api/admin/settings/test-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            const data = await res.json();
            if (res.ok) alert(data.message || 'Emails Sent!');
            else alert(data.error || 'Failed to send emails');
        } catch (e) {
            alert('Error sending emails');
        }
    };

    if (loading) return <div className={styles.container}>Loading...</div>;

    return (
        <div className={styles.grid}>
            <div className={styles.card} style={{ gridColumn: 'span 2' }}>
                <div className={styles.cardTitle}>Daily Reporting Configuration</div>
                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '2rem' }}>
                        <label className={styles.statLabel}>Standard Report Recipients</label>
                        <RecipientSelector
                            users={allUsers}
                            value={settings.report_emails}
                            onChange={(val) => setSettings({ ...settings, report_emails: val })}
                        />
                    </div>

                    <div style={{ marginBottom: '2rem' }}>
                        <div className="flex gap-4">
                            <div className="flex-1">
                                <label className={styles.statLabel}>Report Frequency</label>
                                <FrequencyPicker
                                    value={settings.report_schedule}
                                    onChange={val => setSettings({ ...settings, report_schedule: val })}
                                />
                            </div>
                            <div className="flex-1">
                                <label className={styles.statLabel}>Report Title</label>
                                <input
                                    name="report_title"
                                    value={settings.report_title}
                                    onChange={handleChange}
                                    className={styles.table}
                                    style={{ background: '#1f2937', color: 'white', padding: '0.5rem', border: '1px solid #374151', borderRadius: '0.25rem', width: '100%' }}
                                />
                                <div className="mt-4">
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
                        </div>
                    </div>


                    <div className={styles.cardTitle} style={{ marginTop: '2rem' }}>Low Stock Configuration</div>

                    <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                            type="checkbox"
                            checked={settings.use_global_low_stock === 'true'}
                            onChange={(e) => setSettings(prev => ({ ...prev, use_global_low_stock: e.target.checked ? 'true' : 'false' }))}
                            className="w-4 h-4"
                        />
                        <label className={styles.statLabel} style={{ marginBottom: 0 }}>Use Global Low Stock Threshold (Override Product Settings)</label>
                    </div>

                    {settings.use_global_low_stock === 'true' && (
                        <div style={{ marginBottom: '1rem', paddingLeft: '1.5rem' }}>
                            <label className={styles.statLabel}>Global Threshold</label>
                            <input
                                name="low_stock_threshold"
                                type="number"
                                value={settings.low_stock_threshold}
                                onChange={handleChange}
                                className={styles.table}
                                style={{ background: '#1f2937', color: 'white', padding: '0.5rem', border: '1px solid #374151', borderRadius: '0.25rem', width: '100px' }}
                            />
                            <p className="text-gray-500 text-xs mt-1">If enabled, ALL products will be flagged if quantity is below this number.</p>
                        </div>
                    )}


                    <div className={styles.cardTitle} style={{ marginTop: '2rem' }}>Low Stock Alert Email</div>

                    <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                            type="checkbox"
                            name="low_stock_alert_enabled"
                            checked={settings.low_stock_alert_enabled === 'true'}
                            onChange={(e) => setSettings(prev => ({ ...prev, low_stock_alert_enabled: e.target.checked ? 'true' : 'false' }))}
                            className="w-4 h-4"
                        />
                        <label className={styles.statLabel} style={{ marginBottom: 0 }}>Enable Separate Low Stock Alert Email</label>
                    </div>

                    {settings.low_stock_alert_enabled === 'true' && (
                        <div className="pl-6 border-l-2 border-gray-700 ml-2">
                            <div className="mb-4">
                                <label className={styles.statLabel}>Alert Recipients</label>
                                <RecipientSelector
                                    users={allUsers}
                                    value={settings.low_stock_alert_emails}
                                    onChange={(val) => setSettings({ ...settings, low_stock_alert_emails: val })}
                                />
                            </div>
                            <div className="mb-4">
                                <label className={styles.statLabel}>Alert Schedule</label>
                                <FrequencyPicker
                                    value={settings.low_stock_alert_schedule}
                                    onChange={val => setSettings({ ...settings, low_stock_alert_schedule: val })}
                                />
                            </div>
                            <div className="mb-4">
                                <label className={styles.statLabel}>Email Subject</label>
                                <input
                                    name="low_stock_alert_title"
                                    value={settings.low_stock_alert_title}
                                    onChange={handleChange}
                                    className={styles.table}
                                    style={{ background: '#1f2937', color: 'white', padding: '0.5rem', border: '1px solid #374151', borderRadius: '0.25rem', width: '100%' }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Location Subscriptions (Keep as is) */}
                    <div className={styles.cardTitle} style={{ marginTop: '2rem' }}>Location Reporting Subscriptions</div>
                    <p style={{ color: '#9ca3af', marginBottom: '1rem', fontSize: '0.9rem' }}>Select users to receive daily reports for specific locations.</p>

                    <div style={{ display: 'grid', gap: '1.5rem' }}>
                        {locations.map(loc => {
                            const subbedUsers = subscriptions.filter(s => s.location_id === loc.id);
                            return (
                                <div key={loc.id} style={{ background: '#1f2937', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #374151' }}>
                                    <h4 style={{ margin: '0 0 1rem 0', color: '#fbbf24' }}>{loc.name}</h4>

                                    {/* Existing Subs */}
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                                        {subbedUsers.length === 0 && <span style={{ color: '#6b7280', fontStyle: 'italic', fontSize: '0.9rem' }}>No recipients</span>}
                                        {subbedUsers.map(u => (
                                            <div key={u.user_id} style={{ display: 'flex', alignItems: 'center', background: '#374151', padding: '0.25rem 0.75rem', borderRadius: '1rem', fontSize: '0.9rem', gap: '0.5rem' }}>
                                                <span>{u.first_name} {u.last_name}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveUser(loc.id, u.user_id)}
                                                    style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}
                                                >
                                                    &times;
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Add User */}
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <select
                                            value={selections[loc.id] || ''}
                                            onChange={e => setSelections(prev => ({ ...prev, [loc.id]: e.target.value }))}
                                            style={{ flex: 1, padding: '0.5rem', background: '#111827', color: 'white', border: '1px solid #4b5563', borderRadius: '0.25rem' }}
                                        >
                                            <option value="">Select user to add...</option>
                                            {allUsers
                                                .filter(u => !subbedUsers.find(s => s.user_id === u.id)) // Exclude already subbed
                                                .map(u => (
                                                    <option key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.email})</option>
                                                ))}
                                        </select>
                                        <button
                                            type="button"
                                            onClick={() => handleAddUser(loc.id)}
                                            disabled={!selections[loc.id]}
                                            style={{ background: selections[loc.id] ? '#10b981' : '#374151', color: 'white', padding: '0 1rem', borderRadius: '0.25rem', border: 'none', cursor: selections[loc.id] ? 'pointer' : 'not-allowed' }}
                                        >
                                            Add
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

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

                    <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
                        <button
                            type="submit"
                            disabled={saving}
                            style={{ padding: '0.75rem 2rem', background: '#d97706', color: 'white', borderRadius: '0.5rem', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                            {saving ? 'Saving...' : 'Save Configuration'}
                        </button>
                        <button
                            type="button"
                            onClick={handleTestEmail}
                            style={{ padding: '0.75rem 2rem', background: '#4b5563', color: 'white', borderRadius: '0.5rem', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                            Send Test Email
                        </button>
                    </div>
                </form>
            </div >
        </div >
    );
}
