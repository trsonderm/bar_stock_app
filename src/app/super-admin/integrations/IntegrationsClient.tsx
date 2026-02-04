'use client';

import { useState, useEffect } from 'react';
import styles from '../../admin/admin.module.css';

export default function IntegrationsClient() {
    const [settings, setSettings] = useState({
        twilio_sid: '',
        twilio_token: '',
        twilio_from: ''
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetch('/api/super-admin/integrations')
            .then(res => res.json())
            .then(data => {
                if (data.settings) setSettings(prev => ({ ...prev, ...data.settings }));
                setLoading(false);
            });
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSettings({ ...settings, [e.target.name]: e.target.value });
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await fetch('/api/super-admin/integrations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            alert('Saved');
        } catch (e) {
            alert('Error');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div>Loading...</div>;

    return (
        <div className={styles.container}>
            <h1 className={styles.pageTitle}>System Integrations</h1>

            <div className={styles.card}>
                <div className={styles.cardTitle}>Twilio (SMS)</div>
                <p style={{ marginBottom: '1rem', color: '#9ca3af' }}>Configure global Twilio credentials for sending system SMS.</p>

                <div style={{ marginBottom: '1rem' }}>
                    <label className={styles.statLabel}>Account SID</label>
                    <input name="twilio_sid" value={settings.twilio_sid} onChange={handleChange} className={styles.table} style={{ width: '100%', background: '#1f2937', color: 'white', border: '1px solid #374151', padding: '0.5rem', borderRadius: '0.25rem' }} />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                    <label className={styles.statLabel}>Auth Token</label>
                    <input name="twilio_token" type="password" value={settings.twilio_token} onChange={handleChange} className={styles.table} style={{ width: '100%', background: '#1f2937', color: 'white', border: '1px solid #374151', padding: '0.5rem', borderRadius: '0.25rem' }} />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                    <label className={styles.statLabel}>From Number</label>
                    <input name="twilio_from" value={settings.twilio_from} onChange={handleChange} className={styles.table} style={{ width: '100%', background: '#1f2937', color: 'white', border: '1px solid #374151', padding: '0.5rem', borderRadius: '0.25rem' }} placeholder="+15550001234" />
                </div>

                <button onClick={handleSave} disabled={saving} className={styles.submitBtn}>
                    {saving ? 'Saving...' : 'Save Configuration'}
                </button>
            </div>
        </div>
    );
}
