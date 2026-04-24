'use client';

import { useState, useEffect } from 'react';
import styles from '../../admin.module.css';
import RecipientSelector from '@/components/RecipientSelector';
import FrequencyPicker from '@/components/FrequencyPicker';

export default function ReportingSettingsClient() {
    const [settings, setSettings] = useState({
        report_emails: { to: [], cc: [], bcc: [] } as any,
        report_schedule: { frequency: 'daily', time: '08:00' } as any, // Replaces simple report_time
        low_stock_threshold: '5',
        use_global_low_stock: 'false', // New Toggle

        report_title: 'Daily Stock Report',
        backup_time: '06:00',

        report_per_location: 'false', // Send one report per location vs combined summary

        low_stock_alert_enabled: 'false',
        low_stock_alert_emails: { to: [], cc: [], bcc: [] } as any,
        low_stock_alert_schedule: { frequency: 'daily', time: '14:00' } as any, // Replaces alert_time
        low_stock_alert_title: 'URGENT: Low Stock Alert',

        shift_report_emails: { to: [], cc: [], bcc: [] } as any,
        shift_report_schedule: { frequency: 'per_shift', time: '00:00' } as any,
        shift_report_enabled: 'false',
        shift_report_title: 'Shift Close Report',

        audit_alert_enabled: 'false',
        audit_alert_emails: { to: [], cc: [], bcc: [] } as any,
        audit_alert_actions: 'both',
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

                const parseShiftSchedule = (val: string) => {
                    try {
                        if (!val) return { frequency: 'per_shift', time: '00:00' };
                        return JSON.parse(val);
                    } catch { return { frequency: 'per_shift', time: '00:00' }; }
                };

                setSettings(prev => ({
                    ...prev,
                    ...s,
                    report_emails: parseEmails(s.report_emails),
                    report_schedule: parseSchedule(s.report_time || s.report_schedule, '08:00'), // Handle backward compat
                    low_stock_alert_emails: parseEmails(s.low_stock_alert_emails),
                    low_stock_alert_schedule: parseSchedule(s.low_stock_alert_time || s.low_stock_alert_schedule, '14:00'),
                    report_per_location: s.report_per_location || 'false',
                    shift_report_emails: parseEmails(s.shift_report_emails),
                    shift_report_schedule: parseShiftSchedule(s.shift_report_schedule),
                    shift_report_enabled: s.shift_report_enabled || 'false',
                    shift_report_title: s.shift_report_title || 'Shift Close Report',
                    audit_alert_enabled: s.audit_alert_enabled || 'false',
                    audit_alert_emails: parseEmails(s.audit_alert_emails),
                    audit_alert_actions: s.audit_alert_actions || 'both',
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
        try {
            const res = await fetch('/api/admin/settings/test-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ report_emails: settings.report_emails })
            });
            const data = await res.json();
            if (res.ok) alert(data.message || 'Email sent!');
            else alert(data.error || 'Failed to send email');
        } catch (e) {
            alert('Error sending email');
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


                    {/* Per-location report mode — only shown when org has more than one location */}
                    {locations.length > 1 && (
                        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#1f2937', borderRadius: '0.5rem', border: '1px solid #374151' }}>
                            <div className={styles.cardTitle} style={{ marginTop: 0, marginBottom: '0.75rem' }}>Report Scope</div>
                            <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1rem' }}>
                                Choose whether to send one combined report covering all locations or a separate report for each location.
                            </p>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: settings.report_per_location !== 'true' ? 'white' : '#9ca3af' }}>
                                    <input
                                        type="radio"
                                        name="report_per_location"
                                        checked={settings.report_per_location !== 'true'}
                                        onChange={() => setSettings(prev => ({ ...prev, report_per_location: 'false' }))}
                                        style={{ accentColor: '#3b82f6' }}
                                    />
                                    Combined — one report for all locations
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: settings.report_per_location === 'true' ? 'white' : '#9ca3af' }}>
                                    <input
                                        type="radio"
                                        name="report_per_location"
                                        checked={settings.report_per_location === 'true'}
                                        onChange={() => setSettings(prev => ({ ...prev, report_per_location: 'true' }))}
                                        style={{ accentColor: '#3b82f6' }}
                                    />
                                    Per-location — separate report per location
                                </label>
                            </div>
                            {settings.report_per_location === 'true' && (
                                <p style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                                    Each location's subscribers (configured below) will receive a report containing only their location's inventory data.
                                </p>
                            )}
                        </div>
                    )}

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

                    <p style={{ color: '#6b7280', fontSize: '0.85rem', margin: '0.5rem 0 1.5rem' }}>
                        Email delivery is handled by the <strong style={{ color: '#9ca3af' }}>Reporting</strong> mail account configured in Super Admin → Mail Accounts.
                    </p>

                    {/* Shift Report Email Section */}
                    <div className={styles.cardTitle} style={{ marginTop: '2rem' }}>Shift Report Emails</div>

                    <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                            type="checkbox"
                            checked={settings.shift_report_enabled === 'true'}
                            onChange={(e) => setSettings(prev => ({ ...prev, shift_report_enabled: e.target.checked ? 'true' : 'false' }))}
                            className="w-4 h-4"
                        />
                        <label className={styles.statLabel} style={{ marginBottom: 0 }}>Enable Shift Close Report Emails</label>
                    </div>

                    {settings.shift_report_enabled === 'true' && (
                        <div className="pl-6 border-l-2 border-gray-700 ml-2">
                            <div className="mb-4">
                                <label className={styles.statLabel}>Shift Report Recipients</label>
                                <RecipientSelector
                                    users={allUsers}
                                    value={settings.shift_report_emails}
                                    onChange={(val) => setSettings(prev => ({ ...prev, shift_report_emails: val }))}
                                />
                            </div>

                            <div style={{ marginBottom: '1rem' }}>
                                <label className={styles.statLabel}>Send Schedule</label>
                                <p style={{ color: '#6b7280', fontSize: '0.8rem', marginBottom: '0.5rem', marginTop: '0.25rem' }}>
                                    "Per Shift" sends immediately after each shift close. Other options aggregate shifts.
                                </p>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                    <div>
                                        <label className={styles.statLabel}>Frequency</label>
                                        <select
                                            value={settings.shift_report_schedule?.frequency || 'per_shift'}
                                            onChange={(e) => setSettings(prev => ({ ...prev, shift_report_schedule: { ...prev.shift_report_schedule, frequency: e.target.value } }))}
                                            style={{ width: '100%', background: '#1f2937', color: 'white', border: '1px solid #374151', borderRadius: '0.25rem', padding: '0.5rem', fontSize: '0.875rem' }}
                                        >
                                            <option value="per_shift">Per Shift (immediate)</option>
                                            <option value="daily">Daily Digest</option>
                                            <option value="weekly">Weekly Summary</option>
                                            <option value="monthly">Monthly Report</option>
                                        </select>
                                    </div>
                                    {settings.shift_report_schedule?.frequency !== 'per_shift' && (
                                        <div>
                                            <label className={styles.statLabel}>Send Time</label>
                                            <input
                                                type="time"
                                                value={settings.shift_report_schedule?.time || '08:00'}
                                                onChange={(e) => setSettings(prev => ({ ...prev, shift_report_schedule: { ...prev.shift_report_schedule, time: e.target.value } }))}
                                                style={{ width: '100%', background: '#1f2937', color: 'white', border: '1px solid #374151', borderRadius: '0.25rem', padding: '0.5rem', fontSize: '0.875rem' }}
                                            />
                                        </div>
                                    )}
                                </div>

                                {settings.shift_report_schedule?.frequency === 'weekly' && (
                                    <div style={{ marginBottom: '1rem' }}>
                                        <label className={styles.statLabel}>Day of Week</label>
                                        <select
                                            value={settings.shift_report_schedule?.dayOfWeek ?? 1}
                                            onChange={(e) => setSettings(prev => ({ ...prev, shift_report_schedule: { ...prev.shift_report_schedule, dayOfWeek: parseInt(e.target.value) } }))}
                                            style={{ width: '100%', background: '#1f2937', color: 'white', border: '1px solid #374151', borderRadius: '0.25rem', padding: '0.5rem', fontSize: '0.875rem' }}
                                        >
                                            <option value={0}>Sunday</option>
                                            <option value={1}>Monday</option>
                                            <option value={2}>Tuesday</option>
                                            <option value={3}>Wednesday</option>
                                            <option value={4}>Thursday</option>
                                            <option value={5}>Friday</option>
                                            <option value={6}>Saturday</option>
                                        </select>
                                    </div>
                                )}

                                {settings.shift_report_schedule?.frequency !== 'per_shift' && (
                                    <div style={{ marginBottom: '1rem' }}>
                                        <label className={styles.statLabel}>Shift Inclusion</label>
                                        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.375rem' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: (settings.shift_report_schedule?.shiftInclusion || 'all_shifts') === 'all_shifts' ? 'white' : '#9ca3af' }}>
                                                <input
                                                    type="radio"
                                                    name="shift_inclusion"
                                                    value="all_shifts"
                                                    checked={(settings.shift_report_schedule?.shiftInclusion || 'all_shifts') === 'all_shifts'}
                                                    onChange={() => setSettings(prev => ({ ...prev, shift_report_schedule: { ...prev.shift_report_schedule, shiftInclusion: 'all_shifts' } }))}
                                                    style={{ accentColor: '#3b82f6' }}
                                                />
                                                All Shifts (each as separate section)
                                            </label>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: settings.shift_report_schedule?.shiftInclusion === 'summary_only' ? 'white' : '#9ca3af' }}>
                                                <input
                                                    type="radio"
                                                    name="shift_inclusion"
                                                    value="summary_only"
                                                    checked={settings.shift_report_schedule?.shiftInclusion === 'summary_only'}
                                                    onChange={() => setSettings(prev => ({ ...prev, shift_report_schedule: { ...prev.shift_report_schedule, shiftInclusion: 'summary_only' } }))}
                                                    style={{ accentColor: '#3b82f6' }}
                                                />
                                                Summary Only
                                            </label>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="mb-4">
                                <label className={styles.statLabel}>Email Subject</label>
                                <input
                                    name="shift_report_title"
                                    value={settings.shift_report_title}
                                    onChange={handleChange}
                                    className={styles.table}
                                    style={{ background: '#1f2937', color: 'white', padding: '0.5rem', border: '1px solid #374151', borderRadius: '0.25rem', width: '100%' }}
                                />
                            </div>
                        </div>
                    )}

                    {/* ── Stock Activity / Audit Alerts ── */}
                    <div style={{ borderTop: '1px solid #374151', paddingTop: '1.5rem', marginTop: '1.5rem' }}>
                        <div className={styles.cardTitle} style={{ marginBottom: '0.75rem' }}>Stock Activity Alerts</div>
                        <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1rem' }}>
                            Send an email notification every time stock is added or removed. Useful for auditing inventory changes in real time.
                        </p>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#d1d5db', fontSize: '0.9rem' }}>
                                <input
                                    type="checkbox"
                                    checked={settings.audit_alert_enabled === 'true'}
                                    onChange={e => setSettings(prev => ({ ...prev, audit_alert_enabled: e.target.checked ? 'true' : 'false' }))}
                                    style={{ width: 16, height: 16, accentColor: '#3b82f6' }}
                                />
                                Enable stock activity alerts
                            </label>
                        </div>

                        {settings.audit_alert_enabled === 'true' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingLeft: '0.5rem' }}>
                                <div>
                                    <label className={styles.statLabel}>Trigger on</label>
                                    <select
                                        value={settings.audit_alert_actions}
                                        onChange={e => setSettings(prev => ({ ...prev, audit_alert_actions: e.target.value }))}
                                        style={{ background: '#1f2937', color: '#d1d5db', border: '1px solid #374151', borderRadius: 6, padding: '6px 10px', fontSize: '0.875rem', marginTop: '0.25rem' }}
                                    >
                                        <option value="both">Additions &amp; Subtractions</option>
                                        <option value="add">Additions only</option>
                                        <option value="subtract">Subtractions only</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={styles.statLabel}>Alert Recipients</label>
                                    <RecipientSelector
                                        users={allUsers}
                                        value={settings.audit_alert_emails}
                                        onChange={val => setSettings(prev => ({ ...prev, audit_alert_emails: val }))}
                                    />
                                </div>
                            </div>
                        )}
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
