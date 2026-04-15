'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SecurityThreat, SecuritySuggestion, ThreatLevel } from '@/lib/security-analysis';

interface SecurityStats {
    totalLoginAttempts7d: number;
    failedLoginAttempts7d: number;
    uniqueIps7d: number;
    blockedIpCount: number;
    lockedAccountCount: number;
    threatsDetected: number;
    criticalCount: number;
    highCount: number;
    last24hFails: number;
    last24hSuccesses: number;
}

interface LoginAttemptRow {
    id: number;
    ip_address: string;
    email: string | null;
    success: boolean;
    fail_reason: string | null;
    attempted_at: string;
    user_agent: string;
}

const LEVEL_CONFIG: Record<ThreatLevel, { color: string; bg: string; border: string; label: string; dot: string }> = {
    critical: { color: '#fca5a5', bg: '#450a0a', border: '#dc2626', label: 'CRITICAL', dot: '#ef4444' },
    high:     { color: '#fdba74', bg: '#431407', border: '#ea580c', label: 'HIGH',     dot: '#f97316' },
    medium:   { color: '#fde047', bg: '#422006', border: '#ca8a04', label: 'MEDIUM',   dot: '#eab308' },
    low:      { color: '#86efac', bg: '#052e16', border: '#16a34a', label: 'LOW',      dot: '#22c55e' },
    info:     { color: '#93c5fd', bg: '#1e3a5f', border: '#2563eb', label: 'INFO',     dot: '#3b82f6' },
};

const TYPE_ICONS: Record<string, string> = {
    brute_force: '🔨',
    credential_stuffing: '🌐',
    account_targeting: '🎯',
    off_hours_activity: '🌙',
    activity_spike: '📈',
    dormant_account_active: '👻',
    email_enumeration: '📋',
};

export default function SecurityClient() {
    const [threats, setThreats] = useState<SecurityThreat[]>([]);
    const [stats, setStats] = useState<SecurityStats | null>(null);
    const [recentAttempts, setRecentAttempts] = useState<LoginAttemptRow[]>([]);
    const [blockedIps, setBlockedIps] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState<'overview' | 'threats' | 'attempts' | 'blocked'>('overview');
    const [implementing, setImplementing] = useState<Record<string, boolean>>({});
    const [actionResults, setActionResults] = useState<Record<string, { ok: boolean; msg: string }>>({});
    const [levelFilter, setLevelFilter] = useState<ThreatLevel | 'all'>('all');
    const [expandedThreat, setExpandedThreat] = useState<string | null>(null);

    const runAnalysis = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/super-admin/security');
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Analysis failed');
            setThreats(data.threats || []);
            setStats(data.stats || null);
            setRecentAttempts(data.recentAttempts || []);
            setBlockedIps(data.blockedIps || []);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { runAnalysis(); }, [runAnalysis]);

    const implementFix = async (suggestionId: string, action: any) => {
        setImplementing(p => ({ ...p, [suggestionId]: true }));
        setActionResults(p => ({ ...p, [suggestionId]: undefined! }));
        try {
            const res = await fetch('/api/super-admin/security', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action }),
            });
            const data = await res.json();
            setActionResults(p => ({ ...p, [suggestionId]: { ok: res.ok, msg: data.message || data.error || '' } }));
            if (res.ok) {
                // Re-run analysis after fix
                setTimeout(() => runAnalysis(), 1200);
            }
        } catch (e: any) {
            setActionResults(p => ({ ...p, [suggestionId]: { ok: false, msg: e.message } }));
        } finally {
            setImplementing(p => ({ ...p, [suggestionId]: false }));
        }
    };

    const unblockIp = async (ip: string) => {
        await fetch(`/api/super-admin/security?ip=${encodeURIComponent(ip)}`, { method: 'DELETE' });
        runAnalysis();
    };

    const filteredThreats = levelFilter === 'all' ? threats : threats.filter(t => t.level === levelFilter);

    const scoreBar = (score: number) => (
        <div style={{ height: '4px', background: '#1f2937', borderRadius: '2px', width: '80px', display: 'inline-block', verticalAlign: 'middle', marginLeft: '0.5rem' }}>
            <div style={{ height: '100%', width: `${score * 100}%`, background: score > 0.7 ? '#ef4444' : score > 0.4 ? '#f97316' : '#eab308', borderRadius: '2px', transition: 'width 0.4s' }} />
        </div>
    );

    return (
        <div style={{ background: '#0f172a', minHeight: '100vh', color: 'white', padding: '1.5rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>🛡️ Security Monitor</h1>
                    <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.875rem' }}>
                        ML-powered threat detection — analyzing login patterns, user behavior, and access anomalies
                    </p>
                </div>
                <button
                    onClick={runAnalysis}
                    disabled={loading}
                    style={{ background: loading ? '#1e293b' : '#2563eb', color: loading ? '#64748b' : 'white', border: 'none', borderRadius: '8px', padding: '0.6rem 1.25rem', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                    {loading ? '⟳ Analyzing...' : '⟳ Re-analyze'}
                </button>
            </div>

            {error && (
                <div style={{ background: '#450a0a', border: '1px solid #dc2626', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', color: '#fca5a5', fontSize: '0.875rem' }}>
                    {error}
                </div>
            )}

            {/* KPI Cards */}
            {stats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <KpiCard label="Threats Detected" value={stats.threatsDetected} color={stats.threatsDetected > 0 ? '#ef4444' : '#22c55e'} icon="⚠️" />
                    <KpiCard label="Critical / High" value={`${stats.criticalCount} / ${stats.highCount}`} color={stats.criticalCount > 0 ? '#ef4444' : stats.highCount > 0 ? '#f97316' : '#22c55e'} icon="🚨" />
                    <KpiCard label="Failed Logins 7d" value={stats.failedLoginAttempts7d} color={stats.failedLoginAttempts7d > 50 ? '#f97316' : '#94a3b8'} icon="🔒" />
                    <KpiCard label="Fails Last 24h" value={stats.last24hFails} color={stats.last24hFails > 20 ? '#ef4444' : '#94a3b8'} icon="⏱️" />
                    <KpiCard label="Unique IPs 7d" value={stats.uniqueIps7d} color="#94a3b8" icon="🌐" />
                    <KpiCard label="Blocked IPs" value={stats.blockedIpCount} color={stats.blockedIpCount > 0 ? '#f97316' : '#94a3b8'} icon="🚫" />
                    <KpiCard label="Locked Accounts" value={stats.lockedAccountCount} color={stats.lockedAccountCount > 0 ? '#f97316' : '#94a3b8'} icon="🔑" />
                    <KpiCard label="Success / Fail (24h)" value={`${stats.last24hSuccesses} / ${stats.last24hFails}`} color="#94a3b8" icon="✅" />
                </div>
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.25rem', borderBottom: '1px solid #1e293b', paddingBottom: '0' }}>
                {(['overview', 'threats', 'attempts', 'blocked'] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                        style={{ background: 'none', border: 'none', borderBottom: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent', color: activeTab === tab ? '#60a5fa' : '#64748b', cursor: 'pointer', padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 600, textTransform: 'capitalize', transition: 'color 0.15s' }}>
                        {tab === 'threats' ? `Threats (${threats.length})` : tab === 'blocked' ? `Blocked IPs (${blockedIps.length})` : tab === 'attempts' ? 'Login Attempts' : 'Overview'}
                    </button>
                ))}
            </div>

            {/* Overview Tab */}
            {activeTab === 'overview' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    {/* Threat Summary */}
                    <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: '10px', padding: '1.25rem' }}>
                        <h3 style={{ margin: '0 0 1rem', fontSize: '0.95rem', fontWeight: 700, color: '#e2e8f0' }}>Active Threats by Severity</h3>
                        {(['critical', 'high', 'medium', 'low'] as ThreatLevel[]).map(level => {
                            const count = threats.filter(t => t.level === level).length;
                            const cfg = LEVEL_CONFIG[level];
                            return (
                                <div key={level} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem' }}>
                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: cfg.dot, display: 'inline-block', flexShrink: 0 }} />
                                    <span style={{ color: cfg.color, fontSize: '0.8rem', fontWeight: 600, width: '70px' }}>{cfg.label}</span>
                                    <div style={{ flex: 1, height: '6px', background: '#1e293b', borderRadius: '3px' }}>
                                        <div style={{ height: '100%', width: `${threats.length ? (count / threats.length * 100) : 0}%`, background: cfg.dot, borderRadius: '3px' }} />
                                    </div>
                                    <span style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 700, width: '20px', textAlign: 'right' }}>{count}</span>
                                </div>
                            );
                        })}
                        {threats.length === 0 && !loading && (
                            <p style={{ color: '#22c55e', fontSize: '0.875rem', margin: 0 }}>✓ No threats detected</p>
                        )}
                    </div>

                    {/* Top Threats Quick View */}
                    <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: '10px', padding: '1.25rem' }}>
                        <h3 style={{ margin: '0 0 1rem', fontSize: '0.95rem', fontWeight: 700, color: '#e2e8f0' }}>Top Threats</h3>
                        {loading ? <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Analyzing...</p> :
                            threats.slice(0, 5).length === 0 ? <p style={{ color: '#22c55e', fontSize: '0.875rem' }}>✓ All clear</p> :
                            threats.slice(0, 5).map(t => {
                                const cfg = LEVEL_CONFIG[t.level];
                                return (
                                    <div key={t.id} onClick={() => { setActiveTab('threats'); setExpandedThreat(t.id); }}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.4rem 0.5rem', borderRadius: '6px', cursor: 'pointer', marginBottom: '2px', transition: 'background 0.1s' }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#1e293b'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <span style={{ fontSize: '0.9rem' }}>{TYPE_ICONS[t.type] || '⚠️'}</span>
                                        <span style={{ flex: 1, color: '#e2e8f0', fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                                        <span style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, borderRadius: '4px', padding: '1px 6px', fontSize: '0.7rem', fontWeight: 700, flexShrink: 0 }}>{cfg.label}</span>
                                    </div>
                                );
                            })}
                        {threats.length > 5 && (
                            <button onClick={() => setActiveTab('threats')} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                                View all {threats.length} threats →
                            </button>
                        )}
                    </div>

                    {/* Login Activity Chart (hourly last 24h) */}
                    <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: '10px', padding: '1.25rem', gridColumn: '1 / -1' }}>
                        <h3 style={{ margin: '0 0 1rem', fontSize: '0.95rem', fontWeight: 700, color: '#e2e8f0' }}>Login Activity — Last 24 Hours</h3>
                        <LoginBarChart attempts={recentAttempts} />
                    </div>
                </div>
            )}

            {/* Threats Tab */}
            {activeTab === 'threats' && (
                <div>
                    {/* Level filter */}
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                        {(['all', 'critical', 'high', 'medium', 'low'] as const).map(lv => {
                            const cfg = lv === 'all' ? null : LEVEL_CONFIG[lv];
                            const active = levelFilter === lv;
                            return (
                                <button key={lv} onClick={() => setLevelFilter(lv)}
                                    style={{ background: active ? (cfg?.bg || '#1e293b') : 'transparent', color: active ? (cfg?.color || 'white') : '#64748b', border: `1px solid ${active ? (cfg?.border || '#334155') : '#334155'}`, borderRadius: '6px', padding: '4px 12px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, textTransform: 'capitalize' }}>
                                    {lv === 'all' ? `All (${threats.length})` : `${cfg!.label} (${threats.filter(t => t.level === lv).length})`}
                                </button>
                            );
                        })}
                    </div>

                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Analyzing threats...</div>
                    ) : filteredThreats.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: '#22c55e' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>✓</div>
                            <p style={{ margin: 0, fontWeight: 600 }}>No threats at this severity level</p>
                        </div>
                    ) : (
                        filteredThreats.map(threat => (
                            <ThreatCard
                                key={threat.id}
                                threat={threat}
                                expanded={expandedThreat === threat.id}
                                onToggle={() => setExpandedThreat(expandedThreat === threat.id ? null : threat.id)}
                                onImplement={implementFix}
                                implementing={implementing}
                                actionResults={actionResults}
                                scoreBar={scoreBar}
                            />
                        ))
                    )}
                </div>
            )}

            {/* Login Attempts Tab */}
            {activeTab === 'attempts' && (
                <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: '10px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #1e293b', background: '#0f172a' }}>
                                {['Time', 'IP Address', 'Email', 'Status', 'Reason', 'User Agent'].map(h => (
                                    <th key={h} style={{ padding: '0.6rem 0.75rem', color: '#64748b', fontWeight: 600, textAlign: 'left', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {recentAttempts.map(a => (
                                <tr key={a.id} style={{ borderBottom: '1px solid #1e293b', background: a.success ? 'rgba(34,197,94,0.04)' : 'rgba(239,68,68,0.04)' }}>
                                    <td style={{ padding: '0.5rem 0.75rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>{new Date(a.attempted_at).toLocaleString()}</td>
                                    <td style={{ padding: '0.5rem 0.75rem' }}>
                                        <code style={{ background: '#1e293b', padding: '1px 6px', borderRadius: '4px', fontSize: '0.78rem', color: blockedIps.includes(a.ip_address) ? '#fca5a5' : '#e2e8f0' }}>
                                            {a.ip_address}
                                            {blockedIps.includes(a.ip_address) && <span style={{ marginLeft: '4px', color: '#ef4444' }}>🚫</span>}
                                        </code>
                                    </td>
                                    <td style={{ padding: '0.5rem 0.75rem', color: '#cbd5e1', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.email || '—'}</td>
                                    <td style={{ padding: '0.5rem 0.75rem' }}>
                                        <span style={{ background: a.success ? '#14532d' : '#450a0a', color: a.success ? '#86efac' : '#fca5a5', padding: '1px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700 }}>
                                            {a.success ? 'SUCCESS' : 'FAILED'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '0.5rem 0.75rem', color: '#64748b' }}>{a.fail_reason || '—'}</td>
                                    <td style={{ padding: '0.5rem 0.75rem', color: '#475569', fontSize: '0.72rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.user_agent}</td>
                                </tr>
                            ))}
                            {recentAttempts.length === 0 && (
                                <tr>
                                    <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>No recent login attempts</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Blocked IPs Tab */}
            {activeTab === 'blocked' && (
                <div>
                    {blockedIps.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                            <p>No IP addresses are currently blocked.</p>
                        </div>
                    ) : (
                        <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: '10px', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #1e293b', background: '#0f172a' }}>
                                        <th style={{ padding: '0.6rem 1rem', color: '#64748b', textAlign: 'left', fontSize: '0.75rem', textTransform: 'uppercase' }}>IP Address</th>
                                        <th style={{ padding: '0.6rem 1rem', color: '#64748b', textAlign: 'left', fontSize: '0.75rem', textTransform: 'uppercase' }}>Failed Attempts (7d)</th>
                                        <th style={{ padding: '0.6rem 1rem', textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {blockedIps.map(ip => {
                                        const count = recentAttempts.filter(a => a.ip_address === ip && !a.success).length;
                                        return (
                                            <tr key={ip} style={{ borderBottom: '1px solid #1e293b' }}>
                                                <td style={{ padding: '0.75rem 1rem' }}>
                                                    <code style={{ background: '#1e293b', padding: '2px 8px', borderRadius: '4px', color: '#fca5a5', fontSize: '0.875rem' }}>{ip}</code>
                                                </td>
                                                <td style={{ padding: '0.75rem 1rem', color: '#94a3b8' }}>{count || '—'}</td>
                                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                                                    <button onClick={() => unblockIp(ip)}
                                                        style={{ background: 'none', border: '1px solid #374151', color: '#9ca3af', borderRadius: '6px', padding: '4px 12px', cursor: 'pointer', fontSize: '0.8rem' }}>
                                                        Unblock
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value, color, icon }: { label: string; value: string | number; color: string; icon: string }) {
    return (
        <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: '8px', padding: '0.875rem 1rem' }}>
            <div style={{ color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>{icon} {label}</div>
            <div style={{ color, fontSize: '1.5rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
        </div>
    );
}

function ThreatCard({ threat, expanded, onToggle, onImplement, implementing, actionResults, scoreBar }: {
    threat: SecurityThreat;
    expanded: boolean;
    onToggle: () => void;
    onImplement: (id: string, action: any) => void;
    implementing: Record<string, boolean>;
    actionResults: Record<string, { ok: boolean; msg: string }>;
    scoreBar: (score: number) => React.ReactNode;
}) {
    const cfg = LEVEL_CONFIG[threat.level];
    return (
        <div style={{ background: '#111827', border: `1px solid ${expanded ? cfg.border : '#1e293b'}`, borderRadius: '10px', marginBottom: '0.75rem', overflow: 'hidden', transition: 'border-color 0.2s' }}>
            {/* Header row — always visible */}
            <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.875rem 1.1rem', cursor: 'pointer' }}>
                <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>{TYPE_ICONS[threat.type] || '⚠️'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '0.9rem' }}>{threat.title}</span>
                        <span style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, borderRadius: '4px', padding: '1px 6px', fontSize: '0.7rem', fontWeight: 700 }}>{cfg.label}</span>
                        <span style={{ color: '#64748b', fontSize: '0.75rem' }}>ML confidence: {(threat.mlScore * 100).toFixed(0)}%{scoreBar(threat.mlScore)}</span>
                    </div>
                    <div style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '0.15rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: expanded ? 'normal' : 'nowrap' }}>
                        {threat.affectedEntity} — {threat.description.slice(0, expanded ? undefined : 100)}{!expanded && threat.description.length > 100 ? '…' : ''}
                    </div>
                </div>
                <span style={{ color: '#64748b', fontSize: '0.8rem', flexShrink: 0 }}>{expanded ? '▲' : '▼'}</span>
            </div>

            {/* Expanded detail */}
            {expanded && (
                <div style={{ borderTop: `1px solid ${cfg.border}`, padding: '1rem 1.1rem', background: 'rgba(0,0,0,0.2)' }}>
                    {/* Full description */}
                    <p style={{ color: '#cbd5e1', fontSize: '0.875rem', lineHeight: '1.6', margin: '0 0 1rem' }}>{threat.description}</p>

                    {/* Evidence */}
                    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', padding: '0.75rem', marginBottom: '1rem', fontSize: '0.78rem' }}>
                        <div style={{ color: '#64748b', fontWeight: 600, marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Evidence</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {Object.entries(threat.evidence).filter(([k]) => !['dailyCounts'].includes(k)).map(([k, v]) => (
                                <span key={k} style={{ background: '#1e293b', color: '#94a3b8', borderRadius: '4px', padding: '2px 8px', fontSize: '0.75rem' }}>
                                    <strong style={{ color: '#cbd5e1' }}>{k}:</strong> {Array.isArray(v) ? v.join(', ') : String(v)}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Suggestions */}
                    <div style={{ color: '#64748b', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>
                        ML Suggested Fixes ({threat.suggestions.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {threat.suggestions.map(sug => {
                            const result = actionResults[sug.id];
                            const busy = implementing[sug.id];
                            return (
                                <div key={sug.id} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.2rem' }}>
                                            {sug.destructive && <span style={{ color: '#ef4444', marginRight: '4px' }}>⚠</span>}
                                            {sug.label}
                                        </div>
                                        <div style={{ color: '#64748b', fontSize: '0.8rem' }}>{sug.description}</div>
                                        {result && (
                                            <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: result.ok ? '#4ade80' : '#ef4444' }}>
                                                {result.ok ? '✓' : '✗'} {result.msg}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => onImplement(sug.id, sug.action)}
                                        disabled={busy || result?.ok === true}
                                        style={{
                                            background: result?.ok ? '#14532d' : sug.destructive ? '#7f1d1d' : '#1e3a5f',
                                            color: result?.ok ? '#86efac' : sug.destructive ? '#fca5a5' : '#93c5fd',
                                            border: `1px solid ${result?.ok ? '#16a34a' : sug.destructive ? '#dc2626' : '#1d4ed8'}`,
                                            borderRadius: '6px',
                                            padding: '0.45rem 1rem',
                                            cursor: busy || result?.ok ? 'not-allowed' : 'pointer',
                                            fontWeight: 600,
                                            fontSize: '0.8rem',
                                            flexShrink: 0,
                                            minWidth: '100px',
                                            opacity: busy ? 0.7 : 1,
                                        }}
                                    >
                                        {busy ? 'Applying…' : result?.ok ? 'Applied ✓' : 'Implement Fix'}
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#475569', textAlign: 'right' }}>
                        Detected: {new Date(threat.detectedAt).toLocaleString()}
                    </div>
                </div>
            )}
        </div>
    );
}

function LoginBarChart({ attempts }: { attempts: { attempted_at: string; success: boolean }[] }) {
    // Build 24 hourly buckets from the last 24h
    const now = Date.now();
    const failed = new Array(24).fill(0);
    const success = new Array(24).fill(0);

    for (const a of attempts) {
        const msAgo = now - new Date(a.attempted_at).getTime();
        const hoursAgo = Math.floor(msAgo / 3_600_000);
        if (hoursAgo < 0 || hoursAgo >= 24) continue;
        const bucket = 23 - hoursAgo;
        if (a.success) success[bucket]++;
        else failed[bucket]++;
    }

    const maxVal = Math.max(1, ...failed, ...success);

    return (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '80px' }}>
            {failed.map((f, i) => {
                const s = success[i];
                const total = f + s;
                return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%', position: 'relative', gap: '1px' }} title={`${24 - i}h ago — ${f} failed, ${s} success`}>
                        {s > 0 && <div style={{ height: `${(s / maxVal) * 100}%`, background: '#16a34a', borderRadius: '2px 2px 0 0', minHeight: '2px' }} />}
                        {f > 0 && <div style={{ height: `${(f / maxVal) * 100}%`, background: '#dc2626', borderRadius: s > 0 ? '0' : '2px 2px 0 0', minHeight: '2px' }} />}
                        {total === 0 && <div style={{ height: '2px', background: '#1e293b', borderRadius: '2px' }} />}
                    </div>
                );
            })}
            <div style={{ display: 'flex', gap: '1rem', position: 'absolute', right: '1.5rem', top: '0.5rem', fontSize: '0.72rem' }}>
                <span><span style={{ display: 'inline-block', width: '8px', height: '8px', background: '#22c55e', borderRadius: '2px', marginRight: '4px' }} />Success</span>
                <span><span style={{ display: 'inline-block', width: '8px', height: '8px', background: '#ef4444', borderRadius: '2px', marginRight: '4px' }} />Failed</span>
            </div>
        </div>
    );
}
