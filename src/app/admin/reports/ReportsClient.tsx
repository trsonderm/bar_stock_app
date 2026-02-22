'use client';

import { useState, useEffect } from 'react';
import { downloadCSV } from '@/lib/export';
import ReportingClient from '../reporting/ReportingClient';
import Link from 'next/link';
import ReportPreview from '@/components/ReportPreviews';

export default function ReportsClient() {
    const [reportType, setReportType] = useState('stock');
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'view' | 'builder' | 'preview_daily' | 'preview_lowstock'>('view');
    const [settings, setSettings] = useState<any>({});

    // Sample Toggle State
    const [showSample, setShowSample] = useState(false);

    // Fetch settings for threshold info
    useEffect(() => {
        fetch('/api/admin/settings').then(r => r.json()).then(d => {
            if (d.settings) setSettings(d.settings);
        });
    }, []);

    useEffect(() => {
        if (activeTab === 'view') {
            setLoading(true);
            fetch(`/api/admin/reports/${reportType}`)
                .then(res => res.json())
                .then(resData => {
                    setData(resData.data || []);
                    setLoading(false);
                });
        }
        // If preview tabs, we might want to fetch real data too to see if it exists
        if (activeTab === 'preview_daily') {
            // Try to fetch daily data... reused logic or new endpoint?
            // For now we simulate.
            setLoading(true);
            fetch('/api/admin/reports/daily-stock') // Assuming exists or consistent with 'view'
                .then(r => r.json())
                .then(d => {
                    // Check if enough data
                    if (!d.data || d.data.length === 0) setShowSample(true);
                    else {
                        setData(d.data);
                        setShowSample(false);
                    }
                    setLoading(false);
                }).catch(() => {
                    setShowSample(true);
                    setLoading(false);
                });
        }
        if (activeTab === 'preview_lowstock') {
            setLoading(true);
            fetch('/api/admin/reports/low-stock-alert')
                .then(r => r.json())
                .then(d => {
                    if (!d.data || d.data.length === 0) setShowSample(true);
                    setData(d.data || []);
                    setLoading(false);
                }).catch(() => {
                    setShowSample(true);
                    setLoading(false);
                });
        }

    }, [reportType, activeTab]);

    const handleExport = () => {
        downloadCSV(data, `${reportType}-report-${new Date().toISOString().split('T')[0]}.csv`);
    };

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold text-white">Analytics & Reports</h1>
                <div className="bg-gray-800 rounded-lg p-1 border border-gray-700 grid grid-flow-col gap-1">
                    <button
                        onClick={() => setActiveTab('view')}
                        className={`px-4 py-2 rounded font-bold transition-all text-sm whitespace-nowrap ${activeTab === 'view' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                    >
                        Standard Reports
                    </button>
                    <button
                        onClick={() => setActiveTab('preview_daily')}
                        className={`px-4 py-2 rounded font-bold transition-all text-sm whitespace-nowrap ${activeTab === 'preview_daily' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                    >
                        Daily Report Preview
                    </button>
                    <button
                        onClick={() => setActiveTab('preview_lowstock')}
                        className={`px-4 py-2 rounded font-bold transition-all text-sm whitespace-nowrap ${activeTab === 'preview_lowstock' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                    >
                        Low Stock Preview
                    </button>
                    <button
                        onClick={() => setActiveTab('builder')}
                        className={`px-4 py-2 rounded font-bold transition-all text-sm whitespace-nowrap ${activeTab === 'builder' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                    >
                        Custom Builder
                    </button>
                    <Link
                        href="/admin/reports/daily"
                        className="px-4 py-2 rounded font-bold transition-all text-gray-400 hover:text-white flex items-center gap-2 text-sm whitespace-nowrap bg-indigo-900/50 border border-indigo-700 ml-2"
                    >
                        <span>📅</span> Daily Report
                    </Link>
                    <Link
                        href="/admin/settings/reporting"
                        className="px-4 py-2 rounded font-bold transition-all text-gray-400 hover:text-white flex items-center gap-2 text-sm whitespace-nowrap bg-gray-900 border border-gray-700 ml-2"
                    >
                        <span>⚙️</span> Config
                    </Link>
                </div>
            </div>

            {activeTab === 'builder' && <ReportingClient />}

            {(activeTab === 'preview_daily' || activeTab === 'preview_lowstock') && (
                <div className="max-w-4xl mx-auto">
                    <ReportPreview
                        type={activeTab === 'preview_daily' ? 'DAILY' : 'LOW_STOCK'}
                        isSample={showSample}
                        showSampleToggle={true}
                        onToggleSample={setShowSample}
                        data={showSample ? null : data}
                        lowStockThreshold={settings.low_stock_threshold ? parseInt(settings.low_stock_threshold) : 5}
                    />
                </div>
            )}

            {activeTab === 'view' && (
                <>
                    <div className="flex justify-between items-center mb-6 bg-gray-800 p-4 rounded-xl border border-gray-700">
                        <div className="flex gap-4 items-center">
                            <span className="text-gray-400 font-bold">Report Type:</span>
                            <select
                                value={reportType}
                                onChange={e => setReportType(e.target.value)}
                                className="bg-gray-900 text-white border border-gray-600 rounded px-4 py-2 outline-none"
                            >
                                <option value="stock">Low Stock List</option>
                                <option value="usage">Usage Trends (30 Days)</option>
                            </select>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={handleExport}
                                disabled={loading || data.length === 0}
                                className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-4 py-2 rounded font-bold transition-colors flex items-center gap-2"
                            >
                                <span>⬇️</span> Export CSV
                            </button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="text-white p-12 text-center">Loading Report Data...</div>
                    ) : (
                        <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
                            {data.length === 0 ? (
                                <div className="p-12 text-center text-gray-500">No data found for this report.</div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm text-gray-400">
                                        <thead className="bg-gray-900/50 uppercase text-xs font-bold text-gray-300">
                                            <tr>
                                                {Object.keys(data[0]).map(key => (
                                                    <th key={key} className="py-4 px-6 border-b border-gray-700">{key.replace(/_/g, ' ')}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-700">
                                            {data.map((row, i) => (
                                                <tr key={i} className="hover:bg-gray-700/50 transition-colors">
                                                    {Object.values(row).map((val: any, j) => (
                                                        <td key={j} className="py-4 px-6 text-white border-b border-gray-700/50">
                                                            {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
