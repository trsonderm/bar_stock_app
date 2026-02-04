'use client';

import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    ComposedChart, Line, Area
} from 'recharts';

interface ChartProps {
    suggestions: any[];
    history?: any[];
    selectedItemName?: string;
}

export default function SmartOrderCharts({ suggestions, history, selectedItemName }: ChartProps) {
    if (suggestions.length === 0 && (!history || history.length === 0)) return null;

    // 0. History Chart Data
    const historyChart = history || [];

    // 1. Data for Supplier Spend Distribution
    const supplierData = suggestions.reduce((acc: any, s) => {
        const sup = s.supplier || 'Unassigned';
        const cost = parseFloat(s.estimated_cost);
        if (!acc[sup]) acc[sup] = { name: sup, value: 0 };
        acc[sup].value += cost;
        return acc;
    }, {});
    const supplierChartData = Object.values(supplierData).sort((a: any, b: any) => b.value - a.value);

    // 2. Data for Top Critical Items (Burn vs Stock)
    const topCritical = suggestions
        .sort((a, b) => parseFloat(b.days_until_empty) - parseFloat(a.days_until_empty)) // Actually reverse sort by urgency? No, urgency is low days.
        .filter(s => s.priority === 'CRITICAL')
        .slice(0, 5)
        .map(s => ({
            name: s.item_name,
            Stock: s.current_stock,
            BurnRate: parseFloat(s.burn_rate),
            DaysLeft: parseFloat(s.days_until_empty)
        }));

    return (
        <div className="space-y-8 print:hidden">
            {/* Chart 0: Product Trends (Full Width) */}
            {historyChart.length > 0 && (
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 shadow-lg">
                    <h3 className="text-lg font-bold text-white mb-4">
                        Trend Analysis: <span className="text-blue-400">{selectedItemName}</span>
                    </h3>
                    <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={historyChart}>
                                <defs>
                                    <linearGradient id="colorUsage" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                <XAxis dataKey="label" stroke="#9ca3af" minTickGap={30} />
                                <YAxis yAxisId="left" stroke="#9ca3af" />
                                <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" />
                                <Tooltip contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }} />
                                <Legend />
                                <Area yAxisId="left" type="monotone" dataKey="usage" stroke="#8884d8" fillOpacity={1} fill="url(#colorUsage)" name="Daily Usage" />
                                <Line yAxisId="left" type="monotone" dataKey="stock" stroke="#82ca9d" strokeWidth={3} dot={false} name="Stock Level" />
                                <Bar yAxisId="left" dataKey="restock" fill="#34d399" barSize={10} name="Restock" />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Chart 1: Estimated Spend by Supplier */}
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 shadow-lg">
                    <h3 className="text-lg font-bold text-white mb-4">Estimated Spend by Supplier</h3>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={supplierChartData} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                <XAxis type="number" stroke="#9ca3af" unit="$" />
                                <YAxis dataKey="name" type="category" stroke="#9ca3af" width={100} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }}
                                    cursor={{ fill: '#374151', opacity: 0.4 }}
                                />
                                <Bar dataKey="value" fill="#60a5fa" radius={[0, 4, 4, 0]} name="Est. Cost" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                        Visualizes total estimated cost grouped by supplier to help you plan POs.
                    </p>
                </div>

                {/* Chart 2: Critical Items Analysis */}
                {topCritical.length > 0 && (
                    <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 shadow-lg">
                        <h3 className="text-lg font-bold text-white mb-4">Critical Items Risk Analysis</h3>
                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={topCritical}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                    <XAxis dataKey="name" stroke="#9ca3af" scale="point" padding={{ left: 10, right: 10 }} />
                                    <YAxis yAxisId="left" stroke="#9ca3af" />
                                    <YAxis yAxisId="right" orientation="right" stroke="#ef4444" unit="d" />
                                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }} />
                                    <Legend />
                                    <Bar yAxisId="left" dataKey="Stock" fill="#34d399" name="Current Stock" barSize={20} />
                                    <Line yAxisId="right" type="monotone" dataKey="DaysLeft" stroke="#ef4444" strokeWidth={2} name="Days Until Empty" />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                        <p className="text-xs text-gray-400 mt-2">
                            Comparing current stock levels against remaining days of inventory.
                            <span className="text-red-400"> Red line</span> approaching zero indicates imminent stockout.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
