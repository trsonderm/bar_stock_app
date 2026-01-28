'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../admin.module.css';
import { Smartphone } from 'lucide-react';
import NotificationSettings from '@/components/NotificationSettings';

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
        low_stock_alert_title: 'URGENT: Low Stock Alert',
        track_bottle_levels: 'true',
        subdomain: ''
    });
    const [options, setOptions] = useState<any[]>([]);
    const [newOption, setNewOption] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [registeringDevice, setRegisteringDevice] = useState(false);

    useEffect(() => {
        fetch('/api/admin/settings')
            .then(res => res.json())
            .then(data => {
                setSettings(prev => ({ ...prev, ...data.settings }));
                setLoading(false);
            });
        fetchOptions();
    }, []);

    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

    useEffect(() => {
        const handler = (e: any) => {
            e.preventDefault();
            setDeferredPrompt(e);
        };
        window.addEventListener('beforeinstallprompt', handler);
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            setDeferredPrompt(null);
        }
    };

    const fetchOptions = () => {
        fetch('/api/admin/settings/options')
            .then(res => res.json())
            .then(data => setOptions(data.options || []));
    };

    const handleAddOption = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newOption) return;
        await fetch('/api/admin/settings/options', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: newOption })
        });
        setNewOption('');
        fetchOptions();
    };

    const handleDeleteOption = async (id: number) => {
        if (!confirm('Delete this option?')) return;
        await fetch('/api/admin/settings/options', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        fetchOptions();
    };

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

    const handleRegisterDevice = async () => {
        if (!confirm('Register this device for 90 days of PIN-only access?')) return;
        setRegisteringDevice(true);
        try {
            // In a real app we'd get orgId from context. For now, we assume server handles it from session.
            const res = await fetch('/api/auth/station-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceName: navigator.userAgent })
            });
            if (res.ok) {
                alert('Device Registered Successfully for 90 Days.');
            } else {
                alert('Failed to register device.');
            }
        } catch (e) {
            console.error(e);
            alert('Error registering device.');
        } finally {
            setRegisteringDevice(false);
        }
    };

    if (loading) return <div className={styles.container}>Loading...</div>;

    return (
        <>
            <div className={styles.grid}>

                {/* Organization & App Section */}
                <div className={styles.card} style={{ gridColumn: 'span 2' }}>
                    <div className={styles.cardTitle}>Organization & App</div>

                    <div style={{ marginBottom: '2rem' }}>
                        <div style={{ marginBottom: '1rem' }}>
                            <label className={styles.statLabel}>Organization URL ID (Subdomain)</label>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <span style={{ color: '#9ca3af' }}>https://fosters.com/</span>
                                <input
                                    value={settings.subdomain || ''}
                                    onChange={(e) => setSettings(prev => ({ ...prev, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                                    placeholder="downtown-bar"
                                    className={styles.table}
                                    style={{ background: '#1f2937', color: 'white', padding: '0.5rem', border: '1px solid #374151', borderRadius: '0.25rem', flex: 1 }}
                                />
                            </div>
                            <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.25rem' }}>
                                Use this ID for custom login URLs. Must be unique.
                            </p>
                            <button
                                onClick={handleSubmit}
                                disabled={saving}
                                style={{ marginTop: '0.5rem', padding: '0.5rem 1rem', background: '#3b82f6', color: 'white', borderRadius: '0.25rem', border: 'none', cursor: 'pointer' }}
                            >
                                Update URL ID
                            </button>
                        </div>
                    </div>

                    <div style={{ borderTop: '1px solid #374151', paddingTop: '1.5rem' }}>
                        <div className={styles.cardTitle} style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Smartphone size={20} className="text-green-500" /> Mobile App Shortcut
                        </div>
                        <p style={{ color: '#9ca3af', marginBottom: '1rem' }}>
                            Install this app to your Android home screen for quick fullscreen access.
                        </p>

                        {deferredPrompt ? (
                            <button
                                onClick={handleInstallClick}
                                style={{
                                    padding: '0.75rem 1.5rem',
                                    background: '#059669',
                                    color: 'white',
                                    borderRadius: '0.5rem',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem'
                                }}
                            >
                                <Smartphone size={18} /> Add to Home Screen
                            </button>
                        ) : (
                            <div style={{ background: '#1f2937', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #374151' }}>
                                <p style={{ color: '#e5e7eb', margin: '0 0 0.5rem 0', fontWeight: 'bold' }}>To install manually on Android (Chrome):</p>
                                <ol style={{ margin: 0, paddingLeft: '1.2rem', color: '#d1d5db', fontSize: '0.9rem' }}>
                                    <li>Tap the browser menu (⋮) at the top right.</li>
                                    <li>Select <strong>"Add to Home screen"</strong> or <strong>"Install App"</strong>.</li>
                                </ol>
                            </div>
                        )}
                    </div>
                </div>

                <div className={styles.card} style={{ gridColumn: 'span 2' }}>
                    <div className={styles.cardTitle} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Smartphone size={20} className="text-amber-500" /> Station Mode (Kiosk)
                    </div>
                    <p style={{ color: '#9ca3af', marginBottom: '1rem' }}>
                        Register this current device to allow 90-day persistent access via PIN code only.
                        Useful for bar terminals (iPads, POS).
                    </p>
                    <div style={{ background: '#1f2937', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #374151' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h4 style={{ color: 'white', margin: '0 0 0.25rem 0' }}>Enable Persistent Access</h4>
                                <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: 0 }}>
                                    Bypasses email/password login for 90 days on this browser.
                                </p>
                            </div>
                            <button
                                onClick={handleRegisterDevice}
                                disabled={registeringDevice}
                                style={{
                                    padding: '0.5rem 1.5rem',
                                    background: registeringDevice ? '#4b5563' : '#059669',
                                    color: 'white',
                                    borderRadius: '0.25rem',
                                    border: 'none',
                                    cursor: registeringDevice ? 'not-allowed' : 'pointer',
                                    fontWeight: 'bold'
                                }}
                            >
                                {registeringDevice ? 'Registering...' : 'Register Device'}
                            </button>
                        </div>
                    </div>
                </div>

                <div className={styles.card} style={{ gridColumn: 'span 2' }}>
                    <NotificationSettings />
                </div>

                <div className={styles.card} style={{ gridColumn: 'span 2' }}>
                    <div className={styles.cardTitle}>Bottle Level Tracking</div>
                    <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginBottom: '1rem' }}>
                        If enabled, staff will be asked to record the "Existing Bottle Level" when they replace a bottle (Subtract Stock) for Wine/Liquor.
                    </p>

                    <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                            type="checkbox"
                            checked={settings.track_bottle_levels === 'true'}
                            onChange={(e) => setSettings(prev => ({ ...prev, track_bottle_levels: e.target.checked ? 'true' : 'false' }))}
                            style={{ width: '20px', height: '20px' }}
                        />
                        <label className={styles.statLabel} style={{ marginBottom: 0, color: 'white' }}>Enable Tracking</label>
                    </div>
                    {/* Save button again for convenience if they just toggled this */}
                    <button onClick={handleSubmit} style={{ marginBottom: '2rem', padding: '0.5rem 1rem', background: '#374151', color: 'white', borderRadius: '0.25rem', cursor: 'pointer', border: 'none' }}>
                        Save Setting
                    </button>

                    <div className={styles.cardTitle} style={{ fontSize: '1rem' }}>Previous Shift Options</div>
                    <ul style={{ listStyle: 'none', padding: 0 }}>
                        {options.map(o => (
                            <li key={o.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', background: '#1f2937', marginBottom: '0.5rem', borderRadius: '0.25rem' }}>
                                <span>{o.label}</span>
                                <button onClick={() => handleDeleteOption(o.id)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
                            </li>
                        ))}
                    </ul>
                    <form onSubmit={handleAddOption} style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                            value={newOption}
                            onChange={e => setNewOption(e.target.value)}
                            placeholder="New Option (e.g. Less than 3 shots)"
                            className={styles.table}
                            style={{ background: '#1f2937', color: 'white', padding: '0.5rem', border: '1px solid #374151', borderRadius: '0.25rem', flex: 1 }}
                        />
                        <button type="submit" style={{ padding: '0.5rem 1rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '0.25rem', cursor: 'pointer' }}>Add</button>
                    </form>
                </div>

            </div>
        </>
    );
}
