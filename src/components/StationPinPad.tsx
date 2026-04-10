'use client';

import { useState, useEffect } from 'react';
import PinPad from './PinPad';

interface StationPinPadProps {
    orgName?: string;
    orgId?: number;
    /** If the token was registered without a fingerprint (legacy/old tokens), skip fingerprint check */
    requireFingerprint?: boolean;
}

// Build a hardware-bound fingerprint from available browser signals
async function collectFingerprint(): Promise<string> {
    const canvasHash = await getCanvasHash();
    const components = [
        navigator.userAgent,
        navigator.platform,
        navigator.language,
        String(screen.width),
        String(screen.height),
        String(screen.colorDepth),
        String(navigator.hardwareConcurrency || '0'),
        String((navigator as any).deviceMemory || '0'),
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        canvasHash,
    ].join('||');

    const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(components));
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

async function getCanvasHash(): Promise<string> {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 40;
        const ctx = canvas.getContext('2d');
        if (!ctx) return 'no-canvas';
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial, sans-serif';
        ctx.fillStyle = '#f60';
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = '#069';
        ctx.fillText('TopShelf\u{1F378}', 2, 15);
        ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
        ctx.fillText('TopShelf\u{1F378}', 4, 17);
        // Take last 80 chars of dataURL — GPU-rendered text differs by hardware
        const url = canvas.toDataURL('image/png');
        return url.slice(-80);
    } catch {
        return 'canvas-error';
    }
}

export default function StationPinPad({ orgName, orgId, requireFingerprint = true }: StationPinPadProps) {
    const [state, setState] = useState<'verifying' | 'verified' | 'blocked'>('verifying');
    const [resolvedOrgName, setResolvedOrgName] = useState(orgName);
    const [resolvedOrgId, setResolvedOrgId] = useState(orgId);

    useEffect(() => {
        async function verify() {
            try {
                const fingerprintHash = await collectFingerprint();
                const res = await fetch('/api/auth/verify-station', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fingerprintHash, orgId }),
                });
                const data = await res.json();

                if (res.ok && data.valid) {
                    if (data.orgName) setResolvedOrgName(data.orgName);
                    if (data.orgId) setResolvedOrgId(data.orgId);
                    setState('verified');
                } else {
                    // If no fingerprint was stored (old token), still allow but warn
                    if (!requireFingerprint && data.reason === 'invalid_token') {
                        setState('blocked');
                    } else if (data.reason === 'no_token') {
                        setState('blocked');
                    } else {
                        setState('blocked');
                    }
                }
            } catch {
                setState('blocked');
            }
        }
        verify();
    }, [orgId, requireFingerprint]);

    if (state === 'verifying') {
        return (
            <div style={{
                minHeight: '100vh', background: '#0f172a',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <div style={{ textAlign: 'center', color: '#475569' }}>
                    <div style={{
                        width: 48, height: 48, borderRadius: '50%',
                        border: '3px solid #1e293b',
                        borderTopColor: '#d97706',
                        animation: 'spin 0.8s linear infinite',
                        margin: '0 auto 1rem',
                    }} />
                    <p style={{ fontSize: '0.9rem' }}>Verifying device…</p>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            </div>
        );
    }

    if (state === 'blocked') {
        return (
            <div style={{
                minHeight: '100vh', background: '#0f172a',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '1rem',
            }}>
                <div style={{
                    background: '#1e293b', borderRadius: '1.5rem', padding: '2.5rem 2rem',
                    width: '100%', maxWidth: '340px', border: '1px solid #ef444433',
                    boxShadow: '0 25px 50px rgba(0,0,0,0.5)', textAlign: 'center',
                }}>
                    <div style={{
                        width: 56, height: 56, background: 'rgba(239,68,68,0.1)',
                        borderRadius: '50%', margin: '0 auto 1.25rem',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1.5rem',
                    }}>🚫</div>
                    <h2 style={{ color: 'white', margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: 700 }}>
                        Device Not Authorized
                    </h2>
                    <p style={{ color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.6, margin: '0 0 1.5rem' }}>
                        This device does not have a valid registration token, or the token has been revoked. An admin must register this device from the Settings page.
                    </p>
                    <a
                        href="/login"
                        style={{
                            display: 'inline-block', color: '#d97706',
                            fontSize: '0.85rem', textDecoration: 'none',
                            border: '1px solid #d9770633', padding: '0.5rem 1.25rem',
                            borderRadius: '0.5rem',
                        }}
                    >
                        Admin Login →
                    </a>
                </div>
            </div>
        );
    }

    return <PinPad orgName={resolvedOrgName} orgId={resolvedOrgId} />;
}
