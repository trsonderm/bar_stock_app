'use client';

import { useState, useEffect } from 'react';
import styles from '../admin.module.css';
import CsvMappingModal from './CsvMappingModal';

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
    order_size?: number | number[];
    stock_options?: number[];
    include_in_audit?: boolean;
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

    // State for Modal
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);

    // Unified Form State
    const [formData, setFormData] = useState({
        name: '',
        type: 'Liquor',
        secondary_type: '',
        supplier: '',
        supplier_id: undefined as number | undefined,
        unit_cost: '',
        quantity: '',
        order_size: [1] as number[],
        low_stock_threshold: '5' as string | null, // '5' or null (for global) or custom string
        track_quantity: true,
        include_in_audit: true,
        stock_options: [] as number[]
    });

    // Temp input for stock options
    const [tempOptionInput, setTempOptionInput] = useState('');
    // Temp input for order sizes
    const [tempOrderInput, setTempOrderInput] = useState('');

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

    const resetForm = () => {
        setEditingId(null);
        setFormData({
            name: '',
            type: 'Liquor',
            secondary_type: '',
            supplier: '',
            supplier_id: undefined,
            unit_cost: '',
            quantity: '',
            order_size: [1],
            low_stock_threshold: '5',
            track_quantity: true,
            include_in_audit: true,
            stock_options: []
        });
        setTempOptionInput('');
        setTempOrderInput('');
    };

    const handleCreateClick = () => {
        resetForm();
        setShowModal(true);
    };

    const handleEditClick = (item: Item) => {
        setEditingId(item.id);

        // Populate Form
        setFormData({
            name: item.name,
            type: item.type,
            secondary_type: item.secondary_type || '',
            supplier: item.supplier || '',
            supplier_id: item.supplier_id,
            unit_cost: item.unit_cost !== undefined ? item.unit_cost.toString() : '',
            quantity: item.quantity !== undefined ? item.quantity.toString() : '',
            order_size: Array.isArray(item.order_size) ? item.order_size : (item.order_size ? [item.order_size] : [1]),
            low_stock_threshold: item.low_stock_threshold === null || item.low_stock_threshold === undefined ? null : item.low_stock_threshold.toString(),
            track_quantity: true, // Assuming true if it exists, or check quantity
            include_in_audit: item.include_in_audit !== undefined ? item.include_in_audit : true,
            stock_options: Array.isArray(item.stock_options) ? item.stock_options : []
        });

        setShowModal(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const body = {
                id: editingId, // Undefined for Create
                name: formData.name,
                type: formData.type,
                secondary_type: formData.secondary_type || undefined,
                supplier: formData.supplier || undefined,
                supplier_id: formData.supplier_id,
                unit_cost: formData.unit_cost ? parseFloat(formData.unit_cost) : 0,
                quantity: formData.quantity ? parseFloat(formData.quantity) : 0,
                order_size: formData.order_size.length > 0 ? formData.order_size : [1],
                low_stock_threshold: formData.low_stock_threshold === null ? null : parseInt(formData.low_stock_threshold || '5'),
                track_quantity: formData.track_quantity ? 1 : 0,
                include_in_audit: formData.include_in_audit,
                stock_options: formData.stock_options.length > 0 ? formData.stock_options : null
            };

            const url = '/api/inventory' + (overrideOrgId ? `?orgId=${overrideOrgId}` : '');
            const method = editingId ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                setShowModal(false);
                resetForm();
                fetchData();
            } else {
                const d = await res.json();
                alert(d.error || 'Failed to save');
            }
        } catch (e) {
            console.error(e);
            alert('Error saving item');
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

    const [importFile, setImportFile] = useState<File | null>(null);

    const handleImportClick = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImportFile(file);
        }
        e.target.value = ''; // Reset input
    };

    const handleConfirmImport = async (file: File, mapping: Record<string, number>) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('mapping', JSON.stringify(mapping));

        try {
            setLoading(true);
            setImportFile(null); // Close modal

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
                            onChange={handleImportClick}
                        />
                        <button
                            onClick={handleCreateClick}
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
                                {stockMode === 'PRODUCT' && <th>Count Options</th>}
                                <th>Low Limit</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(item => (
                                <tr key={item.id}>
                                    <td>{item.name}</td>
                                    <td>{item.type}</td>
                                    <td>{item.secondary_type || '-'}</td>
                                    <td>{item.supplier || '-'}</td>
                                    <td>${Number(item.unit_cost || 0).toFixed(2)}</td>
                                    <td style={{ fontSize: '0.9em', color: '#cbd5e1' }}>
                                        {Array.isArray(item.order_size) ? item.order_size.map(os => <div key={os}>{os}</div>) : (item.order_size ?? 1)}
                                    </td>
                                    {stockMode === 'PRODUCT' && (
                                        <td style={{ fontWeight: 'bold', color: item.quantity === 0 ? '#ef4444' : item.quantity < (item.low_stock_threshold ?? 5) ? '#f59e0b' : 'inherit' }}>
                                            {Number(item.quantity).toFixed(2).replace(/\.00$/, '')}
                                        </td>
                                    )}
                                    {stockMode === 'PRODUCT' && (
                                        <td style={{ fontSize: '0.8em', color: '#9ca3af' }}>
                                            {Array.isArray(item.stock_options) && item.stock_options.length > 0 ?
                                                item.stock_options.map(opt => <div key={opt}>{opt}</div>)
                                                : 'Default'}
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
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {showModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
                    <div style={{ background: '#111827', padding: '2rem', borderRadius: '1rem', width: '90%', maxWidth: '500px', border: '1px solid #374151', maxHeight: '90vh', overflowY: 'auto' }}>
                        <h2 style={{ marginTop: 0, color: 'white' }}>{editingId ? 'Edit Product' : 'Add New Product'}</h2>
                        <form onSubmit={handleSave}>
                            <div style={{ marginBottom: '1rem' }}>
                                <label className={styles.statLabel}>Name</label>
                                <input
                                    style={{ width: '100%' }}
                                    className={styles.input}
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    required
                                    autoFocus
                                />
                            </div>
                            <div style={{ marginBottom: '1rem' }}>
                                <label className={styles.statLabel}>Category</label>
                                <select
                                    style={{ width: '100%' }}
                                    className={styles.input}
                                    value={formData.type}
                                    onChange={e => setFormData({ ...formData, type: e.target.value })}
                                >
                                    {categories.length > 0 ? (
                                        categories.map((c, i) => <option key={`cat-${c.id}-${i}`} value={c.name}>{c.name}</option>)
                                    ) : (
                                        <option value="">No categories</option>
                                    )}
                                </select>
                            </div>
                            {/* SubCategory Logic */}
                            {(() => {
                                const cat = categories.find(c => c.name === formData.type);
                                if (cat && cat.sub_categories && cat.sub_categories.length > 0) {
                                    return (
                                        <div style={{ marginBottom: '1rem' }}>
                                            <label className={styles.statLabel}>Sub-Category</label>
                                            <select
                                                style={{ width: '100%' }}
                                                className={styles.input}
                                                value={formData.secondary_type}
                                                onChange={e => setFormData({ ...formData, secondary_type: e.target.value })}
                                            >
                                                <option value="">(None)</option>
                                                {cat.sub_categories.map((sub: string) => <option key={sub} value={sub}>{sub}</option>)}
                                            </select>
                                        </div>
                                    );
                                }
                                return null;
                            })()}

                            <div style={{ marginBottom: '1rem' }}>
                                <label className={styles.statLabel}>Supplier</label>
                                {suppliers.length > 0 ? (
                                    <select
                                        style={{ width: '100%' }}
                                        className={styles.input}
                                        value={formData.supplier_id || ''}
                                        onChange={e => {
                                            const id = parseInt(e.target.value);
                                            const name = suppliers.find(s => s.id === id)?.name;
                                            setFormData({ ...formData, supplier_id: id, supplier: name || '' });
                                        }}
                                    >
                                        <option value="">Select Supplier</option>
                                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                ) : (
                                    <input
                                        style={{ width: '100%' }}
                                        className={styles.input}
                                        value={formData.supplier}
                                        onChange={e => setFormData({ ...formData, supplier: e.target.value })}
                                    />
                                )}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                <div>
                                    <label className={styles.statLabel}>Cost ($)</label>
                                    <input
                                        style={{ width: '100%' }}
                                        className={styles.input}
                                        type="number" step="0.01"
                                        value={formData.unit_cost}
                                        onChange={e => setFormData({ ...formData, unit_cost: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className={styles.statLabel}>Order Sizes</label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', background: '#374151', padding: '0.5rem', borderRadius: '0.5rem', minHeight: '42px' }}>
                                        {formData.order_size.map((size) => (
                                            <span key={size} style={{
                                                background: '#d97706', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px'
                                            }}>
                                                {size}
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData(prev => ({ ...prev, order_size: prev.order_size.filter(o => o !== size) }))}
                                                    style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 0, fontSize: '0.85rem', fontWeight: 'bold' }}
                                                >
                                                    x
                                                </button>
                                            </span>
                                        ))}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <input
                                                className={styles.input}
                                                value={tempOrderInput}
                                                onChange={e => setTempOrderInput(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        const val = parseInt(tempOrderInput);
                                                        if (!isNaN(val) && !formData.order_size.includes(val)) {
                                                            setFormData(prev => ({
                                                                ...prev,
                                                                order_size: [...prev.order_size, val].sort((a, b) => a - b)
                                                            }));
                                                            setTempOrderInput('');
                                                        }
                                                    }
                                                }}
                                                placeholder="#"
                                                style={{ width: '60px', padding: '2px 4px', fontSize: '0.9rem' }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const val = parseInt(tempOrderInput);
                                                    if (!isNaN(val) && !formData.order_size.includes(val)) {
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            order_size: [...prev.order_size, val].sort((a, b) => a - b)
                                                        }));
                                                        setTempOrderInput('');
                                                    }
                                                }}
                                                style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', padding: '2px 6px', cursor: 'pointer', fontSize: '0.9rem' }}
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <label className={styles.statLabel}>Inventory Qty</label>
                                    <input
                                        style={{ width: '100%' }}
                                        className={styles.input}
                                        type="number" step="any"
                                        value={formData.quantity}
                                        onChange={e => setFormData({ ...formData, quantity: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div style={{ marginBottom: '1rem' }}>
                                <label className={styles.statLabel} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={formData.include_in_audit}
                                        onChange={e => setFormData({ ...formData, include_in_audit: e.target.checked })}
                                        style={{ width: '18px', height: '18px' }}
                                    />
                                    Include in Audit
                                </label>
                                <p className="text-xs text-gray-500 mt-1" style={{ marginLeft: '26px' }}>
                                    If unchecked, this item will be hidden from default audit views.
                                </p>
                            </div>

                            {stockMode === 'PRODUCT' && (
                                <div style={{ marginBottom: '1rem' }}>
                                    <label className={styles.statLabel}>Counting Options</label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', background: '#374151', padding: '0.5rem', borderRadius: '0.5rem' }}>
                                        {formData.stock_options.map((opt) => (
                                            <span key={opt} style={{
                                                background: '#3b82f6', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px'
                                            }}>
                                                {opt}
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData(prev => ({ ...prev, stock_options: prev.stock_options.filter(o => o !== opt) }))}
                                                    style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 0, fontSize: '0.85rem', fontWeight: 'bold' }}
                                                >
                                                    x
                                                </button>
                                            </span>
                                        ))}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <input
                                                className={styles.input}
                                                value={tempOptionInput}
                                                onChange={e => setTempOptionInput(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        const val = parseInt(tempOptionInput);
                                                        if (!isNaN(val) && !formData.stock_options.includes(val)) {
                                                            setFormData(prev => ({
                                                                ...prev,
                                                                stock_options: [...prev.stock_options, val].sort((a, b) => a - b)
                                                            }));
                                                            setTempOptionInput('');
                                                        }
                                                    }
                                                }}
                                                placeholder="Add #"
                                                style={{ width: '80px' }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const val = parseInt(tempOptionInput);
                                                    if (!isNaN(val) && !formData.stock_options.includes(val)) {
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            stock_options: [...prev.stock_options, val].sort((a, b) => a - b)
                                                        }));
                                                        setTempOptionInput('');
                                                    }
                                                }}
                                                style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer' }}
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">Leave empty to use category defaults.</p>
                                </div>
                            )}

                            <div style={{ marginBottom: '1rem' }}>
                                <label className={styles.statLabel}>Low Stock Alert</label>
                                <div className="flex items-center gap-2 mb-2">
                                    <input
                                        type="checkbox"
                                        checked={formData.low_stock_threshold === null}
                                        onChange={e => setFormData({ ...formData, low_stock_threshold: e.target.checked ? null : '5' })}
                                        style={{ width: '16px', height: '16px' }}
                                    />
                                    <span className="text-sm text-gray-400">Use Global Default</span>
                                </div>
                                {formData.low_stock_threshold !== null && (
                                    <input
                                        className={styles.input}
                                        type="number"
                                        value={formData.low_stock_threshold}
                                        onChange={e => setFormData({ ...formData, low_stock_threshold: e.target.value })}
                                        placeholder="5"
                                        style={{ width: '100px' }}
                                    />
                                )}
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                                <button type="button" onClick={() => setShowModal(false)} style={{ padding: '0.5rem 1rem', background: 'transparent', color: '#9ca3af', border: '1px solid #374151', borderRadius: '0.5rem', cursor: 'pointer' }}>Cancel</button>
                                <button type="submit" style={{ padding: '0.5rem 1rem', background: '#d97706', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold' }}>
                                    {editingId ? 'Save Changes' : 'Create Product'}
                                </button>
                            </div>
                        </form>
                    </div >
                </div >
            )}

            {importFile && (
                <CsvMappingModal
                    file={importFile}
                    onClose={() => setImportFile(null)}
                    onImport={handleConfirmImport}
                />
            )}
        </>
    );


}
