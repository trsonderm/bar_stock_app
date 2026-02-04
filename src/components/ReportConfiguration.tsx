'use client';
import { useState, useEffect } from 'react';
import styles from '../app/admin/admin.module.css';

export default function ReportConfiguration() {
    const [settings, setSettings] = useState({
        report_emails: '',
        smtp_host: '',
        smtp_port: '587',
        smtp_user: '',
        smtp_pass: '',
        report_time: '08:00',
        report_title: 'Daily Stock Report',
        low_stock_threshold: '5',
        low_stock_alert_enabled: 'false',
        low_stock_alert_emails: '',
        low_stock_alert_time: '14:00',
        low_stock_alert_title: 'URGENT: Low Stock Alert',
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetch('/api/admin/settings')
            .then(res => res.json())
            .then(data => {
                if (data.settings) setSettings(prev => ({ ...prev, ...data.settings }));
                setLoading(false);
            });
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
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
            if (res.ok) alert('Report Settings Saved');
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

    if (loading) return <div>Loading Configuration...</div>;

    return (
        <form onSubmit={handleSubmit} className="space-y-8">
            {/* SMTP Configuration */}
            <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
                <h3 className="text-xl font-bold text-white mb-4">SMTP Server Configuration</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className={styles.statLabel}>SMTP Host</label>
                        <input className={styles.input} style={{ width: '100%' }} name="smtp_host" value={settings.smtp_host} onChange={handleChange} placeholder="smtp.gmail.com" />
                    </div>
                    <div>
                        <label className={styles.statLabel}>Port</label>
                        <input className={styles.input} style={{ width: '100%' }} name="smtp_port" value={settings.smtp_port} onChange={handleChange} placeholder="587" />
                    </div>
                    <div>
                        <label className={styles.statLabel}>Username</label>
                        <input className={styles.input} style={{ width: '100%' }} name="smtp_user" value={settings.smtp_user} onChange={handleChange} placeholder="you@gmail.com" />
                    </div>
                    <div>
                        <label className={styles.statLabel}>Password (App Password)</label>
                        <input type="password" className={styles.input} style={{ width: '100%' }} name="smtp_pass" value={settings.smtp_pass} onChange={handleChange} placeholder="****" />
                    </div>
                </div>
                <div className="mt-4">
                    <button
                        type="button"
                        onClick={handleTestEmail}
                        className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded text-sm font-bold"
                    >
                        Send Test Email
                    </button>
                </div>
            </div>

            {/* Standard Report Schedule */}
            <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
                <h3 className="text-xl font-bold text-white mb-4">Daily Stock Report</h3>
                <div className="grid grid-cols-1 gap-4">
                    <div>
                        <label className={styles.statLabel}>Recipients (Comma separated)</label>
                        <input className={styles.input} style={{ width: '100%' }} name="report_emails" value={settings.report_emails} onChange={handleChange} placeholder="manager@bar.com, owner@bar.com" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={styles.statLabel}>Send Time (Daily)</label>
                            <input type="time" className={styles.input} style={{ width: '100%' }} name="report_time" value={settings.report_time} onChange={handleChange} />
                        </div>
                        <div>
                            <label className={styles.statLabel}>Email Title</label>
                            <input className={styles.input} style={{ width: '100%' }} name="report_title" value={settings.report_title} onChange={handleChange} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Low Stock Alerts */}
            <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-white">Low Stock Alerts</h3>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            name="low_stock_alert_enabled"
                            checked={settings.low_stock_alert_enabled === 'true'}
                            onChange={(e) => setSettings({ ...settings, low_stock_alert_enabled: e.target.checked ? 'true' : 'false' })}
                            className="w-5 h-5 rounded"
                        />
                        <span className="text-white font-bold">Enable Alerts</span>
                    </label>
                </div>

                {settings.low_stock_alert_enabled === 'true' && (
                    <div className="grid grid-cols-1 gap-4">
                        <div>
                            <label className={styles.statLabel}>Alert Recipients</label>
                            <input className={styles.input} style={{ width: '100%' }} name="low_stock_alert_emails" value={settings.low_stock_alert_emails} onChange={handleChange} placeholder="Same as defaults if empty" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className={styles.statLabel}>Check Time (Daily)</label>
                                <input type="time" className={styles.input} style={{ width: '100%' }} name="low_stock_alert_time" value={settings.low_stock_alert_time} onChange={handleChange} />
                            </div>
                            <div>
                                <label className={styles.statLabel}>Alert Email Title</label>
                                <input className={styles.input} style={{ width: '100%' }} name="low_stock_alert_title" value={settings.low_stock_alert_title} onChange={handleChange} />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex justify-end">
                <button
                    type="submit"
                    disabled={saving}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-lg font-bold text-lg shadow-lg"
                >
                    {saving ? 'Saving...' : 'Save Configuration'}
                </button>
            </div>
        </form>
    );
}
