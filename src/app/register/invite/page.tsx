'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

function InviteForm() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams.get('token') || '';

    const [status, setStatus] = useState<'loading' | 'valid' | 'invalid' | 'done'>('loading');
    const [errorMsg, setErrorMsg] = useState('');
    const [orgName, setOrgName] = useState('');
    const [prefillEmail, setPrefillEmail] = useState('');

    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [pin, setPin] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState('');

    useEffect(() => {
        if (!token) { setStatus('invalid'); setErrorMsg('No invitation token found in the link.'); return; }

        fetch(`/api/register/invite?token=${token}`)
            .then(r => r.json())
            .then(d => {
                if (d.valid) {
                    setOrgName(d.org_name);
                    setPrefillEmail(d.email || '');
                    setEmail(d.email || '');
                    setStatus('valid');
                } else {
                    setStatus('invalid');
                    setErrorMsg(d.error || 'Invalid invitation.');
                }
            })
            .catch(() => { setStatus('invalid'); setErrorMsg('Could not validate invitation. Please try again.'); });
    }, [token]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        if (!firstName.trim() || !lastName.trim()) return setFormError('First and last name are required.');
        if (password.length < 6) return setFormError('Password must be at least 6 characters.');
        if (password !== confirmPassword) return setFormError('Passwords do not match.');
        if (!/^\d{4}$/.test(pin)) return setFormError('PIN must be exactly 4 digits.');

        setSubmitting(true);
        const res = await fetch('/api/register/invite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, firstName, lastName, displayName, email, phone, password, pin }),
        });
        const data = await res.json();
        setSubmitting(false);

        if (res.ok) {
            setStatus('done');
            setTimeout(() => router.push(data.redirect || '/inventory'), 1200);
        } else {
            setFormError(data.error || 'Registration failed. Please try again.');
        }
    };

    const card: React.CSSProperties = {
        background: '#1f2937', borderRadius: '12px', padding: '2rem 1.75rem',
        width: '100%', maxWidth: '440px', border: '1px solid #374151',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    };
    const inp: React.CSSProperties = {
        width: '100%', background: '#111827', border: '1px solid #374151', borderRadius: '8px',
        color: 'white', padding: '0.65rem 0.9rem', fontSize: '0.9rem', outline: 'none',
        boxSizing: 'border-box' as const,
    };
    const lbl: React.CSSProperties = { color: '#9ca3af', fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' };
    const row: React.CSSProperties = { marginBottom: '1rem' };
    const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' };

    return (
        <div style={{ minHeight: '100vh', background: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem 1rem' }}>
            <div style={card}>
                {/* Logo / header */}
                <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>🍸</div>
                    <h1 style={{ color: 'white', fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>TopShelf Inventory</h1>
                </div>

                {status === 'loading' && (
                    <p style={{ color: '#9ca3af', textAlign: 'center', padding: '1rem 0' }}>Validating your invitation…</p>
                )}

                {status === 'invalid' && (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>⚠️</div>
                        <h2 style={{ color: '#f87171', fontSize: '1.1rem', margin: '0 0 0.5rem' }}>Invitation Invalid</h2>
                        <p style={{ color: '#9ca3af', fontSize: '0.9rem', margin: 0 }}>{errorMsg}</p>
                    </div>
                )}

                {status === 'done' && (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>✅</div>
                        <h2 style={{ color: '#34d399', fontSize: '1.1rem', margin: '0 0 0.5rem' }}>Account Created!</h2>
                        <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>Taking you to the app…</p>
                    </div>
                )}

                {status === 'valid' && (
                    <>
                        <div style={{ background: '#0f172a', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1.5rem', textAlign: 'center' }}>
                            <p style={{ color: '#9ca3af', fontSize: '0.8rem', margin: '0 0 0.2rem' }}>You're joining</p>
                            <p style={{ color: 'white', fontWeight: 700, fontSize: '1.05rem', margin: 0 }}>{orgName}</p>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div style={grid2}>
                                <div>
                                    <label style={lbl}>First Name *</label>
                                    <input style={inp} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Alex" autoFocus required />
                                </div>
                                <div>
                                    <label style={lbl}>Last Name *</label>
                                    <input style={inp} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Smith" required />
                                </div>
                            </div>

                            <div style={row}>
                                <label style={lbl}>Display Name <span style={{ color: '#6b7280', fontWeight: 400 }}>(shown in feed & messages)</span></label>
                                <input style={inp} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder={firstName || 'Alex S.'} />
                            </div>

                            <div style={row}>
                                <label style={lbl}>Email {prefillEmail ? '' : '*'}</label>
                                <input type="email" style={inp} value={email} onChange={e => setEmail(e.target.value)}
                                    placeholder="you@example.com" required={!prefillEmail} />
                            </div>

                            <div style={row}>
                                <label style={lbl}>Phone <span style={{ color: '#6b7280', fontWeight: 400 }}>(optional)</span></label>
                                <input type="tel" style={inp} value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 000-0000" />
                            </div>

                            <div style={row}>
                                <label style={lbl}>Password * <span style={{ color: '#6b7280', fontWeight: 400 }}>(min 6 characters)</span></label>
                                <input type="password" style={inp} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
                            </div>

                            <div style={row}>
                                <label style={lbl}>Confirm Password *</label>
                                <input type="password" style={inp} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••" required />
                            </div>

                            <div style={row}>
                                <label style={lbl}>4-Digit PIN * <span style={{ color: '#6b7280', fontWeight: 400 }}>(for quick login on shared devices)</span></label>
                                <input type="text" inputMode="numeric" maxLength={4} style={{ ...inp, width: '120px', letterSpacing: '0.3em', textAlign: 'center', fontSize: '1.2rem' }}
                                    value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="••••" required />
                            </div>

                            {formError && (
                                <div style={{ background: '#7f1d1d', border: '1px solid #ef4444', borderRadius: '8px', padding: '0.65rem 0.9rem', marginBottom: '1rem', color: '#fca5a5', fontSize: '0.875rem' }}>
                                    {formError}
                                </div>
                            )}

                            <button type="submit" disabled={submitting}
                                style={{ width: '100%', background: '#d97706', color: 'white', border: 'none', borderRadius: '8px', padding: '0.85rem', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', opacity: submitting ? 0.7 : 1, marginTop: '0.5rem' }}>
                                {submitting ? 'Creating account…' : 'Create My Account'}
                            </button>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
}

export default function InvitePage() {
    return (
        <Suspense fallback={
            <div style={{ minHeight: '100vh', background: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
                Loading…
            </div>
        }>
            <InviteForm />
        </Suspense>
    );
}
