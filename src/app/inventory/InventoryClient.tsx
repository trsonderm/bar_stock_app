'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './inventory.module.css';

interface Item {
    id: number;
    name: string;
    type: string;
    quantity: number;
    unit_cost: number;
}

interface ActivityLog {
    id: number;
    action: string;
    details: string;
    timestamp: string;
}

interface UserSession {
    firstName: string;
    role: string;
    permissions: string[];
}

export default function InventoryClient({ user }: { user: UserSession }) {
    const [items, setItems] = useState<Item[]>([]);
    const [myActivity, setMyActivity] = useState<ActivityLog[]>([]);
    const [sort, setSort] = useState<'usage' | 'name'>('usage');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc'); // default most used desc
    const [filterType, setFilterType] = useState<'All' | 'Liquor' | 'Beer' | 'Seltzer' | 'THC' | 'Wine'>('All');
    const [showModal, setShowModal] = useState(false);

    // Completed Activity Modal
    const [showActivityModal, setShowActivityModal] = useState(false);

    const [newItemName, setNewItemName] = useState('');
    const [newItemType, setNewItemType] = useState('Liquor');
    const [categories, setCategories] = useState<any[]>([]); // Full Category objects
    const [loading, setLoading] = useState(false);

    // Cost Edit State
    const [editingItem, setEditingItem] = useState<Item | null>(null);
    const [editCost, setEditCost] = useState('');
    const [pack6Cost, setPack6Cost] = useState('');
    const [pack24Cost, setPack24Cost] = useState('');
    const [lastBasis, setLastBasis] = useState<'unit' | '6' | '24'>('unit');

    const router = useRouter();

    const canAddStock = user.role === 'admin' || user.permissions.includes('add_stock') || user.permissions.includes('all');
    const canAddItem = user.role === 'admin' || user.permissions.includes('add_item_name') || user.permissions.includes('all');

    const fetchItems = async () => {
        try {
            // we handle sort locally for arrows or pass param? 
            // API only supports basic sort. Let's sorting on client for full control of arrows
            const res = await fetch(`/api/inventory?sort=${sort}`);
            const data = await res.json();
            if (res.ok) {
                let sorted = data.items;
                if (sort === 'name') {
                    sorted.sort((a: Item, b: Item) => sortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));
                } else {
                    // Usage sort (assuming API returns usage_count or we assume quantity?)
                    // The API currently returns usage_count.
                    sorted.sort((a: any, b: any) => sortDir === 'asc' ? a.usage_count - b.usage_count : b.usage_count - a.usage_count);
                }
                setItems(sorted);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const fetchActivity = async () => {
        try {
            const res = await fetch('/api/user/activity'); // Will create this
            if (res.ok) {
                const data = await res.json();
                setMyActivity(data.logs);
            }
        } catch { }
    };

    const fetchCategories = async () => {
        try {
            const res = await fetch('/api/admin/categories');
            const data = await res.json();
            if (data.categories) {
                setCategories(data.categories);
            }
        } catch { }
    };

    useEffect(() => {
        fetchItems();
        fetchActivity();
        fetchCategories();
    }, [sort, sortDir]);

    const toggleSort = (field: 'usage' | 'name') => {
        if (sort === field) {
            setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSort(field);
            setSortDir(field === 'name' ? 'asc' : 'desc');
        }
    };

    const handleAdjust = async (itemId: number, change: number) => {
        // Optimistic update
        setItems(prev => prev.map(i => i.id === itemId ? { ...i, quantity: Math.max(0, i.quantity + change) } : i));

        try {
            const res = await fetch('/api/inventory/adjust', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemId, change })
            });
            if (!res.ok) {
                fetchItems(); // Sync back
                alert('Failed to update stock');
            } else {
                fetchActivity(); // Refresh activity
            }
        } catch (e) {
            fetchItems();
        }
    };

    const handleCreateItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newItemName) return;
        setLoading(true);
        try {
            const res = await fetch('/api/inventory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newItemName, type: newItemType })
            });
            if (res.ok) {
                setShowModal(false);
                setNewItemName('');
                fetchItems();
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to create item');
            }
        } finally {
            setLoading(false);
        }
    };

    const openCostModal = (item: Item) => {
        setEditingItem(item);
        const c = item.unit_cost || 0;
        setEditCost(c.toString());
        setPack6Cost((c * 6).toFixed(2));
        setPack24Cost((c * 24).toFixed(2));
    };

    const handleCostChange = (val: string, source: 'unit' | '6' | '24') => {
        if (source === 'unit') {
            setEditCost(val);
            const v = parseFloat(val);
            if (!isNaN(v)) {
                setPack6Cost((v * 6).toFixed(2));
                setPack24Cost((v * 24).toFixed(2));
            }
        } else if (source === '6') {
            setPack6Cost(val);
            const v = parseFloat(val);
            if (!isNaN(v)) {
                const unit = v / 6;
                setEditCost(unit.toFixed(4));
                setPack24Cost((unit * 24).toFixed(2));
            }
        } else if (source === '24') {
            setPack24Cost(val);
            const v = parseFloat(val);
            if (!isNaN(v)) {
                const unit = v / 24;
                setEditCost(unit.toFixed(4));
                setPack6Cost((unit * 6).toFixed(2));
            }
        }
    };

    const saveCost = async () => {
        if (!editingItem) return;
        const cost = parseFloat(editCost);
        if (isNaN(cost)) return;

        await fetch('/api/inventory', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: editingItem.id, unit_cost: cost })
        });
        setEditingItem(null);
        fetchItems();
    };

    const handleLogout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/');
        router.refresh(); // Ensure strict refresh
    };

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div className={styles.title}>Foster's Stock</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button
                        onClick={() => { fetchActivity(); setShowActivityModal(true); }}
                        className={styles.completedBtn}
                    >
                        Completed
                    </button>
                    <button onClick={handleLogout} className={styles.logoutBtn}>Logout</button>
                </div>
            </header>

            <div className={styles.controls}>
                <button
                    className={`${styles.sortBtn} ${sort === 'usage' ? styles.sortBtnActive : ''}`}
                    onClick={() => toggleSort('usage')}
                >
                    Most Used {sort === 'usage' && (sortDir === 'asc' ? '▲' : '▼')}
                </button>
                <button
                    className={`${styles.sortBtn} ${sort === 'name' ? styles.sortBtnActive : ''}`}
                    onClick={() => toggleSort('name')}
                >
                    A-Z {sort === 'name' && (sortDir === 'asc' ? '▲' : '▼')}
                </button>

                {canAddItem && (
                    <button className={styles.newItemBtn} onClick={() => setShowModal(true)}>
                        + New Item
                    </button>
                )}
            </div>

            <div className={styles.filters} style={{ display: 'flex', gap: '0.5rem', padding: '0 1rem 1rem 1rem', overflowX: 'auto' }}>
                {['All', ...categories.map(c => c.name)].map((type: string) => (
                    <button
                        key={type}
                        onClick={() => setFilterType(type as any)}
                        style={{
                            padding: '0.5rem 1rem',
                            borderRadius: '20px',
                            border: '1px solid #374151',
                            background: filterType === type ? '#d97706' : '#1f2937',
                            color: 'white',
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        {type}
                    </button>
                ))}
            </div>

            <div className={styles.list}>
                {items.filter(i => filterType === 'All' || i.type === filterType).map(item => (
                    <div key={item.id} className={styles.itemCard}>
                        <div className={styles.itemInfo}>
                            <div className={styles.itemName}>{item.name}</div>
                            <div className={styles.itemType}>
                                {item.type}
                                {canAddItem && (
                                    <span
                                        onClick={() => openCostModal(item)}
                                        style={{ marginLeft: '8px', cursor: 'pointer', opacity: 0.6, fontSize: '0.9em' }}
                                        title={`Unit Cost: $${item.unit_cost || 0}`}
                                    >
                                        💲
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className={styles.stockControls}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <span className={styles.quantity} style={{ fontSize: '1.5rem' }}>{item.quantity}</span>
                            </div>

                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                                {(() => {
                                    // Find category options
                                    const cat = categories.find(c => c.name === item.type);
                                    // Default to [1] if not found or no options, or if fetching logic hasn't populated fully. 
                                    const options = (cat && cat.stock_options && cat.stock_options.length > 0) ? cat.stock_options : [1];

                                    return (
                                        <>
                                            {options.sort((a: number, b: number) => a - b).map((amt: number) => (
                                                <div key={amt} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    <button className={`${styles.stockBtn} ${styles.plusBtn}`} disabled={!canAddStock} onClick={() => handleAdjust(item.id, amt)} style={!canAddStock ? { opacity: 0.2, fontSize: '0.7rem', padding: '0.25rem' } : { fontSize: '0.7rem', padding: '0.25rem' }}>+{amt}</button>
                                                    <button className={`${styles.stockBtn} ${styles.minusBtn}`} onClick={() => handleAdjust(item.id, -amt)} style={{ fontSize: '0.7rem', padding: '0.25rem' }}>-{amt}</button>
                                                </div>
                                            ))}
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                ))}
                {items.length === 0 && (
                    <div style={{ textAlign: 'center', color: '#6b7280', padding: '2rem' }}>
                        No items found. {canAddItem ? 'Add one above!' : 'Ask an admin to add items.'}
                    </div>
                )}
            </div>

            {
                showModal && (
                    <div className={styles.modalOverlay}>
                        <div className={styles.modal}>
                            <h2 className={styles.modalTitle}>Add New Item</h2>
                            <form onSubmit={handleCreateItem}>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Item Name</label>
                                    <input
                                        className={styles.input}
                                        value={newItemName}
                                        onChange={(e) => setNewItemName(e.target.value)}
                                        placeholder="e.g. Jack Daniels"
                                        autoFocus
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Type</label>
                                    <select
                                        className={styles.input}
                                        value={newItemType}
                                        onChange={(e) => setNewItemType(e.target.value)}
                                    >
                                        {categories.map(cat => (
                                            <option key={cat.name} value={cat.name}>{cat.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className={styles.modalActions}>
                                    <button type="button" className={styles.cancelBtn} onClick={() => setShowModal(false)}>Cancel</button>
                                    <button type="submit" className={styles.submitModalBtn} disabled={loading}>
                                        {loading ? 'Saving...' : 'Create Item'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }
            {
                editingItem && (
                    <div className={styles.modalOverlay}>
                        <div className={styles.modal}>
                            <h2 className={styles.modalTitle}>Set Cost: {editingItem.name}</h2>
                            <div className={styles.modalActions} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '1rem', width: '100%' }}>
                                <label style={{ color: '#aaa', fontSize: '0.9rem' }}>Pricing Basis (Click to select input mode):</label>
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: lastBasis === 'unit' ? '#fbbf24' : 'white' }}>
                                        <input type="radio" checked={lastBasis === 'unit'} onChange={() => setLastBasis('unit')} /> Unit (Bottle/Can)
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: lastBasis === '6' ? '#fbbf24' : 'white' }}>
                                        <input type="radio" checked={lastBasis === '6'} onChange={() => setLastBasis('6')} /> 6-Pack
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: lastBasis === '24' ? '#fbbf24' : 'white' }}>
                                        <input type="radio" checked={lastBasis === '24'} onChange={() => setLastBasis('24')} /> 24-Pack
                                    </label>
                                </div>
                            </div>

                            <div className={styles.formGroup} style={lastBasis !== 'unit' ? { opacity: 0.6 } : {}}>
                                <label className={styles.label}>Unit Cost ($)</label>
                                <input
                                    className={styles.input}
                                    type="number"
                                    step="0.01"
                                    value={editCost}
                                    onChange={(e) => { setLastBasis('unit'); handleCostChange(e.target.value, 'unit'); }}
                                />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className={styles.formGroup} style={lastBasis !== '6' ? { opacity: 0.6 } : {}}>
                                    <label className={styles.label}>6-Pack Price</label>
                                    <input className={styles.input} type="number" step="0.01" value={pack6Cost} onChange={(e) => { setLastBasis('6'); handleCostChange(e.target.value, '6'); }} />
                                </div>
                                <div className={styles.formGroup} style={lastBasis !== '24' ? { opacity: 0.6 } : {}}>
                                    <label className={styles.label}>24-Pack Price</label>
                                    <input className={styles.input} type="number" step="0.01" value={pack24Cost} onChange={(e) => { setLastBasis('24'); handleCostChange(e.target.value, '24'); }} />
                                </div>
                            </div>

                            <div style={{ marginTop: '0.5rem', marginBottom: '1rem', color: '#fbbf24', fontSize: '0.9rem' }}>
                                {lastBasis === 'unit' && `Saving Unit Cost: $${editCost}`}
                                {lastBasis === '6' && `Saving Unit Cost: $${editCost} (Derived from 6-Pack: $${pack6Cost})`}
                                {lastBasis === '24' && `Saving Unit Cost: $${editCost} (Derived from 24-Pack: $${pack24Cost})`}
                            </div>

                            <div className={styles.modalActions}>
                                <button type="button" className={styles.cancelBtn} onClick={() => setEditingItem(null)}>Cancel</button>
                                <button type="button" className={styles.submitModalBtn} onClick={saveCost}>Save Cost</button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
