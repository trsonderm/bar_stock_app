'use client';

import { useState, useEffect } from 'react';
import styles from '../../admin/admin.module.css';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export default function IntegrationsClient() {
    const [twilio, setTwilio] = useState({ twilio_sid: '', twilio_token: '', twilio_from: '' });
    const [loading, setLoading] = useState(true);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
    const [testPhone, setTestPhone] = useState('');
    const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
    const [testMsg, setTestMsg] = useState('');

    useEffect(() => {
        fetch('/api/super-admin/integrations')
            .then(r => r.json())
            .then(data => {
                if (data.settings) {
                    const s = data.settings;
                    setTwilio({ twilio_sid: s.twilio_sid || '', twilio_token: s.twilio_token || '', twilio_from: s.twilio_from || '' });
                }
                setLoading(false);
            });
    }, []);

    const handleSave = async () => {
        setSaveStatus('saving');
        try {
            const res = await fetch('/api/super-admin/integrations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(twilio),
            });
            setSaveStatus(res.ok ? 'saved' : 'error');
        } catch {
            setSaveStatus('error');
        }
        setTimeout(() => setSaveStatus('idle'), 3000);
    };

    const sendTestSms = async () => {
        if (!testPhone.trim()) return;
        setTestStatus('sending');
        setTestMsg('');
        try {
            const res = await fetch('/api/super-admin/integrations/test-sms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to: testPhone.trim() }),
            });
            const data = await res.json();
            if (res.ok) { setTestStatus('ok'); setTestMsg('Test SMS sent successfully!'); }
            else { setTestStatus('error'); setTestMsg(data.error || 'Failed to send'); }
        } catch {
            setTestStatus('error');
            setTestMsg('Network error');
        }
        setTimeout(() => { setTestStatus('idle'); setTestMsg(''); }, 6000);
    };

    if (loading) return <div>Loading...</div>;

    const configured = !!(twilio.twilio_sid && twilio.twilio_token && twilio.twilio_from);
    const inp: React.CSSProperties = { width: '100%', background: '#1f2937', color: 'white', border: '1px solid #374151', padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '0.875rem', outline: 'none' };

    return (
        <div className={styles.container}>
            <h1 className={styles.pageTitle}>System Integrations</h1>

            <div className={styles.card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <div className={styles.cardTitle} style={{ margin: 0 }}>Twilio — SMS Notifications</div>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.78rem', fontWeight: 600, color: configured ? '#10b981' : '#6b7280' }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: configured ? '#10b981' : '#6b7280', display: 'inline-block' }} />
                        {configured ? 'Configured' : 'Not configured'}
                    </span>
                </div>
                <p style={{ marginBottom: '1.25rem', color: '#9ca3af', fontSize: '0.875rem' }}>
                    Used to send SMS alerts for schedule approvals, shift change notifications, and security alerts.
                </p>

                <div style={{ marginBottom: '1rem' }}>
                    <label className={styles.statLabel}>Account SID</label>
                    <input value={twilio.twilio_sid} onChange={e => setTwilio(p => ({ ...p, twilio_sid: e.target.value }))}
                        style={inp} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                    <label className={styles.statLabel}>Auth Token</label>
                    <input type="password" value={twilio.twilio_token} onChange={e => setTwilio(p => ({ ...p, twilio_token: e.target.value }))}
                        style={inp} placeholder="••••••••••••••••••••••••••••••••" />
                </div>
                <div style={{ marginBottom: '1.25rem' }}>
                    <label className={styles.statLabel}>From Phone Number</label>
                    <input value={twilio.twilio_from} onChange={e => setTwilio(p => ({ ...p, twilio_from: e.target.value }))}
                        style={inp} placeholder="+15550001234" />
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button onClick={handleSave} disabled={saveStatus === 'saving'} className={styles.submitBtn}
                        style={{ background: saveStatus === 'saved' ? '#059669' : saveStatus === 'error' ? '#dc2626' : undefined }}>
                        {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'error' ? '✗ Error' : 'Save Configuration'}
                    </button>

                    {configured && (
                        <>
                            <input value={testPhone} onChange={e => setTestPhone(e.target.value)}
                                placeholder="+15550009999" style={{ ...inp, width: '160px' }} />
                            <button onClick={sendTestSms} disabled={testStatus === 'sending' || !testPhone.trim()}
                                style={{ background: '#374151', color: '#d1d5db', border: '1px solid #4b5563', borderRadius: '6px', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.875rem', whiteSpace: 'nowrap' }}>
                                {testStatus === 'sending' ? 'Sending…' : 'Send Test SMS'}
                            </button>
                        </>
                    )}
                </div>

                {testMsg && (
                    <p style={{ marginTop: '0.6rem', color: testStatus === 'ok' ? '#10b981' : '#ef4444', fontSize: '0.875rem' }}>
                        {testStatus === 'ok' ? '✓ ' : '✗ '}{testMsg}
                    </p>
                )}
            </div>
        </div>
    );
}
