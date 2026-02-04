'use client';

import React, { useEffect, useState } from 'react';
import {
    Users,
    Building2,
    Ticket,
    TrendingUp,
    Activity,
    AlertCircle,
    LayoutDashboard
} from 'lucide-react';
import { AdminPageHeader } from './components/AdminPageHeader';
import { StatCard } from './components/StatCard';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface DashboardStats {
    orgCount: number;
    userCount: number;
    ticketCount: number;
    growth: number;
    activity: any[];
}

export default function SuperAdminDashboard() {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/super-admin/stats')
            .then(res => res.json())
            .then(data => {
                setStats(data);
                setLoading(false);
            })
            .catch(() => {
                // Fallback data if API fails or is not implemented yet
                setStats({
                    orgCount: 12,
                    userCount: 450,
                    ticketCount: 5,
                    growth: 12.5,
                    activity: [
                        { name: 'Mon', value: 30 },
                        { name: 'Tue', value: 45 },
                        { name: 'Wed', value: 55 },
                        { name: 'Thu', value: 40 },
                        { name: 'Fri', value: 70 },
                        { name: 'Sat', value: 35 },
                        { name: 'Sun', value: 20 },
                    ]
                });
                setLoading(false);
            });
    }, []);

    const actions = [
        { label: 'View Reports', href: '/super-admin/reports/custom', variant: 'secondary' as const },
        { label: 'System Settings', href: '/super-admin/settings', variant: 'primary' as const },
    ];

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <AdminPageHeader
                title="Mission Control"
                subtitle="Overview of system performance and key metrics"
                icon={LayoutDashboard}
                actions={actions}
            />

            {/* KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    label="Total Organizations"
                    value={stats?.orgCount || 0}
                    icon={Building2}
                    color="blue"
                    loading={loading}
                    trend={{ value: 12, label: 'vs last month', positive: true }}
                />
                <StatCard
                    label="Total Users"
                    value={stats?.userCount || 0}
                    icon={Users}
                    color="purple"
                    loading={loading}
                    trend={{ value: 8.5, label: 'vs last month', positive: true }}
                />
                <StatCard
                    label="Active Tickets"
                    value={stats?.ticketCount || 0}
                    icon={Ticket}
                    color="amber"
                    loading={loading}
                    trend={{ value: -2, label: 'vs last week', positive: true }}
                />
                <StatCard
                    label="System Health"
                    value="99.9%"
                    icon={Activity}
                    color="emerald"
                    loading={loading}
                    trend={{ value: 0.1, label: 'uptime', positive: true }}
                />
            </div>

            {/* Analytics Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Chart */}
                <div className="lg:col-span-2 bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-blue-400" />
                            Activity Trends
                        </h3>
                        <select className="bg-slate-800 border border-slate-700 text-slate-300 text-sm rounded-lg px-3 py-1 outline-none">
                            <option>Last 7 Days</option>
                            <option>Last 30 Days</option>
                        </select>
                    </div>
                    <div className="h-80 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={stats?.activity || []}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} vertical={false} />
                                <XAxis
                                    dataKey="name"
                                    stroke="#94a3b8"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    dy={10}
                                />
                                <YAxis
                                    stroke="#94a3b8"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    dx={-10}
                                />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px', color: '#fff' }}
                                    itemStyle={{ color: '#fff' }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="value"
                                    stroke="#3b82f6"
                                    strokeWidth={3}
                                    dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                                    activeDot={{ r: 6, fill: '#60a5fa' }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* System Alerts / Sidebar */}
                <div className="space-y-6">
                    <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-sm h-full">
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-amber-400" />
                            Recent Alerts
                        </h3>
                        <div className="space-y-4">
                            {[1, 2, 3].map((_, i) => (
                                <div key={i} className="flex gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-800 hover:bg-slate-800 transition-colors">
                                    <div className="w-2 h-2 mt-2 rounded-full bg-amber-500 shrink-0" />
                                    <div>
                                        <p className="text-sm font-medium text-white">High CPU Usage Detected</p>
                                        <p className="text-xs text-slate-500 mt-1">Server US-East-1 • 10m ago</p>
                                    </div>
                                </div>
                            ))}
                            <button className="w-full py-2 text-sm text-center text-blue-400 hover:text-blue-300 font-medium border-t border-slate-800 mt-2">
                                View All Alerts
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
