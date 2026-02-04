'use client';

import { useState, useEffect } from 'react';
import { Trash2, Shield, RefreshCw } from 'lucide-react';

export default function LogsPage() {
    const [logs, setLogs] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [settings, setSettings] = useState({ logging_enabled: true, log_retention_days: '30' });
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);
    const limit = 50;

    const fetchLogs = async () => {
        const offset = page * limit;
        const res = await fetch(`/api/super-admin/logs?limit=${limit}&offset=${offset}`);
        const data = await res.json();
        if (data.logs) {
            setLogs(data.logs);
            setTotal(data.total);
            setSettings(data.settings);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchLogs();
    }, [page]);

    const handleSettingChange = async (key: string, val: any) => {
        const newSettings = { ...settings, [key]: val };
        setSettings(newSettings);
        await fetch('/api/super-admin/logs', {
            method: 'POST',
            body: JSON.stringify(newSettings)
        });
    };

    const handlePrune = async () => {
        if (!confirm(`Delete logs older than ${settings.log_retention_days} days?`)) return;
        const res = await fetch('/api/super-admin/logs', { method: 'DELETE' });
        if (res.ok) {
            alert('Logs pruned.');
            fetchLogs();
        } else {
            alert('Failed to prune.');
        }
    };

    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold text-white mb-8 flex items-center gap-3">
                <Shield className="text-amber-500" /> System Audit Logs
            </h1>

            {/* Settings Bar */}
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 mb-8 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-8">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <div className={`w-12 h-6 rounded-full p-1 transition-colors ${settings.logging_enabled ? 'bg-green-600' : 'bg-gray-600'}`}>
                            <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${settings.logging_enabled ? 'translate-x-6' : ''}`}></div>
                        </div>
                        <input
                            type="checkbox"
                            className="hidden"
                            checked={settings.logging_enabled}
                            onChange={e => handleSettingChange('logging_enabled', e.target.checked)}
                        />
                        <span className="text-white font-medium">Activity Logging Enabled</span>
                    </label>

                    <div className="flex items-center gap-3">
                        <span className="text-gray-400">Retention:</span>
                        <select
                            className="bg-gray-900 border border-gray-600 text-white rounded p-1"
                            value={settings.log_retention_days}
                            onChange={e => handleSettingChange('log_retention_days', e.target.value)}
                        >
                            <option value="7">1 Week</option>
                            <option value="14">2 Weeks</option>
                            <option value="30">1 Month</option>
                            <option value="90">3 Months</option>
                            <option value="365">1 Year</option>
                        </select>
                    </div>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={handlePrune}
                        className="flex items-center gap-2 bg-red-900/50 hover:bg-red-900 text-red-200 px-4 py-2 rounded-lg border border-red-800 transition-colors"
                    >
                        <Trash2 size={16} /> Prune Old Logs
                    </button>
                    <button
                        onClick={() => fetchLogs()}
                        className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
                    >
                        <RefreshCw size={16} /> Refresh
                    </button>
                </div>
            </div>

            {/* Log Table */}
            <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden shadow-2xl">
                <table className="w-full text-left">
                    <thead className="bg-gray-900/50 border-b border-gray-700">
                        <tr>
                            <th className="p-4 text-gray-400 font-medium">Time</th>
                            <th className="p-4 text-gray-400 font-medium">Action</th>
                            <th className="p-4 text-gray-400 font-medium">User</th>
                            <th className="p-4 text-gray-400 font-medium">Organization</th>
                            <th className="p-4 text-gray-400 font-medium">Details</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {loading ? (
                            <tr><td colSpan={5} className="p-8 text-center text-gray-500">Loading logs...</td></tr>
                        ) : logs.length === 0 ? (
                            <tr><td colSpan={5} className="p-8 text-center text-gray-500">No logs found.</td></tr>
                        ) : (
                            logs.map(log => (
                                <tr key={log.id} className="hover:bg-gray-700/50 transition-colors">
                                    <td className="p-4 text-gray-300 text-sm whitespace-nowrap">
                                        {new Date(log.timestamp).toLocaleString()}
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${log.action.includes('ADD') ? 'bg-green-900/50 text-green-400 border border-green-800' :
                                                log.action.includes('SUBTRACT') ? 'bg-red-900/50 text-red-400 border border-red-800' :
                                                    'bg-blue-900/50 text-blue-400 border border-blue-800'
                                            }`}>
                                            {log.action}
                                        </span>
                                    </td>
                                    <td className="p-4 text-white font-medium">
                                        {log.first_name ? `${log.first_name} ${log.last_name}` : 'Unknown'}
                                        <div className="text-xs text-gray-500">{log.email}</div>
                                    </td>
                                    <td className="p-4 text-gray-300">
                                        {log.org_name || 'System'}
                                    </td>
                                    <td className="p-4 text-gray-400 text-xs font-mono max-w-xs truncate" title={JSON.stringify(log.details)}>
                                        {typeof log.details === 'object' ? JSON.stringify(log.details) : log.details}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>

                {/* Pagination */}
                <div className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-between items-center text-gray-400 text-sm">
                    <div>
                        Showing {logs.length} of {total} logs
                    </div>
                    <div className="flex gap-2">
                        <button
                            disabled={page === 0}
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                            className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50"
                        >
                            Previous
                        </button>
                        <button
                            disabled={(page + 1) * limit >= total}
                            onClick={() => setPage(p => p + 1)}
                            className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
