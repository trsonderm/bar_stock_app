'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, RotateCcw, RefreshCw, PackageOpen, ArrowLeft } from 'lucide-react';

interface ArchivedItem {
    id: number;
    name: string;
    type: string;
    secondary_type: string | null;
    unit_cost: number;
    archived_at: string;
}

export default function ArchivedProductsPage() {
    const router = useRouter();
    const [items, setItems] = useState<ArchivedItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [restoring, setRestoring] = useState<number | null>(null);
    const [search, setSearch] = useState('');

    const load = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/inventory?archived=true&sort=name');
            const d = await res.json();
            setItems(d.items || []);
        } catch {}
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    const handleRestore = async (id: number, name: string) => {
        if (!confirm(`Restore "${name}"? It will reappear in the product list.`)) return;
        setRestoring(id);
        try {
            const res = await fetch('/api/admin/products/archive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, archive: false }),
            });
            if (res.ok) {
                setItems(prev => prev.filter(i => i.id !== id));
            } else {
                alert('Failed to restore product');
            }
        } catch {
            alert('Error restoring product');
        }
        setRestoring(null);
    };

    const filtered = search.trim()
        ? items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()) || i.type.toLowerCase().includes(search.toLowerCase()))
        : items;

    return (
        <div style={{ padding: '2rem', maxWidth: '960px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                <button
                    type="button"
                    onClick={() => router.push('/admin/products')}
                    style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
                >
                    <ArrowLeft size={16} />
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <Archive size={22} style={{ color: '#f59e0b' }} />
                    <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0, color: 'white' }}>Archived Products</h1>
                </div>
            </div>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.75rem', marginLeft: '2.5rem' }}>
                Archived products are hidden from the product list, inventory view, and reporting. Restore them to make them active again.
            </p>

            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <input
                    type="text"
                    placeholder="Search archived products…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{
                        flex: 1, maxWidth: '320px', padding: '0.5rem 0.9rem',
                        background: '#1f2937', border: '1px solid #374151', borderRadius: '8px',
                        color: 'white', fontSize: '0.875rem', outline: 'none',
                    }}
                />
                <button
                    type="button"
                    onClick={load}
                    style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', padding: '0.5rem 0.75rem', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                    <RefreshCw size={14} />
                </button>
                <span style={{ color: '#6b7280', fontSize: '0.8rem', marginLeft: 'auto' }}>
                    {items.length} archived product{items.length !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Content */}
            {loading ? (
                <div style={{ color: '#6b7280', textAlign: 'center', padding: '4rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                    <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite' }} />
                    <span>Loading archived products…</span>
                </div>
            ) : filtered.length === 0 ? (
                <div style={{
                    border: '2px dashed #374151', borderRadius: '12px',
                    padding: '4rem 2rem', textAlign: 'center', color: '#6b7280',
                }}>
                    <PackageOpen size={40} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
                    <div style={{ fontWeight: 600, color: '#9ca3af', fontSize: '1rem', marginBottom: '0.4rem' }}>
                        {search ? 'No matching archived products' : 'No archived products'}
                    </div>
                    <div style={{ fontSize: '0.85rem' }}>
                        {search ? 'Try a different search term.' : 'Products you archive will appear here.'}
                    </div>
                </div>
            ) : (
                <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '12px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: '#0f172a', borderBottom: '1px solid #1f2937' }}>
                                {['Name', 'Type', 'Unit Cost', 'Archived On', 'Actions'].map(h => (
                                    <th key={h} style={{
                                        padding: '0.75rem 1rem', textAlign: 'left' as const,
                                        color: '#6b7280', fontSize: '0.72rem', fontWeight: 700,
                                        textTransform: 'uppercase' as const, letterSpacing: '0.05em',
                                    }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((item, i) => (
                                <tr
                                    key={item.id}
                                    style={{
                                        borderBottom: i < filtered.length - 1 ? '1px solid #1f2937' : 'none',
                                        transition: 'background 0.15s',
                                    }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#1f2937'}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                                >
                                    <td style={{ padding: '0.75rem 1rem', color: '#e5e7eb', fontWeight: 500 }}>
                                        {item.name}
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem' }}>
                                        <span style={{
                                            background: '#1f2937', border: '1px solid #374151',
                                            borderRadius: '999px', padding: '2px 8px',
                                            color: '#9ca3af', fontSize: '0.75rem',
                                        }}>
                                            {item.type}{item.secondary_type ? ` · ${item.secondary_type}` : ''}
                                        </span>
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem', color: '#9ca3af', fontSize: '0.875rem' }}>
                                        {item.unit_cost ? `$${Number(item.unit_cost).toFixed(2)}` : '—'}
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem', color: '#6b7280', fontSize: '0.8rem' }}>
                                        {item.archived_at
                                            ? new Date(item.archived_at).toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' })
                                            : '—'
                                        }
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem' }}>
                                        <button
                                            type="button"
                                            onClick={() => handleRestore(item.id, item.name)}
                                            disabled={restoring === item.id}
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                                padding: '5px 12px',
                                                background: restoring === item.id ? '#374151' : '#14532d',
                                                border: '1px solid #16a34a',
                                                borderRadius: '6px', color: '#86efac',
                                                cursor: restoring === item.id ? 'default' : 'pointer',
                                                fontSize: '0.8rem', fontWeight: 600,
                                            }}
                                        >
                                            {restoring === item.id
                                                ? <><RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> Restoring…</>
                                                : <><RotateCcw size={12} /> Restore</>
                                            }
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
