'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Database, Clock, Upload, Download, Save, RefreshCw, Server, AlertTriangle, RotateCcw, CheckCircle, XCircle } from 'lucide-react';
import { AdminPageHeader } from '../components/AdminPageHeader';

interface BackupFile {
    name: string;
    size: number;
    created: string;
}

function fmtSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
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
        if (!confirm(`Restore database from "${filename}"? This will overwrite current data.`)) return;
        setRestoreTarget(filename);
        setMsg(`Restoring from ${filename}...`, 'working');
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
        if (!confirm(`Restore database from uploaded file "${file.name}"? This will overwrite current data.`)) {
            e.target.value = '';
            return;
        }
        setMsg(`Uploading and restoring ${file.name}...`, 'working');
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

    if (loading) return <div className="p-8 text-white">Loading...</div>;

    const actions = [
        {
            label: 'Upload & Restore',
            variant: 'secondary' as const,
            icon: Upload,
            onClick: () => fileRef.current?.click(),
        },
        {
            label: 'Run Manual Backup',
            variant: 'primary' as const,
            icon: Download,
            onClick: runManualBackup,
        },
    ];

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <AdminPageHeader
                title="Database Backups"
                subtitle="Configure automated pg_dump schedules and restore from SQL snapshots."
                icon={Database}
                actions={actions}
            />

            <input ref={fileRef} type="file" accept=".sql" className="hidden" onChange={handleFileRestore} />

            {status.msg && (
                <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium border ${
                    status.type === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-400' :
                    status.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                    'bg-blue-500/10 border-blue-500/30 text-blue-400'
                }`}>
                    {status.type === 'success' && <CheckCircle className="w-4 h-4 shrink-0" />}
                    {status.type === 'error' && <XCircle className="w-4 h-4 shrink-0" />}
                    {status.type === 'working' && <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />}
                    {status.msg}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Cron Settings */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-slate-800 bg-slate-900/50">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <Clock className="w-5 h-5 text-blue-400" /> Automated Backup Schedule
                        </h2>
                    </div>
                    <div className="p-6 space-y-6">
                        <label className="flex items-center gap-3 p-4 border border-slate-700 bg-slate-800/50 rounded-lg cursor-pointer hover:bg-slate-800 transition-colors">
                            <input
                                type="checkbox"
                                checked={cronEnabled}
                                onChange={e => setCronEnabled(e.target.checked)}
                                className="w-5 h-5 rounded border-slate-600 text-blue-500 bg-slate-700"
                            />
                            <div>
                                <p className="font-semibold text-white">Enable Automated Backups</p>
                                <p className="text-sm text-slate-400">The scheduler checks hourly and runs when the interval has elapsed.</p>
                            </div>
                        </label>

                        <div className={`space-y-2 transition-opacity ${!cronEnabled ? 'opacity-40 pointer-events-none' : ''}`}>
                            <label className="block text-sm font-medium text-slate-300">Backup Interval</label>
                            <select
                                value={interval}
                                onChange={e => setInterval_(e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="monthly">Monthly</option>
                            </select>
                        </div>

                        <div className="pt-4 border-t border-slate-800 flex justify-end">
                            <button
                                onClick={saveSettings}
                                className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
                            >
                                <Save className="w-4 h-4" /> Save Configuration
                            </button>
                        </div>
                    </div>
                </div>

                {/* Backup List */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm flex flex-col">
                    <div className="p-6 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <Server className="w-5 h-5 text-emerald-400" /> Backup Files
                        </h2>
                        <button onClick={loadBackups} className="text-slate-400 hover:text-white transition-colors">
                            <RefreshCw className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto max-h-96">
                        {backups.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-500 p-8 text-center border-2 border-dashed border-slate-800 rounded-xl">
                                <AlertTriangle className="w-10 h-10 mb-3 text-amber-500/50" />
                                <p className="font-medium text-slate-400 mb-1">No backups found</p>
                                <p className="text-sm">Run a manual backup or enable automated backups above.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {backups.map((b) => (
                                    <div key={b.name} className="flex items-center justify-between p-3 border border-slate-800 bg-slate-950/50 rounded-lg hover:border-slate-700 transition-colors gap-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-white truncate">{b.name}</p>
                                            <p className="text-xs text-slate-500 mt-0.5">
                                                {new Date(b.created).toLocaleString()} &middot; {fmtSize(b.size)}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <button
                                                onClick={() => downloadBackup(b.name)}
                                                title="Download"
                                                className="p-1.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-blue-600 rounded-lg transition-colors"
                                            >
                                                <Download className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => restoreFromDisk(b.name)}
                                                disabled={restoreTarget === b.name}
                                                title="Restore"
                                                className="p-1.5 text-slate-400 hover:text-amber-300 bg-slate-800 hover:bg-amber-600/20 rounded-lg transition-colors disabled:opacity-50"
                                            >
                                                <RotateCcw className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
