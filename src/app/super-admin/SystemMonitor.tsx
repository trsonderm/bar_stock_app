'use client';

import { useState, useEffect } from 'react';

export default function SystemMonitor() {
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await fetch('/api/super-admin/resources');
                const data = await res.json();
                if (!data.error) setStats(data);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
        // Poll every 10 seconds
        const interval = setInterval(fetchStats, 10000);
        return () => clearInterval(interval);
    }, []);

    if (loading) return <div className="animate-pulse bg-gray-800 h-32 rounded-xl"></div>;
    if (!stats) return null;

    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-800 border border-gray-700 p-4 rounded-xl">
                <h3 className="text-gray-400 text-xs uppercase font-bold mb-2">CPU Load</h3>
                <div className="flex items-end gap-2">
                    <span className="text-2xl font-bold text-white">{stats.cpu}%</span>
                    <div className="flex-1 h-2 bg-gray-700 rounded-full mb-1.5">
                        <div
                            className={`h-full rounded-full transition-all duration-500 ${parseFloat(stats.cpu) > 80 ? 'bg-red-500' : 'bg-blue-500'}`}
                            style={{ width: `${Math.min(parseFloat(stats.cpu), 100)}%` }}
                        ></div>
                    </div>
                </div>
            </div>

            <div className="bg-gray-800 border border-gray-700 p-4 rounded-xl">
                <h3 className="text-gray-400 text-xs uppercase font-bold mb-2">Memory Used</h3>
                <div className="flex items-end gap-2">
                    <span className="text-2xl font-bold text-white">{stats.mem.used} GB</span>
                    <span className="text-sm text-gray-500 mb-1">/ {stats.mem.total} GB</span>
                </div>
                <div className="w-full h-1 bg-gray-700 rounded-full mt-2">
                    <div
                        className="h-full bg-purple-500 rounded-full transition-all duration-500"
                        style={{ width: `${(parseFloat(stats.mem.used) / parseFloat(stats.mem.total)) * 100}%` }}
                    ></div>
                </div>
            </div>

            <div className="bg-gray-800 border border-gray-700 p-4 rounded-xl">
                <h3 className="text-gray-400 text-xs uppercase font-bold mb-2">Disk Usage</h3>
                <div className="flex items-end gap-2">
                    <span className="text-2xl font-bold text-white">{stats.disk.percent}%</span>
                    <span className="text-sm text-gray-500 mb-1">({stats.disk.used} GB Used)</span>
                </div>
            </div>

            <div className="bg-gray-800 border border-gray-700 p-4 rounded-xl">
                <h3 className="text-gray-400 text-xs uppercase font-bold mb-2">Uptime</h3>
                <span className="text-xl font-mono text-white">
                    {(stats.uptime / 3600).toFixed(1)} hrs
                </span>
            </div>
        </div>
    );
}
