'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SupplierDetailClient({ supplier, initialLinkedItems, allItems }: any) {
    const router = useRouter();
    const [linkedItems, setLinkedItems] = useState(initialLinkedItems);
    const [isAddOpen, setIsAddOpen] = useState(false);

    // Form State
    const [selectedItemId, setSelectedItemId] = useState('');
    const [cost, setCost] = useState('');
    const [sku, setSku] = useState('');
    const [isPreferred, setIsPreferred] = useState(true);

    const handleAddLink = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/admin/suppliers/items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    item_id: selectedItemId,
                    supplier_id: supplier.id,
                    cost: parseFloat(cost),
                    supplier_sku: sku,
                    is_preferred: isPreferred
                })
            });

            if (res.ok) {
                window.location.reload();
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleUnlink = async (itemId: number) => {
        if (!confirm('Remove this item from supplier?')) return;
        try {
            await fetch('/api/admin/suppliers/items', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ item_id: itemId, supplier_id: supplier.id })
            });
            window.location.reload();
        } catch (e) {
            console.error(e);
        }
    };

    // Filter out items already linked
    const availableItems = allItems.filter((i: any) => !linkedItems.find((l: any) => l.item_id === i.id));

    return (
        <div className="p-6">
            <div className="flex items-center gap-4 mb-6">
                <button
                    onClick={() => router.push('/admin/suppliers')}
                    className="text-gray-400 hover:text-white"
                >
                    &larr; Back
                </button>
                <h1 className="text-2xl font-bold text-white">{supplier.name} <span className="text-gray-500 font-normal">Items</span></h1>
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 shadow-lg">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-lg font-bold text-white">Catalog Pricing</h2>
                    <button
                        onClick={() => setIsAddOpen(true)}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm"
                    >
                        + Link Item
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-300">
                        <thead className="bg-gray-900/50 text-gray-400 uppercase text-xs">
                            <tr>
                                <th className="px-4 py-3 rounded-tl-lg">Item Name</th>
                                <th className="px-4 py-3">Supplier SKU</th>
                                <th className="px-4 py-3">Unit Cost</th>
                                <th className="px-4 py-3">Preferred</th>
                                <th className="px-4 py-3 rounded-tr-lg">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {linkedItems.map((item: any) => (
                                <tr key={item.item_id} className="hover:bg-gray-750">
                                    <td className="px-4 py-3 font-medium text-white">{item.item_name}</td>
                                    <td className="px-4 py-3">{item.supplier_sku || '-'}</td>
                                    <td className="px-4 py-3 text-green-400">${Number(item.cost_per_unit).toFixed(2)}</td>
                                    <td className="px-4 py-3">
                                        {item.is_preferred ? (
                                            <span className="text-green-500 text-xs bg-green-500/10 px-2 py-1 rounded border border-green-500/20">Primary</span>
                                        ) : (
                                            <span className="text-gray-500">-</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <button
                                            onClick={() => handleUnlink(item.item_id)}
                                            className="text-red-400 hover:text-red-300 hover:underline"
                                        >
                                            Unlink
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {linkedItems.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500 italic">
                                        No items linked to this supplier yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add Link Modal */}
            {isAddOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl p-6">
                        <h2 className="text-xl font-bold text-white mb-4">Link Item</h2>
                        <form onSubmit={handleAddLink} className="space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Select Item</label>
                                <select
                                    required
                                    value={selectedItemId}
                                    onChange={e => setSelectedItemId(e.target.value)}
                                    className="w-full bg-gray-800 border-gray-700 rounded-lg px-4 py-2 text-white outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="">-- Choose Item --</option>
                                    {availableItems.map((i: any) => (
                                        <option key={i.id} value={i.id}>{i.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Unit Cost ($)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        required
                                        value={cost}
                                        onChange={e => setCost(e.target.value)}
                                        className="w-full bg-gray-800 border-gray-700 rounded-lg px-4 py-2 text-white outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Supplier SKU</label>
                                    <input
                                        type="text"
                                        value={sku}
                                        onChange={e => setSku(e.target.value)}
                                        placeholder="Optional"
                                        className="w-full bg-gray-800 border-gray-700 rounded-lg px-4 py-2 text-white outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="pref"
                                    checked={isPreferred}
                                    onChange={e => setIsPreferred(e.target.checked)}
                                    className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                                />
                                <label htmlFor="pref" className="text-sm text-gray-300">Set as Preferred Supplier</label>
                            </div>

                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setIsAddOpen(false)}
                                    className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                                >
                                    Save Link
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
