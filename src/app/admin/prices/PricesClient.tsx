'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from '../admin.module.css';

interface Item {
    id: number;
    name: string;
    type: string;
    unit_cost: number;
    sale_price?: number;
}

export default function PricesClient() {
    const [items, setItems] = useState<Item[]>([]);
    const [categories, setCategories] = useState<string[]>(['Liquor', 'Beer', 'Wine', 'Seltzer', 'THC']);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    // Local sale price edits before save
    const [salePriceEdits, setSalePriceEdits] = useState<Record<number, string>>({});

    useEffect(() => {
        fetchItems();
        fetchCategories();
    }, []);

    const fetchCategories = async () => {
        try {
            const res = await fetch('/api/admin/categories');
            const data = await res.json();
            if (data.categories) setCategories(data.categories.map((c: any) => c.name));
        } catch { }
    };

    const fetchItems = async () => {
        const res = await fetch('/api/inventory');
        const data = await res.json();
        if (data.items) {
            setItems(data.items);
            // Seed local edit state
            const initial: Record<number, string> = {};
            data.items.forEach((i: Item) => {
                initial[i.id] = i.sale_price !== null && i.sale_price !== undefined ? String(i.sale_price) : '';
            });
            setSalePriceEdits(initial);
        }
        setLoading(false);
    };

    const saveSalePrice = async (id: number) => {
        const raw = salePriceEdits[id];
        const num = raw === '' ? null : parseFloat(raw);
        if (num !== null && isNaN(num)) return;

        // Optimistic update
        setItems(prev => prev.map(i => i.id === id ? { ...i, sale_price: num ?? undefined } : i));

        try {
            await fetch('/api/inventory', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, sale_price: num })
            });
        } catch {
            fetchItems();
        }
    };

    const getMargin = (unitCost: number, salePrice: number) => {
        if (!salePrice || salePrice <= 0) return null;
        return ((salePrice - unitCost) / salePrice * 100).toFixed(1);
    };

    const filteredItems = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

    const grouped: Record<string, Item[]> = {};
    categories.forEach(cat => {
        grouped[cat] = filteredItems.filter(i => i.type === cat);
    });

    if (loading) return <div className={styles.container}>Loading...</div>;

    return (
        <div className={styles.card}>
            <div style={{ marginBottom: '1.5rem' }}>
                <p style={{ color: '#9ca3af', fontSize: '0.9rem', margin: '0 0 1rem 0' }}>
                    Unit prices are set on the{' '}
                    <Link href="/admin/products" style={{ color: '#3b82f6', textDecoration: 'underline' }}>
                        Product List
                    </Link>
                    {' '}and are read-only here. Set a sale price per item to enable profit reporting.
                </p>
                <input
                    className={styles.input}
                    placeholder="Search items..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>

            {Object.entries(grouped).map(([type, typeItems]) => (
                typeItems.length > 0 && (
                    <div key={type} style={{ marginBottom: '3rem' }}>
                        <h2 className={styles.cardTitle} style={{ borderBottom: '1px solid #374151', paddingBottom: '0.5rem', marginBottom: '1rem', color: '#d97706' }}>
                            {type}
                        </h2>
                        <div className={styles.tableContainer}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th style={{ width: '35%' }}>Name</th>
                                        <th style={{ width: '20%' }}>
                                            Unit Price ($)
                                            <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 'normal', marginLeft: '6px' }}>
                                                (from product)
                                            </span>
                                        </th>
                                        <th style={{ width: '20%' }}>Sale Price ($)</th>
                                        <th style={{ width: '15%' }}>Margin</th>
                                        <th style={{ width: '10%' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {typeItems.map(item => {
                                        const saleVal = salePriceEdits[item.id] ?? '';
                                        const saleNum = parseFloat(saleVal);
                                        const margin = !isNaN(saleNum) && saleNum > 0 ? getMargin(item.unit_cost || 0, saleNum) : null;
                                        return (
                                            <tr key={item.id}>
                                                <td style={{ fontWeight: 600 }}>{item.name}</td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <span style={{ color: '#e5e7eb', fontWeight: 600 }}>
                                                            ${Number(item.unit_cost || 0).toFixed(2)}
                                                        </span>
                                                        <Link
                                                            href={`/admin/products`}
                                                            style={{ fontSize: '0.75rem', color: '#3b82f6', whiteSpace: 'nowrap' }}
                                                        >
                                                            Edit →
                                                        </Link>
                                                    </div>
                                                </td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        className={styles.input}
                                                        style={{ padding: '0.25rem', fontSize: '0.9em', width: '100px', marginBottom: 0 }}
                                                        value={saleVal}
                                                        placeholder="0.00"
                                                        onChange={e => setSalePriceEdits(prev => ({ ...prev, [item.id]: e.target.value }))}
                                                        onBlur={() => saveSalePrice(item.id)}
                                                    />
                                                </td>
                                                <td>
                                                    {margin !== null ? (
                                                        <span style={{
                                                            color: parseFloat(margin) >= 0 ? '#10b981' : '#ef4444',
                                                            fontWeight: 600,
                                                            fontSize: '0.9rem'
                                                        }}>
                                                            {margin}%
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: '#4b5563' }}>—</span>
                                                    )}
                                                </td>
                                                <td>
                                                    <Link
                                                        href="/admin/products"
                                                        style={{
                                                            background: '#374151',
                                                            color: '#d1d5db',
                                                            border: 'none',
                                                            padding: '4px 8px',
                                                            borderRadius: '4px',
                                                            cursor: 'pointer',
                                                            fontSize: '0.8rem',
                                                            textDecoration: 'none',
                                                            display: 'inline-block'
                                                        }}
                                                    >
                                                        Edit Product
                                                    </Link>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            ))}
        </div>
    );
}
