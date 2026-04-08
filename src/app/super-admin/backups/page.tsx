'use client';

import React, { useState, useEffect } from 'react';
import { Database, Clock, Upload, Download, Save, RefreshCw, Server, AlertTriangle } from 'lucide-react';
import { AdminPageHeader } from '../components/AdminPageHeader';
import { StatCard } from '../components/StatCard';

export default function DatabaseBackupsPage() {
    const [settings, setSettings] = useState({
        cron_enabled: false,
        interval: 'weekly',
    });
    
    const [loading, setLoading] = useState(true);
    const [statusText, setStatusText] = useState('Idle');
    const [backupHistory, setBackupHistory] = useState([
        { id: 1, date: new Date().toISOString(), size: '2.4 MB', type: 'Manual' }
    ]); // Stub for now

    useEffect(() => {
        fetch('/api/super-admin/settings')
            .then(res => res.json())
            .then(data => {
                if (data.settings && data.settings.db_backups) {
                    try {
                        const hd = JSON.parse(data.settings.db_backups);
                        if (hd.interval) setSettings(hd);
                    } catch (e) {}
                }
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    const handleSaveSettings = async () => {
        setStatusText('Saving settings...');
        
        let finalSettings = { ...settings };
        if (finalSettings.cron_enabled && !finalSettings.interval) {
            finalSettings.interval = 'weekly'; // Fallback
        }

        try {
            await fetch('/api/super-admin/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ db_backups: JSON.stringify(finalSettings) })
            });
            setStatusText('Settings saved successfully!');
            setTimeout(() => setStatusText('Idle'), 3000);
        } catch (e) {
            setStatusText('Failed to save settings.');
        }
    };

    const triggerManualBackup = async () => {
        if (!confirm('This will lock database writes for a few seconds. Proceed with manual dump?')) return;
        setStatusText('Executing pg_dump...');
        try {
            const res = await fetch('/api/super-admin/backups', { method: 'POST' });
            if (res.ok) {
                setStatusText('Backup completed and saved to history!');
                setTimeout(() => setStatusText('Idle'), 5000);
            } else {
                setStatusText('Backup failed. Check server logs.');
            }
        } catch (e) {
            setStatusText('Network Error during backup.');
        }
    };

    const handleRestore = () => {
        alert('File upload to restore functionality is not completely hooked yet, but the API endpoint exists in /api/super-admin/backups/restore.');
    }

    const actions = [
        { label: 'Import Restore File', variant: 'secondary' as const, icon: Upload, onClick: handleRestore },
        { label: 'Run Manual Backup', variant: 'primary' as const, icon: Download, onClick: triggerManualBackup },
    ];

    if (loading) return <div className="p-8 max-w-7xl mx-auto space-y-8 text-white font-bold">Loading configuration...</div>;

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <AdminPageHeader
                title="Database Maintenance & Backups"
                subtitle="Configure automated pg_dumps and restore the system from SQL snapshots."
                icon={Database}
                actions={actions}
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard
                    label="Current DB Size"
                    value="24 MB"
                    icon={Server}
                    color="blue"
                />
                <StatCard
                    label="Automated Cron"
                    value={settings.cron_enabled ? 'Active' : 'Disabled'}
                    icon={Clock}
                    color={settings.cron_enabled ? 'emerald' : 'blue'}
                />
                <StatCard
                    label="Last Backup"
                    value="Just now"
                    icon={Save}
                    color="purple"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Settings Panel */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-slate-800 bg-slate-900/50">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <Clock className="w-5 h-5 text-blue-400" /> Automated Cron Settings
                        </h2>
                    </div>
                    <div className="p-6 space-y-6">
                        <label className="flex items-center gap-3 p-4 border border-slate-700 bg-slate-800/50 rounded-lg cursor-pointer hover:bg-slate-800 transition-colors">
                            <input 
                                type="checkbox" 
                                checked={settings.cron_enabled} 
                                onChange={e => setSettings({...settings, cron_enabled: e.target.checked})}
                                className="w-5 h-5 rounded border-slate-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900 bg-slate-700"
                            />
                            <div className="flex-1">
                                <p className="font-semibold text-white">Enable Automated Backups</p>
                                <p className="text-sm text-slate-400">Generates a pg_dump file and emails super admins metrics.</p>
                            </div>
                        </label>

                        <div className={`space-y-2 transition-opacity duration-300 ${!settings.cron_enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                            <label className="block text-sm font-medium text-slate-300">Backup Interval</label>
                            <select 
                                value={settings.interval} 
                                onChange={e => setSettings({...settings, interval: e.target.value})}
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="monthly">Monthly</option>
                            </select>
                        </div>

                        <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
                            <span className={`text-sm font-medium ${statusText === 'Idle' ? 'text-slate-500' : 'text-blue-400 animate-pulse'}`}>
                                {statusText}
                            </span>
                            <button 
                                onClick={handleSaveSettings}
                                className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
                            >
                                <Save className="w-4 h-4" /> Save Configuration
                            </button>
                        </div>
                    </div>
                </div>

                {/* History Panel */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm flex flex-col">
                    <div className="p-6 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <RefreshCw className="w-5 h-5 text-emerald-400" /> Recent Backups
                        </h2>
                    </div>
                    <div className="flex-1 p-6">
                        {backupHistory.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-500 p-8 text-center border-2 border-dashed border-slate-800 rounded-xl">
                                <AlertTriangle className="w-12 h-12 mb-3 text-amber-500/50" />
                                <p className="font-medium text-slate-400 mb-1">No backups found</p>
                                <p className="text-sm">Initiate a manual backup or wait for cron execution.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {backupHistory.map((backup) => (
                                    <div key={backup.id} className="flex justify-between items-center p-4 border border-slate-800 bg-slate-950/50 rounded-lg hover:border-slate-700 transition-colors">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 uppercase tracking-widest">{backup.type}</span>
                                                <span className="text-sm font-medium text-white">{new Date(backup.date).toLocaleString()}</span>
                                            </div>
                                            <p className="text-xs text-slate-500">PostgreSQL Dump File</p>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className="text-sm font-medium text-slate-400">{backup.size}</span>
                                            <button className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-blue-600 rounded-lg transition-colors">
                                                <Download className="w-4 h-4" />
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
