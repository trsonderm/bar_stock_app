'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import BarcodeScanner from '@/components/BarcodeScanner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Entry {
    id: number;
    barcode: string;
    brand: string | null;
    name: string;
    size: string | null;
    abv: number | null;
    type: string | null;
    secondary_type: string | null;
    has_image: boolean;
    imported_from_org_id: number | null;
    created_at: string;
}

interface OrgBarcode {
    item_id: number;
    item_name: string;
    type: string | null;
    secondary_type: string | null;
    supplier: string | null;
    org_id: number;
    org_name: string;
    barcode: string;
    already_in_site_db: boolean;
}

const TYPES = ['Liquor', 'Beer', 'Wine', 'Mixer', 'Other'];
const SUB_TYPES: Record<string, string[]> = {
    Liquor: ['Whiskey', 'Vodka', 'Rum', 'Tequila', 'Gin', 'Brandy', 'Liqueur', ''],
    Beer: ['Domestic', 'Craft', 'Import', ''],
    Wine: ['Red', 'White', 'Rosé', 'Sparkling', ''],
    Mixer: [],
    Other: [],
};

const inp: React.CSSProperties = {
    background: '#111827', border: '1px solid #4b5563', borderRadius: '6px',
    color: 'white', padding: '0.45rem 0.75rem', fontSize: '0.875rem', width: '100%',
    outline: 'none',
};
const label: React.CSSProperties = { color: '#9ca3af', fontSize: '0.8rem', marginBottom: '0.25rem', display: 'block' };
const card: React.CSSProperties = { background: '#1f2937', border: '1px solid #374151', borderRadius: '10px', padding: '1.25rem', marginBottom: '1.25rem' };
const btn = (color: string, disabled = false): React.CSSProperties => ({
    background: disabled ? '#374151' : color,
    color: 'white', border: 'none', borderRadius: '6px',
    padding: '0.5rem 1.1rem', cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 600, fontSize: '0.875rem', opacity: disabled ? 0.6 : 1,
    whiteSpace: 'nowrap' as const,
});

function classifyByName(name: string): { type: string; secondary_type: string } {
    const l = name.toLowerCase();
    if (/whiskey|whisky|bourbon|scotch|rye/.test(l)) return { type: 'Liquor', secondary_type: 'Whiskey' };
    if (/vodka/.test(l)) return { type: 'Liquor', secondary_type: 'Vodka' };
    if (/rum/.test(l)) return { type: 'Liquor', secondary_type: 'Rum' };
    if (/tequila|mezcal/.test(l)) return { type: 'Liquor', secondary_type: 'Tequila' };
    if (/\bgin\b/.test(l)) return { type: 'Liquor', secondary_type: 'Gin' };
    if (/brandy|cognac/.test(l)) return { type: 'Liquor', secondary_type: 'Brandy' };
    if (/liqueur|schnapps|triple sec|amaretto|baileys/.test(l)) return { type: 'Liquor', secondary_type: 'Liqueur' };
    if (/wine|chardonnay|cabernet|merlot|pinot|sauvignon|champagne|prosecco|rosé|rose|malbec/.test(l)) return { type: 'Wine', secondary_type: '' };
    if (/beer|lager|ale|ipa|stout|porter|pilsner|wheat|sour/.test(l)) return { type: 'Beer', secondary_type: '' };
    if (/soda|cola|juice|water|energy/.test(l)) return { type: 'Mixer', secondary_type: '' };
    return { type: 'Liquor', secondary_type: '' };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BottleLookupDbClient() {
    const [tab, setTab] = useState<'add' | 'database' | 'import'>('add');

    return (
        <div style={{ minHeight: '100vh', background: '#0a0f1a', fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ maxWidth: '960px', margin: '0 auto', padding: '2rem 1.25rem' }}>
                <h1 style={{ color: 'white', fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                    Bottle Lookup Database
                </h1>
                <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                    Central barcode registry used for site-wide bottle lookup. Scan to add entries, browse the database, or import from organization inventory.
                </p>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid #1f2937', paddingBottom: '0' }}>
                    {([['add', '📷 Scan & Add'], ['database', '🗄️ Database'], ['import', '📥 Import from Orgs']] as const).map(([key, title]) => (
                        <button key={key} onClick={() => setTab(key)} style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: tab === key ? '#60a5fa' : '#6b7280',
                            fontWeight: tab === key ? 700 : 400,
                            fontSize: '0.9rem', padding: '0.6rem 1rem',
                            borderBottom: tab === key ? '2px solid #60a5fa' : '2px solid transparent',
                            marginBottom: '-1px',
                        }}>{title}</button>
                    ))}
                </div>

                {tab === 'add' && <ScanAddTab />}
                {tab === 'database' && <DatabaseTab />}
                {tab === 'import' && <ImportTab />}
            </div>
        </div>
    );
}

// ─── Scan & Add Tab ───────────────────────────────────────────────────────────

function ScanAddTab() {
    const [scannerOpen, setScannerOpen] = useState(false);
    const [form, setForm] = useState({
        barcode: '', brand: '', name: '', size: '', abv: '', type: 'Liquor', secondary_type: '', image_data: '',
    });
    const [imagePreview, setImagePreview] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState<string | null>(null);
    const [error, setError] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);

    const setF = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

    const handleScan = (barcode: string) => {
        setScannerOpen(false);
        setF('barcode', barcode);
        setSaved(null);
        setError('');
    };

    const handleNameChange = (v: string) => {
        setF('name', v);
        if (!form.type || form.type === 'Liquor') {
            const cls = classifyByName(v);
            setForm(prev => ({ ...prev, name: v, type: cls.type, secondary_type: cls.secondary_type }));
        }
    };

    const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) { setError('Image must be under 2MB'); return; }
        const reader = new FileReader();
        reader.onload = (ev) => {
            const data = ev.target?.result as string;
            setImagePreview(data);
            setF('image_data', data);
        };
        reader.readAsDataURL(file);
    };

    const handleSave = async () => {
        if (!form.barcode.trim()) { setError('Scan or enter a barcode first.'); return; }
        if (!form.name.trim()) { setError('Product name is required.'); return; }
        setSaving(true); setError(''); setSaved(null);
        try {
            const res = await fetch('/api/super-admin/bottle-lookup-db', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error || 'Save failed'); return; }
            setSaved(form.barcode);
            setForm({ barcode: '', brand: '', name: '', size: '', abv: '', type: 'Liquor', secondary_type: '', image_data: '' });
            setImagePreview('');
        } catch { setError('Network error'); }
        finally { setSaving(false); }
    };

    const subTypes = SUB_TYPES[form.type] ?? [];

    return (
        <>
            <BarcodeScanner open={scannerOpen} onClose={() => setScannerOpen(false)} onDetected={handleScan} title="Scan Bottle Barcode" />

            <div style={card}>
                <div style={{ color: '#d1d5db', fontWeight: 700, marginBottom: '1rem', fontSize: '1rem' }}>Add Bottle to Database</div>

                {/* Barcode row */}
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                        <label style={label}>Barcode (UPC/EAN)</label>
                        <input style={inp} value={form.barcode} onChange={e => setF('barcode', e.target.value)} placeholder="Scan or type barcode…" />
                    </div>
                    <button style={btn('#7c3aed')} onClick={() => setScannerOpen(true)}>📷 Scan</button>
                </div>

                {/* Name + Brand */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div>
                        <label style={label}>Product Name *</label>
                        <input style={inp} value={form.name} onChange={e => handleNameChange(e.target.value)} placeholder="e.g. Jim Beam Kentucky Straight" />
                    </div>
                    <div>
                        <label style={label}>Brand / Company</label>
                        <input style={inp} value={form.brand} onChange={e => setF('brand', e.target.value)} placeholder="e.g. Jim Beam" />
                    </div>
                </div>

                {/* Size + ABV */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div>
                        <label style={label}>Size</label>
                        <input style={inp} value={form.size} onChange={e => setF('size', e.target.value)} placeholder="e.g. 750ml, 1L, 1.75L" />
                    </div>
                    <div>
                        <label style={label}>ABV % (optional)</label>
                        <input style={inp} type="number" min="0" max="100" step="0.1" value={form.abv} onChange={e => setF('abv', e.target.value)} placeholder="e.g. 40" />
                    </div>
                </div>

                {/* Type */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div>
                        <label style={label}>Type</label>
                        <select style={inp} value={form.type} onChange={e => { setF('type', e.target.value); setF('secondary_type', ''); }}>
                            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    {subTypes.length > 0 && (
                        <div>
                            <label style={label}>Sub-type</label>
                            <select style={inp} value={form.secondary_type} onChange={e => setF('secondary_type', e.target.value)}>
                                <option value="">— None —</option>
                                {subTypes.filter(Boolean).map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                    )}
                </div>

                {/* Image */}
                <div style={{ marginBottom: '1rem' }}>
                    <label style={label}>Bottle Image (optional — max 2MB)</label>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleImageFile} style={{ display: 'none' }} />
                        <button style={btn('#374151')} onClick={() => fileRef.current?.click()}>📸 Choose / Capture Image</button>
                        {imagePreview && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <img src={imagePreview} alt="preview" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #374151' }} />
                                <button style={{ ...btn('#374151'), padding: '0.3rem 0.6rem', fontSize: '0.75rem' }} onClick={() => { setImagePreview(''); setF('image_data', ''); }}>✕ Remove</button>
                            </div>
                        )}
                    </div>
                </div>

                {error && <div style={{ background: '#3b1515', border: '1px solid #ef4444', borderRadius: '6px', padding: '0.5rem 0.75rem', color: '#fca5a5', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</div>}
                {saved && <div style={{ background: '#052e16', border: '1px solid #10b981', borderRadius: '6px', padding: '0.5rem 0.75rem', color: '#4ade80', fontSize: '0.85rem', marginBottom: '0.75rem' }}>Saved barcode {saved} to database.</div>}

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button style={btn('#2563eb', saving || !form.barcode.trim() || !form.name.trim())} disabled={saving || !form.barcode.trim() || !form.name.trim()} onClick={handleSave}>
                        {saving ? 'Saving…' : '💾 Save to Site Database'}
                    </button>
                    <button style={btn('#374151')} onClick={() => { setForm({ barcode: '', brand: '', name: '', size: '', abv: '', type: 'Liquor', secondary_type: '', image_data: '' }); setImagePreview(''); setError(''); setSaved(null); }}>
                        Clear
                    </button>
                </div>
            </div>
        </>
    );
}

// ─── Database Tab ─────────────────────────────────────────────────────────────

function DatabaseTab() {
    const [entries, setEntries] = useState<Entry[]>([]);
    const [total, setTotal] = useState(0);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [deleting, setDeleting] = useState<number | null>(null);
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const load = useCallback((q: string) => {
        setLoading(true);
        fetch(`/api/super-admin/bottle-lookup-db?search=${encodeURIComponent(q)}&limit=100`)
            .then(r => r.json())
            .then(d => { setEntries(d.entries ?? []); setTotal(d.total ?? 0); })
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(''); }, [load]);

    const handleSearch = (v: string) => {
        setSearch(v);
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => load(v), 350);
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this entry from the site database?')) return;
        setDeleting(id);
        await fetch(`/api/super-admin/bottle-lookup-db?id=${id}`, { method: 'DELETE' });
        setEntries(prev => prev.filter(e => e.id !== id));
        setTotal(prev => prev - 1);
        setDeleting(null);
    };

    return (
        <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ color: '#d1d5db', fontWeight: 700, fontSize: '1rem' }}>
                    Site Database <span style={{ color: '#6b7280', fontWeight: 400, fontSize: '0.85rem' }}>({total} entries)</span>
                </div>
                <input
                    style={{ ...inp, width: '220px' }}
                    placeholder="Search name, brand, barcode…"
                    value={search}
                    onChange={e => handleSearch(e.target.value)}
                />
            </div>

            {loading ? (
                <div style={{ color: '#6b7280', padding: '1.5rem', textAlign: 'center' }}>Loading…</div>
            ) : entries.length === 0 ? (
                <div style={{ color: '#6b7280', padding: '1.5rem', textAlign: 'center' }}>
                    {search ? 'No matches found.' : 'No entries yet — use Scan & Add or Import from Orgs.'}
                </div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #374151' }}>
                                {['Barcode', 'Name', 'Brand', 'Size', 'ABV', 'Type', '📷', 'Added', ''].map(h => (
                                    <th key={h} style={{ color: '#9ca3af', fontWeight: 600, padding: '0.4rem 0.5rem', textAlign: 'left' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map(e => (
                                <tr key={e.id} style={{ borderBottom: '1px solid #1f2937' }}>
                                    <td style={{ padding: '0.5rem', color: '#d1d5db', fontFamily: 'monospace', fontSize: '0.78rem' }}>{e.barcode}</td>
                                    <td style={{ padding: '0.5rem', color: '#f3f4f6', fontWeight: 500, maxWidth: '200px' }}>{e.name}</td>
                                    <td style={{ padding: '0.5rem', color: '#9ca3af' }}>{e.brand ?? '—'}</td>
                                    <td style={{ padding: '0.5rem', color: '#9ca3af' }}>{e.size ?? '—'}</td>
                                    <td style={{ padding: '0.5rem', color: '#9ca3af' }}>{e.abv != null ? `${e.abv}%` : '—'}</td>
                                    <td style={{ padding: '0.5rem', color: '#9ca3af' }}>{[e.type, e.secondary_type].filter(Boolean).join(' / ') || '—'}</td>
                                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>{e.has_image ? '✅' : ''}</td>
                                    <td style={{ padding: '0.5rem', color: '#6b7280', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                                        {new Date(e.created_at).toLocaleDateString()}
                                    </td>
                                    <td style={{ padding: '0.5rem' }}>
                                        <button
                                            style={{ ...btn('#7f1d1d'), padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                                            disabled={deleting === e.id}
                                            onClick={() => handleDelete(e.id)}
                                        >
                                            {deleting === e.id ? '…' : '🗑'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ─── Import from Orgs Tab ─────────────────────────────────────────────────────

function ImportTab() {
    const [items, setItems] = useState<OrgBarcode[]>([]);
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
    const [orgFilter, setOrgFilter] = useState('');
    const [search, setSearch] = useState('');
    const [hideExisting, setHideExisting] = useState(true);

    const fetchItems = async () => {
        setLoading(true); setLoaded(false); setResult(null);
        try {
            const res = await fetch('/api/super-admin/bottle-lookup-db/org-barcodes');
            const data = await res.json();
            setItems(data.items ?? []);
            setLoaded(true);
        } finally { setLoading(false); }
    };

    const orgs = Array.from(new Set(items.map(i => i.org_name))).sort();

    const filtered = items.filter(i => {
        if (hideExisting && i.already_in_site_db) return false;
        if (orgFilter && i.org_name !== orgFilter) return false;
        if (search && !i.item_name.toLowerCase().includes(search.toLowerCase()) && !i.barcode.includes(search)) return false;
        return true;
    });

    const toggleSelect = (barcode: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(barcode) ? next.delete(barcode) : next.add(barcode);
            return next;
        });
    };

    const selectAll = () => setSelected(new Set(filtered.map(i => i.barcode)));
    const selectNone = () => setSelected(new Set());

    const handleImport = async () => {
        if (selected.size === 0) return;
        setImporting(true); setResult(null);
        const toImport = items.filter(i => selected.has(i.barcode)).map(i => ({
            barcode: i.barcode,
            item_name: i.item_name,
            type: i.type,
            secondary_type: i.secondary_type,
            org_id: i.org_id,
        }));
        try {
            const res = await fetch('/api/super-admin/bottle-lookup-db/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: toImport }),
            });
            const data = await res.json();
            setResult(data);
            setSelected(new Set());
            // Refresh to mark newly imported
            const refreshed = await fetch('/api/super-admin/bottle-lookup-db/org-barcodes').then(r => r.json());
            setItems(refreshed.items ?? []);
        } finally { setImporting(false); }
    };

    return (
        <div>
            <div style={card}>
                <div style={{ color: '#d1d5db', fontWeight: 700, marginBottom: '0.5rem', fontSize: '1rem' }}>Import from Organization Inventory</div>
                <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1rem' }}>
                    Pulls all barcodes that organizations have saved to their item inventory. Select entries to add to the site-wide bottle lookup database.
                </p>

                {!loaded ? (
                    <button style={btn('#7c3aed', loading)} disabled={loading} onClick={fetchItems}>
                        {loading ? 'Loading…' : '🔍 Load Organization Barcodes'}
                    </button>
                ) : (
                    <>
                        {/* Filter bar */}
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem', alignItems: 'center' }}>
                            <input style={{ ...inp, width: '200px' }} placeholder="Search name or barcode…" value={search} onChange={e => setSearch(e.target.value)} />
                            <select style={{ ...inp, width: '180px' }} value={orgFilter} onChange={e => setOrgFilter(e.target.value)}>
                                <option value="">All Organizations</option>
                                {orgs.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                            <label style={{ color: '#9ca3af', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                                <input type="checkbox" checked={hideExisting} onChange={e => setHideExisting(e.target.checked)} />
                                Hide already imported
                            </label>
                            <button style={{ ...btn('#374151'), padding: '0.35rem 0.75rem' }} onClick={selectAll}>Select All ({filtered.length})</button>
                            <button style={{ ...btn('#374151'), padding: '0.35rem 0.75rem' }} onClick={selectNone}>Clear</button>
                        </div>

                        {result && (
                            <div style={{ background: '#052e16', border: '1px solid #10b981', borderRadius: '6px', padding: '0.5rem 0.75rem', color: '#4ade80', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                                Imported {result.imported} entries. {result.skipped > 0 ? `${result.skipped} skipped (already exist or invalid).` : ''}
                            </div>
                        )}

                        <div style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                            {filtered.length} items shown · {selected.size} selected
                        </div>

                        <div style={{ maxHeight: '420px', overflowY: 'auto', border: '1px solid #374151', borderRadius: '8px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                <thead style={{ position: 'sticky', top: 0, background: '#111827', zIndex: 1 }}>
                                    <tr>
                                        {['', 'Barcode', 'Product Name', 'Type', 'Organization', 'Status'].map(h => (
                                            <th key={h} style={{ color: '#9ca3af', fontWeight: 600, padding: '0.5rem 0.6rem', textAlign: 'left', borderBottom: '1px solid #374151' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.length === 0 ? (
                                        <tr><td colSpan={6} style={{ padding: '1.5rem', textAlign: 'center', color: '#6b7280' }}>No items match the current filters.</td></tr>
                                    ) : filtered.map(i => (
                                        <tr key={`${i.org_id}-${i.barcode}`} style={{ borderBottom: '1px solid #1f2937', background: selected.has(i.barcode) ? '#1e3a5f33' : 'transparent' }}>
                                            <td style={{ padding: '0.4rem 0.6rem' }}>
                                                <input type="checkbox" checked={selected.has(i.barcode)} onChange={() => toggleSelect(i.barcode)} />
                                            </td>
                                            <td style={{ padding: '0.4rem 0.6rem', color: '#9ca3af', fontFamily: 'monospace', fontSize: '0.78rem' }}>{i.barcode}</td>
                                            <td style={{ padding: '0.4rem 0.6rem', color: '#f3f4f6', fontWeight: 500 }}>{i.item_name}</td>
                                            <td style={{ padding: '0.4rem 0.6rem', color: '#9ca3af' }}>{[i.type, i.secondary_type].filter(Boolean).join(' / ') || '—'}</td>
                                            <td style={{ padding: '0.4rem 0.6rem', color: '#60a5fa', fontSize: '0.78rem' }}>{i.org_name}</td>
                                            <td style={{ padding: '0.4rem 0.6rem' }}>
                                                {i.already_in_site_db
                                                    ? <span style={{ color: '#4ade80', fontSize: '0.75rem' }}>✅ In DB</span>
                                                    : <span style={{ color: '#facc15', fontSize: '0.75rem' }}>Pending</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            <button style={btn('#2563eb', importing || selected.size === 0)} disabled={importing || selected.size === 0} onClick={handleImport}>
                                {importing ? 'Importing…' : `📥 Import ${selected.size} Selected`}
                            </button>
                            <button style={{ ...btn('#374151'), padding: '0.45rem 0.75rem' }} onClick={fetchItems}>↻ Refresh</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
