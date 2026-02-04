'use client';

import { useState } from 'react';

export default function BillingClient() {
    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold text-white mb-8">Billing & Invoices</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                {/* Current Plan Card */}
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
                    <h2 className="text-xl font-bold text-white mb-4">Current Subscription</h2>
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <p className="text-gray-400 text-sm uppercase">Plan</p>
                            <p className="text-2xl font-bold text-white">Advanced PRO</p>
                        </div>
                        <span className="bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-sm font-bold">
                            Active
                        </span>
                    </div>
                    <div className="space-y-2 mb-6 text-gray-400 text-sm">
                        <div className="flex justify-between">
                            <span>Cost</span>
                            <span className="text-white">$49.00 / month</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Next Billing Date</span>
                            <span className="text-white">Oct 14, 2024</span>
                        </div>
                    </div>
                    <button className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg font-medium transition-colors">
                        Manage Payment Method
                    </button>
                </div>

                {/* Billing History Card */}
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
                    <h2 className="text-xl font-bold text-white mb-4">Invoice History</h2>
                    <div className="overflow-hidden">
                        <table className="w-full text-left text-sm text-gray-400">
                            <thead className="bg-gray-900/50 uppercase text-xs">
                                <tr>
                                    <th className="py-2 px-3">Date</th>
                                    <th className="py-2 px-3">Amount</th>
                                    <th className="py-2 px-3">Status</th>
                                    <th className="py-2 px-3 text-right">PDF</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                <tr>
                                    <td className="py-3 px-3">Sep 14, 2024</td>
                                    <td className="py-3 px-3">$49.00</td>
                                    <td className="py-3 px-3"><span className="text-green-400">Paid</span></td>
                                    <td className="py-3 px-3 text-right"><button className="hover:text-white">⬇</button></td>
                                </tr>
                                <tr>
                                    <td className="py-3 px-3">Aug 14, 2024</td>
                                    <td className="py-3 px-3">$49.00</td>
                                    <td className="py-3 px-3"><span className="text-green-400">Paid</span></td>
                                    <td className="py-3 px-3 text-right"><button className="hover:text-white">⬇</button></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Payment Method Form Section (Mock) */}
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
                <h2 className="text-xl font-bold text-white mb-6">Payment Settings</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Billing Email</label>
                        <input type="email" className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white" defaultValue="admin@fosters.com" />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Tax ID / VAT</label>
                        <input type="text" className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white" />
                    </div>
                </div>
                <div className="mt-6">
                    <button className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded-lg font-medium">Save Changes</button>
                </div>
            </div>
        </div>
    );
}
