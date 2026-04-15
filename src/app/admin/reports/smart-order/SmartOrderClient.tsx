'use client';

import { useState, useEffect } from 'react';
import SmartOrderCharts from './SmartOrderCharts';

interface Suggestion {
    item_id: number;
    item_name: string;
    current_stock: number;
    pending_order: number;
    burn_rate: string;
    days_until_empty: number;
    supplier: string;
    suggested_order: number;
    estimated_cost: string;
    reason: string;
    priority: 'CRITICAL' | 'HIGH' | 'HEALTHY';
    model: string;
}

interface LocationData {
    locationId: number;
    locationName: string;
    suggestions: Suggestion[];
    notifications: any[];
}

const PRIORITY_ORDER = { CRITICAL: 0, HIGH: 1, HEALTHY: 2 };

const priorityBadge = (p: Suggestion['priority']) => {
    const cls = p === 'CRITICAL'
        ? 'bg-red-900/30 text-red-200 border-red-800'
        : p === 'HIGH'
            ? 'bg-yellow-900/30 text-yellow-200 border-yellow-800'
            : 'bg-green-900/30 text-green-200 border-green-800';
    return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${cls}`}>{p}</span>;
};

export default function SmartOrderClient() {
    const [byLocation, setByLocation] = useState<LocationData[]>([]);
    const [activeLocId, setActiveLocId] = useState<number | null>(null);
    const [allItems, setAllItems] = useState<{ id: number; name: string; supplier?: string }[]>([]);
    const [supplierWarning, setSupplierWarning] = useState(false);
    const [loading, setLoading] = useState(true);

    const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
    const [itemHistory, setItemHistory] = useState<any[]>([]);
    const [chartLoading, setChartLoading] = useState(false);

    const [isSigned, setIsSigned] = useState(false);
    const [sortMode, setSortMode] = useState<'PRIORITY' | 'ALPHA'>('PRIORITY');
    const [selectedSupplier, setSelectedSupplier] = useState<string>('ALL');
    const [availableSuppliers, setAvailableSuppliers] = useState<{ id: number; name: string }[]>([]);
    const [activeSignature, setActiveSignature] = useState<string | null>(null);
    const [modelType, setModelType] = useState<string>('SMA');
    const [enabledModels, setEnabledModels] = useState<string[]>(['SMA', 'EMA', 'WMA', 'LINEAR_REGRESSION']);
    const [forecastDays, setForecastDays] = useState<number>(30);
    const [orgName, setOrgName] = useState('My Bar');
    const [showPrintView, setShowPrintView] = useState(false);
    const [availableSignatures, setAvailableSignatures] = useState<any[]>([]);
    const [showSignatureModal, setShowSignatureModal] = useState(false);
    const [emailing, setEmailing] = useState(false);

    // Load ML model config
    useEffect(() => {
        fetch('/api/super-admin/ml-models').then(r => r.json()).then(d => {
            if (d.config) {
                setEnabledModels(d.config.enabled_models || ['SMA']);
                setModelType(d.config.smart_order_model || 'SMA');
            }
        }).catch(() => {});
    }, []);

    useEffect(() => {
        if (showPrintView && availableSignatures.length === 0) {
            fetch('/api/settings/signatures').then(r => r.json()).then(d => {
                if (d.signatures) setAvailableSignatures(d.signatures);
            }).catch(console.error);
        }
    }, [showPrintView]);

    const fetchInitial = async () => {
        setLoading(true);
        try {
            const [predRes, itemsRes] = await Promise.all([
                fetch(`/api/inventory/predictive?model=${modelType}&days=${forecastDays}`),
                fetch('/api/inventory?sort=name'),
            ]);
            const predData = await predRes.json();
            const itemsData = await itemsRes.json();

            if (predData.byLocation) {
                setByLocation(predData.byLocation);
                if (predData.byLocation.length > 0) {
                    setActiveLocId(prev => prev ?? predData.byLocation[0].locationId);
                    // Default chart item from first location's first critical/high suggestion
                    if (!selectedItemId) {
                        const first = predData.byLocation[0].suggestions.find(
                            (s: Suggestion) => s.priority !== 'HEALTHY'
                        ) ?? predData.byLocation[0].suggestions[0];
                        if (first) setSelectedItemId(first.item_id);
                    }
                }
            }
            if (predData.suppliers) setAvailableSuppliers(predData.suppliers);
            if (predData.supplierCount === 0) setSupplierWarning(true);
            if (predData.orgName) setOrgName(predData.orgName);
            // Strip to primitives only — order_size JSONB objects must not flow into recharts
            if (itemsData.items) setAllItems(
                itemsData.items.map((i: any) => ({ id: i.id, name: String(i.name), supplier: i.supplier || '' }))
            );
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchInitial(); }, [modelType, forecastDays]);

    useEffect(() => {
        if (!selectedItemId) return;
        const fetchHistory = async () => {
            setChartLoading(true);
            try {
                const res = await fetch(`/api/reports/history?itemId=${selectedItemId}&days=40`);
                const data = await res.json();
                if (data.history) setItemHistory(data.history);
            } catch (e) { console.error(e); } finally { setChartLoading(false); }
        };
        fetchHistory();
    }, [selectedItemId]);

    const handlePlaceOrder = async (item: Suggestion) => {
        if (!confirm(`Place order for ${item.suggested_order} units of ${item.item_name}?`)) return;
        try {
            const res = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    supplier_id: null,
                    expected_delivery_date: new Date(Date.now() + 7 * 86400000).toISOString(),
                    items: [{ item_id: item.item_id, quantity: item.suggested_order }],
                }),
            });
            if (res.ok) { alert('Order placed!'); fetchInitial(); }
        } catch { alert('Error placing order'); }
    };

    const handleIgnoreOrder = async (orderId: number) => {
        if (!confirm('Cancel this order?')) return;
        try {
            await fetch('/api/orders/update', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId, status: 'CANCELLED' }),
            });
            fetchInitial();
        } catch { alert('Error cancelling order'); }
    };

    const modelLabel = (m: string) => ({
        SMA: 'Simple Moving Avg', EMA: 'Exp. Moving Avg',
        WMA: 'Weighted Moving Avg', LINEAR_REGRESSION: 'Linear Regression',
        HOLT: "Holt's Linear", NEURAL: 'Neural (Adaline)',
    }[m] ?? m);

    // Active location data
    const activeLocData = byLocation.find(l => l.locationId === activeLocId) ?? byLocation[0];
    const activeSuggestions = activeLocData?.suggestions ?? [];
    const activeNotifications = activeLocData?.notifications ?? [];

    // Filter + sort active suggestions
    const filtered = activeSuggestions
        .filter(s => selectedSupplier === 'ALL' || s.supplier === selectedSupplier)
        .sort((a, b) => {
            if (sortMode === 'ALPHA') return a.item_name.localeCompare(b.item_name);
            const pd = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
            return pd !== 0 ? pd : a.days_until_empty - b.days_until_empty;
        });

    const totalCost = filtered.reduce((acc, s) => acc + parseFloat(s.estimated_cost), 0);
    const criticalCount = filtered.filter(s => s.priority === 'CRITICAL').length;

    // Items dropdown for trend chart
    const sortedItems = [...allItems]
        .filter(i => selectedSupplier === 'ALL' || (i as any).supplier === selectedSupplier)
        .sort((a, b) => {
            if (sortMode === 'ALPHA') return a.name.localeCompare(b.name);
            const ba = activeSuggestions.find(s => s.item_id === a.id)?.burn_rate ?? '0';
            const bb = activeSuggestions.find(s => s.item_id === b.id)?.burn_rate ?? '0';
            return parseFloat(bb) - parseFloat(ba);
        });

    if (loading) return <div className="p-8 text-white">Calculating forecasts…</div>;

    // ── Print View ─────────────────────────────────────────────────────────────
    if (showPrintView) {
        // Group ALL locations' non-zero suggestions by location → supplier
        const printData: { locationName: string; bySupplier: Record<string, Suggestion[]> }[] = byLocation
            .map(loc => {
                const items = loc.suggestions.filter(s => s.suggested_order > 0);
                const bySupplier: Record<string, Suggestion[]> = {};
                items.forEach(s => {
                    const sup = s.supplier || 'Unassigned';
                    if (!bySupplier[sup]) bySupplier[sup] = [];
                    bySupplier[sup].push(s);
                });
                return { locationName: loc.locationName, bySupplier };
            })
            .filter(l => Object.keys(l.bySupplier).length > 0);

        const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        return (
            <div className="fixed inset-0 bg-white z-[9999] overflow-auto text-black p-0 md:p-8 font-serif leading-relaxed">
                <style jsx global>{`@media print { @page { margin: 0.5in; } body { background: white; } .no-print { display: none !important; } }`}</style>

                <div className="no-print fixed top-4 right-4 flex gap-4 bg-gray-100 p-2 rounded shadow-lg border border-gray-300 z-50">
                    <button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-sans font-bold">🖨️ Print / PDF</button>
                    <button onClick={() => setShowPrintView(false)} className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-2 rounded font-sans font-bold">Close</button>
                    <button
                        onClick={() => isSigned ? (setIsSigned(false), setActiveSignature(null)) : setShowSignatureModal(true)}
                        className={`px-6 py-2 rounded font-sans font-bold ${isSigned ? 'bg-green-600 text-white' : 'bg-yellow-400 text-black'}`}
                    >{isSigned ? '✅ Signed' : '✍️ Stamp Signature'}</button>
                </div>

                {showSignatureModal && (
                    <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center print:hidden">
                        <div className="bg-white p-6 rounded shadow-xl text-black w-96">
                            <h3 className="text-xl font-bold mb-4">Select Signature</h3>
                            {availableSignatures.length === 0
                                ? <p className="text-gray-500 mb-4">No signatures found. Add one in Settings.</p>
                                : <div className="flex flex-col gap-2 mb-4 max-h-64 overflow-y-auto">
                                    {availableSignatures.map(sig => (
                                        <button key={sig.id} onClick={() => { setActiveSignature(sig.data); setIsSigned(true); setShowSignatureModal(false); }}
                                            className="border p-2 rounded hover:bg-gray-100 flex items-center justify-between">
                                            <span className="font-bold">{sig.label || 'Signature'}</span>
                                            {sig.data && <img src={sig.data} alt="sig" className="h-8 object-contain mix-blend-multiply" />}
                                        </button>
                                    ))}
                                </div>
                            }
                            <div className="flex justify-end"><button onClick={() => setShowSignatureModal(false)} className="px-4 py-2 bg-gray-200 rounded font-bold">Cancel</button></div>
                        </div>
                    </div>
                )}

                <div className="max-w-4xl mx-auto bg-white min-h-screen p-8 md:p-12 shadow-2xl print:shadow-none">
                    <div className="border-b-4 border-black pb-6 mb-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                        <div>
                            <h1 className="text-4xl font-bold uppercase tracking-wider mb-2">{orgName}</h1>
                            <p className="text-gray-600 text-lg uppercase tracking-widest">Purchase Order Request</p>
                        </div>
                        <div className="text-right"><p className="font-bold text-xl">{todayStr}</p><p className="text-sm text-gray-500">Generated by TopShelf</p></div>
                    </div>

                    {printData.length === 0 && (
                        <div className="text-center py-20 border-2 border-dashed border-gray-300 rounded bg-gray-50">
                            <p className="text-xl italic text-gray-500">No pending orders to print.</p>
                        </div>
                    )}

                    {printData.map(({ locationName, bySupplier }) => (
                        <div key={locationName}>
                            {byLocation.length > 1 && (
                                <div className="mt-8 mb-4 flex items-center gap-3">
                                    <span className="text-2xl font-bold uppercase tracking-tight border-b-4 border-black pb-1">📍 {locationName}</span>
                                </div>
                            )}
                            {Object.entries(bySupplier).map(([supplier, items]) => (
                                <div key={supplier} className="mb-12 break-inside-avoid">
                                    <div className="bg-gray-100 p-4 mb-6 border-l-8 border-black flex justify-between items-center rounded-r print:bg-white">
                                        <h2 className="text-2xl font-bold uppercase tracking-tight">To: {supplier}</h2>
                                        <span className="text-sm font-bold bg-black text-white px-3 py-1 rounded-full">{items.length} Items</span>
                                    </div>
                                    <table className="w-full border-collapse mb-6">
                                        <thead>
                                            <tr className="border-b-2 border-black">
                                                <th className="text-left py-3 px-2 font-bold uppercase w-1/2">Item Name</th>
                                                <th className="text-center py-3 px-2 font-bold uppercase w-1/4">Order Qty</th>
                                                <th className="text-right py-3 px-2 font-bold uppercase w-1/4">Notes / Check</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {items.map((item, idx) => (
                                                <tr key={idx} className="border-b border-gray-200">
                                                    <td className="py-4 px-2 font-bold text-lg">{item.item_name}</td>
                                                    <td className="py-4 px-2 text-center font-mono text-xl font-bold">{item.suggested_order}</td>
                                                    <td className="py-4 px-2 text-right italic text-gray-400">__________</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    <div className="mt-8 text-sm text-gray-600 italic pl-2 border-l-2 border-gray-300">Please confirm receipt and delivery date with {orgName}.</div>
                                    <div className="mt-12 pt-8 border-t-2 border-black text-center text-gray-500">
                                        <p className="mb-8">Authorized Signature</p>
                                        <div className="w-64 border-b border-black mx-auto mb-2 relative h-12 flex items-end justify-center">
                                            {isSigned && activeSignature && (
                                                <img src={activeSignature} alt="Signature" className="absolute bottom-0 h-16 w-auto mix-blend-multiply" />
                                            )}
                                        </div>
                                        <p className="text-xs uppercase tracking-widest">Manager Approval</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // ── Main View ──────────────────────────────────────────────────────────────
    return (
        <div className="p-6">
            {/* Header */}
            <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white mb-1">{orgName} — Smart Order Sheet</h1>
                    <p className="text-blue-400 text-sm">Predictive intelligence based on {forecastDays}-day usage trends.</p>
                </div>
                <div className="flex gap-3 flex-wrap">
                    <select className="bg-gray-800 text-white border border-gray-700 rounded px-3 py-2 text-sm"
                        value={forecastDays} onChange={e => setForecastDays(parseInt(e.target.value))}>
                        <option value={30}>Last 30 Days</option>
                        <option value={60}>Last 60 Days</option>
                        <option value={90}>Last 90 Days</option>
                    </select>
                    <button onClick={async () => {
                        setEmailing(true);
                        try {
                            const res = await fetch('/api/admin/reporting/email-now', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reportType: 'smart-order' }) });
                            const json = await res.json();
                            alert(res.ok ? (json.message || 'Sent!') : (json.error || 'Failed'));
                        } catch { alert('Error'); } finally { setEmailing(false); }
                    }} disabled={emailing} className="bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded text-sm font-bold">
                        {emailing ? 'Sending…' : '✉ Email Now'}
                    </button>
                    <button onClick={() => setShowPrintView(true)}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded text-sm font-bold">
                        📄 Preview &amp; Print Order
                    </button>
                </div>
            </div>

            {/* Location Tabs */}
            {byLocation.length > 1 && (
                <div className="flex gap-2 mb-6 flex-wrap">
                    {byLocation.map(loc => {
                        const critCount = loc.suggestions.filter(s => s.priority === 'CRITICAL').length;
                        const highCount = loc.suggestions.filter(s => s.priority === 'HIGH').length;
                        const isActive = loc.locationId === activeLocId;
                        return (
                            <button key={loc.locationId} onClick={() => setActiveLocId(loc.locationId)}
                                className={`px-4 py-2 rounded-lg text-sm font-bold border transition-all flex items-center gap-2 ${isActive
                                    ? 'bg-blue-600 border-blue-500 text-white'
                                    : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'}`}>
                                📍 {loc.locationName}
                                {critCount > 0 && <span className="bg-red-600 text-white text-xs px-1.5 py-0.5 rounded-full">{critCount}</span>}
                                {highCount > 0 && <span className="bg-yellow-600 text-white text-xs px-1.5 py-0.5 rounded-full">{highCount}</span>}
                            </button>
                        );
                    })}
                </div>
            )}

            <div className="max-w-7xl mx-auto w-full">
                {/* Notifications */}
                {activeNotifications.length > 0 && (
                    <div className="mb-6 space-y-2">
                        {activeNotifications.map((n: any, idx: number) => (
                            <div key={idx} className="bg-red-900/50 border border-red-500 text-red-100 p-4 rounded flex justify-between items-center">
                                <div><strong className="block">{n.title}</strong><span className="text-sm">{n.message}</span></div>
                                <div className="flex gap-2">
                                    <button onClick={() => handleIgnoreOrder(n.orderId)} className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-xs border border-gray-500">Cancel</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {supplierWarning && (
                    <div className="bg-yellow-900/40 border border-yellow-600 text-yellow-100 p-4 rounded mb-6">
                        <strong>⚠️ No Suppliers Found</strong>
                        <p className="text-sm mt-1">Add suppliers in Settings to enable lead-time-based predictions.</p>
                    </div>
                )}

                {/* Controls bar */}
                <div className="flex flex-col md:flex-row justify-between items-center mb-6 bg-gray-800 p-4 rounded-lg border border-gray-700 gap-4">
                    <div className="flex items-center gap-4">
                        <h2 className="text-xl font-bold text-white">Smart Order Report
                            {activeLocData && byLocation.length > 1 && (
                                <span className="ml-2 text-blue-400 text-base font-normal">— {activeLocData.locationName}</span>
                            )}
                        </h2>
                        <select className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 text-sm"
                            value={selectedSupplier} onChange={e => setSelectedSupplier(e.target.value)}>
                            <option value="ALL">All Suppliers</option>
                            {Array.from(new Set(availableSuppliers.map(s => s.name))).sort().map(name => (
                                <option key={name} value={name}>{name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-gray-400 text-sm">Model:</span>
                        {enabledModels.length > 1
                            ? <select className="bg-gray-800 text-white border border-gray-700 rounded px-3 py-2 text-sm"
                                value={modelType} onChange={e => setModelType(e.target.value)}>
                                {enabledModels.map(m => <option key={m} value={m}>{modelLabel(m)}</option>)}
                            </select>
                            : <span className="text-gray-400 text-sm bg-gray-800 px-3 py-2 rounded border border-gray-700">
                                {modelLabel(enabledModels[0] || 'SMA')}
                            </span>
                        }
                    </div>
                    <div className="flex gap-4 text-sm hidden md:flex">
                        <div className="px-4 py-2 bg-red-900/30 border border-red-500/30 rounded text-red-100">
                            Critical: <strong>{criticalCount}</strong>
                        </div>
                        <div className="px-4 py-2 bg-blue-900/30 border border-blue-500/30 rounded text-blue-100">
                            Est. Cost: <strong>${totalCost.toFixed(2)}</strong>
                        </div>
                    </div>
                </div>

                {/* Trend Chart */}
                <div className="bg-gray-800 border border-gray-700 p-6 rounded-xl mb-8">
                    <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            📈 Product Trends
                            {chartLoading && <span className="text-xs font-normal text-blue-400 animate-pulse">Loading…</span>}
                        </h3>
                        <div className="flex gap-4">
                            <select className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 text-sm"
                                value={sortMode} onChange={e => setSortMode(e.target.value as any)}>
                                <option value="PRIORITY">🔥 Most Urgent</option>
                                <option value="ALPHA">🔤 Alphabetical</option>
                            </select>
                            <select className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 text-sm max-w-[200px]"
                                value={selectedItemId || ''} onChange={e => setSelectedItemId(parseInt(e.target.value))}>
                                {sortedItems.map(i => {
                                    const burnRate = activeSuggestions.find(s => s.item_id === i.id)?.burn_rate ?? '0';
                                    return <option key={i.id} value={i.id}>{i.name}{parseFloat(burnRate) > 0 ? ` (Burn: ${burnRate})` : ''}</option>;
                                })}
                            </select>
                        </div>
                    </div>
                    <SmartOrderCharts
                        suggestions={filtered.map(s => ({
                            item_id: s.item_id,
                            item_name: String(s.item_name),
                            current_stock: Number(s.current_stock) || 0,
                            pending_order: Number(s.pending_order) || 0,
                            burn_rate: String(s.burn_rate),
                            days_until_empty: Number(s.days_until_empty) || 0,
                            supplier: String(s.supplier || 'Unassigned'),
                            suggested_order: Number(s.suggested_order) || 0,
                            estimated_cost: String(s.estimated_cost),
                            reason: String(s.reason),
                            priority: s.priority,
                            model: String(s.model),
                        }))}
                        history={itemHistory}
                        selectedItemName={allItems.find(i => i.id === selectedItemId)?.name || 'Selected Item'}
                    />
                </div>

                {/* Suggestions Table */}
                <div className="overflow-x-auto rounded-lg border border-gray-700 mb-8">
                    <table className="w-full text-left text-sm text-gray-400">
                        <thead className="bg-gray-900 text-gray-200 uppercase font-medium">
                            <tr>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Item</th>
                                <th className="px-6 py-4">Supplier</th>
                                <th className="px-6 py-4">Stock / Burn</th>
                                <th className="px-6 py-4">Days Left</th>
                                <th className="px-6 py-4">Order Qty</th>
                                <th className="px-6 py-4">Est. Cost</th>
                                <th className="px-6 py-4"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700 bg-gray-800">
                            {filtered.length === 0 ? (
                                <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-500">No suggestions for this criteria.</td></tr>
                            ) : filtered.map(s => (
                                <tr key={s.item_id} className="hover:bg-gray-700/50 transition-colors">
                                    <td className="px-6 py-4">{priorityBadge(s.priority)}</td>
                                    <td className="px-6 py-4 font-medium text-white">{s.item_name}</td>
                                    <td className="px-6 py-4">{s.supplier || 'Unassigned'}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="text-white">{s.current_stock} units</span>
                                            <span className="text-xs text-gray-500">Burn: {s.burn_rate}/day</span>
                                            {s.pending_order > 0 && <span className="text-xs text-blue-400">+{s.pending_order} pending</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={s.days_until_empty < 3 ? 'text-red-400 font-bold' : ''}>
                                            {s.days_until_empty} days
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-white">{s.suggested_order > 0 ? s.suggested_order : '—'}</td>
                                    <td className="px-6 py-4 text-white">${s.estimated_cost}</td>
                                    <td className="px-6 py-4 text-right">
                                        {s.suggested_order > 0 && (
                                            <button onClick={() => handlePlaceOrder(s)}
                                                className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded">
                                                Place Order
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-gray-900 border-t border-gray-700">
                            <tr>
                                <td colSpan={6} className="px-6 py-4 text-right text-sm text-gray-400 font-medium">Total Estimated Cost</td>
                                <td className="px-6 py-4 text-right font-bold text-white text-lg">${totalCost.toFixed(2)}</td>
                                <td />
                            </tr>
                        </tfoot>
                    </table>
                </div>

                {/* How it works */}
                <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-6 print:hidden">
                    <h3 className="text-lg font-bold text-blue-300 mb-2">🧠 How Smart Order Works</h3>
                    <div className="text-blue-100 text-sm space-y-2">
                        <p>Each location's predictions are calculated independently using that location's own usage history and current stock levels. If you have multiple locations, switch tabs to view and print orders per location.</p>
                        <p><strong>Formula:</strong> <code>Days Remaining = Current Stock ÷ Avg Daily Usage</code></p>
                        <ul className="list-disc list-inside space-y-1 mt-2">
                            <li><span className="text-red-400 font-bold">CRITICAL</span> — Runs out before next delivery. Order immediately.</li>
                            <li><span className="text-yellow-400 font-bold">HIGH</span> — Runs out within the reorder window. Plan to order.</li>
                            <li><span className="text-green-400 font-bold">HEALTHY</span> — Stock sufficient past next delivery.</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}
