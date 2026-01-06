'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './inventory.module.css';

interface Item {
    id: number;
    name: string;
    type: string;
    secondary_type?: string;
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
    iat?: number;
}

export default function InventoryClient({ user }: { user: UserSession }) {
    const [items, setItems] = useState<Item[]>([]);
    const [myActivity, setMyActivity] = useState<ActivityLog[]>([]);
    const [sort, setSort] = useState<'usage' | 'name'>('usage');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    // Filters
    const [search, setSearch] = useState('');
    const [filterType, setFilterType] = useState('All');
    const [secondaryFilter, setSecondaryFilter] = useState('');

    const [showModal, setShowModal] = useState(false);
    const [showActivityModal, setShowActivityModal] = useState(false);

    // New Item Inline State
    const [newItemName, setNewItemName] = useState('');
    const [newItemType, setNewItemType] = useState('Liquor');
    const [newItemSecondary, setNewItemSecondary] = useState('');

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
            const res = await fetch(`/api/inventory?sort=${sort}`);
            const data = await res.json();
            if (res.ok) {
                let sorted = data.items;
                if (sort === 'name') {
                    sorted.sort((a: Item, b: Item) => sortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));
                } else {
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
            const res = await fetch('/api/user/activity');
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
                fetchActivity();
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
                body: JSON.stringify({ name: newItemName, type: newItemType, secondary_type: newItemSecondary || undefined })
            });
            if (res.ok) {
                setShowModal(false);
                setNewItemName('');
                setNewItemSecondary('');
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
        router.refresh();
    };

    const clearFilters = () => {
        setSearch('');
        setFilterType('All');
        setSecondaryFilter('');
    };

    // Filter Logic
    const filteredItems = items.filter(item => {
        const matchesType = filterType === 'All' || item.type === filterType;
        const matchesSecondary = !secondaryFilter || item.secondary_type === secondaryFilter;
        const matchesSearch = !search || item.name.toLowerCase().includes(search.toLowerCase());
        return matchesType && matchesSecondary && matchesSearch;
    });

    // Get current category subcats
    const currentCat = categories.find(c => c.name === filterType);
    const subCats = currentCat?.sub_categories || [];

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <h1 style={{ margin: 0, fontSize: '2.5rem', fontWeight: 'bold', color: '#fbbf24', lineHeight: 1.2 }}>{user.firstName}</h1>
                    <div className={styles.title} style={{ fontSize: '1rem', opacity: 0.7, margin: 0 }}>Foster's Stock</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {canAddItem && (
                        <button
                            onClick={() => setShowModal(true)}
                            className={styles.newItemBtn}
                            style={{ height: 'auto', padding: '0.5rem 1rem', fontSize: '0.9rem', margin: 0 }}
                        >
                            + Add Item
                        </button>
                    )}
                    <button
                        onClick={() => { fetchActivity(); setShowActivityModal(true); }}
                        className={styles.completedBtn}
                    >
                        Completed / Return to Dashboard
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
            </div>

            {/* Filter Section */}
            <div style={{ padding: '0 1rem 1rem 1rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <input
                        className={styles.input}
                        placeholder="Type to search..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ flex: 1 }}
                    />
                    <button onClick={clearFilters} style={{ background: '#374151', color: '#9ca3af', border: 'none', borderRadius: '0.5rem', padding: '0 1rem', cursor: 'pointer' }}>
                        Clear
                    </button>
                </div>

                {/* Main Category Filter */}
                <div className={styles.filters} style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                    {['All', ...categories.map(c => c.name)].map((type: string) => (
                        <button
                            key={type}
                            onClick={() => { setFilterType(type); setSecondaryFilter(''); }}
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

                {/* Secondary Category Filter */}
                {subCats.length > 0 && (
                    <div className={styles.filters} style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', marginTop: '0.5rem' }}>
                        {subCats.map((sub: string) => (
                            <button
                                key={sub}
                                onClick={() => setSecondaryFilter(sub === secondaryFilter ? '' : sub)}
                                style={{
                                    padding: '0.25rem 0.75rem',
                                    borderRadius: '15px',
                                    border: '1px solid #4b5563',
                                    background: secondaryFilter === sub ? '#2563eb' : '#374151',
                                    color: 'white',
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                {sub}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className={styles.list}>
                {filteredItems.map(item => (
                    <div key={item.id} className={styles.itemCard}>
                        <div className={styles.itemInfo}>
                            <div className={styles.itemName}>{item.name}</div>
                            <div className={styles.itemType}>
                                {item.type}
                                {item.secondary_type && <span style={{ opacity: 0.7, marginLeft: '6px', fontSize: '0.85em' }}>• {item.secondary_type}</span>}
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
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'flex-end', width: '100%' }}>
                                            {options.sort((a: number, b: number) => a - b).map((amt: number) => (
                                                <div key={amt} className={styles.stockGroup}>
                                                    <span style={{ color: '#9ca3af', fontSize: '0.8rem', marginRight: '0.25rem' }}>{amt}:</span>
                                                    <button className={`${styles.stockBtn} ${styles.minusBtn}`} onClick={() => handleAdjust(item.id, -amt)}>-</button>
                                                    <button className={`${styles.stockBtn} ${styles.plusBtn}`} disabled={!canAddStock} onClick={() => handleAdjust(item.id, amt)}>+</button>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                ))}
                {filteredItems.length === 0 && (
                    <div style={{ textAlign: 'center', color: '#6b7280', padding: '2rem' }}>
                        No items found match your filters.
                    </div>
                )}
            </div>

            {editingItem && (
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
            )}


            {showModal && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modal}>
                        <h2 className={styles.modalTitle}>Add New Item</h2>
                        <form onSubmit={handleCreateItem}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Name</label>
                                <input
                                    className={styles.input}
                                    value={newItemName}
                                    onChange={e => setNewItemName(e.target.value)}
                                    placeholder="Item Name"
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Type</label>
                                <select className={styles.input} value={newItemType} onChange={e => setNewItemType(e.target.value)}>
                                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                </select>
                            </div>
                            {(() => {
                                const cat = categories.find(c => c.name === newItemType);
                                if (cat && cat.sub_categories && cat.sub_categories.length > 0) {
                                    return (
                                        <div className={styles.formGroup}>
                                            <label className={styles.label}>Sub-Category</label>
                                            <select className={styles.input} value={newItemSecondary} onChange={e => setNewItemSecondary(e.target.value)}>
                                                <option value="">(None)</option>
                                                {cat.sub_categories.map((sub: string) => <option key={sub} value={sub}>{sub}</option>)}
                                            </select>
                                        </div>
                                    );
                                }
                                return null;
                            })()}
                            <div className={styles.modalActions}>
                                <button type="button" className={styles.cancelBtn} onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className={styles.submitModalBtn} disabled={loading}>
                                    {loading ? '...' : 'Create Item'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {showActivityModal && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modal}>
                        <h2 className={styles.modalTitle}>Session Activity</h2>
                        <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '1rem' }}>
                            {myActivity
                                .filter(log => !user.iat || new Date(log.timestamp).getTime() > user.iat * 1000)
                                .length === 0 ? <div style={{ color: '#9ca3af', textAlign: 'center' }}>No activity in this session.</div> : (
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                    {myActivity
                                        .filter(log => !user.iat || new Date(log.timestamp).getTime() > user.iat * 1000)
                                        .map(log => {
                                            let displayText = log.details;
                                            try {
                                                const json = JSON.parse(log.details);
                                                if (log.action === 'ADD_STOCK') {
                                                    displayText = `Added ${json.quantity} to ${json.itemName}`;
                                                } else if (log.action === 'SUBTRACT_STOCK') {
                                                    displayText = `Removed ${json.quantity} from ${json.itemName}`;
                                                }
                                            } catch { }

                                            return (
                                                <li key={log.id} style={{ borderBottom: '1px solid #374151', padding: '0.75rem 0' }}>
                                                    <div style={{ fontWeight: 'bold', color: 'white' }}>{displayText}</div>
                                                    <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                                                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </li>
                                            );
                                        })}
                                </ul>
                            )}
                        </div>
                        <div className={styles.modalActions}>
                            <button
                                className={styles.submitModalBtn}
                                onClick={() => {
                                    if (user.role === 'admin') {
                                        router.push('/admin/dashboard');
                                    } else {
                                        setShowActivityModal(false);
                                    }
                                }}
                                style={{ width: '100%' }}
                            >
                                {user.role === 'admin' ? 'Return to Dashboard' : 'Close'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
