'use client';

import { useState, useEffect } from 'react';
import { ScrollText, RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react';

interface SyncLog {
    id: number;
    org_name: string;
    pos_type: string;
    started_at: string;
    completed_at: string | null;
    status: string;
    records_fetched: number;
    records_inserted: number;
    error_message: string | null;
    triggered_by: string;
}

export default function POSLogsClient() {
    const [logs, setLogs] = useState<SyncLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState({ pos_type: '', status: '' });

    useEffect(() => { load(); }, []);

    async function load() {
        setLoading(true);
        const params = new URLSearchParams({ limit: '200' });
        if (filter.pos_type) params.set('pos_type', filter.pos_type);
        const res = await fetch(`/api/super-admin/pos/logs?${params}`);
        const data = await res.json();
        setLogs(data.logs || []);
        setLoading(false);
    }

    const statusIcon = (s: string) => {
        if (s === 'success') return <CheckCircle className="w-4 h-4 text-green-400" />;
        if (s === 'error') return <XCircle className="w-4 h-4 text-red-400" />;
        return <Clock className="w-4 h-4 text-amber-400 animate-pulse" />;
    };

    const duration = (log: SyncLog) => {
        if (!log.completed_at) return '—';
        const ms = new Date(log.completed_at).getTime() - new Date(log.started_at).getTime();
        return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
    };

    return (
        <div className="p-8">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-700/50 rounded-xl flex items-center justify-center">
                        <ScrollText className="w-5 h-5 text-slate-300" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">POS Sync Logs</h1>
                        <p className="text-slate-400 text-sm">All POS synchronization events across organizations</p>
                    </div>
                </div>
                <button onClick={load} className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors">
                    <RefreshCw className="w-4 h-4" /> Refresh
                </button>
            </div>

            <div className="flex gap-3 mb-6">
                <select value={filter.pos_type} onChange={e => setFilter(f => ({ ...f, pos_type: e.target.value }))}
                    className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm">
                    <option value="">All POS Types</option>
                    <option value="toast">Toast</option>
                    <option value="clover">Clover</option>
                </select>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-slate-400">Loading…</div>
                ) : logs.length === 0 ? (
                    <div className="p-8 text-center text-slate-400">No sync logs found.</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-800">
                                {['Organization', 'POS', 'Triggered', 'Started', 'Duration', 'Fetched', 'Inserted', 'Status'].map(h => (
                                    <th key={h} className="text-left text-slate-400 text-xs uppercase tracking-wider px-4 py-3 font-medium">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {logs.map(log => (
                                <tr key={log.id} className="hover:bg-slate-800/30">
                                    <td className="px-4 py-3 text-white font-medium">{log.org_name}</td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                            log.pos_type === 'toast' ? 'bg-orange-900/40 text-orange-400' : 'bg-green-900/40 text-green-400'
                                        }`}>{log.pos_type}</span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-400 text-xs">{log.triggered_by}</td>
                                    <td className="px-4 py-3 text-slate-400 text-xs">
                                        {new Date(log.started_at).toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 text-slate-400 text-xs">{duration(log)}</td>
                                    <td className="px-4 py-3 text-slate-300">{log.records_fetched}</td>
                                    <td className="px-4 py-3 text-slate-300">{log.records_inserted}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1.5">
                                            {statusIcon(log.status)}
                                            <span className={`text-xs ${log.status === 'success' ? 'text-green-400' : log.status === 'error' ? 'text-red-400' : 'text-amber-400'}`}>
                                                {log.status}
                                            </span>
                                        </div>
                                        {log.error_message && (
                                            <p className="text-red-400/70 text-xs mt-0.5 max-w-xs truncate" title={log.error_message}>{log.error_message}</p>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
