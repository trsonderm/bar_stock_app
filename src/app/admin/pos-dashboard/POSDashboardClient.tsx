'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, TrendingUp, TrendingDown, CheckCircle, RefreshCw, Link, Settings } from 'lucide-react';
import NextLink from 'next/link';

interface AnalysisRow {
    pos_item_name: string;
    inventory_item_name: string | null;
    qty_sold: number;
    expected_oz: number;
    expected_oz_padded: number;
    actual_stock_used: number;
    deviation_pct: number;
    is_anomaly: boolean;
    anomaly_type: 'over' | 'under' | 'normal';
}

interface DashboardData {
    summary: { total_transactions: number; total_revenue: number; unique_items: number };
    analysis: AnalysisRow[];
    anomalyCount: number;
    unmappedCount: number;
    recentLogs: any[];
    modelSettings: { sensitivity: number; paddingPct: number; defaultOzPerShot: number };
    dateRange: { since: string; until: string; view: string };
}

export default function POSDashboardClient() {
    const [data, setData] = useState<DashboardData | null>(null);
    const [view, setView] = useState<'weekly' | 'monthly'>('weekly');
    const [sensitivity, setSensitivity] = useState(50);
    const [loading, setLoading] = useState(true);
    const [showAll, setShowAll] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        const res = await fetch(`/api/admin/pos/dashboard?view=${view}`);
        const d = await res.json();
        setData(d);
        if (d.modelSettings) setSensitivity(Math.round(d.modelSettings.sensitivity * 100));
        setLoading(false);
    }, [view]);

    useEffect(() => { load(); }, [load]);

    const displayed = data?.analysis
        ? (showAll ? data.analysis : data.analysis.filter(r => r.is_anomaly))
        : [];

    const anomalyColor = (type: string) => {
        if (type === 'over') return 'text-red-400';
        if (type === 'under') return 'text-amber-400';
        return 'text-green-400';
    };
    const anomalyIcon = (type: string) => {
        if (type === 'over') return <TrendingUp className="w-4 h-4 text-red-400" />;
        if (type === 'under') return <TrendingDown className="w-4 h-4 text-amber-400" />;
        return <CheckCircle className="w-4 h-4 text-green-400" />;
    };

    return (
        <div className="space-y-6 max-w-6xl">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-white">POS Analysis Dashboard</h1>
                    <p className="text-gray-400 text-sm mt-0.5">Compare POS sales against actual inventory usage to detect anomalies</p>
                </div>
                <div className="flex items-center gap-2">
                    <NextLink href="/admin/pos-dashboard/item-linking"
                        className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors border border-gray-700">
                        <Link className="w-4 h-4" /> Item Linking
                        {data?.unmappedCount ? <span className="ml-1 px-1.5 py-0.5 bg-amber-600 text-white rounded text-xs">{data.unmappedCount}</span> : null}
                    </NextLink>
                    <NextLink href="/admin/pos-dashboard/settings"
                        className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors border border-gray-700">
                        <Settings className="w-4 h-4" /> Model Settings
                    </NextLink>
                    <button type="button" onClick={load} className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-700 transition-colors">
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-4 flex-wrap">
                <div className="flex gap-1 bg-gray-900 border border-gray-700 p-1 rounded-lg">
                    {(['weekly', 'monthly'] as const).map(v => (
                        <button key={v} type="button" onClick={() => setView(v)}
                            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${view === v ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                            {v === 'weekly' ? 'This Week' : 'This Month'}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-3 flex-1 min-w-48">
                    <span className="text-gray-400 text-xs whitespace-nowrap">Detection Sensitivity</span>
                    <input type="range" min={0} max={100} value={sensitivity}
                        onChange={e => setSensitivity(Number(e.target.value))}
                        className="flex-1 accent-blue-500" />
                    <span className="text-white text-sm font-medium w-8 text-right">{sensitivity}%</span>
                </div>
                <span className="text-gray-500 text-xs">{sensitivity < 30 ? 'Lenient — major anomalies only' : sensitivity > 70 ? 'Strict — small deviations flagged' : 'Balanced'}</span>
            </div>

            {/* Summary Cards */}
            {data && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                        { label: 'Transactions', value: data.summary.total_transactions.toLocaleString(), sub: view === 'weekly' ? 'this week' : 'this month' },
                        { label: 'Revenue', value: `$${Number(data.summary.total_revenue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, sub: 'total sales' },
                        { label: 'Anomalies', value: data.anomalyCount.toString(), sub: 'items flagged', highlight: data.anomalyCount > 0 },
                        { label: 'Unmapped Items', value: data.unmappedCount.toString(), sub: 'need linking', highlight: data.unmappedCount > 0 },
                    ].map(card => (
                        <div key={card.label} className={`bg-gray-900 border rounded-xl p-4 ${card.highlight ? 'border-amber-700/50 bg-amber-950/20' : 'border-gray-700'}`}>
                            <p className="text-gray-400 text-xs uppercase tracking-wider">{card.label}</p>
                            <p className={`text-2xl font-bold mt-1 ${card.highlight ? 'text-amber-400' : 'text-white'}`}>{card.value}</p>
                            <p className="text-gray-500 text-xs mt-0.5">{card.sub}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Anomaly Table */}
            <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                        <h2 className="text-white font-semibold">
                            {showAll ? 'All Mapped Items' : `Anomalies (${data?.anomalyCount ?? 0})`}
                        </h2>
                    </div>
                    <button type="button" onClick={() => setShowAll(s => !s)}
                        className="text-gray-400 hover:text-white text-xs underline underline-offset-2">
                        {showAll ? 'Show anomalies only' : 'Show all items'}
                    </button>
                </div>

                {loading ? (
                    <div className="p-8 text-center text-gray-400">Loading analysis…</div>
                ) : displayed.length === 0 ? (
                    <div className="p-8 text-center text-gray-400">
                        {data?.unmappedCount ? (
                            <p>No anomalies found. {data.unmappedCount} items still need <NextLink href="/admin/pos-dashboard/item-linking" className="text-blue-400 hover:underline">inventory linking</NextLink>.</p>
                        ) : (
                            <p>No anomalies detected for this period.</p>
                        )}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase">
                                    <th className="text-left px-5 py-3 font-medium">POS Item</th>
                                    <th className="text-left px-5 py-3 font-medium">Inventory Item</th>
                                    <th className="text-right px-5 py-3 font-medium">Qty Sold</th>
                                    <th className="text-right px-5 py-3 font-medium">Expected oz</th>
                                    <th className="text-right px-5 py-3 font-medium">Actual oz Used</th>
                                    <th className="text-right px-5 py-3 font-medium">Deviation</th>
                                    <th className="text-center px-5 py-3 font-medium">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {displayed.map((row, i) => (
                                    <tr key={i} className={`hover:bg-gray-800/40 ${row.is_anomaly ? 'bg-amber-950/10' : ''}`}>
                                        <td className="px-5 py-3 text-white font-medium">{row.pos_item_name}</td>
                                        <td className="px-5 py-3 text-gray-300">{row.inventory_item_name || <span className="text-gray-600 italic">—</span>}</td>
                                        <td className="px-5 py-3 text-right text-gray-300">{Number(row.qty_sold).toFixed(1)}</td>
                                        <td className="px-5 py-3 text-right text-gray-300">{Number(row.expected_oz_padded).toFixed(1)}</td>
                                        <td className="px-5 py-3 text-right text-gray-300">{Number(row.actual_stock_used).toFixed(1)}</td>
                                        <td className={`px-5 py-3 text-right font-medium ${anomalyColor(row.anomaly_type)}`}>
                                            {row.deviation_pct}%
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center justify-center gap-1">
                                                {anomalyIcon(row.anomaly_type)}
                                                <span className={`text-xs ${anomalyColor(row.anomaly_type)}`}>
                                                    {row.anomaly_type === 'over' ? 'Over' : row.anomaly_type === 'under' ? 'Under' : 'OK'}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Recent Sync Status */}
            {data?.recentLogs && data.recentLogs.length > 0 && (
                <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
                    <h3 className="text-gray-400 text-xs uppercase tracking-wider mb-3">Last Sync</h3>
                    <div className="flex items-center gap-3">
                        {data.recentLogs[0].status === 'success'
                            ? <CheckCircle className="w-4 h-4 text-green-400" />
                            : <AlertTriangle className="w-4 h-4 text-red-400" />
                        }
                        <span className="text-gray-300 text-sm">
                            {data.recentLogs[0].pos_type} — {new Date(data.recentLogs[0].started_at).toLocaleString()}
                            {' · '}{data.recentLogs[0].records_inserted} new records
                        </span>
                        <NextLink href="/admin/settings/sync-pos" className="ml-auto text-blue-400 hover:underline text-xs">Sync settings →</NextLink>
                    </div>
                </div>
            )}
        </div>
    );
}
