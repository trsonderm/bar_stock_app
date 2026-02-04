'use client';

import { useState, useEffect } from 'react';
import styles from '../admin.module.css';

interface Item {
    id: number;
    name: string;
    type: string;
    secondary_type?: string;
    unit_cost: number;
    quantity: number;
    supplier?: string;
    supplier_id?: number;
    low_stock_threshold?: number;
    order_size?: number;
}

interface Category {
    id: number;
    name: string;
    sub_categories?: string[];
}

export default function ProductsClient({ overrideOrgId }: { overrideOrgId?: number }) {
    const [items, setItems] = useState<Item[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [suppliers, setSuppliers] = useState<{ id: number, name: string }[]>([]);
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
    const [newItemSupplier, setNewItemSupplier] = useState('');
    const [newItemSupplierId, setNewItemSupplierId] = useState<number | undefined>(undefined);
    const [newItemThreshold, setNewItemThreshold] = useState('5');
    const [newItemOrderSize, setNewItemOrderSize] = useState('1');
    const [newItemTrackQty, setNewItemTrackQty] = useState(true);

    const [stockMode, setStockMode] = useState<string>('CATEGORY');

    useEffect(() => {
        fetchData();
        fetch('/api/admin/settings').then(r => r.json()).then(d => {
            if (d.settings?.stock_count_mode) setStockMode(d.settings.stock_count_mode);
        });
    }, [overrideOrgId]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const inventoryUrl = overrideOrgId ? `/api/inventory?sort=name&orgId=${overrideOrgId}` : '/api/inventory?sort=name';
            const catsUrl = overrideOrgId ? `/api/admin/categories?orgId=${overrideOrgId}` : '/api/admin/categories';
            const suppliersUrl = overrideOrgId ? `/api/admin/suppliers?orgId=${overrideOrgId}` : '/api/admin/suppliers';

            const [itemsRes, catsRes, suppRes] = await Promise.all([
                fetch(inventoryUrl),
                fetch(catsUrl),
                fetch(suppliersUrl)
            ]);

            const itemsData = await itemsRes.json();
            const catsData = await catsRes.json();
            const suppData = await suppRes.json();

            if (itemsData.items) setItems(itemsData.items);
            if (catsData.categories) setCategories(catsData.categories);
            if (suppData.suppliers) setSuppliers(suppData.suppliers);
        } catch (e: any) {
            console.error(e);
            alert('Error loading inventory: ' + (e.message || 'Unknown error'));
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
            const url = overrideOrgId ? `/api/inventory?orgId=${overrideOrgId}` : '/api/inventory';
            const res = await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: editingId,
                    name: editForm.name,
                    type: editForm.type,
                    secondary_type: editForm.secondary_type,
                    unit_cost: editForm.unit_cost,
                    quantity: editForm.quantity,
                    supplier: editForm.supplier,
                    supplier_id: editForm.supplier_id,
                    low_stock_threshold: editForm.low_stock_threshold,
                    order_size: editForm.order_size
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
            const url = overrideOrgId ? `/api/inventory?id=${id}&orgId=${overrideOrgId}` : `/api/inventory?id=${id}`;
            const res = await fetch(url, { method: 'DELETE' });
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
            console.log('Creating item:', { name: newItemName, type: newItemType, supplier: newItemSupplier });
            // First create item
            const res = await fetch('/api/inventory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newItemName,
                    type: newItemType,
                    supplier: newItemSupplier,
                    supplier_id: newItemSupplierId,
                    track_quantity: newItemTrackQty ? 1 : 0,
                    low_stock_threshold: newItemThreshold === '' ? null : parseInt(newItemThreshold),
                    order_size: newItemOrderSize ? parseInt(newItemOrderSize) : 1
                })
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
                setNewItemSupplier('');
                setNewItemSupplierId(undefined); // Reset
                fetchData();
            } else {
                const d = await res.json();
                alert(d.error || 'Failed to create');
            }
        } catch (e) {
            console.error(e);
            alert('Error creating item');
        }
    };

    const handleDeleteAll = async () => {
        if (!confirm('WARNING: This will DELETE ALL PRODUCTS and INVENTORY LEVELS. This action cannot be undone. Are you sure?')) return;
        if (!confirm('Double Check: Are you absolutely sure you want to wipe the entire database of products?')) return;

        try {
            const res = await fetch('/api/admin/products/delete-all', { method: 'DELETE' });
            if (res.ok) {
                alert('All products deleted.');
                fetchData();
            } else {
                alert('Failed to delete products');
            }
        } catch (e) {
            alert('Error deleting products');
        }
    };

    const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            setLoading(true);
            const res = await fetch('/api/admin/products/import', {
                method: 'POST',
                body: formData
            });

            const data = await res.json();
            if (res.ok) {
                alert(`Import Successful! Added: ${data.count}, Skipped (Duplicates): ${data.skipped}`);
                fetchData();
            } else {
                alert('Import Failed: ' + (data.error || 'Unknown error'));
            }
        } catch (e) {
            alert('Error importing CSV');
        } finally {
            setLoading(false);
            e.target.value = ''; // Reset input
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
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                            onClick={handleDeleteAll}
                            style={{ background: '#ef4444', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.5rem', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}
                        >
                            Delete All
                        </button>
                        <button
                            onClick={() => document.getElementById('csvInput')?.click()}
                            style={{ background: '#10b981', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.5rem', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}
                        >
                            Import CSV
                        </button>
                        <input
                            id="csvInput"
                            type="file"
                            accept=".csv"
                            style={{ display: 'none' }}
                            onChange={handleImportCSV}
                        />
                        <button
                            onClick={() => setShowCreate(true)}
                            style={{ background: '#d97706', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.5rem', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}
                        >
                            + Add New Product
                        </button>
                    </div>
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
                                <th>Sub-Category</th>
                                <th>Supplier</th>
                                <th>Cost ($)</th>
                                <th>Order Qty</th>
                                {stockMode === 'PRODUCT' && <th>In Stock</th>}
                                <th>Low Limit</th>
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
                                                        onChange={e => setEditForm({ ...editForm, type: e.target.value, secondary_type: '' })}
                                                    >
                                                        {categories.map((c, i) => <option key={`cat-${c.id}-${i}`} value={c.name}>{c.name}</option>)}
                                                    </select>
                                                </td>
                                                <td>
                                                    <select
                                                        className={styles.input}
                                                        value={editForm.secondary_type || ''}
                                                        onChange={e => setEditForm({ ...editForm, secondary_type: e.target.value })}
                                                    >
                                                        <option value="">(None)</option>
                                                        {(() => {
                                                            const cat = categories.find(c => c.name === editForm.type);
                                                            return cat?.sub_categories?.map((sub: string) => (
                                                                <option key={sub} value={sub}>{sub}</option>
                                                            ));
                                                        })()}
                                                    </select>
                                                </td>
                                                <td>
                                                    {suppliers.length > 0 ? (
                                                        <select
                                                            className={styles.input}
                                                            value={editForm.supplier_id || ''}
                                                            onChange={e => {
                                                                const id = parseInt(e.target.value);
                                                                const name = suppliers.find(s => s.id === id)?.name;
                                                                setEditForm({ ...editForm, supplier_id: id, supplier: name });
                                                            }}
                                                        >
                                                            <option value="">(None)</option>
                                                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                                        </select>
                                                    ) : (
                                                        <input
                                                            className={styles.input}
                                                            value={editForm.supplier || ''}
                                                            onChange={e => setEditForm({ ...editForm, supplier: e.target.value })}
                                                            placeholder="Supplier"
                                                        />
                                                    )}
                                                </td>
                                                <td>
                                                    <input
                                                        className={styles.input}
                                                        type="number" step="0.01"
                                                        value={editForm.unit_cost}
                                                        onChange={e => setEditForm({ ...editForm, unit_cost: parseFloat(e.target.value) })}
                                                        style={{ width: '80px' }}
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        className={styles.input}
                                                        type="number"
                                                        min="1"
                                                        value={editForm.order_size || 1}
                                                        onChange={e => setEditForm({ ...editForm, order_size: parseInt(e.target.value) })}
                                                        style={{ width: '60px' }}
                                                        placeholder="1"
                                                    />
                                                </td>
                                                {stockMode === 'PRODUCT' && (
                                                    <td>
                                                        <input
                                                            className={styles.input}
                                                            type="number"
                                                            value={editForm.quantity}
                                                            onChange={e => setEditForm({ ...editForm, quantity: parseInt(e.target.value) })}
                                                            style={{ width: '80px' }}
                                                            step="1"
                                                        />
                                                    </td>
                                                )}
                                                <td>
                                                    <div className="flex flex-col text-xs">
                                                        <label className="flex items-center gap-1 mb-1 whitespace-nowrap">
                                                            <input
                                                                type="checkbox"
                                                                checked={editForm.low_stock_threshold === null || editForm.low_stock_threshold === undefined}
                                                                onChange={(e) => {
                                                                    if (e.target.checked) setEditForm({ ...editForm, low_stock_threshold: null as any });
                                                                    else setEditForm({ ...editForm, low_stock_threshold: 5 });
                                                                }}
                                                            />
                                                            Global
                                                        </label>
                                                        {editForm.low_stock_threshold !== null && editForm.low_stock_threshold !== undefined && (
                                                            <input
                                                                className={styles.input}
                                                                type="number"
                                                                value={editForm.low_stock_threshold}
                                                                onChange={e => setEditForm({ ...editForm, low_stock_threshold: parseInt(e.target.value) })}
                                                                style={{ width: '60px' }}
                                                            />
                                                        )}
                                                    </div>
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
                                                <td>{item.secondary_type || '-'}</td>
                                                <td>{item.supplier || '-'}</td>
                                                <td>${Number(item.unit_cost || 0).toFixed(2)}</td>
                                                <td style={{ fontSize: '0.9em', color: '#cbd5e1' }}>{item.order_size ?? 1}</td>
                                                {stockMode === 'PRODUCT' && (
                                                    <td style={{ fontWeight: 'bold', color: item.quantity === 0 ? '#ef4444' : item.quantity < (item.low_stock_threshold ?? 5) ? '#f59e0b' : 'inherit' }}>
                                                        {Math.floor(item.quantity)}
                                                    </td>
                                                )}
                                                <td style={{ color: '#9ca3af', fontSize: '0.9em' }}>{item.low_stock_threshold === null ? 'Global' : item.low_stock_threshold}</td>
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
                                    {categories.length > 0 ? (
                                        categories.map((c, i) => <option key={`new-cat-${c.id}-${i}`} value={c.name}>{c.name}</option>)
                                    ) : (
                                        <option value="">No categories found</option>
                                    )}
                                </select>
                            </div>
                            <div style={{ marginBottom: '1rem' }}>
                                <label className={styles.statLabel}>Supplier (Optional)</label>
                                {suppliers.length > 0 ? (
                                    <select
                                        style={{ width: '100%' }}
                                        className={styles.input}
                                        value={newItemSupplierId || ''}
                                        onChange={e => {
                                            const id = parseInt(e.target.value);
                                            setNewItemSupplierId(id);
                                            const name = suppliers.find(s => s.id === id)?.name || '';
                                            setNewItemSupplier(name);
                                        }}
                                    >
                                        <option value="">Select a Supplier</option>
                                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                ) : (
                                    <input
                                        style={{ width: '100%' }}
                                        className={styles.input}
                                        value={newItemSupplier}
                                        onChange={e => setNewItemSupplier(e.target.value)}
                                        placeholder="e.g. Acme Distributors"
                                    />
                                )}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                <div>
                                    <label className={styles.statLabel}>Cost ($)</label>
                                    <input style={{ width: '100%' }} className={styles.input} type="number" step="0.01" value={newItemCost} onChange={e => setNewItemCost(e.target.value)} placeholder="0.00" />
                                </div>
                                <div>
                                    <label className={styles.statLabel}>Order Size (e.g. 24)</label>
                                    <input style={{ width: '100%' }} className={styles.input} type="number" step="1" min="1" value={newItemOrderSize} onChange={e => setNewItemOrderSize(e.target.value)} placeholder="1" />
                                </div>
                                <div>
                                    <label className={styles.statLabel}>Initial Qty</label>
                                    <input style={{ width: '100%' }} className={styles.input} type="number" step="1" value={newItemQty} onChange={e => setNewItemQty(e.target.value)} placeholder="0" />
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <input
                                        type="checkbox"
                                        checked={newItemTrackQty}
                                        onChange={e => setNewItemTrackQty(e.target.checked)}
                                        style={{ width: '20px', height: '20px' }}
                                    />
                                    <label className={styles.statLabel} style={{ marginBottom: 0 }}>Track Inventory</label>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label className={styles.statLabel}>Low Stock Alert</label>
                                    <div className="flex items-center gap-2 mb-2">
                                        <input
                                            type="checkbox"
                                            checked={newItemThreshold === ''}
                                            onChange={e => setNewItemThreshold(e.target.checked ? '' : '5')}
                                            className="w-4 h-4"
                                        />
                                        <span className="text-sm text-gray-400">Use Global Default</span>
                                    </div>
                                    {newItemThreshold !== '' && (
                                        <input
                                            className={styles.input}
                                            type="number"
                                            value={newItemThreshold}
                                            onChange={e => setNewItemThreshold(e.target.value)}
                                            placeholder="5"
                                            style={{ width: '100%' }}
                                        />
                                    )}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                                <button type="button" onClick={() => setShowCreate(false)} style={{ padding: '0.5rem 1rem', background: 'transparent', color: '#9ca3af', border: '1px solid #374151', borderRadius: '0.5rem', cursor: 'pointer' }}>Cancel</button>
                                <button type="submit" style={{ padding: '0.5rem 1rem', background: '#d97706', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold' }}>Create Product</button>
                            </div>
                        </form>
                    </div >
                </div >
            )
            }
        </>
    );

}
