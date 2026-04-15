'use client';

import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    ComposedChart, Line, Area,
} from 'recharts';

interface ChartProps {
    suggestions: any[];
    history?: any[];
    selectedItemName?: string;
}

const TOOLTIP_STYLE = { backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' };
const GRID_STROKE = '#374151';

// Safe number coercion — prevents NaN from bubbling into recharts
const safeNum = (v: any): number => {
    const n = parseFloat(String(v));
    return isNaN(n) ? 0 : n;
};

export default function SmartOrderCharts({ suggestions, history, selectedItemName }: ChartProps) {
    // Explicitly pick only primitive fields — prevents {label,amount} objects from
    // leaking into recharts data via accidental spread of API response objects
    const historyChart = (history || []).map(d => ({
        label: typeof d.label === 'string' ? d.label : String(d.date ?? ''),
        stock: safeNum(d.stock),
        usage: safeNum(d.usage),
        restock: safeNum(d.restock),
    }));

    // Supplier spend — guard against NaN cost
    const supplierMap: Record<string, number> = {};
    suggestions.forEach(s => {
        const sup = s.supplier || 'Unassigned';
        const cost = safeNum(s.estimated_cost);
        supplierMap[sup] = (supplierMap[sup] || 0) + cost;
    });
    const supplierChartData = Object.entries(supplierMap)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

    // Critical items — sort by most urgent (fewest days left)
    const topCritical = [...suggestions]
        .filter(s => s.priority === 'CRITICAL')
        .sort((a, b) => safeNum(a.days_until_empty) - safeNum(b.days_until_empty))
        .slice(0, 5)
        .map(s => ({
            name: String(s.item_name),
            Stock: safeNum(s.current_stock),
            DaysLeft: safeNum(s.days_until_empty),
        }));

    const hasHistory = historyChart.length > 0;
    const hasSupplier = supplierChartData.length > 0;
    const hasCritical = topCritical.length > 0;

    if (!hasHistory && !hasSupplier && !hasCritical) return null;

    return (
        <div className="space-y-8 print:hidden">
            {/* Trend chart */}
            {hasHistory && (
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 shadow-lg">
                    <h3 className="text-lg font-bold text-white mb-4">
                        Trend Analysis: <span className="text-blue-400">{selectedItemName}</span>
                    </h3>
                    {/* Explicit pixel height avoids ResponsiveContainer width/height(-1) warning */}
                    <div style={{ width: '100%', height: 288 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={historyChart}>
                                <defs>
                                    <linearGradient id="colorUsage" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                                <XAxis dataKey="label" stroke="#9ca3af" minTickGap={30} />
                                <YAxis yAxisId="left" stroke="#9ca3af" />
                                <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" />
                                <Tooltip contentStyle={TOOLTIP_STYLE} />
                                <Legend />
                                <Area yAxisId="left" type="monotone" dataKey="usage" stroke="#8884d8"
                                    fillOpacity={1} fill="url(#colorUsage)" name="Daily Usage" />
                                <Line yAxisId="left" type="monotone" dataKey="stock" stroke="#82ca9d"
                                    strokeWidth={3} dot={false} name="Stock Level" />
                                <Bar yAxisId="left" dataKey="restock" fill="#34d399" barSize={10} name="Restock" />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Supplier spend */}
                {hasSupplier && (
                    <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 shadow-lg">
                        <h3 className="text-lg font-bold text-white mb-4">Estimated Spend by Supplier</h3>
                        <div style={{ width: '100%', height: 256 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={supplierChartData} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                                    <XAxis type="number" stroke="#9ca3af" unit="$" />
                                    <YAxis dataKey="name" type="category" stroke="#9ca3af" width={100} />
                                    <Tooltip
                                        contentStyle={TOOLTIP_STYLE}
                                        cursor={{ fill: '#374151', opacity: 0.4 }}
                                        formatter={(value: any) => [`$${safeNum(value).toFixed(2)}`, 'Est. Cost']}
                                    />
                                    <Bar dataKey="value" fill="#60a5fa" radius={[0, 4, 4, 0]} name="Est. Cost" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <p className="text-xs text-gray-400 mt-2">Total estimated cost grouped by supplier.</p>
                    </div>
                )}

                {/* Critical items */}
                {hasCritical && (
                    <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 shadow-lg">
                        <h3 className="text-lg font-bold text-white mb-4">Critical Items Risk Analysis</h3>
                        <div style={{ width: '100%', height: 256 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={topCritical}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                                    <XAxis dataKey="name" stroke="#9ca3af" scale="point" padding={{ left: 10, right: 10 }} />
                                    <YAxis yAxisId="left" stroke="#9ca3af" />
                                    <YAxis yAxisId="right" orientation="right" stroke="#ef4444" unit="d" />
                                    <Tooltip
                                        contentStyle={TOOLTIP_STYLE}
                                        formatter={(value: any, name: string | undefined) => [safeNum(value), name ?? '']}
                                    />
                                    <Legend />
                                    <Bar yAxisId="left" dataKey="Stock" fill="#34d399" name="Current Stock" barSize={20} />
                                    <Line yAxisId="right" type="monotone" dataKey="DaysLeft" stroke="#ef4444"
                                        strokeWidth={2} name="Days Until Empty" />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                        <p className="text-xs text-gray-400 mt-2">
                            <span className="text-red-400">Red line</span> approaching zero = imminent stockout.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
