'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from '../admin.module.css';

interface Item {
    id: number;
    name: string;
    type: string;
    unit_cost: number;
    sale_price?: number;
    location_sale_price?: number;
}

interface Location {
    id: number;
    name: string;
}

export default function PricesClient() {
    const router = useRouter();
    const [items, setItems] = useState<Item[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);
    const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
    const [perLocationPricing, setPerLocationPricing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    // Local sale price edits keyed by itemId (global) or `${itemId}_${locationId}` (per-location)
    const [salePriceEdits, setSalePriceEdits] = useState<Record<string, string>>({});

    useEffect(() => {
        fetchCategories();
        fetchLocations();
        fetchSettings();
    }, []);

    // Re-fetch items when location changes (to get location_sale_price)
    useEffect(() => {
        fetchItems();
    }, [selectedLocationId]);

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/admin/settings');
            const data = await res.json();
            if (data.settings?.per_location_pricing === 'true') {
                setPerLocationPricing(true);
            }
        } catch { }
    };

    const fetchLocations = async () => {
        try {
            const res = await fetch('/api/user/locations');
            const data = await res.json();
            if (data.locations?.length > 0) {
                setLocations(data.locations);
                const match = document.cookie.match(/(^| )current_location_id=([^;]+)/);
                const cookieLocId = match ? parseInt(match[2]) : null;
                const found = cookieLocId ? data.locations.find((l: Location) => l.id === cookieLocId) : null;
                setSelectedLocationId(found ? found.id : data.locations[0].id);
            }
        } catch { }
    };

    const fetchCategories = async () => {
        try {
            const res = await fetch('/api/admin/categories');
            const data = await res.json();
            if (data.categories) setCategories(data.categories.map((c: any) => c.name));
        } catch { }
    };

    const fetchItems = async () => {
        const locParam = selectedLocationId ? `&locationId=${selectedLocationId}` : '';
        const res = await fetch(`/api/inventory?sort=name${locParam}`);
        const data = await res.json();
        if (data.items) {
            setItems(data.items);
            const initial: Record<string, string> = {};
            data.items.forEach((i: Item) => {
                // Global price key
                initial[String(i.id)] = i.sale_price !== null && i.sale_price !== undefined ? String(i.sale_price) : '';
                // Location price key
                if (selectedLocationId) {
                    const locKey = `${i.id}_${selectedLocationId}`;
                    initial[locKey] = i.location_sale_price !== null && i.location_sale_price !== undefined ? String(i.location_sale_price) : '';
                }
            });
            setSalePriceEdits(initial);
        }
        setLoading(false);
    };

    const savePrice = async (itemId: number, isLocationPrice: boolean) => {
        if (isLocationPrice && selectedLocationId) {
            const key = `${itemId}_${selectedLocationId}`;
            const raw = salePriceEdits[key];
            const num = raw === '' ? null : parseFloat(raw);
            if (num !== null && isNaN(num)) return;
            try {
                await fetch('/api/inventory', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: itemId, location_sale_price: num, locationId: selectedLocationId })
                });
                // Update local item display
                setItems(prev => prev.map(i => i.id === itemId ? { ...i, location_sale_price: num ?? undefined } : i));
            } catch {
                fetchItems();
            }
        } else {
            const raw = salePriceEdits[String(itemId)];
            const num = raw === '' ? null : parseFloat(raw);
            if (num !== null && isNaN(num)) return;
            setItems(prev => prev.map(i => i.id === itemId ? { ...i, sale_price: num ?? undefined } : i));
            try {
                await fetch('/api/inventory', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: itemId, sale_price: num })
                });
            } catch {
                fetchItems();
            }
        }
    };

    const togglePerLocationPricing = async (enabled: boolean) => {
        setPerLocationPricing(enabled);
        await fetch('/api/admin/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ per_location_pricing: enabled ? 'true' : 'false' })
        });
    };

    const getMargin = (unitCost: number, salePrice: number) => {
        if (!salePrice || salePrice <= 0) return null;
        return ((salePrice - unitCost) / salePrice * 100).toFixed(1);
    };

    const filteredItems = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

    const itemTypes = [...new Set(items.map(i => i.type))];
    const orderedTypes = [
        ...categories.filter(c => itemTypes.includes(c)),
        ...itemTypes.filter(t => !categories.includes(t)),
    ];
    const grouped: Record<string, Item[]> = {};
    orderedTypes.forEach(type => {
        grouped[type] = filteredItems.filter(i => i.type === type);
    });

    const effectivePrice = (item: Item) => {
        if (perLocationPricing && selectedLocationId && item.location_sale_price != null) {
            return item.location_sale_price;
        }
        return item.sale_price;
    };

    if (loading) return <div className={styles.container}>Loading...</div>;

    return (
        <div className={styles.card}>
            {/* Header controls */}
            <div style={{ marginBottom: '1.5rem' }}>
                <p style={{ color: '#9ca3af', fontSize: '0.9rem', margin: '0 0 1rem 0' }}>
                    Unit prices are set on the{' '}
                    <Link href="/admin/products" style={{ color: '#3b82f6', textDecoration: 'underline' }}>
                        Product List
                    </Link>
                    {' '}and are read-only here. Set a sale price per item to enable profit reporting.
                </p>

                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
                    <input
                        className={styles.input}
                        placeholder="Search items..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ flex: 1, minWidth: '200px' }}
                    />

                    {/* Per-location pricing toggle */}
                    {locations.length > 1 && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'white', whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: '0.9rem', color: '#9ca3af' }}>Per-location prices</span>
                            <div
                                onClick={() => togglePerLocationPricing(!perLocationPricing)}
                                style={{
                                    width: '42px', height: '24px', borderRadius: '12px', cursor: 'pointer',
                                    background: perLocationPricing ? '#3b82f6' : '#374151',
                                    position: 'relative', transition: 'background 0.2s', flexShrink: 0
                                }}
                            >
                                <div style={{
                                    position: 'absolute', top: '3px',
                                    left: perLocationPricing ? '21px' : '3px',
                                    width: '18px', height: '18px', borderRadius: '50%',
                                    background: 'white', transition: 'left 0.2s'
                                }} />
                            </div>
                        </label>
                    )}

                    {/* Location selector (shown when per-location pricing is on) */}
                    {perLocationPricing && locations.length > 1 && (
                        <select
                            className={styles.input}
                            value={selectedLocationId ?? ''}
                            onChange={e => setSelectedLocationId(parseInt(e.target.value))}
                            style={{ width: 'auto' }}
                        >
                            {locations.map(l => (
                                <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                        </select>
                    )}
                </div>

                {perLocationPricing && selectedLocationId && (
                    <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '0.4rem', fontSize: '0.82rem', color: '#93c5fd', marginBottom: '0.5rem' }}>
                        Editing prices for <strong>{locations.find(l => l.id === selectedLocationId)?.name}</strong>.
                        Location prices override the global sale price for this location only.
                    </div>
                )}
            </div>

            {orderedTypes.map(type => {
                const typeItems = grouped[type];
                if (!typeItems?.length) return null;
                return (
                    <div key={type} style={{ marginBottom: '3rem' }}>
                        <h2 className={styles.cardTitle} style={{ borderBottom: '1px solid #374151', paddingBottom: '0.5rem', marginBottom: '1rem', color: '#d97706' }}>
                            {type}
                        </h2>
                        <div className={styles.tableContainer}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th style={{ width: '30%' }}>Name</th>
                                        <th style={{ width: '18%' }}>
                                            Unit Price ($)
                                            <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 'normal', marginLeft: '6px' }}>(from product)</span>
                                        </th>
                                        <th style={{ width: '18%' }}>
                                            {perLocationPricing && selectedLocationId
                                                ? `${locations.find(l => l.id === selectedLocationId)?.name} Price ($)`
                                                : 'Sale Price ($)'}
                                        </th>
                                        {perLocationPricing && selectedLocationId && (
                                            <th style={{ width: '18%' }}>
                                                Global Price ($)
                                                <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 'normal', marginLeft: '4px' }}>(fallback)</span>
                                            </th>
                                        )}
                                        <th style={{ width: '14%' }}>Margin</th>
                                        <th style={{ width: '10%' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {typeItems.map(item => {
                                        const locKey = `${item.id}_${selectedLocationId}`;
                                        const globalKey = String(item.id);
                                        const activePriceVal = perLocationPricing && selectedLocationId
                                            ? (salePriceEdits[locKey] ?? '')
                                            : (salePriceEdits[globalKey] ?? '');
                                        const activePriceNum = parseFloat(activePriceVal);
                                        const displayPrice = isNaN(activePriceNum) ? (effectivePrice(item) ?? 0) : activePriceNum;
                                        const margin = displayPrice > 0 ? getMargin(item.unit_cost || 0, displayPrice) : null;

                                        return (
                                            <tr key={item.id}>
                                                <td style={{ fontWeight: 600 }}>{item.name}</td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <span style={{ color: '#e5e7eb', fontWeight: 600 }}>
                                                            ${Number(item.unit_cost || 0).toFixed(2)}
                                                        </span>
                                                        <button
                                                            onClick={() => router.push(`/admin/products?editId=${item.id}`)}
                                                            style={{ fontSize: '0.75rem', color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', padding: 0, whiteSpace: 'nowrap' }}
                                                        >
                                                            Edit →
                                                        </button>
                                                    </div>
                                                </td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        className={styles.input}
                                                        style={{ padding: '0.25rem', fontSize: '0.9em', width: '100px', marginBottom: 0 }}
                                                        value={activePriceVal}
                                                        placeholder="0.00"
                                                        onChange={e => {
                                                            const key = perLocationPricing && selectedLocationId ? locKey : globalKey;
                                                            setSalePriceEdits(prev => ({ ...prev, [key]: e.target.value }));
                                                        }}
                                                        onBlur={() => savePrice(item.id, !!(perLocationPricing && selectedLocationId))}
                                                    />
                                                </td>
                                                {perLocationPricing && selectedLocationId && (
                                                    <td>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            min="0"
                                                            className={styles.input}
                                                            style={{ padding: '0.25rem', fontSize: '0.9em', width: '100px', marginBottom: 0 }}
                                                            value={salePriceEdits[globalKey] ?? ''}
                                                            placeholder="0.00"
                                                            onChange={e => setSalePriceEdits(prev => ({ ...prev, [globalKey]: e.target.value }))}
                                                            onBlur={() => savePrice(item.id, false)}
                                                        />
                                                    </td>
                                                )}
                                                <td>
                                                    {margin !== null ? (
                                                        <span style={{ color: parseFloat(margin) >= 0 ? '#10b981' : '#ef4444', fontWeight: 600, fontSize: '0.9rem' }}>
                                                            {margin}%
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: '#4b5563' }}>—</span>
                                                    )}
                                                </td>
                                                <td>
                                                    <button
                                                        onClick={() => router.push(`/admin/products?editId=${item.id}`)}
                                                        style={{ background: '#374151', color: '#d1d5db', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                                                    >
                                                        Edit Product
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
