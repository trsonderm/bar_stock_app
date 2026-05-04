'use client';

import { useState, useEffect } from 'react';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
    return (
        <div style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem' }}>
            <div style={{ marginBottom: '1.25rem' }}>
                <h2 style={{ margin: 0, color: 'white', fontSize: '1rem', fontWeight: 700 }}>{title}</h2>
                {subtitle && <p style={{ margin: '0.3rem 0 0', color: '#6b7280', fontSize: '0.85rem' }}>{subtitle}</p>}
            </div>
            {children}
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</label>
            {children}
        </div>
    );
}

const inp: React.CSSProperties = {
    width: '100%', background: '#111827', border: '1px solid #374151', borderRadius: '8px',
    color: 'white', padding: '0.6rem 0.9rem', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box',
};

function SaveBtn({ status, onClick, label = 'Save' }: { status: SaveStatus; onClick: () => void; label?: string }) {
    return (
        <button onClick={onClick} disabled={status === 'saving'}
            style={{ background: status === 'saved' ? '#059669' : status === 'error' ? '#dc2626' : '#1d4ed8', color: 'white', border: 'none', borderRadius: '8px', padding: '0.6rem 1.25rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem', opacity: status === 'saving' ? 0.7 : 1 }}>
            {status === 'saving' ? 'Saving…' : status === 'saved' ? '✓ Saved' : status === 'error' ? '✗ Error' : label}
        </button>
    );
}

export default function IntegrationsClient() {
    const [twilio, setTwilio] = useState({ twilio_sid: '', twilio_token: '', twilio_from: '' });
    const [s3, setS3] = useState({ s3_bucket: '', s3_region: '', s3_access_key: '', s3_secret_key: '' });
    const [loading, setLoading] = useState(true);

    const [twilioStatus, setTwilioStatus] = useState<SaveStatus>('idle');
    const [s3Status, setS3Status] = useState<SaveStatus>('idle');

    const [testPhone, setTestPhone] = useState('');
    const [testSmsStatus, setTestSmsStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
    const [testSmsMsg, setTestSmsMsg] = useState('');

    const [testS3Status, setTestS3Status] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
    const [testS3Msg, setTestS3Msg] = useState('');

    useEffect(() => {
        fetch('/api/super-admin/integrations')
            .then(r => r.json())
            .then(data => {
                if (data.settings) {
                    const s = data.settings;
                    setTwilio({ twilio_sid: s.twilio_sid || '', twilio_token: s.twilio_token || '', twilio_from: s.twilio_from || '' });
                    setS3({ s3_bucket: s.s3_bucket || '', s3_region: s.s3_region || '', s3_access_key: s.s3_access_key || '', s3_secret_key: s.s3_secret_key || '' });
                }
                setLoading(false);
            });
    }, []);

    const save = async (data: Record<string, string>, setStatus: (s: SaveStatus) => void) => {
        setStatus('saving');
        try {
            const res = await fetch('/api/super-admin/integrations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            setStatus(res.ok ? 'saved' : 'error');
            setTimeout(() => setStatus('idle'), 3000);
        } catch {
            setStatus('error');
            setTimeout(() => setStatus('idle'), 3000);
        }
    };

    const sendTestSms = async () => {
        if (!testPhone.trim()) return;
        setTestSmsStatus('sending');
        setTestSmsMsg('');
        try {
            const res = await fetch('/api/super-admin/integrations/test-sms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to: testPhone.trim() }),
            });
            const data = await res.json();
            if (res.ok) { setTestSmsStatus('ok'); setTestSmsMsg('Test SMS sent successfully!'); }
            else { setTestSmsStatus('error'); setTestSmsMsg(data.error || 'Failed to send'); }
        } catch {
            setTestSmsStatus('error');
            setTestSmsMsg('Network error');
        }
        setTimeout(() => { setTestSmsStatus('idle'); setTestSmsMsg(''); }, 6000);
    };

    const testS3 = async () => {
        setTestS3Status('testing');
        setTestS3Msg('');
        try {
            const res = await fetch('/api/super-admin/integrations/test-s3', { method: 'POST' });
            const data = await res.json();
            if (res.ok) { setTestS3Status('ok'); setTestS3Msg(data.message || 'S3 connection successful!'); }
            else { setTestS3Status('error'); setTestS3Msg(data.error || 'Connection failed'); }
        } catch {
            setTestS3Status('error');
            setTestS3Msg('Network error');
        }
        setTimeout(() => { setTestS3Status('idle'); setTestS3Msg(''); }, 6000);
    };

    if (loading) return <div style={{ color: '#6b7280', padding: '2rem' }}>Loading…</div>;

    const twilioConfigured = !!(twilio.twilio_sid && twilio.twilio_token && twilio.twilio_from);
    const s3Configured = !!(s3.s3_bucket && s3.s3_region && s3.s3_access_key && s3.s3_secret_key);

    return (
        <div style={{ maxWidth: '720px', margin: '0 auto', padding: '1.5rem 1rem', color: 'white' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>Integrations</h1>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.75rem' }}>Configure third-party services used across the platform.</p>

            {/* ── Twilio ── */}
            <Section
                title="📱 Twilio — SMS Notifications"
                subtitle="Send SMS alerts for schedule changes, shift approvals, and security notifications."
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: twilioConfigured ? '#10b981' : '#6b7280' }} />
                    <span style={{ color: twilioConfigured ? '#10b981' : '#6b7280', fontSize: '0.8rem', fontWeight: 600 }}>
                        {twilioConfigured ? 'Configured' : 'Not configured'}
                    </span>
                </div>

                <Field label="Account SID">
                    <input value={twilio.twilio_sid} onChange={e => setTwilio(p => ({ ...p, twilio_sid: e.target.value }))}
                        style={inp} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
                </Field>
                <Field label="Auth Token">
                    <input type="password" value={twilio.twilio_token} onChange={e => setTwilio(p => ({ ...p, twilio_token: e.target.value }))}
                        style={inp} placeholder="••••••••••••••••••••••••••••••••" />
                </Field>
                <Field label="From Phone Number">
                    <input value={twilio.twilio_from} onChange={e => setTwilio(p => ({ ...p, twilio_from: e.target.value }))}
                        style={inp} placeholder="+15550001234" />
                </Field>

                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                    <SaveBtn status={twilioStatus} onClick={() => save(twilio, setTwilioStatus)} />

                    {twilioConfigured && (
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <input value={testPhone} onChange={e => setTestPhone(e.target.value)}
                                placeholder="+15550009999" style={{ ...inp, width: '160px' }} />
                            <button onClick={sendTestSms} disabled={testSmsStatus === 'sending' || !testPhone.trim()}
                                style={{ background: '#374151', color: '#d1d5db', border: '1px solid #4b5563', borderRadius: '8px', padding: '0.6rem 1rem', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                                {testSmsStatus === 'sending' ? 'Sending…' : 'Send Test SMS'}
                            </button>
                        </div>
                    )}
                </div>
                {testSmsMsg && (
                    <div style={{ marginTop: '0.6rem', color: testSmsStatus === 'ok' ? '#10b981' : '#ef4444', fontSize: '0.85rem' }}>
                        {testSmsStatus === 'ok' ? '✓ ' : '✗ '}{testSmsMsg}
                    </div>
                )}
            </Section>

            {/* ── S3 Offsite Backups ── */}
            <Section
                title="☁️ AWS S3 — Offsite Database Backups"
                subtitle="Automatically upload database backups to S3 after each local backup. Prevents total data loss if the server is wiped."
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: s3Configured ? '#10b981' : '#f59e0b' }} />
                    <span style={{ color: s3Configured ? '#10b981' : '#f59e0b', fontSize: '0.8rem', fontWeight: 600 }}>
                        {s3Configured ? 'Configured — backups upload to S3 automatically' : 'Not configured — data only exists on this server'}
                    </span>
                </div>

                {!s3Configured && (
                    <div style={{ background: '#451a03', border: '1px solid #d97706', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.85rem', color: '#fcd34d' }}>
                        ⚠ Without offsite backups, a server wipe or accidental <code>docker compose down -v</code> will permanently destroy all data. Configure S3 now.
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
                    <Field label="S3 Bucket Name">
                        <input value={s3.s3_bucket} onChange={e => setS3(p => ({ ...p, s3_bucket: e.target.value }))}
                            style={inp} placeholder="my-topshelf-backups" />
                    </Field>
                    <Field label="AWS Region">
                        <input value={s3.s3_region} onChange={e => setS3(p => ({ ...p, s3_region: e.target.value }))}
                            style={inp} placeholder="us-east-1" />
                    </Field>
                </div>
                <Field label="AWS Access Key ID">
                    <input value={s3.s3_access_key} onChange={e => setS3(p => ({ ...p, s3_access_key: e.target.value }))}
                        style={inp} placeholder="AKIAIOSFODNN7EXAMPLE" />
                </Field>
                <Field label="AWS Secret Access Key">
                    <input type="password" value={s3.s3_secret_key} onChange={e => setS3(p => ({ ...p, s3_secret_key: e.target.value }))}
                        style={inp} placeholder="••••••••••••••••••••••••••••••••••••••••" />
                </Field>

                <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.8rem', color: '#6b7280' }}>
                    <strong style={{ color: '#9ca3af' }}>Required IAM permissions:</strong>{' '}
                    <code style={{ color: '#60a5fa' }}>s3:PutObject</code>, <code style={{ color: '#60a5fa' }}>s3:GetObject</code>, <code style={{ color: '#60a5fa' }}>s3:ListBucket</code>
                    <br />
                    <strong style={{ color: '#9ca3af' }}>Note:</strong> After saving, also run <code style={{ color: '#60a5fa' }}>sudo bash scripts/setup-backup-cron.sh</code> on the server to install automatic scheduled backups.
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <SaveBtn status={s3Status} onClick={() => save(s3, setS3Status)} />
                    {s3Configured && (
                        <button onClick={testS3} disabled={testS3Status === 'testing'}
                            style={{ background: '#374151', color: '#d1d5db', border: '1px solid #4b5563', borderRadius: '8px', padding: '0.6rem 1rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                            {testS3Status === 'testing' ? 'Testing…' : 'Test S3 Connection'}
                        </button>
                    )}
                </div>
                {testS3Msg && (
                    <div style={{ marginTop: '0.6rem', color: testS3Status === 'ok' ? '#10b981' : '#ef4444', fontSize: '0.85rem' }}>
                        {testS3Status === 'ok' ? '✓ ' : '✗ '}{testS3Msg}
                    </div>
                )}
            </Section>

            {/* ── Cron reminder ── */}
            <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '10px', padding: '1rem 1.25rem', fontSize: '0.85rem', color: '#6b7280' }}>
                <strong style={{ color: '#9ca3af' }}>Automatic backup schedule</strong><br />
                Run once on the server to install cron jobs (every 6h, daily at 2am, weekly Sunday 3am):<br />
                <code style={{ display: 'block', marginTop: '0.5rem', background: '#1f2937', borderRadius: '6px', padding: '0.5rem 0.75rem', color: '#60a5fa' }}>
                    sudo bash scripts/setup-backup-cron.sh
                </code>
            </div>
        </div>
    );
}
