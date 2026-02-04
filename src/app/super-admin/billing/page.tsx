'use client';

import { useState, useEffect } from 'react';

export default function SuperAdminBilling() {
    const [stats, setStats] = useState({ revenue: 0, pending: 0, activeSubs: 0 });
    const [invoices, setInvoices] = useState<any[]>([]);

    useEffect(() => {
        // Mock data fetch effectively or real one
        // For MVP, we'll static mock or fetch real if endpoint existed.
        // Let's create the endpoint for this too? Or just mock for UI.
        // Real implementation is better.
        fetch('/api/super-admin/billing/stats')
            .then(res => res.json())
            .then(data => {
                if (data.stats) setStats(data.stats);
                if (data.invoices) setInvoices(data.invoices);
            });
    }, []);

    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold text-white mb-8">Global Revenue & Billing</h1>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
                    <h3 className="text-gray-400 font-bold uppercase text-xs mb-2">MRR (Monthly Recurring)</h3>
                    <p className="text-4xl font-bold text-white">${stats.revenue.toFixed(2)}</p>
                </div>
                <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
                    <h3 className="text-gray-400 font-bold uppercase text-xs mb-2">Pending Invoices</h3>
                    <p className="text-4xl font-bold text-yellow-500">${stats.pending.toFixed(2)}</p>
                </div>
                <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
                    <h3 className="text-gray-400 font-bold uppercase text-xs mb-2">Active Subscriptions</h3>
                    <p className="text-4xl font-bold text-blue-500">{stats.activeSubs}</p>
                </div>
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
                <div className="p-6 border-b border-gray-700">
                    <h2 className="text-xl font-bold text-white">Recent Invoices</h2>
                </div>
                <table className="w-full text-left text-sm text-gray-400">
                    <thead className="bg-gray-900/50 uppercase text-xs">
                        <tr>
                            <th className="py-3 px-6">Organization</th>
                            <th className="py-3 px-6">Date</th>
                            <th className="py-3 px-6">Amount</th>
                            <th className="py-3 px-6">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {invoices.map((inv: any) => (
                            <tr key={inv.id} className="hover:bg-gray-700/50">
                                <td className="py-3 px-6 text-white font-medium">{inv.organization_name}</td>
                                <td className="py-3 px-6">{new Date(inv.created_at).toLocaleDateString()}</td>
                                <td className="py-3 px-6">${Number(inv.amount).toFixed(2)}</td>
                                <td className="py-3 px-6">
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${inv.status === 'PAID' ? 'bg-green-500/20 text-green-400' :
                                            inv.status === 'PENDING' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'
                                        }`}>
                                        {inv.status}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
