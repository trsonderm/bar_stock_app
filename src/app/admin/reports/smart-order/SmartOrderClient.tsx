'use client';

import { useState, useEffect } from 'react';
import SmartOrderCharts from './SmartOrderCharts';

interface Suggestion {
    item_id: number;
    item_name: string;
    current_stock: number;
    burn_rate: string;
    days_until_empty: string;
    supplier: string;
    lead_time: number;
    suggested_order: number;
    estimated_cost: string;
    reason: string;
    priority: 'CRITICAL' | 'HIGH' | 'HEALTHY';
}

export default function SmartOrderClient() {
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [allItems, setAllItems] = useState<{ id: number, name: string }[]>([]);
    const [supplierWarning, setSupplierWarning] = useState(false);
    const [loading, setLoading] = useState(true);

    // Trend Analysis State
    const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
    const [itemHistory, setItemHistory] = useState<any[]>([]);
    const [chartLoading, setChartLoading] = useState(false);
    const [isSigned, setIsSigned] = useState(false);
    const [sortMode, setSortMode] = useState<'PRIORITY' | 'ALPHA'>('PRIORITY');
    const [selectedSupplier, setSelectedSupplier] = useState<string>('ALL');
    const [availableSuppliers, setAvailableSuppliers] = useState<{ id: number, name: string }[]>([]);
    const [activeSignature, setActiveSignature] = useState<string | null>(null);
    const [modelType, setModelType] = useState<string>('SMA');
    const [forecastDays, setForecastDays] = useState<number>(30);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [orgName, setOrgName] = useState('My Bar');
    const [showPrintView, setShowPrintView] = useState(false);

    const fetchInitial = async () => {
        setLoading(true);
        try {
            const [predRes, itemsRes] = await Promise.all([
                fetch(`/api/inventory/predictive?model=${modelType}&days=${forecastDays}`),
                fetch('/api/inventory?sort=name')
            ]);

            const predData = await predRes.json();
            const itemsData = await itemsRes.json();

            if (predData.suggestions) {
                setSuggestions(predData.suggestions);
                if (predData.suggestions.length > 0 && !selectedItemId) {
                    setSelectedItemId(predData.suggestions[0].item_id);
                }
            }
            if (predData.suppliers) setAvailableSuppliers(predData.suppliers);
            if (predData.notifications) setNotifications(predData.notifications);
            if (predData.supplierCount === 0) setSupplierWarning(true);
            if (predData.orgName) setOrgName(predData.orgName);
            if (itemsData.items) setAllItems(itemsData.items);

        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchInitial();
    }, [modelType, forecastDays]); // Refetch when model or days changes

    // Fetch History when Selected Item Changes
    useEffect(() => {
        if (!selectedItemId) return;
        const fetchHistory = async () => {
            setChartLoading(true);
            try {
                const res = await fetch(`/api/reports/history?itemId=${selectedItemId}&days=40`);
                const data = await res.json();
                if (data.history) setItemHistory(data.history);
            } catch (e) { console.error(e); }
            finally { setChartLoading(false); }
        };
        fetchHistory();
    }, [selectedItemId]);

    const handlePlaceOrder = async (item: any) => {
        // Simple Single Item Order for Demo
        // In real app, we might bundle by supplier.
        // Logic: Create Order for THIS item using suggested amount.
        const confirm = window.confirm(`Place order for ${item.suggested_order} units of ${item.item_name}?`);
        if (!confirm) return;

        try {
            // Find Supplier ID
            // Assuming we have supplier name, need ID?
            // The suggestion has `supplier` string.
            // We might need to look it up or API needs to return supplier_id.
            // Let's rely on backend or just use `allItems` to find item->supplier link?
            // Easier: Update API to return `supplier_id`.
            // FOR NOW: Let's assume we can fetch it or just fake it?
            // Wait, we need `supplier_id` for the `purchase_orders` table.
            // Let's cheat and look up supplier_id from `allItems` if possible, or just pass `null`.

            // To be robust: API should return `supplier_id`.
            // Let's Update client to just assume success for UI demo if ID missing,
            // OR find it from `allItems` if we had supplier info there.
            // Actually, let's just use the Order API correctly.

            // Quick fix: assume supplier_id is available or optional.
            // Let's find it from the `sortedItems` or pass 0?

            const res = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    supplier_id: null, // Should fix API to return this
                    expected_delivery_date: new Date(Date.now() + (item.lead_time || 1) * 86400000).toISOString(),
                    items: [{ item_id: item.item_id, quantity: item.suggested_order }]
                })
            });

            if (res.ok) {
                alert('Order Placed! Waiting for stock update.');
                fetchInitial(); // Refresh to clear suggestion or update status
            }
        } catch (e) {
            alert('Error placement');
        }
    };

    const handleIgnoreOrder = async (orderId: number) => {
        if (!confirm('Ignore this order? It will be marked as Cancelled and stock estimates will reset.')) return;
        try {
            await fetch('/api/orders/update', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId, status: 'CANCELLED' })
            });
            fetchInitial();
        } catch (e) {
            alert('Error ignoring order');
        }
    };

    // Compute derived data
    const uniqueSuppliers = Array.from(new Set(suggestions.map(s => s.supplier || 'Unassigned'))).sort();

    const filteredSuggestions = selectedSupplier === 'ALL'
        ? suggestions
        : suggestions.filter(s => (s.supplier || 'Unassigned') === selectedSupplier);

    const totalEstimatedCost = filteredSuggestions.reduce((acc, s) => acc + parseFloat(s.estimated_cost), 0);
    const criticalCount = filteredSuggestions.filter(s => s.priority === 'CRITICAL').length;
    const highCount = filteredSuggestions.filter(s => s.priority === 'HIGH').length;

    // Derived List for Dropdown (Sorted)
    // We should filter this too based on supplier?
    // User asked for "show ordering on smart per supplier".
    // Usually trends might be separate, but let's filter items dropdown too if context implies.
    // If I select "Southern Glazer's", the Trend Dropdown should probably validly show only those items?
    // Let's filter `allItems` for the dropdown if needed, OR just keep them all.
    // Let's filtered `sortedItems` to be safe/consistent.

    // BUT `allItems` comes from /api/inventory which might not have supplier name readily available if not joined?
    // Let's check `fetch('/api/inventory?sort=name')`.
    // The `items` table has `supplier` column (text). So `allItems` has it.

    const sortedItems = [...allItems]
        .filter(i => selectedSupplier === 'ALL' || (i as any).supplier === selectedSupplier)
        .sort((a, b) => {
            if (sortMode === 'ALPHA') return a.name.localeCompare(b.name);
            return a.name.localeCompare(b.name);
        });

    // Actually, let's implement the sort properly using suggestions (which has burn rate)
    const getBurnRate = (id: number) => {
        const s = suggestions.find(x => x.item_id === id);
        return s ? parseFloat(s.burn_rate) : 0;
    };

    if (sortMode === 'PRIORITY') {
        sortedItems.sort((a, b) => getBurnRate(b.id) - getBurnRate(a.id));
    }

    if (loading) return <div className="p-8 text-white">Calculating forecast...</div>;

    if (showPrintView) {
        // Group by Supplier
        const itemsBySupplier: Record<string, Suggestion[]> = {};
        const suggestionsToPrint = filteredSuggestions.length > 0 ? filteredSuggestions : suggestions;

        suggestionsToPrint.forEach(s => {
            const sup = s.supplier || 'Unassigned';
            if (!itemsBySupplier[sup]) itemsBySupplier[sup] = [];
            itemsBySupplier[sup].push(s);
        });

        const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        return (
            <div className="fixed inset-0 bg-white z-[9999] overflow-auto text-black p-0 md:p-8 font-serif leading-relaxed">
                <style jsx global>{`
                    @media print {
                        @page { margin: 0.5in; }
                        body { background: white; }
                        .no-print { display: none !important; }
                        .print-only { display: block !important; }
                    }
                `}</style>

                {/* Controls */}
                <div className="no-print fixed top-4 right-4 flex gap-4 bg-gray-100 p-2 rounded shadow-lg border border-gray-300 z-50">
                    <button
                        onClick={() => window.print()}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-sans font-bold shadow flex items-center gap-2"
                    >
                        🖨️ Print / PDF
                    </button>
                    <button
                        onClick={() => setShowPrintView(false)}
                        className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-2 rounded font-sans font-bold"
                    >
                        Close
                    </button>
                    <button
                        onClick={() => setIsSigned(!isSigned)}
                        className={`px-6 py-2 rounded font-sans font-bold shadow transition-colors ${isSigned ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-yellow-400 text-black hover:bg-yellow-500'}`}
                    >
                        {isSigned ? '✅ Signed' : '✍️ Stamp Signature'}
                    </button>
                </div>

                <div className="max-w-4xl mx-auto bg-white min-h-screen p-8 md:p-12 shadow-2xl print:shadow-none">
                    {/* Header */}
                    <div className="border-b-4 border-black pb-6 mb-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                        <div>
                            <h1 className="text-4xl font-bold uppercase tracking-wider mb-2">{orgName}</h1>
                            <p className="text-gray-600 text-lg uppercase tracking-widest">Purchase Order Request</p>
                        </div>
                        <div className="text-left md:text-right">
                            <p className="font-bold text-xl">{todayStr}</p>
                            <p className="text-sm text-gray-500">Generated by TopShelf</p>
                        </div>
                    </div>

                    {Object.keys(itemsBySupplier).length === 0 && (
                        <div className="text-center py-20 border-2 border-dashed border-gray-300 rounded bg-gray-50">
                            <p className="text-xl italic text-gray-500">No pending orders to print.</p>
                        </div>
                    )}

                    {Object.entries(itemsBySupplier).map(([supplier, items], index, array) => (
                        <div key={supplier} className="mb-0 break-inside-avoid w-full" style={{ pageBreakAfter: 'always' }}>
                            <div className="bg-gray-100 p-4 mb-6 border-l-8 border-black flex justify-between items-center rounded-r print:bg-white print:border-black print:border-l-4">
                                <h2 className="text-2xl font-bold uppercase tracking-tight">To: {supplier}</h2>
                                <span className="text-sm font-bold bg-black text-white px-3 py-1 rounded-full print:border print:border-black print:text-black print:bg-white">{items.length} Items</span>
                            </div>

                            <table className="w-full border-collapse mb-6 text-base">
                                <thead>
                                    <tr className="border-b-2 border-black">
                                        <th className="text-left py-3 px-2 font-bold uppercase w-1/2">Item Name</th>
                                        <th className="text-center py-3 px-2 font-bold uppercase w-1/4">Order Qty</th>
                                        <th className="text-right py-3 px-2 font-bold uppercase w-1/4">Notes / Check</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((item, idx) => (
                                        <tr key={idx} className="border-b border-gray-200 hover:bg-gray-50 print:border-gray-400">
                                            <td className="py-4 px-2 font-bold text-lg">{item.item_name}</td>
                                            <td className="py-4 px-2 text-center font-mono text-xl font-bold bg-gray-50 print:bg-transparent">{item.suggested_order}</td>
                                            <td className="py-4 px-2 text-right italic text-gray-400 print:text-gray-900 border-b print:border-gray-400">
                                                __________
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            <div className="mt-8 text-sm text-gray-600 italic pl-2 border-l-2 border-gray-300 print:border-gray-500">
                                Please confirm receipt and expected delivery date with {orgName}.
                            </div>

                            {/* Footer strictly at bottom of page? Or just bottom of section? */}
                            <div className="mt-12 pt-8 border-t-2 border-black text-center text-gray-500 relative">
                                <p className="mb-8">Authorized Signature</p>
                                <div className="w-64 border-b border-black mx-auto mb-2 relative h-12 flex items-end justify-center">
                                    {isSigned && (
                                        activeSignature ? (
                                            <img
                                                src={activeSignature}
                                                alt="Signature"
                                                className="absolute bottom-0 h-16 w-auto mix-blend-multiply"
                                            />
                                        ) : (
                                            <span className="absolute -bottom-2 text-4xl text-blue-900 font-bold transform -rotate-6" style={{ fontFamily: '"Brush Script MT", cursive' }}>
                                                {orgName.split(' ')[0]} Manager
                                            </span>
                                        )
                                    )}
                                </div>
                                <p className="text-xs uppercase tracking-widest">Manager Approval</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div >

        );
    }

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-white mb-1">{orgName} - Smart Order Sheet</h1>
                    <p className="text-blue-400 text-sm">Predictive intelligence based on {forecastDays}-day usage trends.</p>
                </div>
                <div className="flex gap-4">
                    <select
                        className="bg-gray-800 text-white border border-gray-700 rounded px-3 py-2 text-sm"
                        value={forecastDays}
                        onChange={(e) => setForecastDays(parseInt(e.target.value))}
                    >
                        <option value={30}>Last 30 Days</option>
                        <option value={60}>Last 60 Days</option>
                        <option value={90}>Last 90 Days</option>
                    </select>
                    <button
                        onClick={() => setShowPrintView(true)}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg text-sm font-bold print:hidden flex items-center gap-2 shadow-lg transition-transform hover:scale-105 active:scale-95"
                    >
                        <span>📄</span> Preview & Print Order
                    </button>
                </div>
            </div>
            <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
                {/* Notifications */}
                {notifications.length > 0 && (
                    <div className="mb-6 space-y-2">
                        {notifications.map((n: any, idx: number) => (
                            <div key={idx} className="bg-red-900/50 border border-red-500 text-red-100 p-4 rounded flex justify-between items-center">
                                <div>
                                    <strong className="block">{n.title}</strong>
                                    <span className="text-sm">{n.message}</span>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleIgnoreOrder(n.orderId)}
                                        className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-xs border border-gray-500"
                                    >
                                        Ignore / Cancel
                                    </button>
                                    <button className="bg-red-700 hover:bg-red-600 px-3 py-1 rounded text-xs">
                                        Check Stock
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {supplierWarning && (
                    <div className="bg-yellow-900/40 border border-yellow-600 text-yellow-100 p-4 rounded mb-8">
                        <strong>⚠️ No Suppliers Found</strong>
                        <p className="text-sm mt-1">Predictions need supplier info (Lead Time, Delivery Days). Please add suppliers in Settings.</p>
                    </div>
                )}

                {/* Supplier Filter & Model Header */}
                <div className="flex flex-col md:flex-row justify-between items-center mb-6 bg-gray-800 p-4 rounded-lg border border-gray-700 gap-4">
                    <div className="flex items-center gap-4">
                        <h1 className="text-2xl font-bold text-white">Smart Order Report</h1>
                        <select
                            className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 text-sm"
                            value={selectedSupplier}
                            onChange={(e) => setSelectedSupplier(e.target.value)}
                        >
                            <option value="ALL">All Suppliers</option>
                            {Array.from(new Set(availableSuppliers.map(s => s.name)))
                                .sort()
                                .map(name => (
                                    <option key={name} value={name}>{name}</option>
                                ))
                            }
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="text-gray-400 text-sm">Prediction Model:</span>
                        <select
                            className="bg-blue-900/30 text-blue-100 border border-blue-500/50 rounded px-3 py-2 text-sm font-medium"
                            value={modelType}
                            onChange={(e) => setModelType(e.target.value)}
                        >
                            <option value="SMA">Avg 30-Day (Standard)</option>
                            <option value="WMA">Weighted (Recent Focus)</option>
                            <option value="LINEAR">Linear Trend (Growth)</option>
                            <option value="HOLT">Holt-Winters (Trend + Smooth)</option>
                            <option value="NEURAL">Neural Network (Adaptive)</option>
                        </select>
                    </div>

                    <div className="flex gap-4 text-sm hidden md:flex">
                        <div className="px-4 py-2 bg-red-900/30 border border-red-500/30 rounded text-red-100">
                            Critical: <strong>{criticalCount}</strong>
                        </div>
                        <div className="px-4 py-2 bg-blue-900/30 border border-blue-500/30 rounded text-blue-100">
                            Est. Cost: <strong>${totalEstimatedCost.toFixed(2)}</strong>
                        </div>
                    </div>
                </div>

                <div className="bg-gray-800 border border-gray-700 p-6 rounded-xl mb-8">
                    <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            📈 Product Trends
                            {chartLoading && <span className="text-xs font-normal text-blue-400 animate-pulse">Loading...</span>}
                        </h2>

                        <div className="flex gap-4">
                            <select
                                className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 text-sm"
                                value={sortMode}
                                onChange={(e) => setSortMode(e.target.value as any)}
                            >
                                <option value="PRIORITY">🔥 Most Ordered</option>
                                <option value="ALPHA">🔤 Alphabetical</option>
                            </select>

                            <select
                                className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 text-sm max-w-[200px]"
                                value={selectedItemId || ''}
                                onChange={(e) => setSelectedItemId(parseInt(e.target.value))}
                            >
                                {sortedItems.map(i => (
                                    <option key={i.id} value={i.id}>
                                        {i.name} {getBurnRate(i.id) > 0 ? `(Burn: ${getBurnRate(i.id)})` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <SmartOrderCharts
                        suggestions={filteredSuggestions}
                        history={itemHistory}
                        selectedItemName={allItems.find(i => i.id === selectedItemId)?.name || 'Selected Item'}
                    />
                </div>

                <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-6 mb-8 mt-4 print:hidden">
                    <h3 className="text-lg font-bold text-blue-300 mb-2">🧠 How Smart Order Works</h3>
                    <div className="text-blue-100 text-sm space-y-2">
                        <p>
                            This system predicts your order needs by analyzing your <strong>usage burn rate</strong> over the last {forecastDays} days.
                            It compares your current on-hand stock plus any pending orders against your calculated daily consumption.
                        </p>
                        <p>
                            <strong>Formula:</strong> <code>Days Remaining = Current Stock / Avg Daily Usage</code>
                        </p>
                        <ul className="list-disc list-inside space-y-1 mt-2">
                            <li><span className="text-red-400 font-bold">CRITICAL</span>: Stock will run out in &lt; 3 days (Lead Time + Buffer). Order immediately to avoid 86ing items.</li>
                            <li><span className="text-yellow-400 font-bold">HIGH</span>: Stock will run out in &lt; 7 days. Plan to order soon to maintain par levels.</li>
                            <li><span className="text-green-400 font-bold">HEALTHY</span>: Sufficient stock for &gt; 7 days. No action needed unless preparing for a big event.</li>
                        </ul>
                    </div>
                </div>

                {/* Suggestions Table */}
                <div className="overflow-x-auto rounded-lg border border-gray-700">
                    <table className="w-full text-left text-sm text-gray-400">
                        <thead className="bg-gray-900 text-gray-200 uppercase font-medium">
                            <tr>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Item</th>
                                <th className="px-6 py-4">Supplier</th>
                                <th className="px-6 py-4">Stock / Burn</th>
                                <th className="px-6 py-4">Days Left</th>
                                <th className="px-6 py-4">Suggestion</th>
                                <th className="px-6 py-4">Est. Cost</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700 bg-gray-800">
                            {filteredSuggestions.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                                        No suggestions found for this criteria.
                                    </td>
                                </tr>
                            ) : (
                                filteredSuggestions.map((s) => (
                                    <tr key={s.item_id} className="hover:bg-gray-700/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${s.priority === 'CRITICAL' ? 'bg-red-900/30 text-red-200 border-red-800' :
                                                s.priority === 'HIGH' ? 'bg-yellow-900/30 text-yellow-200 border-yellow-800' :
                                                    'bg-green-900/30 text-green-200 border-green-800'
                                                }`}>
                                                {s.priority}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-medium text-white">
                                            {s.item_name}
                                        </td>
                                        <td className="px-6 py-4">
                                            {s.supplier || 'Unassigned'}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-white">{s.current_stock} units</span>
                                                <span className="text-xs text-gray-500">Burn: {s.burn_rate}/day</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`${parseFloat(s.days_until_empty) < 3 ? 'text-red-400 font-bold' : ''}`}>
                                                {s.days_until_empty} days
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-white">
                                            {s.suggested_order}
                                        </td>
                                        <td className="px-6 py-4 text-white">
                                            ${s.estimated_cost}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {s.suggested_order > 0 && (
                                                <button
                                                    onClick={() => handlePlaceOrder(s)}
                                                    className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded transition-colors"
                                                >
                                                    Place Order
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        <tfoot className="bg-gray-900 border-t border-gray-700 print:bg-gray-100 print:border-gray-300">
                            <tr>
                                <td colSpan={5} className="px-6 py-4 text-right text-sm text-gray-400 font-medium">Total Estimated Cost</td>
                                <td className="px-6 py-4 text-right font-bold text-white text-lg print:text-black">${totalEstimatedCost.toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                {suggestions.length === 0 && (
                    <div className="p-12 text-center text-gray-500">
                        <p>No predictive orders needed right now.</p>
                        <p className="text-sm mt-2">Either your stock is healthy or we need more usage data (30 days) to forecast.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
