'use client';

import { useState, useEffect, useRef } from 'react';
import { Link, Search, Save, Trash2, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import NextLink from 'next/link';

interface POSItem {
    pos_item_name: string;
    pos_item_id: string | null;
    pos_type: string;
    total_quantity: number;
    transaction_count: number;
    last_seen: string;
}

interface Mapping {
    id: number;
    pos_item_name: string;
    pos_type: string;
    inventory_item_name: string | null;
    inventory_item_type: string | null;
    oz_per_serving: number;
    servings_per_item: number;
    notes: string | null;
}

interface InventoryItem {
    id: number;
    name: string;
    type: string;
}

type ActiveTab = 'unmapped' | 'all';

export default function ItemLinkingClient() {
    const [activeTab, setActiveTab] = useState<ActiveTab>('unmapped');
    const [unmapped, setUnmapped] = useState<POSItem[]>([]);
    const [mappings, setMappings] = useState<Mapping[]>([]);
    const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [msg, setMsg] = useState('');

    // Per-item form state for unmapped items
    const [linkForms, setLinkForms] = useState<Record<string, {
        inventory_item_id: string;
        oz_per_serving: string;
        servings_per_item: string;
        search: string;
        filtered: InventoryItem[];
        showDropdown: boolean;
    }>>({});

    // Per-mapping edit state
    const [editForms, setEditForms] = useState<Record<number, {
        oz_per_serving: string;
        servings_per_item: string;
        inventory_item_id: string;
        search: string;
        filtered: InventoryItem[];
        showDropdown: boolean;
    }>>({});

    useEffect(() => { load(); }, []);

    async function load() {
        setLoading(true);
        const [mappingsRes, itemsRes] = await Promise.all([
            fetch('/api/admin/pos/item-mappings'),
            fetch('/api/admin/products?limit=500').catch(() => fetch('/api/admin/categories')),
        ]);
        const mData = await mappingsRes.json();
        setUnmapped(mData.unmapped || []);
        setMappings(mData.mappings || []);

        // Load inventory items for search
        try {
            const iRes = await fetch('/api/admin/products?limit=999');
            const iData = await iRes.json();
            const items = (iData.items || iData.products || []).map((i: any) => ({ id: i.id, name: i.name, type: i.type }));
            setInventoryItems(items);
        } catch { }
        setLoading(false);
    }

    function filterItems(query: string): InventoryItem[] {
        if (!query) return inventoryItems.slice(0, 20);
        const q = query.toLowerCase();
        return inventoryItems.filter(i => i.name.toLowerCase().includes(q)).slice(0, 20);
    }

    function initLinkForm(posItemName: string) {
        if (linkForms[posItemName]) return;
        setLinkForms(f => ({
            ...f,
            [posItemName]: { inventory_item_id: '', oz_per_serving: '1.5', servings_per_item: '1', search: '', filtered: inventoryItems.slice(0, 20), showDropdown: false },
        }));
    }

    function updateLinkForm(key: string, field: string, value: any) {
        setLinkForms(f => {
            const cur = f[key] || { inventory_item_id: '', oz_per_serving: '1.5', servings_per_item: '1', search: '', filtered: [], showDropdown: false };
            const updated = { ...cur, [field]: value };
            if (field === 'search') updated.filtered = filterItems(value);
            return { ...f, [key]: updated };
        });
    }

    async function saveLink(posItem: POSItem) {
        const form = linkForms[posItem.pos_item_name];
        if (!form?.inventory_item_id) { setMsg('Please select an inventory item.'); return; }
        setSaving(posItem.pos_item_name);
        await fetch('/api/admin/pos/item-mappings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pos_type: posItem.pos_type,
                pos_item_id: posItem.pos_item_id,
                pos_item_name: posItem.pos_item_name,
                inventory_item_id: parseInt(form.inventory_item_id),
                oz_per_serving: parseFloat(form.oz_per_serving) || 1.5,
                servings_per_item: parseFloat(form.servings_per_item) || 1,
            }),
        });
        setSaving(null);
        setMsg(`Linked "${posItem.pos_item_name}" successfully.`);
        setTimeout(() => setMsg(''), 3000);
        load();
    }

    async function deleteMapping(id: number) {
        if (!confirm('Remove this item mapping?')) return;
        await fetch('/api/admin/pos/item-mappings', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
        });
        load();
    }

    async function saveEdit(id: number) {
        const form = editForms[id];
        if (!form) return;
        setSaving(String(id));
        await fetch('/api/admin/pos/item-mappings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pos_type: mappings.find(m => m.id === id)?.pos_type || 'toast',
                pos_item_name: mappings.find(m => m.id === id)?.pos_item_name || '',
                inventory_item_id: form.inventory_item_id ? parseInt(form.inventory_item_id) : null,
                oz_per_serving: parseFloat(form.oz_per_serving) || 1.5,
                servings_per_item: parseFloat(form.servings_per_item) || 1,
            }),
        });
        setSaving(null);
        setMsg('Mapping updated.');
        setTimeout(() => setMsg(''), 3000);
        setEditForms(f => { const n = { ...f }; delete n[id]; return n; });
        load();
    }

    const InventorySearchField = ({ value, onChange, onSelect, filtered, showDropdown, onFocus, onBlur }: any) => (
        <div className="relative">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                <input type="text" value={value} onChange={e => onChange(e.target.value)}
                    onFocus={onFocus} onBlur={onBlur}
                    placeholder="Search inventory items…"
                    className="w-full pl-8 pr-3 py-2 bg-gray-800 border border-gray-600 text-white text-sm rounded-lg focus:outline-none focus:border-blue-500" />
            </div>
            {showDropdown && filtered.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-40 overflow-y-auto">
                    {filtered.map((item: InventoryItem) => (
                        <button key={item.id} type="button" onMouseDown={() => onSelect(item)}
                            className="w-full text-left px-3 py-2 hover:bg-gray-700 text-sm text-white flex items-center gap-2">
                            <span className="flex-1">{item.name}</span>
                            <span className="text-gray-500 text-xs">{item.type}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );

    return (
        <div className="max-w-5xl space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-white">Item Linking</h1>
                    <p className="text-gray-400 text-sm mt-0.5">Link POS transaction items to inventory products for usage estimation</p>
                </div>
                <div className="flex gap-2">
                    <NextLink href="/admin/pos-dashboard" className="px-3 py-2 bg-gray-800 border border-gray-700 text-gray-300 hover:text-white rounded-lg text-sm transition-colors">
                        ← Dashboard
                    </NextLink>
                    <button type="button" onClick={load} className="p-2 bg-gray-800 border border-gray-700 text-gray-300 hover:text-white rounded-lg transition-colors">
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {msg && <div className="px-4 py-3 bg-green-900/30 border border-green-700/50 text-green-300 rounded-lg text-sm">{msg}</div>}

            {/* Tab bar */}
            <div className="flex gap-2 bg-gray-900 border border-gray-700 p-1 rounded-xl w-fit">
                <button type="button" onClick={() => setActiveTab('unmapped')}
                    className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'unmapped' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                    Unmapped
                    {unmapped.length > 0 && <span className="ml-2 px-1.5 py-0.5 bg-amber-600 text-white rounded text-xs">{unmapped.length}</span>}
                </button>
                <button type="button" onClick={() => setActiveTab('all')}
                    className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'all' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                    All Mappings ({mappings.length})
                </button>
            </div>

            {/* Unmapped items */}
            {activeTab === 'unmapped' && (
                loading ? <div className="text-gray-400 p-8 text-center">Loading…</div> :
                unmapped.length === 0 ? (
                    <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 text-center">
                        <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-3" />
                        <p className="text-white font-medium">All POS items are linked</p>
                        <p className="text-gray-400 text-sm mt-1">Every item that has appeared in transactions is mapped to an inventory product.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {unmapped.map(item => {
                            const form = linkForms[item.pos_item_name] || { inventory_item_id: '', oz_per_serving: '1.5', servings_per_item: '1', search: '', filtered: inventoryItems.slice(0, 20), showDropdown: false };
                            return (
                                <div key={item.pos_item_name} className="bg-gray-900 border border-amber-800/40 rounded-xl p-5">
                                    <div className="flex items-start justify-between gap-4 mb-4">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                                                <span className="text-white font-semibold">{item.pos_item_name}</span>
                                                <span className={`px-1.5 py-0.5 rounded text-xs ${item.pos_type === 'toast' ? 'bg-orange-900/40 text-orange-400' : 'bg-green-900/40 text-green-400'}`}>
                                                    {item.pos_type}
                                                </span>
                                            </div>
                                            <p className="text-gray-500 text-xs mt-1">
                                                {Number(item.total_quantity).toFixed(0)} sold · {item.transaction_count} orders · Last: {item.last_seen ? new Date(item.last_seen).toLocaleDateString() : '—'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <div className="md:col-span-1">
                                            <label className="block text-xs text-gray-400 font-medium mb-1.5 uppercase tracking-wider">Inventory Item</label>
                                            <InventorySearchField
                                                value={form.search}
                                                onChange={(v: string) => {
                                                    initLinkForm(item.pos_item_name);
                                                    updateLinkForm(item.pos_item_name, 'search', v);
                                                    updateLinkForm(item.pos_item_name, 'inventory_item_id', '');
                                                }}
                                                onSelect={(inv: InventoryItem) => {
                                                    setLinkForms(f => ({
                                                        ...f,
                                                        [item.pos_item_name]: { ...(f[item.pos_item_name] || { oz_per_serving: '1.5', servings_per_item: '1', filtered: [], showDropdown: false }), inventory_item_id: String(inv.id), search: inv.name, showDropdown: false },
                                                    }));
                                                }}
                                                filtered={form.filtered}
                                                showDropdown={form.showDropdown}
                                                onFocus={() => { initLinkForm(item.pos_item_name); updateLinkForm(item.pos_item_name, 'showDropdown', true); }}
                                                onBlur={() => setTimeout(() => updateLinkForm(item.pos_item_name, 'showDropdown', false), 150)}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-400 font-medium mb-1.5 uppercase tracking-wider">Oz / Serving</label>
                                            <input type="number" step="0.25" min="0.25"
                                                value={form.oz_per_serving}
                                                onChange={e => updateLinkForm(item.pos_item_name, 'oz_per_serving', e.target.value)}
                                                className="w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-400 font-medium mb-1.5 uppercase tracking-wider">Servings / Item</label>
                                            <input type="number" step="1" min="1"
                                                value={form.servings_per_item}
                                                onChange={e => updateLinkForm(item.pos_item_name, 'servings_per_item', e.target.value)}
                                                className="w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                                        </div>
                                    </div>
                                    <div className="mt-3 flex items-center gap-3">
                                        <button type="button" onClick={() => saveLink(item)}
                                            disabled={!form.inventory_item_id || saving === item.pos_item_name}
                                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors">
                                            <Link className="w-3.5 h-3.5" />
                                            {saving === item.pos_item_name ? 'Saving…' : 'Link Item'}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )
            )}

            {/* All Mappings */}
            {activeTab === 'all' && (
                loading ? <div className="text-gray-400 p-8 text-center">Loading…</div> :
                mappings.length === 0 ? (
                    <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 text-center">
                        <p className="text-gray-400">No mappings yet. Link items from the Unmapped tab first.</p>
                    </div>
                ) : (
                    <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase">
                                    <th className="text-left px-5 py-3 font-medium">POS Item</th>
                                    <th className="text-left px-5 py-3 font-medium">Inventory Item</th>
                                    <th className="text-right px-5 py-3 font-medium">Oz/Srv</th>
                                    <th className="text-right px-5 py-3 font-medium">Srv/Item</th>
                                    <th className="text-right px-5 py-3 font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {mappings.map(m => {
                                    const isEditing = !!editForms[m.id];
                                    const ef = editForms[m.id];
                                    return (
                                        <tr key={m.id} className="hover:bg-gray-800/40">
                                            <td className="px-5 py-3">
                                                <p className="text-white font-medium">{m.pos_item_name}</p>
                                                <p className="text-gray-500 text-xs">{m.pos_type}</p>
                                            </td>
                                            <td className="px-5 py-3">
                                                {isEditing ? (
                                                    <InventorySearchField
                                                        value={ef.search}
                                                        onChange={(v: string) => setEditForms(f => ({ ...f, [m.id]: { ...f[m.id], search: v, filtered: filterItems(v), inventory_item_id: '' } }))}
                                                        onSelect={(inv: InventoryItem) => setEditForms(f => ({ ...f, [m.id]: { ...f[m.id], inventory_item_id: String(inv.id), search: inv.name, showDropdown: false } }))}
                                                        filtered={ef.filtered || []}
                                                        showDropdown={ef.showDropdown}
                                                        onFocus={() => setEditForms(f => ({ ...f, [m.id]: { ...f[m.id], showDropdown: true, filtered: filterItems(ef.search) } }))}
                                                        onBlur={() => setTimeout(() => setEditForms(f => ({ ...f, [m.id]: { ...f[m.id], showDropdown: false } })), 150)}
                                                    />
                                                ) : (
                                                    <p className="text-gray-300">{m.inventory_item_name || <span className="text-gray-600 italic">Unlinked</span>}</p>
                                                )}
                                            </td>
                                            <td className="px-5 py-3 text-right">
                                                {isEditing ? (
                                                    <input type="number" step="0.25" min="0.25" value={ef.oz_per_serving}
                                                        onChange={e => setEditForms(f => ({ ...f, [m.id]: { ...f[m.id], oz_per_serving: e.target.value } }))}
                                                        className="w-20 bg-gray-800 border border-gray-600 text-white rounded px-2 py-1 text-sm text-right" />
                                                ) : (
                                                    <span className="text-gray-300">{Number(m.oz_per_serving).toFixed(2)}</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3 text-right">
                                                {isEditing ? (
                                                    <input type="number" step="1" min="1" value={ef.servings_per_item}
                                                        onChange={e => setEditForms(f => ({ ...f, [m.id]: { ...f[m.id], servings_per_item: e.target.value } }))}
                                                        className="w-20 bg-gray-800 border border-gray-600 text-white rounded px-2 py-1 text-sm text-right" />
                                                ) : (
                                                    <span className="text-gray-300">{Number(m.servings_per_item).toFixed(0)}</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    {isEditing ? (
                                                        <>
                                                            <button type="button" onClick={() => saveEdit(m.id)} disabled={saving === String(m.id)}
                                                                className="p-1.5 bg-green-600 hover:bg-green-500 rounded text-white transition-colors" title="Save">
                                                                <Save className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button type="button" onClick={() => setEditForms(f => { const n = { ...f }; delete n[m.id]; return n; })}
                                                                className="p-1.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors" title="Cancel">
                                                                ✕
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <button type="button"
                                                            onClick={() => setEditForms(f => ({ ...f, [m.id]: { oz_per_serving: String(m.oz_per_serving), servings_per_item: String(m.servings_per_item), inventory_item_id: String(m.inventory_item_name ? '' : ''), search: m.inventory_item_name || '', filtered: inventoryItems.slice(0, 20), showDropdown: false } }))}
                                                            className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs transition-colors" title="Edit">
                                                            Edit
                                                        </button>
                                                    )}
                                                    <button type="button" onClick={() => deleteMapping(m.id)}
                                                        className="p-1.5 bg-red-900/40 hover:bg-red-900/70 rounded text-red-400 transition-colors" title="Remove mapping">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )
            )}
        </div>
    );
}
