'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Supplier {
    id: number;
    name: string;
    contact_email?: string;
    contact_phone?: string;
    delivery_days_json: any;
    order_days_json?: any; // New field
    lead_time_days: number;
}

interface Item {
    id: number;
    name: string;
}

interface ItemSupplierLink {
    item_id: number;
    item_name: string;
    cost: number;
    sku: string;
    is_preferred: boolean;
}

export default function SuppliersClient({ initialSuppliers, items }: { initialSuppliers: any[], items: any[] }) {
    const router = useRouter();
    const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    // Form State
    const [newName, setNewName] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [newPhone, setNewPhone] = useState('');
    const [newLeadTime, setNewLeadTime] = useState(1);
    const [selectedDays, setSelectedDays] = useState<string[]>([]); // Delivery Days
    const [selectedOrderDays, setSelectedOrderDays] = useState<string[]>([]); // Order Days

    const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    const toggleDay = (day: string) => {
        if (selectedDays.includes(day)) {
            setSelectedDays(selectedDays.filter(d => d !== day));
        } else {
            setSelectedDays([...selectedDays, day]);
        }
    };

    const toggleOrderDay = (day: string) => {
        if (selectedOrderDays.includes(day)) {
            setSelectedOrderDays(selectedOrderDays.filter(d => d !== day));
        } else {
            setSelectedOrderDays([...selectedOrderDays, day]);
        }
    };

    const hasExplicitSchedule = selectedDays.length > 0 && selectedOrderDays.length > 0;

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await fetch('/api/admin/suppliers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newName,
                    contact_email: newEmail,
                    contact_phone: newPhone,
                    delivery_days: selectedDays,
                    order_days: selectedOrderDays,
                    lead_time_days: hasExplicitSchedule ? 0 : newLeadTime // Ignore lead time if explicitly scheduled
                })
            });
            if (res.ok) {
                // Refresh
                router.refresh();
                setIsAddModalOpen(false);
                setNewName('');
                setNewEmail('');
                setNewPhone('');
                setSelectedDays([]);
                setSelectedOrderDays([]);
                // Reload to force update
                window.location.reload();
            } else {
                alert('Failed to create');
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white">Supplier Management</h1>
                    <p className="text-gray-400">Manage vendors, ordering windows, and delivery schedules</p>
                </div>
                <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                    <span>+ Add Supplier</span>
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {suppliers.map(sup => (
                    <div key={sup.id} className="bg-gray-800 border border-gray-700 rounded-xl p-5 shadow-lg">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-lg font-bold text-white">{sup.name}</h3>
                            <span className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded">
                                {sup.lead_time_days > 0 ? `${sup.lead_time_days} Day Lead` : 'Dynamic Sched'}
                            </span>
                        </div>

                        <div className="space-y-2 text-sm text-gray-400 mb-4">
                            <div className="flex items-center gap-2">
                                <span className="w-16">Email:</span>
                                <span className="text-white">{sup.contact_email || 'N/A'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-16">Phone:</span>
                                <span className="text-white">{sup.contact_phone || 'N/A'}</span>
                            </div>
                        </div>

                        <div className="mb-4 space-y-3">
                            <div>
                                <p className="text-xs text-green-400 uppercase font-semibold mb-2">Order Days</p>
                                <div className="flex flex-wrap gap-1">
                                    {(() => {
                                        let days = sup.order_days_json;
                                        if (typeof days === 'string') {
                                            try { days = JSON.parse(days); } catch { days = []; }
                                        }
                                        if (!Array.isArray(days)) days = [];

                                        if (days.length === 0) return <span className="text-gray-600 text-xs italic">N/A</span>;

                                        return days.map((day: string) => (
                                            <span key={day} className="bg-green-900/50 text-green-200 text-xs px-2 py-1 rounded border border-green-800">
                                                {day.substring(0, 3)}
                                            </span>
                                        ));
                                    })()}
                                </div>
                            </div>

                            <div>
                                <p className="text-xs text-blue-400 uppercase font-semibold mb-2">Delivery Days</p>
                                <div className="flex flex-wrap gap-1">
                                    {(() => {
                                        let days = sup.delivery_days_json;
                                        if (typeof days === 'string') {
                                            try { days = JSON.parse(days); } catch { days = []; }
                                        }
                                        if (!Array.isArray(days)) days = [];

                                        if (days.length === 0) return <span className="text-gray-600 text-xs italic">No set days</span>;

                                        return days.map((day: string) => (
                                            <span key={day} className="bg-blue-900/50 text-blue-200 text-xs px-2 py-1 rounded border border-blue-800">
                                                {day.substring(0, 3)}
                                            </span>
                                        ));
                                    })()}
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={() => router.push(`/admin/suppliers/${sup.id}`)}
                            className="w-full mt-2 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg text-sm transition-colors"
                        >
                            Manage Items
                        </button>
                    </div>
                ))}

                {suppliers.length === 0 && (
                    <div className="col-span-full py-12 text-center text-gray-500 bg-gray-900/50 rounded-xl border border-dashed border-gray-800">
                        <p>No suppliers found. Add one to get started.</p>
                    </div>
                )}
            </div>

            {/* Add Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold text-white mb-4">Add New Supplier</h2>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Supplier Name</label>
                                <input
                                    type="text"
                                    required
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    className="w-full bg-gray-800 border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Email</label>
                                    <input
                                        type="email"
                                        value={newEmail}
                                        onChange={e => setNewEmail(e.target.value)}
                                        className="w-full bg-gray-800 border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Phone</label>
                                    <input
                                        type="tel"
                                        value={newPhone}
                                        onChange={e => setNewPhone(e.target.value)}
                                        className="w-full bg-gray-800 border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm text-green-400 mb-2 font-bold">Order Days (When you Order)</label>
                                    <div className="flex flex-col gap-1">
                                        {daysOfWeek.map(day => (
                                            <button
                                                key={day}
                                                type="button"
                                                onClick={() => toggleOrderDay(day)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border text-left flex justify-between ${selectedOrderDays.includes(day)
                                                    ? 'bg-green-900/30 border-green-500 text-green-400'
                                                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                                                    }`}
                                            >
                                                {day} {selectedOrderDays.includes(day) && '✓'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm text-blue-400 mb-2 font-bold">Delivery Days (When it Arrives)</label>
                                    <div className="flex flex-col gap-1">
                                        {daysOfWeek.map(day => (
                                            <button
                                                key={day}
                                                type="button"
                                                onClick={() => toggleDay(day)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border text-left flex justify-between ${selectedDays.includes(day)
                                                    ? 'bg-blue-900/30 border-blue-500 text-blue-400'
                                                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                                                    }`}
                                            >
                                                {day} {selectedDays.includes(day) && '✓'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className={`transition-opacity ${hasExplicitSchedule ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                                <label className="block text-sm text-gray-400 mb-1">
                                    Lead Time (Days)
                                    {hasExplicitSchedule && <span className="ml-2 text-yellow-500 text-xs italic">(Calculated automatically from Order -&gt; Delivery days)</span>}
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    value={newLeadTime}
                                    onChange={e => setNewLeadTime(parseInt(e.target.value))}
                                    disabled={hasExplicitSchedule}
                                    className="w-full bg-gray-800 border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-900"
                                />
                            </div>

                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setIsAddModalOpen(false)}
                                    className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                                >
                                    {loading ? 'Saving...' : 'Create Supplier'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
