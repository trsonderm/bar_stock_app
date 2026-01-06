'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../admin.module.css';

interface Item {
    id: number;
    name: string;
    type: string;
    unit_cost: number;
}

export default function PricesClient() {
    const router = useRouter();
    const [items, setItems] = useState<Item[]>([]);
    const [categories, setCategories] = useState<string[]>(['Liquor', 'Beer', 'Wine', 'Seltzer', 'THC']);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    // Local state for edits before save? Or save on blur. 
    // We'll use a local map for "dirty" values to allow typing without jitter
    // But for simplicity, we can just edit directly and save on blur.

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
        if (data.items) setItems(data.items);
        setLoading(false);
    };

    const handleLogout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/');
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this item? This action cannot be undone and will remove it from inventory.')) return;

        try {
            const res = await fetch(`/api/inventory?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                fetchItems(); // Reload
            } else {
                const err = await res.json();
                alert(err.error || 'Failed to delete item');
            }
        } catch (e) {
            console.error('Failed to delete item', e);
            alert('Error deleting item');
        }
    };

    const updatePrice = async (id: number, newCost: number) => {
        // Optimistic update
        setItems(prev => prev.map(i => i.id === id ? { ...i, unit_cost: newCost } : i));

        try {
            await fetch('/api/inventory', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, unit_cost: newCost })
            });
        } catch (e) {
            console.error('Failed to update price', e);
            fetchItems(); // Revert on error
        }
    };

    // Calculate derived prices for display/input
    const getSixPack = (unit: number) => (unit * 6).toFixed(2);
    const getTwentyFourPack = (unit: number) => (unit * 24).toFixed(2);

    const handlePriceChange = (id: number, val: string, packSize: 1 | 6 | 24) => {
        const num = parseFloat(val);
        if (isNaN(num)) return; // Ignore invalid

        const unitCost = num / packSize;
        updatePrice(id, parseFloat(unitCost.toFixed(4))); // Store with precision
    };

    const filteredItems = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

    // Dynamic grouping
    const grouped: Record<string, Item[]> = {};
    categories.forEach(cat => {
        grouped[cat] = filteredItems.filter(i => i.type === cat);
    });
    // Catch-all for unknown categories?
    // Not needed if we only allow creation via known categories.

    if (loading) return <div className={styles.container}>Loading...</div>;

    return (
        <div className={styles.card}>
            <input
                className={styles.input}
                placeholder="Search items..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ marginBottom: '2rem' }}
            />

            {Object.entries(grouped).map(([type, typeItems]) => (
                typeItems.length > 0 && (
                    <div key={type} style={{ marginBottom: '3rem' }}>
                        <h2 className={styles.cardTitle} style={{ borderBottom: '1px solid #374151', paddingBottom: '0.5rem', marginBottom: '1rem', color: '#d97706' }}>
                            {type}
                        </h2>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th style={{ width: '40%' }}>Name</th>
                                    <th style={{ width: '20%' }}>Unit Cost ($)</th>
                                    {/* Dynamic Columns based on Type */}
                                    {type === 'Beer' && <th style={{ width: '20%' }}>6-Pack Price</th>}
                                    {type === 'Beer' && <th style={{ width: '20%' }}>24-Pack Price</th>}
                                    {(type === 'Liquor' || type === 'Wine') && <th style={{ width: '40%' }}>Bottle Price ($)</th>}
                                    <th style={{ width: '50px' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {typeItems.map(item => (
                                    <tr key={item.id}>
                                        <td>{item.name}</td>
                                        <td>
                                            <input
                                                type="number"
                                                step="0.01"
                                                className={styles.input}
                                                style={{ padding: '0.25rem', fontSize: '0.9em', width: '100px' }}
                                                value={item.unit_cost || ''}
                                                onChange={e => handlePriceChange(item.id, e.target.value, 1)}
                                            />
                                        </td>

                                        {/* Beer Logic */}
                                        {type === 'Beer' && (
                                            <>
                                                <td>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        className={styles.input}
                                                        style={{ padding: '0.25rem', fontSize: '0.9em', width: '100px' }}
                                                        value={item.unit_cost ? getSixPack(item.unit_cost) : ''}
                                                        onChange={e => handlePriceChange(item.id, e.target.value, 6)}
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        className={styles.input}
                                                        style={{ padding: '0.25rem', fontSize: '0.9em', width: '100px' }}
                                                        value={item.unit_cost ? getTwentyFourPack(item.unit_cost) : ''}
                                                        onChange={e => handlePriceChange(item.id, e.target.value, 24)}
                                                    />
                                                </td>
                                            </>
                                        )}

                                        {/* Liquor/Wine Logic: Treat Unit as Bottle */}
                                        {(type === 'Liquor' || type === 'Wine') && (
                                            <td>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    className={styles.input}
                                                    style={{ padding: '0.25rem', fontSize: '0.9em', width: '100px' }}
                                                    value={item.unit_cost || ''}
                                                    onChange={e => handlePriceChange(item.id, e.target.value, 1)} // Same as unit
                                                />
                                            </td>
                                        )}
                                        <td>
                                            <button
                                                onClick={() => handleDelete(item.id)}
                                                style={{
                                                    background: '#ef4444',
                                                    color: 'white',
                                                    border: 'none',
                                                    padding: '4px 8px',
                                                    borderRadius: '4px',
                                                    cursor: 'pointer',
                                                    fontSize: '0.8rem'
                                                }}
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )
            ))}
        </div>
    );
}
