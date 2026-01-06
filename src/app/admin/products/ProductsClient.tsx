'use client';

import { useState, useEffect } from 'react';
import styles from '../admin.module.css';

interface Item {
    id: number;
    name: string;
    type: string;
    unit_cost: number;
    quantity: number;
}

interface Category {
    id: number;
    name: string;
}

export default function ProductsClient() {
    const [items, setItems] = useState<Item[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterType, setFilterType] = useState('All');

    // Editing State
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editForm, setEditForm] = useState<Partial<Item>>({});

    // Creating State
    const [showCreate, setShowCreate] = useState(false);
    const [newItemName, setNewItemName] = useState('');
    const [newItemType, setNewItemType] = useState('Liquor');
    const [newItemCost, setNewItemCost] = useState('');
    const [newItemQty, setNewItemQty] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [itemsRes, catsRes] = await Promise.all([
                fetch('/api/inventory?sort=name'),
                fetch('/api/admin/categories')
            ]);

            const itemsData = await itemsRes.json();
            const catsData = await catsRes.json();

            if (itemsData.items) setItems(itemsData.items);
            if (catsData.categories) setCategories(catsData.categories);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleEditClick = (item: Item) => {
        setEditingId(item.id);
        setEditForm({ ...item });
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setEditForm({});
    };

    const handleSaveEdit = async () => {
        if (!editingId) return;

        try {
            const res = await fetch('/api/inventory', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: editingId,
                    name: editForm.name,
                    type: editForm.type,
                    unit_cost: editForm.unit_cost,
                    quantity: editForm.quantity
                })
            });

            if (res.ok) {
                setEditingId(null);
                fetchData(); // Reload to confirm
            } else {
                const d = await res.json();
                alert(d.error || 'Failed to update');
            }
        } catch (e) {
            alert('Error updating item');
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this item?')) return;
        try {
            const res = await fetch(`/api/inventory?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                fetchData();
            } else {
                alert('Failed to delete');
            }
        } catch (e) {
            alert('Error deleting');
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            // First create item
            const res = await fetch('/api/inventory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newItemName, type: newItemType })
            });

            if (res.ok) {
                const data = await res.json();
                const newId = data.id;

                // Then update cost/qty if provided (since POST only takes name/type currently, or we can use PUT after)
                // Actually our POST creates it with 0 qty. 
                // Let's use PUT to set the details immediately if needed.
                if (newItemCost || newItemQty) {
                    await fetch('/api/inventory', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id: newId,
                            unit_cost: newItemCost ? parseFloat(newItemCost) : 0,
                            quantity: newItemQty ? parseInt(newItemQty) : 0
                        })
                    });
                }

                setShowCreate(false);
                setNewItemName('');
                setNewItemCost('');
                setNewItemQty('');
                fetchData();
            } else {
                const d = await res.json();
                alert(d.error || 'Failed to create');
            }
        } catch (e) {
            alert('Error creating item');
        }
    };

    const filtered = items.filter(i => {
        const matchSearch = i.name.toLowerCase().includes(search.toLowerCase());
        const matchType = filterType === 'All' || i.type === filterType;
        return matchSearch && matchType;
    });

    if (loading) return <div className={styles.container}>Loading Product List...</div>;

    return (
        <>
            <div className={styles.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <h2 className={styles.cardTitle}>Product Catalog</h2>
                    <button
                        onClick={() => setShowCreate(true)}
                        style={{ background: '#d97706', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.5rem', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}
                    >
                        + Add New Product
                    </button>
                </div>

                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    <input
                        className={styles.input}
                        placeholder="Search products..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ flex: 1, minWidth: '200px' }}
                    />
                    <select
                        className={styles.input}
                        value={filterType}
                        onChange={e => setFilterType(e.target.value)}
                        style={{ width: 'auto' }}
                    >
                        <option value="All">All Categories</option>
                        {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                </div>

                <div className={styles.tableContainer}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Type</th>
                                <th>Cost ($)</th>
                                <th>In Stock</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(item => {
                                const isEditing = editingId === item.id;
                                return (
                                    <tr key={item.id} style={isEditing ? { background: '#374151' } : {}}>
                                        {isEditing ? (
                                            <>
                                                <td>
                                                    <input
                                                        className={styles.input}
                                                        value={editForm.name}
                                                        onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                                    />
                                                </td>
                                                <td>
                                                    <select
                                                        className={styles.input}
                                                        value={editForm.type}
                                                        onChange={e => setEditForm({ ...editForm, type: e.target.value })}
                                                    >
                                                        {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                                    </select>
                                                </td>
                                                <td>
                                                    <input
                                                        className={styles.input}
                                                        type="number" step="0.01"
                                                        value={editForm.unit_cost}
                                                        onChange={e => setEditForm({ ...editForm, unit_cost: parseFloat(e.target.value) })}
                                                        style={{ width: '100px' }}
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        className={styles.input}
                                                        type="number"
                                                        value={editForm.quantity}
                                                        onChange={e => setEditForm({ ...editForm, quantity: parseInt(e.target.value) })}
                                                        style={{ width: '80px' }}
                                                    />
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <button onClick={handleSaveEdit} style={{ color: '#34d399', marginRight: '10px', fontWeight: 'bold' }}>Save</button>
                                                    <button onClick={handleCancelEdit} style={{ color: '#9ca3af' }}>Cancel</button>
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                <td>{item.name}</td>
                                                <td>{item.type}</td>
                                                <td>${item.unit_cost?.toFixed(2)}</td>
                                                <td style={{ fontWeight: 'bold', color: item.quantity === 0 ? '#ef4444' : item.quantity < 5 ? '#f59e0b' : 'inherit' }}>
                                                    {item.quantity}
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <button
                                                        onClick={() => handleEditClick(item)}
                                                        style={{
                                                            background: '#3b82f6',
                                                            color: 'white',
                                                            border: 'none',
                                                            padding: '4px 8px',
                                                            borderRadius: '4px',
                                                            cursor: 'pointer',
                                                            marginRight: '8px'
                                                        }}
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(item.id)}
                                                        style={{
                                                            background: '#ef4444',
                                                            color: 'white',
                                                            border: 'none',
                                                            padding: '4px 8px',
                                                            borderRadius: '4px',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        Delete
                                                    </button>
                                                </td>
                                            </>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {showCreate && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
                    <div style={{ background: '#111827', padding: '2rem', borderRadius: '1rem', width: '90%', maxWidth: '500px', border: '1px solid #374151' }}>
                        <h2 style={{ marginTop: 0, color: 'white' }}>Add New Product</h2>
                        <form onSubmit={handleCreate}>
                            <div style={{ marginBottom: '1rem' }}>
                                <label className={styles.statLabel}>Name</label>
                                <input style={{ width: '100%' }} className={styles.input} value={newItemName} onChange={e => setNewItemName(e.target.value)} required autoFocus />
                            </div>
                            <div style={{ marginBottom: '1rem' }}>
                                <label className={styles.statLabel}>Category</label>
                                <select style={{ width: '100%' }} className={styles.input} value={newItemType} onChange={e => setNewItemType(e.target.value)}>
                                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                </select>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                <div>
                                    <label className={styles.statLabel}>Cost ($)</label>
                                    <input style={{ width: '100%' }} className={styles.input} type="number" step="0.01" value={newItemCost} onChange={e => setNewItemCost(e.target.value)} placeholder="0.00" />
                                </div>
                                <div>
                                    <label className={styles.statLabel}>Initial Qty</label>
                                    <input style={{ width: '100%' }} className={styles.input} type="number" value={newItemQty} onChange={e => setNewItemQty(e.target.value)} placeholder="0" />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                                <button type="button" onClick={() => setShowCreate(false)} style={{ padding: '0.5rem 1rem', background: 'transparent', color: '#9ca3af', border: '1px solid #374151', borderRadius: '0.5rem', cursor: 'pointer' }}>Cancel</button>
                                <button type="submit" style={{ padding: '0.5rem 1rem', background: '#d97706', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold' }}>Create Product</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}
