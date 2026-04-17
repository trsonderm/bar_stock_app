'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import styles from '../admin.module.css';
import CsvMappingModal from './CsvMappingModal';
import BarcodeScanner from '@/components/BarcodeScanner';

interface OrderSizeOption {
    label: string;
    amount: number;
}

interface Item {
    id: number;
    name: string;
    type: string;
    secondary_type?: string;
    unit_cost: number;
    quantity: number;
    supplier?: string;
    supplier_id?: number;
    location_supplier_id?: number;
    include_in_low_stock_alerts?: boolean;
    low_stock_threshold?: number;
    low_stock_threshold_type?: 'fixed' | 'order_qty' | 'stock_options';
    low_stock_threshold_factor?: number | null;
    order_size?: OrderSizeOption[] | number[] | number;
    stock_options?: number[];
    include_in_audit?: boolean;
    assigned_locations?: number[];
    stock_unit_label?: string;
    stock_unit_size?: number;
    order_unit_label?: string;
    order_unit_size?: number;
    use_category_qty_defaults?: boolean;
    barcodes?: string[];
}

interface Category {
    id: number;
    name: string;
    sub_categories?: string[];
}

export default function ProductsClient({ overrideOrgId }: { overrideOrgId?: number }) {
    const searchParams = useSearchParams();
    const router = useRouter();
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
        location_supplier_id: undefined as number | undefined,
        unit_cost: '',
        quantity: '',
        order_size: [{ label: 'Unit', amount: 1 }] as OrderSizeOption[],
        low_stock_threshold: '5' as string | null,
        low_stock_threshold_type: 'fixed' as 'fixed' | 'order_qty' | 'stock_options',
        low_stock_threshold_factor: '5',
        track_quantity: true,
        include_in_audit: true,
        include_in_low_stock_alerts: true,
        stock_options: [] as number[],
        assignedLocations: [] as number[],
        use_category_qty_defaults: true,
        stock_unit_label: 'unit',
        stock_unit_size: '1',
        order_unit_label: 'case',
        order_unit_size: '1',
        subtraction_presets: [1] as number[],
        custom_preset_input: '',
        barcodes: [] as string[],
    });

    // Temp input for stock options
    const [tempOptionInput, setTempOptionInput] = useState('');
    // Temp input for order sizes
    const [tempOrderLabel, setTempOrderLabel] = useState('Pack');
    const [tempOrderAmount, setTempOrderAmount] = useState('');

    // Barcode scan state
    const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
    const [scannedBarcode, setScannedBarcode] = useState('');
    const [webSearchPendingBarcode, setWebSearchPendingBarcode] = useState<string | null>(null);

    // Bulk select state
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [bulkCategory, setBulkCategory] = useState('');
    const [bulkSubCategory, setBulkSubCategory] = useState('');
    const [bulkSupplierId, setBulkSupplierId] = useState<string>('');
    const [bulkGlobalSupplier, setBulkGlobalSupplier] = useState('');
    const [bulkLocations, setBulkLocations] = useState<number[]>([]);
    const [bulkApplying, setBulkApplying] = useState(false);

    const [stockMode, setStockMode] = useState<string>('CATEGORY');

    // Multi-location Logic
    const [myLocations, setMyLocations] = useState<{ id: number, name: string }[]>([]);
    const [addToAllLocations, setAddToAllLocations] = useState(false);
    const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);


    useEffect(() => {
        // fetchData() is triggered separately via the selectedLocationId effect
        fetch('/api/admin/settings').then(r => r.json()).then(d => {
            if (d.settings?.stock_count_mode) setStockMode(d.settings.stock_count_mode);
        });

        // When viewing another org as super admin, fetch that org's locations directly
        // to avoid the user's own locations leaking into the orgId-scoped query
        const locationsUrl = overrideOrgId
            ? `/api/admin/locations?orgId=${overrideOrgId}`
            : '/api/user/locations';

        fetch(locationsUrl).then(r => r.json()).then(d => {
            const locs: { id: number; name: string }[] = d.locations || [];
            if (locs.length > 0) {
                setMyLocations(locs);
                if (overrideOrgId) {
                    // Always use the first location of the target org — no cookie crossover
                    setSelectedLocationId(locs[0].id);
                } else {
                    const match = document.cookie.match(/(^| )current_location_id=([^;]+)/);
                    const cookieLocId = match ? parseInt(match[2]) : null;
                    const found = cookieLocId ? locs.find((l: any) => l.id === cookieLocId) : null;
                    setSelectedLocationId(found ? found.id : locs[0].id);
                }
            } else {
                setMyLocations([]);
                setSelectedLocationId(null);
            }
        });
    }, [overrideOrgId]);

    // Re-fetch inventory whenever the selected location changes
    useEffect(() => {
        fetchData();
    }, [overrideOrgId, selectedLocationId]);

    // Auto-open edit modal when ?editId=N is in the URL (e.g. linked from Prices page)
    useEffect(() => {
        const editId = searchParams.get('editId');
        if (!editId || items.length === 0) return;
        const item = items.find(i => i.id === parseInt(editId));
        if (item) {
            handleEditClick(item);
            // Remove the param so refreshing doesn't re-open it
            router.replace('/admin/products');
        }
    }, [searchParams, items]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const locParam = selectedLocationId ? `&locationId=${selectedLocationId}` : '';
            const inventoryUrl = overrideOrgId
                ? `/api/inventory?sort=name&orgId=${overrideOrgId}${locParam}`
                : `/api/inventory?sort=name${locParam}`;
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
            location_supplier_id: undefined,
            unit_cost: '',
            quantity: '',
            order_size: [{ label: 'Unit', amount: 1 }],
            low_stock_threshold: '5',
            low_stock_threshold_type: 'fixed',
            low_stock_threshold_factor: '5',
            track_quantity: true,
            include_in_audit: true,
            include_in_low_stock_alerts: true,
            stock_options: [],
            assignedLocations: [],
            use_category_qty_defaults: true,
            stock_unit_label: 'unit',
            stock_unit_size: '1',
            order_unit_label: 'case',
            order_unit_size: '1',
            subtraction_presets: [1],
            custom_preset_input: '',
            barcodes: [],
        });
        setTempOptionInput('');
        setTempOrderLabel('Pack');
        setTempOrderAmount('');
        setAddToAllLocations(false);
    };

    const handleBulkApply = async () => {
        if (selectedIds.size === 0) return;
        setBulkApplying(true);
        const updates: Record<string, any> = {};
        if (bulkCategory) updates.type = bulkCategory;
        if (bulkSubCategory !== '') updates.secondary_type = bulkSubCategory;
        if (bulkSupplierId !== '') updates.supplier_id = bulkSupplierId === 'none' ? null : parseInt(bulkSupplierId);
        if (bulkGlobalSupplier !== '') updates.global_supplier = bulkGlobalSupplier === 'none' ? null : bulkGlobalSupplier;
        if (bulkLocations.length > 0) updates.assigned_locations = bulkLocations;

        try {
            const res = await fetch('/api/admin/products/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ item_ids: Array.from(selectedIds), updates }),
            });
            const data = await res.json();
            if (res.ok) {
                setSelectedIds(new Set());
                setBulkCategory('');
                setBulkSubCategory('');
                setBulkSupplierId('');
                setBulkGlobalSupplier('');
                setBulkLocations([]);
                fetchData();
            } else {
                alert(data.error || 'Bulk update failed');
            }
        } catch {
            alert('Network error during bulk update');
        } finally {
            setBulkApplying(false);
        }
    };

    const toggleSelect = (id: number) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleBarcodeScanForProduct = async (barcode: string) => {
        setShowBarcodeScanner(false);
        setScannedBarcode(barcode);
        
        // Always add the scanned barcode to the product's barcodes array
        setFormData(prev => ({
            ...prev,
            barcodes: prev.barcodes.includes(barcode) ? prev.barcodes : [...prev.barcodes, barcode]
        }));

        try {
            const res = await fetch(`/api/barcode-lookup?barcode=${encodeURIComponent(barcode)}&localOnly=true`);
            const data = await res.json();
            if (data.found && data.name) {
                setFormData(prev => ({
                    ...prev,
                    name: prev.name || data.name,
                    type: prev.type || data.type || 'Liquor',
                    secondary_type: prev.secondary_type || data.secondary_type,
                }));
            } else if (!data.found && data.external_available) {
                setWebSearchPendingBarcode(barcode);
            }
        } catch { }
    };

    const handleWebSearchConfirm = async () => {
        if (!webSearchPendingBarcode) return;
        const b = webSearchPendingBarcode;
        setWebSearchPendingBarcode(null);
        try {
            const res = await fetch(`/api/barcode-lookup?barcode=${encodeURIComponent(b)}`);
            const data = await res.json();
            if (data.found && data.name) {
                setFormData(prev => ({
                    ...prev,
                    name: prev.name || data.name,
                    type: prev.type || data.type || 'Liquor',
                    secondary_type: prev.secondary_type || data.secondary_type,
                }));
            }
        } catch { }
    };

    const handleCreateClick = () => {
        resetForm();
        setScannedBarcode('');
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
            location_supplier_id: item.location_supplier_id,
            include_in_low_stock_alerts: item.include_in_low_stock_alerts !== false,
            unit_cost: item.unit_cost !== undefined ? item.unit_cost.toString() : '',
            quantity: item.quantity !== undefined ? item.quantity.toString() : '',
            order_size: (() => {
                const os = item.order_size;
                if (!os) return [{ label: 'Unit', amount: 1 }];
                if (Array.isArray(os)) {
                    if (os.length > 0 && typeof os[0] === 'object' && os[0] !== null && 'amount' in os[0]) {
                        return os as OrderSizeOption[];
                    }
                    return (os as number[]).map(n => ({ label: n === 1 ? 'Unit' : n.toString(), amount: n }));
                }
                if (typeof os === 'number') {
                    return [{ label: os === 1 ? 'Unit' : os.toString(), amount: os }];
                }
                return [{ label: 'Unit', amount: 1 }];
            })(),
            low_stock_threshold: item.low_stock_threshold === null || item.low_stock_threshold === undefined ? null : item.low_stock_threshold.toString(),
            low_stock_threshold_type: item.low_stock_threshold_type || 'fixed',
            low_stock_threshold_factor: item.low_stock_threshold_factor != null
                ? item.low_stock_threshold_factor.toString()
                : (item.low_stock_threshold != null ? item.low_stock_threshold.toString() : '5'),
            track_quantity: true, // Assuming true if it exists, or check quantity
            include_in_audit: item.include_in_audit !== undefined ? item.include_in_audit : true,
            stock_options: Array.isArray(item.stock_options) ? item.stock_options : [],
            assignedLocations: item.assigned_locations || [],
            use_category_qty_defaults: item.use_category_qty_defaults !== false,
            stock_unit_label: item.stock_unit_label || 'unit',
            stock_unit_size: String(item.stock_unit_size ?? 1),
            order_unit_label: item.order_unit_label || 'case',
            order_unit_size: String(item.order_unit_size ?? 1),
            subtraction_presets: Array.isArray(item.stock_options) && item.stock_options.length > 0 ? item.stock_options : [1],
            custom_preset_input: '',
            barcodes: Array.isArray(item.barcodes) ? item.barcodes : [],
        });

        setShowModal(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const body = {
                id: editingId,
                name: formData.name,
                type: formData.type,
                secondary_type: formData.secondary_type || undefined,
                supplier: formData.supplier || undefined,
                supplier_id: formData.supplier_id,
                // Per-location supplier — only sent when a location is selected
                ...(myLocations.length > 1 && selectedLocationId ? {
                    location_supplier_id: formData.location_supplier_id ?? null,
                    locationId: selectedLocationId,
                } : {}),
                unit_cost: formData.unit_cost ? parseFloat(formData.unit_cost) : 0,
                quantity: formData.quantity ? parseFloat(formData.quantity) : 0,
                // Always scope the quantity update to the currently selected location
                ...(selectedLocationId ? { locationId: selectedLocationId } : {}),
                order_size: formData.order_size.length > 0 ? formData.order_size : [{ label: 'Unit', amount: 1 }],
                ...(() => {
                    if (formData.low_stock_threshold === null) {
                        return { low_stock_threshold: null, low_stock_threshold_type: null, low_stock_threshold_factor: null };
                    }
                    const factor = parseFloat(formData.low_stock_threshold_factor) || 1;
                    const orderUnitSize = parseInt(formData.order_unit_size || '1') || 1;
                    const presets = formData.use_category_qty_defaults
                        ? formData.stock_options
                        : formData.subtraction_presets;
                    const maxPreset = presets.length > 0 ? Math.max(...presets) : 1;
                    let effectiveThreshold: number;
                    if (formData.low_stock_threshold_type === 'order_qty') {
                        effectiveThreshold = Math.round(factor * orderUnitSize);
                    } else if (formData.low_stock_threshold_type === 'stock_options') {
                        effectiveThreshold = Math.round(factor * maxPreset);
                    } else {
                        effectiveThreshold = Math.round(factor);
                    }
                    return {
                        low_stock_threshold: effectiveThreshold,
                        low_stock_threshold_type: formData.low_stock_threshold_type,
                        low_stock_threshold_factor: factor,
                    };
                })(),
                track_quantity: formData.track_quantity ? 1 : 0,
                include_in_audit: formData.include_in_audit,
                include_in_low_stock_alerts: formData.include_in_low_stock_alerts,
                stock_options: formData.use_category_qty_defaults
                    ? (formData.stock_options.length > 0 ? formData.stock_options : null)
                    : (formData.subtraction_presets.length > 0 ? formData.subtraction_presets : null),
                assignedLocations: formData.assignedLocations,
                add_to_all_locations: addToAllLocations,
                use_category_qty_defaults: formData.use_category_qty_defaults,
                stock_unit_label: formData.use_category_qty_defaults ? undefined : formData.stock_unit_label,
                stock_unit_size: formData.use_category_qty_defaults ? undefined : parseInt(formData.stock_unit_size || '1'),
                order_unit_label: formData.use_category_qty_defaults ? undefined : formData.order_unit_label,
                order_unit_size: formData.use_category_qty_defaults ? undefined : parseInt(formData.order_unit_size || '1'),
                barcodes: formData.barcodes,
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

                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
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
                    {myLocations.length > 1 && (
                        <select
                            className={styles.input}
                            value={selectedLocationId ?? ''}
                            onChange={e => setSelectedLocationId(parseInt(e.target.value))}
                            style={{ width: 'auto' }}
                        >
                            {myLocations.map(l => (
                                <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                        </select>
                    )}
                </div>

                {/* Bulk Action Toolbar */}
                {selectedIds.size > 0 && (
                    <div style={{ background: '#1e3a5f', border: '1px solid #1d4ed8', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ color: '#93c5fd', fontWeight: 600, fontSize: '0.9rem', marginRight: '0.25rem' }}>
                            {selectedIds.size} selected
                        </span>

                        {/* Category */}
                        <select value={bulkCategory} onChange={e => { setBulkCategory(e.target.value); setBulkSubCategory(''); }}
                            className={styles.input} style={{ width: 'auto', fontSize: '0.85rem', padding: '4px 8px' }}>
                            <option value="">— Category —</option>
                            {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </select>

                        {/* Sub-category (shown when category selected) */}
                        {bulkCategory && (() => {
                            const cat = categories.find(c => c.name === bulkCategory);
                            if (!cat?.sub_categories?.length) return null;
                            return (
                                <select value={bulkSubCategory} onChange={e => setBulkSubCategory(e.target.value)}
                                    className={styles.input} style={{ width: 'auto', fontSize: '0.85rem', padding: '4px 8px' }}>
                                    <option value="">— Sub-Category —</option>
                                    <option value="none">(Clear)</option>
                                    {cat.sub_categories.map((s: string) => <option key={s} value={s}>{s}</option>)}
                                </select>
                            );
                        })()}

                        {/* Supplier (by org supplier list) */}
                        <select value={bulkSupplierId} onChange={e => setBulkSupplierId(e.target.value)}
                            className={styles.input} style={{ width: 'auto', fontSize: '0.85rem', padding: '4px 8px' }}>
                            <option value="">— Supplier —</option>
                            <option value="none">(Clear)</option>
                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>

                        {/* Global supplier (text) */}
                        <input type="text" value={bulkGlobalSupplier} onChange={e => setBulkGlobalSupplier(e.target.value)}
                            placeholder="Global supplier name..."
                            className={styles.input} style={{ width: '160px', fontSize: '0.85rem', padding: '4px 8px' }} />

                        {/* Assigned Locations */}
                        {myLocations.length > 1 && (
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Locations:</span>
                                {myLocations.map(loc => (
                                    <label key={loc.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: '#d1d5db', fontSize: '0.8rem' }}>
                                        <input type="checkbox" checked={bulkLocations.includes(loc.id)}
                                            onChange={e => setBulkLocations(prev => e.target.checked ? [...prev, loc.id] : prev.filter(id => id !== loc.id))} />
                                        {loc.name}
                                    </label>
                                ))}
                            </div>
                        )}

                        <button onClick={handleBulkApply} disabled={bulkApplying}
                            style={{ background: bulkApplying ? '#374151' : '#2563eb', color: 'white', border: 'none', borderRadius: '6px', padding: '5px 14px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
                            {bulkApplying ? 'Applying...' : 'Apply to Selected'}
                        </button>
                        <button onClick={() => setSelectedIds(new Set())}
                            style={{ background: 'none', border: '1px solid #374151', color: '#9ca3af', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', fontSize: '0.8rem' }}>
                            Clear
                        </button>
                    </div>
                )}

                <div className={styles.tableContainer}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th style={{ width: '36px' }}>
                                    <input type="checkbox"
                                        checked={filtered.length > 0 && filtered.every(i => selectedIds.has(i.id))}
                                        onChange={e => {
                                            if (e.target.checked) setSelectedIds(new Set(filtered.map(i => i.id)));
                                            else setSelectedIds(new Set());
                                        }}
                                        style={{ cursor: 'pointer' }}
                                    />
                                </th>
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
                                <tr key={item.id} style={{ background: selectedIds.has(item.id) ? 'rgba(37,99,235,0.1)' : undefined }}>
                                    <td>
                                        <input type="checkbox" checked={selectedIds.has(item.id)}
                                            onChange={() => toggleSelect(item.id)}
                                            style={{ cursor: 'pointer' }} />
                                    </td>
                                    <td>{item.name}</td>
                                    <td>{item.type}</td>
                                    <td>{item.secondary_type || '-'}</td>
                                    <td>
                                        {item.location_supplier_id
                                            ? (suppliers.find(s => s.id === item.location_supplier_id)?.name ?? item.supplier ?? '-')
                                            : (item.supplier || '-')}
                                        {item.location_supplier_id && myLocations.length > 1 && (
                                            <span style={{ fontSize: '0.7em', color: '#6b7280', marginLeft: '4px' }}>(loc)</span>
                                        )}
                                    </td>
                                    <td>${Number(item.unit_cost || 0).toFixed(2)}</td>
                                    <td style={{ fontSize: '0.9em', color: '#cbd5e1' }}>
                                        {(() => {
                                            const os = item.order_size;
                                            if (Array.isArray(os)) {
                                                if (os.length > 0 && typeof os[0] === 'object' && os[0] !== null) {
                                                    return (os as OrderSizeOption[]).map((o, idx) => <div key={idx}>{o.label}: {o.amount}</div>);
                                                }
                                                return (os as number[]).map(o => <div key={o}>{o}</div>);
                                            }
                                            return os ?? 1;
                                        })()}
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                            <h2 style={{ margin: 0, color: 'white' }}>{editingId ? 'Edit Product' : 'Add New Product'}</h2>
                            <button
                                type="button"
                                onClick={() => setShowBarcodeScanner(true)}
                                style={{ background: '#0891b2', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                                <span style={{ fontSize: '1rem' }}>📷</span> Scan Barcode
                            </button>
                        </div>
                        {scannedBarcode && (
                            <div style={{ background: '#1e3a5f', border: '1px solid #1d4ed8', borderRadius: '6px', padding: '0.5rem 0.75rem', marginBottom: '1rem', fontSize: '0.8rem', color: '#93c5fd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>Scanned: <strong>{scannedBarcode}</strong></span>
                                <button type="button" onClick={() => setScannedBarcode('')} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>×</button>
                            </div>
                        )}
                        <form onSubmit={handleSave}>
                            <div style={{ marginBottom: '1rem' }}>
                                <label className={styles.statLabel}>Barcodes</label>
                                {formData.barcodes.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                        {formData.barcodes.map((bc, idx) => (
                                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#374151', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.9rem', color: '#f3f4f6' }}>
                                                <span>{bc}</span>
                                                <button type="button" onClick={() => setFormData(prev => ({ ...prev, barcodes: prev.barcodes.filter(b => b !== bc) }))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>×</button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '0.5rem' }}>No barcodes assigned.</div>
                                )}
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <input 
                                        type="text"
                                        placeholder="Add barcode manually"
                                        className={styles.input}
                                        style={{ flex: 1 }}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                                                e.preventDefault();
                                                const bc = e.currentTarget.value.trim();
                                                setFormData(prev => ({
                                                    ...prev,
                                                    barcodes: prev.barcodes.includes(bc) ? prev.barcodes : [...prev.barcodes, bc]
                                                }));
                                                e.currentTarget.value = '';
                                            }
                                        }}
                                    />
                                    <button 
                                        type="button" 
                                        onClick={(e) => {
                                            const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                                            if (input && input.value.trim()) {
                                                const bc = input.value.trim();
                                                setFormData(prev => ({
                                                    ...prev,
                                                    barcodes: prev.barcodes.includes(bc) ? prev.barcodes : [...prev.barcodes, bc]
                                                }));
                                                input.value = '';
                                            } else {
                                                setShowBarcodeScanner(true);
                                            }
                                        }}
                                        style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', padding: '0 1rem', cursor: 'pointer', fontWeight: 'bold' }}
                                    >
                                        Add/Scan
                                    </button>
                                </div>
                            </div>
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
                                <label className={styles.statLabel}>
                                    Supplier
                                    {myLocations.length > 1 && <span style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: '6px' }}>(global default)</span>}
                                </label>
                                {suppliers.length > 0 ? (
                                    <select
                                        style={{ width: '100%' }}
                                        className={styles.input}
                                        value={formData.supplier_id || ''}
                                        onChange={e => {
                                            const id = e.target.value ? parseInt(e.target.value) : undefined;
                                            const name = id ? suppliers.find(s => s.id === id)?.name : '';
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

                            {myLocations.length > 1 && selectedLocationId && suppliers.length > 0 && (
                                <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#1e293b', borderRadius: '0.5rem', border: '1px solid #334155' }}>
                                    <label className={styles.statLabel}>
                                        Supplier for{' '}
                                        <span style={{ color: '#f59e0b' }}>
                                            {myLocations.find(l => l.id === selectedLocationId)?.name}
                                        </span>
                                        <span style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: '6px' }}>(overrides global)</span>
                                    </label>
                                    <select
                                        style={{ width: '100%' }}
                                        className={styles.input}
                                        value={formData.location_supplier_id || ''}
                                        onChange={e => {
                                            const id = e.target.value ? parseInt(e.target.value) : undefined;
                                            setFormData({ ...formData, location_supplier_id: id });
                                        }}
                                    >
                                        <option value="">Use global supplier</option>
                                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                            )}

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
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: '#374151', padding: '0.5rem', borderRadius: '0.5rem', minHeight: '42px' }}>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                            {formData.order_size.map((size, idx) => (
                                                <span key={idx} style={{
                                                    background: '#d97706', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap'
                                                }}>
                                                    {size.label}: {size.amount}
                                                    <button
                                                        type="button"
                                                        onClick={() => setFormData(prev => ({ ...prev, order_size: prev.order_size.filter((_, i) => i !== idx) }))}
                                                        style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 0, fontSize: '0.85rem', fontWeight: 'bold' }}
                                                    >
                                                        x
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                        <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                                            {tempOrderLabel !== 'Custom' ? (
                                                <select
                                                    className={styles.input}
                                                    value={tempOrderLabel}
                                                    onChange={e => setTempOrderLabel(e.target.value)}
                                                    style={{ width: '80px', padding: '2px 4px', fontSize: '0.9rem' }}
                                                >
                                                    <option value="Unit">Unit</option>
                                                    <option value="Pack">Pack</option>
                                                    <option value="Case">Case</option>
                                                    <option value="Custom">Custom</option>
                                                </select>
                                            ) : (
                                                <input
                                                    className={styles.input}
                                                    placeholder="Type..."
                                                    onChange={e => setTempOrderLabel(e.target.value)}
                                                    style={{ width: '80px', padding: '2px 4px', fontSize: '0.9rem' }}
                                                    autoFocus
                                                />
                                            )}

                                            <input
                                                className={styles.input}
                                                value={tempOrderAmount}
                                                onChange={e => setTempOrderAmount(e.target.value)}
                                                placeholder="Qty"
                                                type="number"
                                                style={{ width: '60px', padding: '2px 4px', fontSize: '0.9rem' }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const val = parseInt(tempOrderAmount);
                                                    if (!isNaN(val) && val > 0 && tempOrderLabel.trim() !== '') {
                                                        const newOpt = { label: tempOrderLabel.trim(), amount: val };
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            order_size: [...prev.order_size, newOpt]
                                                        }));
                                                        setTempOrderAmount('');
                                                        setTempOrderLabel('Pack');
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
                                    <label className={styles.statLabel}>
                                        Inventory Qty
                                        {myLocations.length > 1 && selectedLocationId && (
                                            <span style={{ color: '#60a5fa', fontWeight: 400, marginLeft: '0.4rem' }}>
                                                — {myLocations.find(l => l.id === selectedLocationId)?.name}
                                            </span>
                                        )}
                                    </label>
                                    <input
                                        style={{ width: '100%' }}
                                        className={styles.input}
                                        type="number" step="any"
                                        value={formData.quantity}
                                        onChange={e => setFormData({ ...formData, quantity: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div style={{ marginBottom: '0.75rem' }}>
                                <label className={styles.statLabel} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={formData.include_in_audit}
                                        onChange={e => setFormData({ ...formData, include_in_audit: e.target.checked })}
                                        style={{ width: '18px', height: '18px' }}
                                    />
                                    Include in Audit
                                </label>
                                <p className="text-xs text-gray-500 mt-1" style={{ marginLeft: '26px', fontSize: '0.78rem', color: '#6b7280' }}>
                                    If unchecked, this item will be hidden from default audit views.
                                </p>
                            </div>

                            <div style={{ marginBottom: '1rem' }}>
                                <label className={styles.statLabel} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={formData.include_in_low_stock_alerts}
                                        onChange={e => setFormData({ ...formData, include_in_low_stock_alerts: e.target.checked })}
                                        style={{ width: '18px', height: '18px' }}
                                    />
                                    Include in Low Stock Alerts
                                </label>
                                <p style={{ marginLeft: '26px', fontSize: '0.78rem', color: '#6b7280', margin: '2px 0 0 26px' }}>
                                    If unchecked, this item will never trigger a low stock notification.
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

                            {/* Quantity Units Section */}
                            <div style={{ marginBottom: '1rem', padding: '1rem', background: '#1e293b', borderRadius: '0.5rem', border: '1px solid #334155' }}>
                                <label className={styles.statLabel} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '0.75rem' }}>
                                    <input
                                        type="checkbox"
                                        checked={formData.use_category_qty_defaults}
                                        onChange={e => setFormData({ ...formData, use_category_qty_defaults: e.target.checked })}
                                        style={{ width: '16px', height: '16px' }}
                                    />
                                    <span style={{ color: 'white', fontWeight: 600 }}>Use Category Quantity Defaults</span>
                                </label>
                                {!formData.use_category_qty_defaults && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        {/* Stock unit label only */}
                                        <div>
                                            <label className={styles.statLabel}>Stock Unit Label</label>
                                            <input
                                                className={styles.input}
                                                placeholder="e.g. bottle, can, unit"
                                                value={formData.stock_unit_label}
                                                onChange={e => setFormData({ ...formData, stock_unit_label: e.target.value })}
                                                style={{ marginBottom: 0 }}
                                            />
                                        </div>

                                        {/* Subtraction preset amounts for stock view */}
                                        <div>
                                            <label className={styles.statLabel}>Subtraction Amounts (for Stock View)</label>
                                            <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: '0 0 0.5rem' }}>
                                                Preset buttons shown when removing stock. Click to toggle; add custom values below.
                                            </p>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.5rem' }}>
                                                {[1, 6, 12].map(preset => {
                                                    const active = formData.subtraction_presets.includes(preset);
                                                    return (
                                                        <button
                                                            key={preset}
                                                            type="button"
                                                            onClick={() => setFormData(prev => ({
                                                                ...prev,
                                                                subtraction_presets: active
                                                                    ? prev.subtraction_presets.filter(p => p !== preset)
                                                                    : [...prev.subtraction_presets, preset].sort((a, b) => a - b)
                                                            }))}
                                                            style={{
                                                                padding: '4px 14px',
                                                                background: active ? '#3b82f6' : '#374151',
                                                                color: active ? 'white' : '#9ca3af',
                                                                border: `1px solid ${active ? '#3b82f6' : '#4b5563'}`,
                                                                borderRadius: '4px',
                                                                cursor: 'pointer',
                                                                fontWeight: active ? 700 : 400,
                                                                fontSize: '0.9rem'
                                                            }}
                                                        >
                                                            {preset}
                                                        </button>
                                                    );
                                                })}
                                                {/* Custom presets already added */}
                                                {formData.subtraction_presets.filter(p => ![1, 6, 12].includes(p)).map(preset => (
                                                    <span key={preset} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', background: '#3b82f6', color: 'white', borderRadius: '4px', fontSize: '0.9rem' }}>
                                                        {preset}
                                                        <button
                                                            type="button"
                                                            onClick={() => setFormData(prev => ({ ...prev, subtraction_presets: prev.subtraction_presets.filter(p => p !== preset) }))}
                                                            style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 0, fontWeight: 'bold', lineHeight: 1 }}
                                                        >×</button>
                                                    </span>
                                                ))}
                                            </div>
                                            {/* Add custom preset */}
                                            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                                <input
                                                    className={styles.input}
                                                    type="number"
                                                    min="1"
                                                    placeholder="Custom #"
                                                    value={formData.custom_preset_input}
                                                    onChange={e => setFormData({ ...formData, custom_preset_input: e.target.value })}
                                                    style={{ width: '100px', marginBottom: 0 }}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            const val = parseInt(formData.custom_preset_input);
                                                            if (!isNaN(val) && val > 0 && !formData.subtraction_presets.includes(val)) {
                                                                setFormData(prev => ({ ...prev, subtraction_presets: [...prev.subtraction_presets, val].sort((a, b) => a - b), custom_preset_input: '' }));
                                                            }
                                                        }
                                                    }}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const val = parseInt(formData.custom_preset_input);
                                                        if (!isNaN(val) && val > 0 && !formData.subtraction_presets.includes(val)) {
                                                            setFormData(prev => ({ ...prev, subtraction_presets: [...prev.subtraction_presets, val].sort((a, b) => a - b), custom_preset_input: '' }));
                                                        }
                                                    }}
                                                    style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', padding: '6px 12px', cursor: 'pointer', fontWeight: 700 }}
                                                >
                                                    + Add
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div style={{ marginBottom: '1rem' }}>
                                <label className={styles.statLabel}>Low Stock Alert Threshold</label>
                                <div className="flex items-center gap-2 mb-2">
                                    <input
                                        type="checkbox"
                                        checked={formData.low_stock_threshold === null}
                                        onChange={e => setFormData({ ...formData, low_stock_threshold: e.target.checked ? null : formData.low_stock_threshold_factor || '5' })}
                                        style={{ width: '16px', height: '16px' }}
                                    />
                                    <span className="text-sm text-gray-400">Use Global Default</span>
                                </div>
                                {formData.low_stock_threshold !== null && (() => {
                                    const factor = parseFloat(formData.low_stock_threshold_factor) || 1;
                                    const orderUnitSize = parseInt(formData.order_unit_size || '1') || 1;
                                    const presets = formData.use_category_qty_defaults ? formData.stock_options : formData.subtraction_presets;
                                    const maxPreset = presets.length > 0 ? Math.max(...presets) : 1;
                                    const effectiveFixed = formData.low_stock_threshold_type === 'order_qty'
                                        ? Math.round(factor * orderUnitSize)
                                        : formData.low_stock_threshold_type === 'stock_options'
                                            ? Math.round(factor * maxPreset)
                                            : Math.round(factor);
                                    return (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            <select
                                                value={formData.low_stock_threshold_type}
                                                onChange={e => setFormData({ ...formData, low_stock_threshold_type: e.target.value as any })}
                                                style={{ background: '#1e293b', color: 'white', border: '1px solid #374151', borderRadius: '4px', padding: '6px 10px', fontSize: '0.875rem' }}
                                            >
                                                <option value="fixed">Fixed Amount (units)</option>
                                                <option value="order_qty">× Order Quantity</option>
                                                <option value="stock_options">× Stock Options</option>
                                            </select>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <input
                                                    className={styles.input}
                                                    type="number"
                                                    min="0.01"
                                                    step={formData.low_stock_threshold_type === 'fixed' ? '1' : '0.5'}
                                                    value={formData.low_stock_threshold_factor}
                                                    onChange={e => setFormData({ ...formData, low_stock_threshold_factor: e.target.value, low_stock_threshold: e.target.value })}
                                                    placeholder={formData.low_stock_threshold_type === 'fixed' ? '5' : '2'}
                                                    style={{ width: '90px' }}
                                                />
                                                {formData.low_stock_threshold_type === 'order_qty' && (
                                                    <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>
                                                        × {orderUnitSize} {formData.order_unit_label || 'units'}
                                                        <span style={{ color: '#f59e0b', marginLeft: '0.5rem' }}>= {effectiveFixed} units</span>
                                                    </span>
                                                )}
                                                {formData.low_stock_threshold_type === 'stock_options' && (
                                                    <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>
                                                        × {maxPreset} (max preset)
                                                        <span style={{ color: '#f59e0b', marginLeft: '0.5rem' }}>= {effectiveFixed} units</span>
                                                    </span>
                                                )}
                                                {formData.low_stock_threshold_type === 'fixed' && (
                                                    <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>units</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>

                            {myLocations.length > 0 && (
                                <div style={{ marginBottom: '1rem', padding: '1rem', background: '#1e293b', borderRadius: '0.5rem', border: '1px solid #3b82f6' }}>
                                    <label className={styles.statLabel} style={{ marginBottom: '0.5rem', display: 'block' }}>Assigned Locations</label>
                                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                        {myLocations.map(loc => (
                                            <label key={loc.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={formData.assignedLocations.includes(loc.id)}
                                                    onChange={e => {
                                                        if (e.target.checked) setFormData(p => ({ ...p, assignedLocations: [...p.assignedLocations, loc.id] }));
                                                        else setFormData(p => ({ ...p, assignedLocations: p.assignedLocations.filter(id => id !== loc.id) }));
                                                    }}
                                                    style={{ width: '18px', height: '18px', accentColor: '#3b82f6' }}
                                                />
                                                {loc.name}
                                            </label>
                                        ))}
                                    </div>
                                    <p className="text-xs text-gray-400 mt-2">
                                        Select the locations where this product should be tracked.
                                    </p>
                                </div>
                            )}

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

            <BarcodeScanner
                open={showBarcodeScanner}
                title="Scan Product Barcode"
                onClose={() => setShowBarcodeScanner(false)}
                onDetected={handleBarcodeScanForProduct}
            />

            {webSearchPendingBarcode && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}>
                    <div style={{ background: '#1f2937', padding: '1.5rem', borderRadius: '8px', maxWidth: '400px', width: '90%', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)' }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'white', marginBottom: '1rem' }}>Barcode Not Found Locally</h2>
                        <p style={{ color: '#d1d5db', marginBottom: '1.5rem', fontSize: '0.95rem', lineHeight: 1.5 }}>
                            The barcode <strong>{webSearchPendingBarcode}</strong> was not found in your local inventory. Would you like to search the global web database for product details?
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            <button
                                onClick={() => setWebSearchPendingBarcode(null)}
                                style={{ background: 'transparent', border: '1px solid #4b5563', color: '#d1d5db', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer' }}
                            >
                                No, thanks
                            </button>
                            <button
                                onClick={handleWebSearchConfirm}
                                style={{ background: '#2563eb', color: 'white', padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 500 }}
                            >
                                Yes, search web
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );


}
