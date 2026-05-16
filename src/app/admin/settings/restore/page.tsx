'use client';

import { useState, useEffect } from 'react';
import { RotateCcw, RefreshCw, AlertTriangle, CheckCircle, XCircle, Clock, Database } from 'lucide-react';

interface Snapshot {
    file: string;
    created: string;
    orgName?: string;
}

export default function DataRestorePage() {
    const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
    const [loading, setLoading] = useState(true);
    const [restoring, setRestoring] = useState<string | null>(null);
    const [status, setStatus] = useState<{ msg: string; type: 'idle' | 'working' | 'success' | 'error' }>({ msg: '', type: 'idle' });
    const [confirmed, setConfirmed] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/admin/backups')
            .then(r => r.json())
            .then(d => setSnapshots(d.snapshots || []))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const handleRestore = async (snapshotFile: string) => {
        if (confirmed !== snapshotFile) {
            setConfirmed(snapshotFile);
            return;
        }
        setConfirmed(null);
        setRestoring(snapshotFile);
        setStatus({ msg: 'Restoring data… this may take a moment.', type: 'working' });

        try {
            const res = await fetch('/api/admin/backups/restore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ snapshotFile }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Restore failed');
            setStatus({ msg: `Data restored successfully (${d.rowsRestored} records). Please reload the app.`, type: 'success' });
        } catch (e: any) {
            setStatus({ msg: `Restore failed: ${e.message}`, type: 'error' });
        } finally {
            setRestoring(null);
        }
    };

    const cancelConfirm = () => setConfirmed(null);

    return (
        <div style={{ padding: '2rem', maxWidth: '760px' }}>
            <div style={{ marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, color: 'white' }}>Data Restore</h1>
                <p style={{ color: '#9ca3af', marginTop: '0.4rem', fontSize: '0.9rem' }}>
                    Roll back your organization&apos;s data to a previous backup point. Items, inventory, settings, security lists, and more will be reverted. User accounts and billing are not affected.
                </p>
            </div>

            {/* Warning banner */}
            <div style={{
                background: '#1c1917', border: '1px solid #78350f',
                borderRadius: '10px', padding: '1rem 1.25rem',
                display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '2rem',
            }}>
                <AlertTriangle size={18} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 2 }} />
                <div>
                    <div style={{ color: '#fcd34d', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                        This action cannot be undone
                    </div>
                    <div style={{ color: '#d97706', fontSize: '0.825rem', lineHeight: '1.5' }}>
                        Restoring will permanently replace your current inventory, products, categories, locations, settings, suppliers, orders, and security data with the selected snapshot. A confirmation step is required before any restore proceeds.
                    </div>
                </div>
            </div>

            {status.msg && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                    padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.5rem',
                    fontSize: '0.875rem', fontWeight: 500,
                    background: status.type === 'success' ? '#052e16' : status.type === 'error' ? '#1c0a0a' : '#0c1a2e',
                    border: `1px solid ${status.type === 'success' ? '#16a34a50' : status.type === 'error' ? '#ef444450' : '#3b82f650'}`,
                    color: status.type === 'success' ? '#4ade80' : status.type === 'error' ? '#f87171' : '#93c5fd',
                }}>
                    {status.type === 'success' && <CheckCircle size={16} />}
                    {status.type === 'error'   && <XCircle size={16} />}
                    {status.type === 'working' && <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />}
                    {status.msg}
                </div>
            )}

            {loading ? (
                <div style={{ color: '#6b7280', padding: '3rem', textAlign: 'center' }}>
                    <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '0.5rem' }} />
                    <div>Loading available restore points…</div>
                </div>
            ) : snapshots.length === 0 ? (
                <div style={{
                    border: '2px dashed #374151', borderRadius: '10px',
                    padding: '3rem', textAlign: 'center', color: '#6b7280',
                }}>
                    <Database size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
                    <div style={{ fontWeight: 600, color: '#9ca3af', marginBottom: '0.4rem' }}>No restore points available</div>
                    <div style={{ fontSize: '0.85rem' }}>
                        Restore points are created automatically with each database backup. Contact your administrator if you need a restore.
                    </div>
                </div>
            ) : (
                <div>
                    <div style={{ color: '#9ca3af', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
                        Available Restore Points ({snapshots.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {snapshots.map((snap, i) => {
                            const isConfirming = confirmed === snap.file;
                            const isRestoring = restoring === snap.file;
                            const isDisabled = !!restoring;

                            return (
                                <div key={snap.file} style={{
                                    background: '#111827',
                                    border: `1px solid ${isConfirming ? '#f59e0b80' : '#374151'}`,
                                    borderRadius: '10px', padding: '1rem 1.25rem',
                                    transition: 'border-color 0.2s',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' as const }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                                                {i === 0 && (
                                                    <span style={{
                                                        background: '#1d4ed8', color: 'white',
                                                        fontSize: '0.65rem', fontWeight: 700,
                                                        padding: '2px 7px', borderRadius: '999px',
                                                    }}>LATEST</span>
                                                )}
                                                <span style={{ color: 'white', fontWeight: 600, fontSize: '0.925rem' }}>
                                                    {new Date(snap.created).toLocaleDateString('default', {
                                                        weekday: 'short', month: 'long', day: 'numeric', year: 'numeric',
                                                    })}
                                                </span>
                                            </div>
                                            <div style={{ color: '#6b7280', fontSize: '0.775rem', display: 'flex', alignItems: 'center', gap: 5 }}>
                                                <Clock size={11} />
                                                {new Date(snap.created).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                <span style={{ color: '#374151' }}>·</span>
                                                <span style={{ fontFamily: 'monospace', color: '#4b5563' }}>{snap.file.replace(/-org\d+\.json$/, '').replace('backup-', '')}</span>
                                            </div>
                                        </div>

                                        {isConfirming ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span style={{ color: '#f59e0b', fontSize: '0.8rem', fontWeight: 600 }}>Are you sure?</span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRestore(snap.file)}
                                                    style={{
                                                        padding: '6px 14px', background: '#7c2d12',
                                                        border: '1px solid #9a3412', borderRadius: '6px',
                                                        color: '#fed7aa', cursor: 'pointer',
                                                        fontSize: '0.8rem', fontWeight: 700,
                                                    }}
                                                >
                                                    Yes, Restore
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={cancelConfirm}
                                                    style={{
                                                        padding: '6px 12px', background: '#1f2937',
                                                        border: '1px solid #374151', borderRadius: '6px',
                                                        color: '#9ca3af', cursor: 'pointer', fontSize: '0.8rem',
                                                    }}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => handleRestore(snap.file)}
                                                disabled={isDisabled}
                                                style={{
                                                    padding: '7px 16px',
                                                    background: isRestoring ? '#374151' : '#1e3a5f',
                                                    border: '1px solid #1d4ed8', borderRadius: '6px',
                                                    color: '#93c5fd', cursor: isDisabled ? 'default' : 'pointer',
                                                    fontSize: '0.825rem', fontWeight: 600,
                                                    display: 'flex', alignItems: 'center', gap: 6,
                                                    opacity: isDisabled && !isRestoring ? 0.5 : 1,
                                                }}
                                            >
                                                {isRestoring
                                                    ? <><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Restoring…</>
                                                    : <><RotateCcw size={13} /> Restore to This Point</>
                                                }
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
