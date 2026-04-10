'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface PinPadProps {
    orgName?: string;
    orgId?: number;
}

export default function PinPad({ orgName, orgId }: PinPadProps) {
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    // Auto-submit when 4 digits entered
    useEffect(() => {
        if (pin.length === 4) {
            handleLogin();
        }
    }, [pin]);

    const handleLogin = async () => {
        if (pin.length < 4 || loading) return;
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin }),
            });
            const data = await res.json();
            if (res.ok) {
                router.refresh();
                if (data.isSuperAdmin) {
                    router.push('/super-admin');
                } else if (data.role === 'admin') {
                    router.push('/admin/dashboard');
                } else {
                    router.push('/inventory');
                }
            } else {
                setError(data.error || 'Invalid PIN');
                setPin('');
                setLoading(false);
            }
        } catch {
            setError('Connection error. Try again.');
            setPin('');
            setLoading(false);
        }
    };

    const append = (d: string) => {
        if (pin.length < 4 && !loading) setPin(p => p + d);
    };
    const backspace = () => { if (!loading) setPin(p => p.slice(0, -1)); setError(''); };
    const clear = () => { if (!loading) setPin(''); setError(''); };

    const dots = Array.from({ length: 4 }).map((_, i) => (
        <div
            key={i}
            style={{
                width: 16, height: 16, borderRadius: '50%',
                background: i < pin.length ? '#d97706' : '#374151',
                border: '2px solid',
                borderColor: i < pin.length ? '#d97706' : '#4b5563',
                transition: 'all 0.15s',
            }}
        />
    ));

    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', '⌫'];

    return (
        <div style={{
            minHeight: '100vh',
            background: '#0f172a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
        }}>
            <div style={{
                background: '#1e293b',
                borderRadius: '1.5rem',
                padding: '2.5rem 2rem',
                width: '100%',
                maxWidth: '320px',
                border: '1px solid #334155',
                boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
            }}>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{
                        width: 56, height: 56, background: 'rgba(217,119,6,0.12)',
                        borderRadius: '50%', margin: '0 auto 1rem',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1.5rem',
                    }}>🔐</div>
                    <h1 style={{ color: 'white', margin: '0 0 0.25rem', fontSize: '1.2rem', fontWeight: 700 }}>
                        {orgName || 'Staff Login'}
                    </h1>
                    <p style={{ color: '#94a3b8', margin: 0, fontSize: '0.85rem' }}>Enter your PIN to continue</p>
                </div>

                {/* PIN dots */}
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '1.5rem' }}>
                    {dots}
                </div>

                {/* Error */}
                {error && (
                    <p style={{ color: '#f87171', fontSize: '0.85rem', textAlign: 'center', margin: '0 0 1rem' }}>
                        {error}
                    </p>
                )}

                {/* Keypad */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                    {keys.map(k => (
                        <button
                            key={k}
                            onClick={() => {
                                if (k === 'CLR') clear();
                                else if (k === '⌫') backspace();
                                else append(k);
                            }}
                            disabled={loading}
                            style={{
                                padding: '1rem',
                                borderRadius: '0.75rem',
                                border: 'none',
                                fontSize: k === '⌫' || k === 'CLR' ? '0.9rem' : '1.3rem',
                                fontWeight: 600,
                                cursor: loading ? 'not-allowed' : 'pointer',
                                background: k === 'CLR' ? '#374151' : k === '⌫' ? '#374151' : '#1e3a5f',
                                color: k === 'CLR' ? '#9ca3af' : k === '⌫' ? '#9ca3af' : 'white',
                                transition: 'background 0.1s',
                                opacity: loading ? 0.5 : 1,
                            }}
                        >
                            {loading && k === '0' ? '...' : k}
                        </button>
                    ))}
                </div>

                {/* Admin login link */}
                <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
                    <a
                        href="/login"
                        style={{ color: '#475569', fontSize: '0.8rem', textDecoration: 'none' }}
                    >
                        Admin login →
                    </a>
                </div>
            </div>
        </div>
    );
}
