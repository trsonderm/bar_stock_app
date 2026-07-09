'use client';

import { useState, useEffect, useCallback } from 'react';
import { Trash2, Download, RefreshCw, Search, Pencil, Plus, X } from 'lucide-react';

interface GlobalProduct {
    id: number;
    name: string;
    category_name: string | null;
    order_size: any;
    barcodes: any;
    bottle_size_amount: number | null;
    bottle_size_unit: string | null;
    aliases: string[] | null;
    is_alcohol: boolean;
    updated_at: string | null;
    linked_count: number;
    created_at: string;
}

interface GlobalCategory {
    id: number;
    name: string;
    created_at: string;
}

interface Org {
    id: number;
    name: string;
}

const EMPTY_FORM = {
    name: '',
    category_name: '',
    bottle_size_amount: '',
    bottle_size_unit: '',
    order_size: '[{"label":"Unit","amount":1}]',
    aliases: '',
    barcodes: '',
    is_alcohol: true,
};

const s = {
    page: { padding: '2rem', color: 'white', maxWidth: '1300px', margin: '0 auto' } as React.CSSProperties,
    h1: { fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' } as React.CSSProperties,
    sub: { color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1.5rem' } as React.CSSProperties,
    tabs: { display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid #374151', paddingBottom: '0' } as React.CSSProperties,
    tab: (active: boolean): React.CSSProperties => ({
        padding: '0.5rem 1rem',
        borderRadius: '6px 6px 0 0',
        border: 'none',
        cursor: 'pointer',
        fontWeight: 600,
        fontSize: '0.875rem',
        background: active ? '#1d4ed8' : 'transparent',
        color: active ? 'white' : '#9ca3af',
    }),
    card: { background: '#1f2937', border: '1px solid #374151', borderRadius: '10px', padding: '1.25rem', marginBottom: '1rem' } as React.CSSProperties,
    row: { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' as const },
    inp: { background: '#111827', border: '1px solid #4b5563', borderRadius: '6px', color: 'white', padding: '0.45rem 0.75rem', fontSize: '0.875rem', outline: 'none' } as React.CSSProperties,
    btn: (color: string): React.CSSProperties => ({
        background: color, color: 'white', border: 'none', borderRadius: '6px',
        padding: '0.45rem 0.9rem', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: '0.4rem',
    }),
    table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.85rem' },
    th: { padding: '0.5rem 0.75rem', textAlign: 'left' as const, color: '#9ca3af', borderBottom: '1px solid #374151', fontWeight: 600 },
    td: { padding: '0.5rem 0.75rem', borderBottom: '1px solid #1f2937', verticalAlign: 'top' as const },
    badge: (color: string): React.CSSProperties => ({
        background: color, color: 'white', padding: '1px 8px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600,
    }),
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties,
    modal: { background: '#1f2937', border: '1px solid #374151', borderRadius: '12px', padding: '1.5rem', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' as const } as React.CSSProperties,
};

function ProductForm({
    initial,
    categories,
    onSave,
    onCancel,
    title,
}: {
    initial: typeof EMPTY_FORM;
    categories: GlobalCategory[];
    onSave: (data: typeof EMPTY_FORM) => Promise<void>;
    onCancel: () => void;
    title: string;
}) {
    const [form, setForm] = useState(initial);
    const [saving, setSaving] = useState(false);

    const field = (label: string, key: keyof typeof EMPTY_FORM, hint?: string, type?: string) => (
        <div style={{ marginBottom: '0.875rem' }}>
            <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.78rem', marginBottom: '0.3rem' }}>{label}</label>
            {hint && <p style={{ color: '#6b7280', fontSize: '0.72rem', margin: '0 0 0.3rem 0' }}>{hint}</p>}
            <input
                type={type || 'text'}
                style={{ ...s.inp, width: '100%' }}
                value={form[key] as string}
                onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
            />
        </div>
    );

    return (
        <div style={s.overlay} onClick={e => e.target === e.currentTarget && onCancel()}>
            <div style={s.modal}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>{title}</h2>
                    <button type="button" onClick={onCancel} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer' }}>
                        <X size={20} />
                    </button>
                </div>

                {field('Product Name *', 'name')}

                <div style={{ marginBottom: '0.875rem' }}>
                    <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.78rem', marginBottom: '0.3rem' }}>Category</label>
                    <select
                        style={{ ...s.inp, width: '100%' }}
                        value={form.category_name}
                        onChange={e => setForm(p => ({ ...p, category_name: e.target.value }))}
                    >
                        <option value="">— Select category —</option>
                        {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                        <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.78rem', marginBottom: '0.3rem' }}>Bottle Size</label>
                        <input
                            type="number"
                            step="any"
                            min="0"
                            style={{ ...s.inp, width: '100%' }}
                            placeholder="e.g. 750"
                            value={form.bottle_size_amount}
                            onChange={e => setForm(p => ({ ...p, bottle_size_amount: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.78rem', marginBottom: '0.3rem' }}>Size Unit</label>
                        <input
                            type="text"
                            style={{ ...s.inp, width: '100%' }}
                            placeholder="ml, oz, L"
                            value={form.bottle_size_unit}
                            onChange={e => setForm(p => ({ ...p, bottle_size_unit: e.target.value }))}
                        />
                    </div>
                </div>

                <div style={{ marginBottom: '0.875rem', marginTop: '0.875rem' }}>
                    <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.78rem', marginBottom: '0.3rem' }}>Order Size (JSON)</label>
                    <p style={{ color: '#6b7280', fontSize: '0.72rem', margin: '0 0 0.3rem 0' }}>
                        Array of {'{'}label, amount{'}'} objects. e.g. {'[{"label":"Bottle","amount":1},{"label":"Case","amount":12}]'}
                    </p>
                    <textarea
                        style={{ ...s.inp, width: '100%', minHeight: '60px', resize: 'vertical', fontFamily: 'monospace', fontSize: '0.78rem' }}
                        value={form.order_size}
                        onChange={e => setForm(p => ({ ...p, order_size: e.target.value }))}
                    />
                </div>

                {field('Aliases (comma-separated)', 'aliases', 'Other names this product is known by — used in typeahead search.')}
                {field('Barcodes (comma-separated)', 'barcodes')}

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
                    <input
                        id="gp-alcohol"
                        type="checkbox"
                        checked={form.is_alcohol}
                        onChange={e => setForm(p => ({ ...p, is_alcohol: e.target.checked }))}
                        style={{ width: '16px', height: '16px' }}
                    />
                    <label htmlFor="gp-alcohol" style={{ color: '#e5e7eb', fontSize: '0.875rem', cursor: 'pointer' }}>Contains Alcohol</label>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    <button type="button" onClick={onCancel} style={s.btn('#374151')}>Cancel</button>
                    <button
                        type="button"
                        disabled={saving || !form.name.trim()}
                        onClick={async () => {
                            setSaving(true);
                            await onSave(form).finally(() => setSaving(false));
                        }}
                        style={{ ...s.btn('#1d4ed8'), opacity: saving ? 0.6 : 1 }}
                    >
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function formToPayload(form: typeof EMPTY_FORM) {
    let parsedOrderSize: any;
    try { parsedOrderSize = JSON.parse(form.order_size); } catch { parsedOrderSize = [{ label: 'Unit', amount: 1 }]; }

    const aliases = form.aliases
        ? form.aliases.split(',').map(s => s.trim()).filter(Boolean)
        : [];
    const barcodes = form.barcodes
        ? form.barcodes.split(',').map(s => s.trim()).filter(Boolean)
        : [];

    return {
        name: form.name.trim(),
        category_name: form.category_name || null,
        bottle_size_amount: form.bottle_size_amount ? parseFloat(form.bottle_size_amount) : null,
        bottle_size_unit: form.bottle_size_unit || null,
        order_size: parsedOrderSize,
        aliases,
        barcodes,
        is_alcohol: form.is_alcohol,
    };
}

function productToForm(p: GlobalProduct): typeof EMPTY_FORM {
    return {
        name: p.name,
        category_name: p.category_name || '',
        bottle_size_amount: p.bottle_size_amount != null ? String(p.bottle_size_amount) : '',
        bottle_size_unit: p.bottle_size_unit || '',
        order_size: p.order_size ? JSON.stringify(p.order_size) : '[{"label":"Unit","amount":1}]',
        aliases: Array.isArray(p.aliases) ? p.aliases.join(', ') : '',
        barcodes: Array.isArray(p.barcodes) ? p.barcodes.join(', ') : '',
        is_alcohol: p.is_alcohol !== false,
    };
}

export default function GlobalDatabaseClient() {
    const [tab, setTab] = useState<'products' | 'categories'>('products');
    const [products, setProducts] = useState<GlobalProduct[]>([]);
    const [categories, setCategories] = useState<GlobalCategory[]>([]);
    const [orgs, setOrgs] = useState<Org[]>([]);
    const [total, setTotal] = useState(0);
    const [q, setQ] = useState('');
    const [importOrgId, setImportOrgId] = useState('');
    const [importing, setImporting] = useState(false);
    const [msg, setMsg] = useState('');
    const [newCatName, setNewCatName] = useState('');
    const [loading, setLoading] = useState(false);

    const [showAddModal, setShowAddModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState<GlobalProduct | null>(null);

    const loadProducts = useCallback(async () => {
        setLoading(true);
        const res = await fetch(`/api/super-admin/global-products?q=${encodeURIComponent(q)}&limit=200`);
        const data = await res.json();
        setProducts(data.rows || []);
        setTotal(data.total || 0);
        setLoading(false);
    }, [q]);

    const loadCategories = useCallback(async () => {
        const res = await fetch('/api/super-admin/global-categories');
        const data = await res.json();
        setCategories(data.rows || []);
    }, []);

    const loadOrgs = useCallback(async () => {
        const res = await fetch('/api/super-admin/organizations');
        const data = await res.json();
        setOrgs(data.organizations || []);
    }, []);

    useEffect(() => { loadProducts(); }, [loadProducts]);
    useEffect(() => { loadCategories(); loadOrgs(); }, [loadCategories, loadOrgs]);

    const importFromOrg = async (type: 'products' | 'categories') => {
        if (!importOrgId) { setMsg('Select an organization first.'); return; }
        setImporting(true);
        setMsg('');
        const endpoint = type === 'products' ? '/api/super-admin/global-products' : '/api/super-admin/global-categories';
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'import_from_org', orgId: parseInt(importOrgId) }),
        });
        const data = await res.json();
        if (res.ok) {
            setMsg(`Imported ${data.inserted} ${type}.`);
            type === 'products' ? loadProducts() : loadCategories();
        } else {
            setMsg(`Error: ${data.error}`);
        }
        setImporting(false);
    };

    const deleteProduct = async (id: number) => {
        if (!confirm('Delete this product from the global database? This will remove it from all linked items.')) return;
        await fetch(`/api/super-admin/global-products?id=${id}`, { method: 'DELETE' });
        loadProducts();
    };

    const deleteCategory = async (id: number) => {
        if (!confirm('Delete this category from the global database?')) return;
        await fetch(`/api/super-admin/global-categories?id=${id}`, { method: 'DELETE' });
        loadCategories();
    };

    const addCategory = async () => {
        if (!newCatName.trim()) return;
        await fetch('/api/super-admin/global-categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'add', name: newCatName.trim() }),
        });
        setNewCatName('');
        loadCategories();
    };

    const handleAdd = async (form: typeof EMPTY_FORM) => {
        const payload = formToPayload(form);
        const res = await fetch('/api/super-admin/global-products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'add', ...payload }),
        });
        if (res.ok) {
            setShowAddModal(false);
            loadProducts();
        } else {
            const d = await res.json();
            alert(d.error || 'Failed to add product');
        }
    };

    const handleEdit = async (form: typeof EMPTY_FORM) => {
        if (!editingProduct) return;
        const payload = formToPayload(form);
        const res = await fetch('/api/super-admin/global-products', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: editingProduct.id, ...payload }),
        });
        if (res.ok) {
            const d = await res.json();
            setEditingProduct(null);
            loadProducts();
            if (d.notified) setMsg('Product updated and notifications sent to linked organizations.');
        } else {
            const d = await res.json();
            alert(d.error || 'Failed to update product');
        }
    };

    const formatOrderSize = (os: any) => {
        if (!os) return '-';
        const arr = Array.isArray(os) ? os : [];
        return arr.map((o: any) => `${o.label}×${o.amount}`).join(', ') || '-';
    };

    return (
        <div style={s.page}>
            <h1 style={s.h1}>Global Product & Category Database</h1>
            <p style={s.sub}>Master reference list shared across all organizations. Used for typeahead suggestions when adding products.</p>

            {msg && (
                <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: '#064e3b', border: '1px solid #10b981', borderRadius: '6px', color: '#6ee7b7', fontSize: '0.875rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {msg}
                    <button type="button" onClick={() => setMsg('')} style={{ background: 'none', border: 'none', color: '#6ee7b7', cursor: 'pointer' }}><X size={14} /></button>
                </div>
            )}

            {/* Import Controls */}
            <div style={s.card}>
                <div style={{ ...s.row, marginBottom: 0 }}>
                    <select
                        style={{ ...s.inp, minWidth: '220px' }}
                        value={importOrgId}
                        onChange={e => setImportOrgId(e.target.value)}
                    >
                        <option value="">Select organization to import from…</option>
                        {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                    <button type="button" style={s.btn('#1d4ed8')} onClick={() => importFromOrg('products')} disabled={importing}>
                        <Download size={14} /> Import Products
                    </button>
                    <button type="button" style={s.btn('#7c3aed')} onClick={() => importFromOrg('categories')} disabled={importing}>
                        <Download size={14} /> Import Categories
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div style={s.tabs}>
                <button type="button" style={s.tab(tab === 'products')} onClick={() => setTab('products')}>
                    Products ({total})
                </button>
                <button type="button" style={s.tab(tab === 'categories')} onClick={() => setTab('categories')}>
                    Categories ({categories.length})
                </button>
            </div>

            {/* Products Tab */}
            {tab === 'products' && (
                <div style={s.card}>
                    <div style={{ ...s.row, marginBottom: '1rem', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flex: 1 }}>
                            <div style={{ position: 'relative', flex: 1, maxWidth: '320px' }}>
                                <Search size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
                                <input
                                    style={{ ...s.inp, paddingLeft: '28px', width: '100%' }}
                                    placeholder="Search by name or alias…"
                                    value={q}
                                    onChange={e => setQ(e.target.value)}
                                />
                            </div>
                            <button type="button" style={s.btn('#374151')} onClick={loadProducts}>
                                <RefreshCw size={14} /> Refresh
                            </button>
                        </div>
                        <button type="button" style={s.btn('#059669')} onClick={() => setShowAddModal(true)}>
                            <Plus size={14} /> Add Product
                        </button>
                    </div>
                    {loading ? (
                        <p style={{ color: '#9ca3af' }}>Loading…</p>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={s.table}>
                                <thead>
                                    <tr>
                                        <th style={s.th}>Name</th>
                                        <th style={s.th}>Category</th>
                                        <th style={s.th}>Bottle Size</th>
                                        <th style={s.th}>Order Size</th>
                                        <th style={s.th}>Aliases</th>
                                        <th style={s.th}>Alcohol</th>
                                        <th style={s.th}>Linked</th>
                                        <th style={s.th}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {products.map(p => (
                                        <tr key={p.id}>
                                            <td style={s.td}>
                                                <div style={{ fontWeight: 500 }}>{p.name}</div>
                                                {Array.isArray(p.barcodes) && p.barcodes.length > 0 && (
                                                    <div style={{ color: '#6b7280', fontSize: '0.72rem' }}>{p.barcodes.join(', ')}</div>
                                                )}
                                            </td>
                                            <td style={s.td}>
                                                {p.category_name
                                                    ? <span style={s.badge('#1d4ed8')}>{p.category_name}</span>
                                                    : <span style={{ color: '#6b7280' }}>-</span>}
                                            </td>
                                            <td style={s.td}>
                                                {p.bottle_size_amount != null
                                                    ? `${p.bottle_size_amount}${p.bottle_size_unit ? ' ' + p.bottle_size_unit : ''}`
                                                    : <span style={{ color: '#6b7280' }}>-</span>}
                                            </td>
                                            <td style={s.td}>{formatOrderSize(p.order_size)}</td>
                                            <td style={s.td}>
                                                {Array.isArray(p.aliases) && p.aliases.length > 0
                                                    ? <span style={{ color: '#9ca3af', fontSize: '0.78rem' }}>{p.aliases.join(', ')}</span>
                                                    : <span style={{ color: '#6b7280' }}>-</span>}
                                            </td>
                                            <td style={s.td}>
                                                {p.is_alcohol !== false
                                                    ? <span style={s.badge('#047857')}>Yes</span>
                                                    : <span style={{ color: '#6b7280' }}>No</span>}
                                            </td>
                                            <td style={s.td}>
                                                {p.linked_count > 0
                                                    ? <span style={s.badge('#6d28d9')}>{p.linked_count} org{p.linked_count !== 1 ? 's' : ''}</span>
                                                    : <span style={{ color: '#6b7280' }}>-</span>}
                                            </td>
                                            <td style={{ ...s.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingProduct(p)}
                                                    style={{ background: '#374151', border: 'none', cursor: 'pointer', color: '#93c5fd', borderRadius: '4px', padding: '4px 8px', marginRight: '0.35rem' }}
                                                    title="Edit"
                                                >
                                                    <Pencil size={13} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => deleteProduct(p.id)}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}
                                                    title="Delete"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {products.length === 0 && (
                                        <tr><td colSpan={8} style={{ ...s.td, color: '#6b7280', textAlign: 'center', padding: '2rem' }}>
                                            No products yet. Import from an organization or add one manually.
                                        </td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Categories Tab */}
            {tab === 'categories' && (
                <div style={s.card}>
                    <div style={{ ...s.row, marginBottom: '1rem' }}>
                        <input
                            style={{ ...s.inp, minWidth: '200px' }}
                            placeholder="New category name…"
                            value={newCatName}
                            onChange={e => setNewCatName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && addCategory()}
                        />
                        <button type="button" style={s.btn('#059669')} onClick={addCategory}>Add Category</button>
                    </div>
                    <table style={s.table}>
                        <thead>
                            <tr>
                                <th style={s.th}>Name</th>
                                <th style={s.th}>Added</th>
                                <th style={s.th}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {categories.map(c => (
                                <tr key={c.id}>
                                    <td style={s.td}>{c.name}</td>
                                    <td style={s.td}>{new Date(c.created_at).toLocaleDateString()}</td>
                                    <td style={{ ...s.td, textAlign: 'right' }}>
                                        <button
                                            type="button"
                                            onClick={() => deleteCategory(c.id)}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}
                                            title="Delete"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {categories.length === 0 && (
                                <tr><td colSpan={3} style={{ ...s.td, color: '#6b7280', textAlign: 'center', padding: '2rem' }}>
                                    No categories yet.
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Add Product Modal */}
            {showAddModal && (
                <ProductForm
                    title="Add Global Product"
                    initial={EMPTY_FORM}
                    categories={categories}
                    onSave={handleAdd}
                    onCancel={() => setShowAddModal(false)}
                />
            )}

            {/* Edit Product Modal */}
            {editingProduct && (
                <ProductForm
                    title={`Edit — ${editingProduct.name}`}
                    initial={productToForm(editingProduct)}
                    categories={categories}
                    onSave={handleEdit}
                    onCancel={() => setEditingProduct(null)}
                />
            )}
        </div>
    );
}
