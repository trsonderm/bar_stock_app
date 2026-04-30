'use client';

import { useState, useEffect, useCallback } from 'react';
import { Trash2, Download, RefreshCw, Search } from 'lucide-react';

interface GlobalProduct {
    id: number;
    name: string;
    category_name: string | null;
    order_size: any;
    barcodes: any;
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

const s = {
    page: { padding: '2rem', color: 'white', maxWidth: '1200px', margin: '0 auto' } as React.CSSProperties,
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
};

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
        if (!confirm('Delete this product from the global database?')) return;
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

    const formatOrderSize = (os: any) => {
        if (!os) return '-';
        const arr = Array.isArray(os) ? os : [];
        return arr.map((o: any) => `${o.label}×${o.amount}`).join(', ') || '-';
    };

    return (
        <div style={s.page}>
            <h1 style={s.h1}>Global Product & Category Database</h1>
            <p style={s.sub}>Master reference list shared across all organizations. Used for typeahead suggestions when adding products.</p>

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
                    <button style={s.btn('#1d4ed8')} onClick={() => importFromOrg('products')} disabled={importing}>
                        <Download size={14} /> Import Products
                    </button>
                    <button style={s.btn('#7c3aed')} onClick={() => importFromOrg('categories')} disabled={importing}>
                        <Download size={14} /> Import Categories
                    </button>
                    {msg && <span style={{ color: '#34d399', fontSize: '0.85rem' }}>{msg}</span>}
                </div>
            </div>

            {/* Tabs */}
            <div style={s.tabs}>
                <button style={s.tab(tab === 'products')} onClick={() => setTab('products')}>
                    Products ({total})
                </button>
                <button style={s.tab(tab === 'categories')} onClick={() => setTab('categories')}>
                    Categories ({categories.length})
                </button>
            </div>

            {/* Products Tab */}
            {tab === 'products' && (
                <div style={s.card}>
                    <div style={{ ...s.row, marginBottom: '1rem' }}>
                        <div style={{ position: 'relative', flex: 1, maxWidth: '320px' }}>
                            <Search size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
                            <input
                                style={{ ...s.inp, paddingLeft: '28px', width: '100%' }}
                                placeholder="Search products…"
                                value={q}
                                onChange={e => setQ(e.target.value)}
                            />
                        </div>
                        <button style={s.btn('#374151')} onClick={loadProducts}>
                            <RefreshCw size={14} /> Refresh
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
                                        <th style={s.th}>Order Size</th>
                                        <th style={s.th}>Barcodes</th>
                                        <th style={s.th}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {products.map(p => (
                                        <tr key={p.id}>
                                            <td style={s.td}>{p.name}</td>
                                            <td style={s.td}>
                                                {p.category_name
                                                    ? <span style={s.badge('#1d4ed8')}>{p.category_name}</span>
                                                    : <span style={{ color: '#6b7280' }}>-</span>}
                                            </td>
                                            <td style={s.td}>{formatOrderSize(p.order_size)}</td>
                                            <td style={s.td}>
                                                {Array.isArray(p.barcodes) && p.barcodes.length > 0
                                                    ? p.barcodes.join(', ')
                                                    : <span style={{ color: '#6b7280' }}>-</span>}
                                            </td>
                                            <td style={{ ...s.td, textAlign: 'right' }}>
                                                <button
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
                                        <tr><td colSpan={5} style={{ ...s.td, color: '#6b7280', textAlign: 'center', padding: '2rem' }}>
                                            No products yet. Import from an organization above.
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
                        <button style={s.btn('#059669')} onClick={addCategory}>Add Category</button>
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
        </div>
    );
}
