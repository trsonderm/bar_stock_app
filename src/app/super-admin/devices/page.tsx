'use client';

import { useState, useEffect, useCallback } from 'react';
import { Smartphone, ShieldOff, ShieldCheck, Clock, MapPin, RefreshCw, AlertTriangle } from 'lucide-react';

interface DeviceToken {
    id: number;
    device_name: string;
    token: string;
    org_id: number;
    org_name: string;
    subdomain: string | null;
    registered_ip: string | null;
    user_agent: string | null;
    created_at: string;
    expires_at: string;
    last_used_at: string | null;
    revoked_at: string | null;
    revoked_by: number | null;
    status: 'active' | 'expired' | 'revoked';
}

function StatusBadge({ status }: { status: DeviceToken['status'] }) {
    const styles: Record<string, { bg: string; text: string; label: string }> = {
        active: { bg: 'rgba(16,185,129,0.15)', text: '#10b981', label: 'Active' },
        expired: { bg: 'rgba(107,114,128,0.15)', text: '#6b7280', label: 'Expired' },
        revoked: { bg: 'rgba(239,68,68,0.15)', text: '#ef4444', label: 'Revoked' },
    };
    const s = styles[status] || styles.expired;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
            background: s.bg, color: s.text,
            padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600,
        }}>
            {status === 'active' && <ShieldCheck size={11} />}
            {status === 'expired' && <Clock size={11} />}
            {status === 'revoked' && <ShieldOff size={11} />}
            {s.label}
        </span>
    );
}

function formatDate(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function daysUntil(iso: string) {
    const diff = new Date(iso).getTime() - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days < 0) return `${Math.abs(days)}d ago`;
    if (days === 0) return 'today';
    return `in ${days}d`;
}

export default function DevicesPage() {
    const [tokens, setTokens] = useState<DeviceToken[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'active' | 'expired' | 'revoked'>('all');
    const [revoking, setRevoking] = useState<number | null>(null);
    const [search, setSearch] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/super-admin/devices');
            const data = await res.json();
            if (res.ok) setTokens(data.tokens || []);
        } catch {}
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleRevoke = async (token: DeviceToken) => {
        if (!confirm(`Revoke token for "${token.device_name}" (${token.org_name})?\n\nThe device will immediately lose PIN access and cannot be used until re-registered.`)) return;
        setRevoking(token.id);
        try {
            const res = await fetch(`/api/super-admin/devices/${token.id}`, { method: 'DELETE' });
            if (res.ok) {
                setTokens(prev => prev.map(t => t.id === token.id ? { ...t, status: 'revoked', revoked_at: new Date().toISOString() } : t));
            } else {
                const data = await res.json();
                alert(`Failed to revoke: ${data.error}`);
            }
        } catch {
            alert('Error revoking token');
        }
        setRevoking(null);
    };

    const filtered = tokens.filter(t => {
        if (filter !== 'all' && t.status !== filter) return false;
        if (search) {
            const q = search.toLowerCase();
            return t.device_name.toLowerCase().includes(q) || t.org_name.toLowerCase().includes(q) || (t.registered_ip || '').includes(q);
        }
        return true;
    });

    const counts = {
        all: tokens.length,
        active: tokens.filter(t => t.status === 'active').length,
        expired: tokens.filter(t => t.status === 'expired').length,
        revoked: tokens.filter(t => t.status === 'revoked').length,
    };

    return (
        <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                        <div style={{ width: 40, height: 40, borderRadius: '0.75rem', background: 'rgba(217,119,6,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Smartphone size={20} style={{ color: '#d97706' }} />
                        </div>
                        <h1 style={{ color: 'white', fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>Device Tokens</h1>
                    </div>
                    <p style={{ color: '#94a3b8', margin: 0, fontSize: '0.9rem' }}>
                        Manage registered station devices and their 90-day encrypted access tokens.
                    </p>
                </div>
                <button
                    onClick={load}
                    disabled={loading}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.875rem' }}
                >
                    <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                    Refresh
                </button>
            </div>

            {/* Stat chips */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                {(['all', 'active', 'expired', 'revoked'] as const).map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        style={{
                            padding: '0.4rem 1rem', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                            border: filter === f ? '1px solid #3b82f6' : '1px solid #334155',
                            background: filter === f ? 'rgba(59,130,246,0.1)' : '#1e293b',
                            color: filter === f ? '#60a5fa' : '#94a3b8',
                            transition: 'all 0.15s',
                        }}
                    >
                        {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
                    </button>
                ))}
            </div>

            {/* Search */}
            <div style={{ marginBottom: '1.5rem' }}>
                <input
                    type="text"
                    placeholder="Search by device name, org, or IP..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{
                        width: '100%', maxWidth: 400, padding: '0.5rem 1rem',
                        background: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem',
                        color: 'white', fontSize: '0.875rem', outline: 'none',
                    }}
                />
            </div>

            {/* Table */}
            {loading ? (
                <div style={{ color: '#94a3b8', textAlign: 'center', padding: '3rem' }}>Loading tokens...</div>
            ) : filtered.length === 0 ? (
                <div style={{ color: '#64748b', textAlign: 'center', padding: '3rem', background: '#1e293b', borderRadius: '1rem', border: '1px solid #334155' }}>
                    No device tokens found.
                </div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 0.5rem' }}>
                        <thead>
                            <tr>
                                {['Device', 'Organization', 'IP / UA', 'Issued', 'Expires', 'Last Used', 'Status', ''].map(h => (
                                    <th key={h} style={{ textAlign: 'left', color: '#64748b', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 0.75rem 0.5rem' }}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(token => (
                                <tr key={token.id} style={{ background: '#1e293b' }}>
                                    <td style={{ padding: '0.875rem 0.75rem', borderRadius: '0.5rem 0 0 0.5rem', border: '1px solid #334155', borderRight: 'none' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                            <div style={{ width: 32, height: 32, borderRadius: '0.5rem', background: token.status === 'active' ? 'rgba(16,185,129,0.1)' : 'rgba(100,116,139,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                <Smartphone size={14} style={{ color: token.status === 'active' ? '#10b981' : '#64748b' }} />
                                            </div>
                                            <div>
                                                <div style={{ color: 'white', fontWeight: 600, fontSize: '0.875rem' }}>{token.device_name}</div>
                                                <div style={{ color: '#475569', fontSize: '0.7rem', fontFamily: 'monospace' }}>
                                                    #{token.id}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td style={{ padding: '0.875rem 0.75rem', border: '1px solid #334155', borderLeft: 'none', borderRight: 'none' }}>
                                        <div style={{ color: '#e2e8f0', fontSize: '0.875rem', fontWeight: 500 }}>{token.org_name}</div>
                                        {token.subdomain && (
                                            <div style={{ color: '#475569', fontSize: '0.75rem' }}>/o/{token.subdomain}</div>
                                        )}
                                    </td>
                                    <td style={{ padding: '0.875rem 0.75rem', border: '1px solid #334155', borderLeft: 'none', borderRight: 'none', maxWidth: 180 }}>
                                        {token.registered_ip ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#94a3b8', fontSize: '0.8rem' }}>
                                                <MapPin size={11} />
                                                {token.registered_ip}
                                            </div>
                                        ) : <span style={{ color: '#475569', fontSize: '0.8rem' }}>—</span>}
                                        {token.user_agent && (
                                            <div style={{ color: '#475569', fontSize: '0.7rem', marginTop: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }} title={token.user_agent}>
                                                {token.user_agent.slice(0, 40)}{token.user_agent.length > 40 ? '…' : ''}
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ padding: '0.875rem 0.75rem', border: '1px solid #334155', borderLeft: 'none', borderRight: 'none', color: '#94a3b8', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                                        {formatDate(token.created_at)}
                                    </td>
                                    <td style={{ padding: '0.875rem 0.75rem', border: '1px solid #334155', borderLeft: 'none', borderRight: 'none', whiteSpace: 'nowrap' }}>
                                        <div style={{ color: token.status === 'expired' ? '#ef4444' : '#94a3b8', fontSize: '0.8rem' }}>
                                            {formatDate(token.expires_at)}
                                        </div>
                                        <div style={{ color: '#475569', fontSize: '0.7rem' }}>{daysUntil(token.expires_at)}</div>
                                    </td>
                                    <td style={{ padding: '0.875rem 0.75rem', border: '1px solid #334155', borderLeft: 'none', borderRight: 'none', color: '#94a3b8', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                                        {token.last_used_at ? formatDate(token.last_used_at) : <span style={{ color: '#475569' }}>Never</span>}
                                    </td>
                                    <td style={{ padding: '0.875rem 0.75rem', border: '1px solid #334155', borderLeft: 'none', borderRight: 'none' }}>
                                        <StatusBadge status={token.status} />
                                        {token.revoked_at && (
                                            <div style={{ color: '#475569', fontSize: '0.7rem', marginTop: '0.2rem' }}>
                                                {formatDate(token.revoked_at)}
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ padding: '0.875rem 0.75rem', borderRadius: '0 0.5rem 0.5rem 0', border: '1px solid #334155', borderLeft: 'none', textAlign: 'right' }}>
                                        {token.status === 'active' && (
                                            <button
                                                onClick={() => handleRevoke(token)}
                                                disabled={revoking === token.id}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                                                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                                                    color: revoking === token.id ? '#9ca3af' : '#ef4444',
                                                    padding: '0.35rem 0.75rem', borderRadius: '0.375rem',
                                                    fontSize: '0.8rem', fontWeight: 600, cursor: revoking === token.id ? 'not-allowed' : 'pointer',
                                                    transition: 'all 0.15s', whiteSpace: 'nowrap',
                                                }}
                                            >
                                                <AlertTriangle size={12} />
                                                {revoking === token.id ? 'Revoking…' : 'Revoke'}
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Security notice */}
            <div style={{ marginTop: '2rem', padding: '1rem 1.25rem', background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: '0.75rem', display: 'flex', gap: '0.75rem' }}>
                <ShieldCheck size={16} style={{ color: '#3b82f6', flexShrink: 0, marginTop: 2 }} />
                <div style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: 1.6 }}>
                    <strong style={{ color: '#94a3b8' }}>Token Security</strong> — Each token is a cryptographically random UUID bound to a hardware fingerprint (canvas, screen, platform, timezone hash) captured at registration time. Tokens are stored as httpOnly cookies and cannot be read by JavaScript. Revoking a token immediately invalidates PIN access on that device.
                </div>
            </div>
        </div>
    );
}
