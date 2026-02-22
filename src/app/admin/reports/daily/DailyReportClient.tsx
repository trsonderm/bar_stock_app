'use client';

import { useState, useEffect, useRef } from 'react';
import styles from '../../admin.module.css';
import DateRangePicker from '@/components/DateRangePicker';

interface ReportData {
    date: string;
    summary: {
        total_cost: number;
        total_items: number;
        top_user: string;
    };
    user_breakdown: Array<{ name: string, items: number, cost: number }>;
    item_breakdown: Array<{ name: string, quantity: number, cost: number }>;
    alerts: {
        low_stock: Array<{ name: string, quantity: number, low_stock_threshold: number }>;
        run_out: Array<{ name: string, quantity: number, reason: string }>;
    };
    is_preview: boolean;
}

export default function DailyReportClient() {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [data, setData] = useState<ReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const [showPicker, setShowPicker] = useState(false);

    // Close picker if clicked outside
    const pickerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
                setShowPicker(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/admin/reporting/daily?date=${date}`);
            const json = await res.json();
            if (json.error) {
                alert(json.error);
            } else {
                setData(json);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [date]);

    if (loading) return <div className="text-white text-center p-12">Loading Daily Report...</div>;
    if (!data) return <div className="text-white text-center p-12">Failed to load data.</div>;

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Daily Closing Report</h1>
                    <p className="text-gray-400">Overview of usage, costs, and stock health for the trading day.</p>
                </div>
                <div className="flex gap-4 items-center bg-gray-800 p-2 rounded-lg border border-gray-700 relative">
                    <label className="text-gray-400 text-sm font-bold">Select Date:</label>
                    <div className="relative" ref={pickerRef}>
                        <button
                            onClick={() => setShowPicker(!showPicker)}
                            className="bg-gray-900 overflow-hidden text-white border border-gray-600 rounded px-10 py-1 outline-none text-left min-w-[150px] relative font-mono text-sm shadow-inner hover:bg-gray-800 flex items-center justify-between"
                        >
                            <span className="absolute left-3 opacity-50">📅</span>
                            {date}
                            <span className="text-[10px] text-gray-500 ml-2">▼</span>
                        </button>

                        {showPicker && (
                            <div className="absolute top-10 right-0 z-50 shadow-2xl drop-shadow-2xl">
                                <DateRangePicker
                                    startDate={date}
                                    endDate={date}
                                    setStartDate={setDate}
                                    setEndDate={setDate}
                                    singleDayOnly={true}
                                    onDateSelect={() => setShowPicker(false)}
                                />
                            </div>
                        )}
                    </div>

                    <button
                        onClick={fetchData}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded font-bold text-sm"
                    >
                        Refresh
                    </button>
                </div>
            </div>

            {/* Preview Banner */}
            {data.is_preview && (
                <div className="bg-gradient-to-r from-indigo-900 to-purple-900 border border-indigo-500 rounded-lg p-4 mb-8 flex justify-between items-center shadow-lg">
                    <div>
                        <h3 className="font-bold text-white text-lg flex items-center gap-2">
                            ✨ Preview Mode Active
                        </h3>
                        <p className="text-indigo-200 text-sm">
                            No data found for this date yet. Showing sample data to demonstrate report capabilities.
                        </p>
                    </div>
                    <div className="bg-white/10 px-4 py-2 rounded text-indigo-100 text-xs font-mono">
                        FAKE DATA
                    </div>
                </div>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-gray-800 border border-gray-700 p-6 rounded-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <span className="text-6xl">💰</span>
                    </div>
                    <h3 className="text-gray-400 font-bold text-sm uppercase mb-1">Total Bottle Cost</h3>
                    <p className="text-4xl font-bold text-white">${data.summary.total_cost.toFixed(2)}</p>
                    {/* <p className="text-green-500 text-xs mt-2 font-bold">+0% vs yesterday</p> */}
                </div>
                <div className="bg-gray-800 border border-gray-700 p-6 rounded-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <span className="text-6xl">📦</span>
                    </div>
                    <h3 className="text-gray-400 font-bold text-sm uppercase mb-1">Items Used</h3>
                    <p className="text-4xl font-bold text-white">{data.summary.total_items}</p>
                    <p className="text-gray-500 text-xs mt-2">Units subtracted from stock</p>
                </div>
                <div className="bg-gray-800 border border-gray-700 p-6 rounded-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <span className="text-6xl">🏆</span>
                    </div>
                    <h3 className="text-gray-400 font-bold text-sm uppercase mb-1">Top User</h3>
                    <p className="text-4xl font-bold text-white truncate">{data.summary.top_user}</p>
                    <p className="text-indigo-400 text-xs mt-2 font-bold">Highest value moved</p>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">

                {/* User Breakdown */}
                <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-gray-700 bg-gray-900/50 flex justify-between items-center">
                        <h3 className="font-bold text-white">User Performance</h3>
                        <span className="text-xs text-gray-400">Sorted by Usage Value</span>
                    </div>
                    <div className="overflow-x-auto flex-1">
                        <table className="w-full text-left">
                            <thead className="bg-gray-900/30 text-xs text-gray-400 uppercase font-bold">
                                <tr>
                                    <th className="p-4">User</th>
                                    <th className="p-4 text-center">Items</th>
                                    <th className="p-4 text-right">Value Used</th>
                                    <th className="p-4 w-24">% of Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {data.user_breakdown.map((u, i) => (
                                    <tr key={i} className="hover:bg-white/5 transition-colors">
                                        <td className="p-4 font-medium text-white">{u.name}</td>
                                        <td className="p-4 text-center text-gray-300">{u.items}</td>
                                        <td className="p-4 text-right font-mono text-green-400">${u.cost.toFixed(2)}</td>
                                        <td className="p-4">
                                            <div className="w-full bg-gray-700 rounded-full h-1.5">
                                                <div
                                                    className="bg-purple-500 h-1.5 rounded-full"
                                                    style={{ width: `${Math.min(100, (u.cost / (data.summary.total_cost || 1)) * 100)}%` }}
                                                ></div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {data.user_breakdown.length === 0 && (
                                    <tr><td colSpan={4} className="p-8 text-center text-gray-500">No user activity recorded.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Item Summary */}
                <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-gray-700 bg-gray-900/50 flex justify-between items-center">
                        <h3 className="font-bold text-white">Item Usage Summary</h3>
                        <span className="text-xs text-gray-400">Sorted by Cost</span>
                    </div>
                    <div className="overflow-x-auto flex-1">
                        <table className="w-full text-left">
                            <thead className="bg-gray-900/30 text-xs text-gray-400 uppercase font-bold">
                                <tr>
                                    <th className="p-4">Item Name</th>
                                    <th className="p-4 text-center">Qty Used</th>
                                    <th className="p-4 text-right">Total Cost</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {data.item_breakdown.slice(0, 10).map((item, i) => (
                                    <tr key={i} className="hover:bg-white/5 transition-colors">
                                        <td className="p-4 font-medium text-white">{item.name}</td>
                                        <td className="p-4 text-center text-gray-300">{item.quantity}</td>
                                        <td className="p-4 text-right font-mono text-orange-400">${item.cost.toFixed(2)}</td>
                                    </tr>
                                ))}
                                {data.item_breakdown.length > 10 && (
                                    <tr>
                                        <td colSpan={3} className="p-3 text-center text-gray-500 text-sm italic">
                                            + {data.item_breakdown.length - 10} more items
                                        </td>
                                    </tr>
                                )}
                                {data.item_breakdown.length === 0 && (
                                    <tr><td colSpan={3} className="p-8 text-center text-gray-500">No items used.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Alerts Section */}
            <h2 className="text-xl font-bold text-white mb-4">Daily Stock Alerts</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Low Stock */}
                <div className="bg-red-900/20 border border-red-900/50 rounded-xl p-6">
                    <h3 className="text-red-400 font-bold mb-4 flex items-center gap-2">
                        <span>⚠️</span> Low Stock Warnings
                    </h3>
                    <div className="grid gap-2">
                        {data.alerts.low_stock.length > 0 ? (
                            data.alerts.low_stock.slice(0, 5).map((a, i) => (
                                <div key={i} className="flex justify-between items-center bg-red-950/30 p-2 rounded">
                                    <span className="text-white font-medium">{a.name}</span>
                                    <span className="text-red-300 text-sm font-bold">
                                        {a.quantity} left <span className="opacity-50 text-xs">(Limit: {a.low_stock_threshold})</span>
                                    </span>
                                </div>
                            ))
                        ) : (
                            <div className="text-gray-500 text-sm">No items below threshold.</div>
                        )}
                        {data.alerts.low_stock.length > 5 && (
                            <div className="text-center text-xs text-red-300 mt-2">+ {data.alerts.low_stock.length - 5} more</div>
                        )}
                    </div>
                </div>

                {/* Run Out Prediction */}
                <div className="bg-orange-900/20 border border-orange-900/50 rounded-xl p-6">
                    <h3 className="text-orange-400 font-bold mb-4 flex items-center gap-2">
                        <span>📉</span> Critical Run-Out Risk
                    </h3>
                    <div className="grid gap-2">
                        {data.alerts.run_out.length > 0 ? (
                            data.alerts.run_out.slice(0, 5).map((a, i) => (
                                <div key={i} className="flex justify-between items-center bg-orange-950/30 p-2 rounded">
                                    <span className="text-white font-medium">{a.name}</span>
                                    <span className="text-orange-300 text-sm font-bold">
                                        {a.quantity} left <span className="opacity-50 text-xs">({a.reason})</span>
                                    </span>
                                </div>
                            ))
                        ) : (
                            <div className="text-gray-500 text-sm">No critical run-out risks detected.</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
