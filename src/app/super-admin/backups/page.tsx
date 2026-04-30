'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Database, Clock, Upload, Download, Save, RefreshCw, Server,
    AlertTriangle, RotateCcw, CheckCircle, XCircle, ChevronDown,
    ChevronRight, Table2, GitCommit, HardDrive, Layers, Info,
} from 'lucide-react';
import { AdminPageHeader } from '../components/AdminPageHeader';

interface TableStat {
    table_name: string;
    row_count: number;
    size: string;
}

interface BackupMeta {
    timestamp: string;
    backup_file: string;
    file_size: string;
    db_size: string;
    table_count: number;
    triggered_by: string;
    git_commit: string;
    git_message: string;
    tables: TableStat[] | null;
}

interface BackupFile {
    name: string;
    size: number;
    created: string;
    meta: BackupMeta | null;
}

function fmtSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function triggerBadge(t: string) {
    const map: Record<string, { label: string; color: string }> = {
        'pre-deploy': { label: 'Pre-Deploy', color: '#1d4ed8' },
        'scheduled':  { label: 'Scheduled',  color: '#7c3aed' },
        'manual':     { label: 'Manual',     color: '#374151' },
    };
    const m = map[t] || { label: t, color: '#374151' };
    return (
        <span style={{
            background: m.color, color: 'white', fontSize: '0.7rem', fontWeight: 700,
            padding: '2px 8px', borderRadius: '999px', whiteSpace: 'nowrap' as const,
        }}>{m.label}</span>
    );
}

function BackupDetail({ backup, onRestore, onDownload }: {
    backup: BackupFile;
    onRestore: (name: string) => void;
    onDownload: (name: string) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const m = backup.meta;
    const tables = m?.tables || [];
    const maxRows = tables.length > 0 ? Math.max(...tables.map(t => Number(t.row_count) || 0), 1) : 1;

    return (
        <div style={{
            background: '#111827', border: '1px solid #374151', borderRadius: '10px',
            marginBottom: '0.75rem', overflow: 'hidden',
        }}>
            {/* Header row */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.85rem 1rem', cursor: 'pointer',
            }} onClick={() => setExpanded(e => !e)}>
                <div style={{ color: '#6b7280' }}>
                    {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' as const }}>
                        <span style={{ color: 'white', fontSize: '0.875rem', fontWeight: 600, fontFamily: 'monospace' }}>
                            {backup.name}
                        </span>
                        {m && triggerBadge(m.triggered_by)}
                    </div>
                    <div style={{ color: '#9ca3af', fontSize: '0.75rem', marginTop: '2px', display: 'flex', gap: '1rem', flexWrap: 'wrap' as const }}>
                        <span><Clock size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />
                            {new Date(backup.created).toLocaleString()}
                        </span>
                        <span><HardDrive size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />
                            {fmtSize(backup.size)}
                        </span>
                        {m?.db_size && (
                            <span><Database size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />
                                DB: {m.db_size}
                            </span>
                        )}
                        {m?.table_count && (
                            <span><Table2 size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />
                                {m.table_count} tables
                            </span>
                        )}
                        {m?.git_commit && m.git_commit !== 'unknown' && (
                            <span><GitCommit size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />
                                {m.git_commit.slice(0, 8)} — {m.git_message?.slice(0, 50)}
                            </span>
                        )}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <button
                        onClick={() => onDownload(backup.name)}
                        title="Download"
                        style={{
                            padding: '6px', background: '#1f2937', border: '1px solid #374151',
                            borderRadius: '6px', color: '#9ca3af', cursor: 'pointer',
                        }}
                    >
                        <Download size={15} />
                    </button>
                    <button
                        onClick={() => onRestore(backup.name)}
                        title="Restore this backup"
                        style={{
                            padding: '6px 12px', background: '#7c2d12', border: '1px solid #9a3412',
                            borderRadius: '6px', color: '#fed7aa', cursor: 'pointer',
                            fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5,
                        }}
                    >
                        <RotateCcw size={13} /> Restore
                    </button>
                </div>
            </div>

            {/* Expanded detail */}
            {expanded && (
                <div style={{ borderTop: '1px solid #1f2937', padding: '1rem' }}>
                    {!m ? (
                        <div style={{ color: '#6b7280', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Info size={14} /> No metadata available for this backup (created before metadata tracking was added).
                        </div>
                    ) : (
                        <>
                            {/* Summary stats */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                                {[
                                    { label: 'Backup File Size', value: m.file_size, icon: HardDrive },
                                    { label: 'Database Size', value: m.db_size, icon: Database },
                                    { label: 'Tables', value: String(m.table_count), icon: Table2 },
                                    { label: 'Triggered By', value: m.triggered_by, icon: Layers },
                                    { label: 'Git Commit', value: m.git_commit?.slice(0, 8) || '—', icon: GitCommit },
                                ].map(s => {
                                    const Icon = s.icon;
                                    return (
                                        <div key={s.label} style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', padding: '0.75rem' }}>
                                            <div style={{ color: '#6b7280', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <Icon size={11} /> {s.label}
                                            </div>
                                            <div style={{ color: 'white', fontSize: '0.9rem', fontWeight: 700 }}>{s.value || '—'}</div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Table breakdown */}
                            {tables.length > 0 && (
                                <>
                                    <div style={{ color: '#9ca3af', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>
                                        Table Contents at Time of Backup
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {tables.map(t => {
                                            const pct = Math.round((Number(t.row_count) / maxRows) * 100);
                                            return (
                                                <div key={t.table_name} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                    <div style={{ width: '160px', color: '#e5e7eb', fontSize: '0.78rem', fontFamily: 'monospace', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                                                        {t.table_name}
                                                    </div>
                                                    <div style={{ flex: 1, height: '16px', background: '#1f2937', borderRadius: '4px', overflow: 'hidden' }}>
                                                        <div style={{
                                                            height: '100%', width: `${Math.max(pct, 1)}%`,
                                                            background: pct > 60 ? '#1d4ed8' : pct > 20 ? '#7c3aed' : '#374151',
                                                            borderRadius: '4px', transition: 'width 0.3s ease',
                                                        }} />
                                                    </div>
                                                    <div style={{ width: '80px', color: '#9ca3af', fontSize: '0.75rem', textAlign: 'right' as const, flexShrink: 0 }}>
                                                        {Number(t.row_count).toLocaleString()} rows
                                                    </div>
                                                    <div style={{ width: '55px', color: '#6b7280', fontSize: '0.72rem', textAlign: 'right' as const, flexShrink: 0 }}>
                                                        {t.size}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}

                            {m.git_message && (
                                <div style={{ marginTop: '1rem', padding: '0.6rem 0.9rem', background: '#1f2937', borderRadius: '6px', color: '#9ca3af', fontSize: '0.8rem', borderLeft: '3px solid #374151' }}>
                                    <span style={{ color: '#6b7280', fontWeight: 700 }}>Commit: </span>{m.git_message}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

export default function DatabaseBackupsPage() {
    const [cronEnabled, setCronEnabled] = useState(false);
    const [interval, setInterval_] = useState('weekly');
    const [backups, setBackups] = useState<BackupFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState<{ msg: string; type: 'idle' | 'working' | 'success' | 'error' }>({ msg: '', type: 'idle' });
    const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const setMsg = (msg: string, type: 'idle' | 'working' | 'success' | 'error' = 'idle') => setStatus({ msg, type });

    const loadBackups = useCallback(async () => {
        try {
            const res = await fetch('/api/super-admin/backups');
            const d = await res.json();
            if (d.backups) setBackups(d.backups);
        } catch {}
    }, []);

    useEffect(() => {
        Promise.all([
            fetch('/api/super-admin/settings').then(r => r.json()),
            fetch('/api/super-admin/backups').then(r => r.json()),
        ]).then(([settings, backupData]) => {
            if (settings.settings?.db_backups) {
                try {
                    const cfg = JSON.parse(settings.settings.db_backups);
                    if (typeof cfg.cron_enabled === 'boolean') setCronEnabled(cfg.cron_enabled);
                    if (cfg.interval) setInterval_(cfg.interval);
                } catch {}
            }
            if (backupData.backups) setBackups(backupData.backups);
        }).catch(() => {}).finally(() => setLoading(false));
    }, []);

    const saveSettings = async () => {
        setMsg('Saving...', 'working');
        try {
            await fetch('/api/super-admin/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ db_backups: JSON.stringify({ cron_enabled: cronEnabled, interval }) }),
            });
            setMsg('Settings saved.', 'success');
            setTimeout(() => setMsg(''), 3000);
        } catch {
            setMsg('Failed to save settings.', 'error');
        }
    };

    const runManualBackup = async () => {
        if (!confirm('Run a manual database backup now?')) return;
        setMsg('Running pg_dump...', 'working');
        try {
            const res = await fetch('/api/super-admin/backups', { method: 'POST' });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Unknown error');
            setMsg(`Backup complete: ${d.file}`, 'success');
            await loadBackups();
            setTimeout(() => setMsg(''), 5000);
        } catch (e: any) {
            setMsg(`Backup failed: ${e.message}`, 'error');
        }
    };

    const downloadBackup = (filename: string) => {
        window.location.href = `/api/super-admin/backups/download?file=${encodeURIComponent(filename)}`;
    };

    const restoreFromDisk = async (filename: string) => {
        if (!confirm(`Restore database from "${filename}"?\n\nThis will overwrite ALL current data. A safety backup will be taken first.`)) return;
        setRestoreTarget(filename);
        setMsg(`Restoring from ${filename}…`, 'working');
        try {
            const fd = new FormData();
            fd.append('filename', filename);
            const res = await fetch('/api/super-admin/backups/restore', { method: 'POST', body: fd });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Unknown error');
            setMsg('Restore completed successfully.', 'success');
            setTimeout(() => setMsg(''), 5000);
        } catch (e: any) {
            setMsg(`Restore failed: ${e.message}`, 'error');
        } finally {
            setRestoreTarget(null);
        }
    };

    const handleFileRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!confirm(`Restore database from uploaded file "${file.name}"?\n\nThis will overwrite ALL current data.`)) {
            e.target.value = '';
            return;
        }
        setMsg(`Uploading and restoring ${file.name}…`, 'working');
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetch('/api/super-admin/backups/restore', { method: 'POST', body: fd });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Unknown error');
            setMsg('Restore completed successfully.', 'success');
            setTimeout(() => setMsg(''), 5000);
        } catch (e: any) {
            setMsg(`Restore failed: ${e.message}`, 'error');
        } finally {
            e.target.value = '';
        }
    };

    // Group backups by month for display
    const grouped = backups.reduce((acc: Record<string, BackupFile[]>, b) => {
        const month = new Date(b.created).toLocaleString('default', { month: 'long', year: 'numeric' });
        if (!acc[month]) acc[month] = [];
        acc[month].push(b);
        return acc;
    }, {});

    if (loading) return <div className="p-8 text-white">Loading…</div>;

    const actions = [
        { label: 'Upload & Restore', variant: 'secondary' as const, icon: Upload, onClick: () => fileRef.current?.click() },
        { label: 'Run Manual Backup', variant: 'primary' as const, icon: Download, onClick: runManualBackup },
    ];

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <AdminPageHeader
                title="Database Backups"
                subtitle="Automated pg_dump snapshots with table-level detail. Expand any backup to see row counts and schema state."
                icon={Database}
                actions={actions}
            />

            <input ref={fileRef} type="file" accept=".sql,.sql.gz" className="hidden" onChange={handleFileRestore} />

            {status.msg && (
                <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium border ${
                    status.type === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-400' :
                    status.type === 'error'   ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                                               'bg-blue-500/10 border-blue-500/30 text-blue-400'
                }`}>
                    {status.type === 'success' && <CheckCircle className="w-4 h-4 shrink-0" />}
                    {status.type === 'error'   && <XCircle className="w-4 h-4 shrink-0" />}
                    {status.type === 'working' && <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />}
                    {status.msg}
                </div>
            )}

            {/* Settings */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="p-5 border-b border-slate-800 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-400" />
                    <h2 className="text-sm font-bold text-white uppercase tracking-wider">Automated Backup Schedule</h2>
                </div>
                <div className="p-5 flex flex-wrap items-center gap-5">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={cronEnabled} onChange={e => setCronEnabled(e.target.checked)}
                            className="w-4 h-4 rounded border-slate-600 text-blue-500 bg-slate-700" />
                        <span className="text-sm text-white font-medium">Enable Automated Backups</span>
                    </label>
                    <select value={interval} onChange={e => setInterval_(e.target.value)}
                        disabled={!cronEnabled}
                        className="bg-slate-800 border border-slate-700 rounded-lg p-2 text-white text-sm disabled:opacity-40 outline-none">
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                    </select>
                    <button onClick={saveSettings}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors">
                        <Save className="w-4 h-4" /> Save
                    </button>
                </div>
            </div>

            {/* Backup list */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Server className="w-5 h-5 text-emerald-400" /> Backup Snapshots
                        <span className="text-slate-500 text-sm font-normal">({backups.length} total)</span>
                    </h2>
                    <button onClick={loadBackups} className="text-slate-400 hover:text-white transition-colors p-1.5 rounded hover:bg-slate-800">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>

                {backups.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-slate-500 p-12 text-center border-2 border-dashed border-slate-800 rounded-xl">
                        <AlertTriangle className="w-10 h-10 mb-3 text-amber-500/50" />
                        <p className="font-medium text-slate-400 mb-1">No backups found</p>
                        <p className="text-sm">Run a manual backup or deploy to create the first snapshot.</p>
                    </div>
                ) : (
                    Object.entries(grouped).map(([month, files]) => (
                        <div key={month} className="mb-6">
                            <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 px-1">{month}</div>
                            {files.map(b => (
                                <BackupDetail
                                    key={b.name}
                                    backup={b}
                                    onRestore={restoreFromDisk}
                                    onDownload={downloadBackup}
                                />
                            ))}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
