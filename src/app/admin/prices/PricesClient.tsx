'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Printer } from 'lucide-react';
import styles from '../admin.module.css';

interface Item {
    id: number;
    name: string;
    type: string;
    unit_cost: number;
    sale_price?: number;
    location_sale_price?: number;
    package_price?: number | null;
    package_sale_enabled?: boolean;
    order_size?: any;
    size_prices?: Record<string, number | null>;
}

interface Location {
    id: number;
    name: string;
}

export default function PricesClient() {
    const router = useRouter();
    const [items, setItems] = useState<Item[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);
    const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
    const [perLocationPricing, setPerLocationPricing] = useState(false);
    const [packageSaleEnabled, setPackageSaleEnabled] = useState(false);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    // Local sale price edits keyed by itemId (global) or `${itemId}_${locationId}` (per-location)
    const [salePriceEdits, setSalePriceEdits] = useState<Record<string, string>>({});
    // Package price edits keyed by itemId
    const [packagePriceEdits, setPackagePriceEdits] = useState<Record<string, string>>({});
    // Per-size price edits keyed by `${itemId}_${label}`
    const [sizePriceEdits, setSizePriceEdits] = useState<Record<string, string>>({});
    // Briefly show a "saved" tick after auto-save
    const [pkgSavedKey, setPkgSavedKey] = useState<string | null>(null);
    const [sizeSavedKey, setSizeSavedKey] = useState<string | null>(null);

    useEffect(() => {
        fetchCategories();
        fetchLocations();
        fetchSettings();
    }, []);

    // Re-fetch items when location changes (to get location_sale_price)
    useEffect(() => {
        fetchItems();
    }, [selectedLocationId]);

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/admin/settings');
            const data = await res.json();
            if (data.settings?.per_location_pricing === 'true') setPerLocationPricing(true);
            if (data.settings?.package_sale_enabled === 'true') setPackageSaleEnabled(true);
        } catch { }
    };

    const fetchLocations = async () => {
        try {
            const res = await fetch('/api/user/locations');
            const data = await res.json();
            if (data.locations?.length > 0) {
                setLocations(data.locations);
                const match = document.cookie.match(/(^| )current_location_id=([^;]+)/);
                const cookieLocId = match ? parseInt(match[2]) : null;
                const found = cookieLocId ? data.locations.find((l: Location) => l.id === cookieLocId) : null;
                setSelectedLocationId(found ? found.id : data.locations[0].id);
            }
        } catch { }
    };

    const fetchCategories = async () => {
        try {
            const res = await fetch('/api/admin/categories');
            const data = await res.json();
            if (data.categories) setCategories(data.categories.map((c: any) => c.name));
        } catch { }
    };

    const fetchItems = async () => {
        const locParam = selectedLocationId ? `&locationId=${selectedLocationId}` : '';
        const res = await fetch(`/api/inventory?sort=name${locParam}`);
        const data = await res.json();
        if (data.items) {
            setItems(data.items);
            const initial: Record<string, string> = {};
            const pkgInitial: Record<string, string> = {};
            const sizeInitial: Record<string, string> = {};
            data.items.forEach((i: Item) => {
                initial[String(i.id)] = i.sale_price !== null && i.sale_price !== undefined ? String(i.sale_price) : '';
                if (selectedLocationId) {
                    const locKey = `${i.id}_${selectedLocationId}`;
                    initial[locKey] = i.location_sale_price !== null && i.location_sale_price !== undefined ? String(i.location_sale_price) : '';
                }
                pkgInitial[String(i.id)] = i.package_price !== null && i.package_price !== undefined ? String(i.package_price) : '';
                const sizes = parseSizes(i.order_size);
                const sp = i.size_prices || {};
                sizes.forEach(s => {
                    const k = `${i.id}_${s.label}`;
                    sizeInitial[k] = sp[s.label] != null ? String(sp[s.label]) : '';
                });
            });
            setSalePriceEdits(initial);
            setPackagePriceEdits(pkgInitial);
            setSizePriceEdits(sizeInitial);
        }
        setLoading(false);
    };

    const savePrice = async (itemId: number, isLocationPrice: boolean) => {
        if (isLocationPrice && selectedLocationId) {
            const key = `${itemId}_${selectedLocationId}`;
            const raw = salePriceEdits[key];
            const num = raw === '' ? null : parseFloat(raw);
            if (num !== null && isNaN(num)) return;
            try {
                await fetch('/api/inventory', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: itemId, location_sale_price: num, locationId: selectedLocationId })
                });
                // Update local item display
                setItems(prev => prev.map(i => i.id === itemId ? { ...i, location_sale_price: num ?? undefined } : i));
            } catch {
                fetchItems();
            }
        } else {
            const raw = salePriceEdits[String(itemId)];
            const num = raw === '' ? null : parseFloat(raw);
            if (num !== null && isNaN(num)) return;
            setItems(prev => prev.map(i => i.id === itemId ? { ...i, sale_price: num ?? undefined } : i));
            try {
                await fetch('/api/inventory', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: itemId, sale_price: num })
                });
            } catch {
                fetchItems();
            }
        }
    };

    const parseSizes = (orderSize: any): { label: string; amount: number }[] => {
        let s = orderSize;
        if (typeof s === 'string') { try { s = JSON.parse(s); } catch { return []; } }
        if (!Array.isArray(s)) return [];
        return s.filter((x: any) => x && typeof x === 'object' && x.label);
    };

    const saveSizePrice = async (itemId: number, label: string) => {
        const k = `${itemId}_${label}`;
        const raw = sizePriceEdits[k];
        const num = raw === '' ? null : parseFloat(raw);
        if (num !== null && isNaN(num)) return;
        // Optimistically update item's size_prices
        setItems(prev => prev.map(i => {
            if (i.id !== itemId) return i;
            const next = { ...(i.size_prices || {}) };
            if (num === null) delete next[label]; else next[label] = num;
            return { ...i, size_prices: next };
        }));
        try {
            // Fetch current size_prices, merge, and save
            const item = items.find(i => i.id === itemId);
            const merged = { ...(item?.size_prices || {}) };
            if (num === null) delete merged[label]; else merged[label] = num;
            await fetch('/api/inventory', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: itemId, size_prices: merged })
            });
            setSizeSavedKey(k);
            setTimeout(() => setSizeSavedKey(prev => prev === k ? null : prev), 1800);
        } catch {
            fetchItems();
        }
    };

    const savePackagePrice = async (itemId: number) => {
        const key = String(itemId);
        const raw = packagePriceEdits[key];
        const num = raw === '' ? null : parseFloat(raw);
        if (num !== null && isNaN(num)) return;
        setItems(prev => prev.map(i => i.id === itemId ? { ...i, package_price: num } : i));
        try {
            await fetch('/api/inventory', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: itemId, package_price: num })
            });
            setPkgSavedKey(key);
            setTimeout(() => setPkgSavedKey(k => k === key ? null : k), 1800);
        } catch {
            fetchItems();
        }
    };

    const printPackageMenu = () => {
        const packageItems = items.filter(i => i.package_sale_enabled && i.package_price != null && Number(i.package_price) > 0);
        if (packageItems.length === 0) {
            alert('No items have a package price set. Mark products as "Package Sale Eligible" and set a price first.');
            return;
        }

        const types = orderedTypes.filter(t => packageItems.some(i => i.type === t));
        const grouped: Record<string, Item[]> = {};
        types.forEach(t => { grouped[t] = packageItems.filter(i => i.type === t); });

        const getOrderLabel = (item: Item): string => {
            if (Array.isArray(item.order_size) && item.order_size.length > 0) {
                const first = item.order_size[0];
                if (first && typeof first === 'object' && first.label) return first.label;
            }
            return '';
        };

        // Pack categories into pages (~16 items each)
        const ITEMS_PER_PAGE = 16;
        const pages: { type: string; items: Item[] }[][] = [];
        let currentPage: { type: string; items: Item[] }[] = [];
        let currentCount = 0;
        types.forEach(type => {
            const typeItems = grouped[type];
            if (currentCount + typeItems.length > ITEMS_PER_PAGE && currentPage.length > 0) {
                pages.push(currentPage);
                currentPage = [];
                currentCount = 0;
            }
            currentPage.push({ type, items: typeItems });
            currentCount += typeItems.length;
        });
        if (currentPage.length > 0) pages.push(currentPage);

        const totalPages = pages.length;

        const pagesHTML = pages.map((page, pageIdx) => `
<div class="page">
  <div class="border-outer"></div>
  <div class="border-inner"></div>
  ${pageIdx === 0 ? `
  <div class="cover-header">
    <div class="eyebrow">Premium Selection</div>
    <div class="main-title">Package Price Menu</div>
    <div class="subtitle">Bulk &amp; Wholesale Pricing</div>
    <div class="ornament">&#9670;&nbsp;&nbsp;&#9671;&nbsp;&nbsp;&#9670;</div>
    <div class="divider"></div>
  </div>` : `
  <div class="continuation-header">
    <span class="cont-title">Package Price Menu</span>
  </div>`}
  <div class="categories">
    ${page.map(({ type, items: typeItems }) => `
    <div class="cat-section">
      <div class="cat-header">
        <div class="cat-rule"></div>
        <div class="cat-name">${escapeHtml(type)}</div>
        <div class="cat-rule"></div>
      </div>
      <div class="item-list">
        ${typeItems.map(item => {
            const label = getOrderLabel(item);
            return `
        <div class="item-row">
          <div class="item-left">
            <span class="item-name">${escapeHtml(item.name)}</span>
            ${label ? `<span class="item-label">${escapeHtml(label)}</span>` : ''}
          </div>
          <div class="item-dots"></div>
          <div class="item-price">$${Number(item.package_price).toFixed(2)}</div>
        </div>`;
        }).join('')}
      </div>
    </div>`).join('')}
  </div>
  <div class="page-footer">
    <span class="footer-note">Prices are per order quantity &middot; Subject to change without notice</span>
    <span class="footer-page">${pageIdx + 1} / ${totalPages}</span>
  </div>
</div>`).join('');

        const escapeHtmlFn = `function escapeHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}`;
        void escapeHtmlFn; // used above as a plain js function, not needed in the print window

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Package Price Menu</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400&family=Lato:wght@300;400;700;900&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
@page{margin:0;size:letter portrait;}
body{font-family:'Lato',sans-serif;background:#fff;color:#111;}

.page{
  width:8.5in;min-height:11in;padding:.55in .8in;
  page-break-after:always;position:relative;
  display:flex;flex-direction:column;background:#fff;
}
.page:last-child{page-break-after:avoid;}

/* Double border frame */
.border-outer{
  position:absolute;inset:.28in;
  border:2.5px solid #b45309;pointer-events:none;
}
.border-inner{
  position:absolute;inset:calc(.28in + 7px);
  border:1px solid rgba(180,83,9,.3);pointer-events:none;
}

/* Cover header */
.cover-header{
  text-align:center;
  margin-bottom:.38in;padding-bottom:.28in;
  position:relative;
}
.eyebrow{
  font-size:7.5pt;letter-spacing:.5em;text-transform:uppercase;
  color:#9ca3af;margin-bottom:10px;
}
.main-title{
  font-family:'Playfair Display',serif;font-size:42pt;font-weight:900;
  letter-spacing:.04em;text-transform:uppercase;color:#111;line-height:1;
}
.subtitle{
  font-size:9pt;letter-spacing:.38em;text-transform:uppercase;
  color:#b45309;margin-top:11px;font-weight:700;
}
.ornament{
  font-size:10pt;color:#b45309;margin-top:14px;letter-spacing:.6em;
}
.divider{
  width:100%;height:1.5px;
  background:linear-gradient(to right,transparent 0%,#111 20%,#111 80%,transparent 100%);
  margin-top:.25in;
}

/* Continuation header */
.continuation-header{
  text-align:center;margin-bottom:.3in;padding-bottom:.15in;
  border-bottom:1.5px solid #111;
}
.cont-title{
  font-family:'Playfair Display',serif;font-size:13pt;
  font-weight:700;letter-spacing:.28em;text-transform:uppercase;color:#6b7280;
}

/* Category */
.categories{flex:1;}
.cat-section{margin-bottom:.28in;}
.cat-header{
  display:flex;align-items:center;gap:10px;margin-bottom:.1in;
}
.cat-rule{flex:1;height:1.5px;background:#b45309;}
.cat-name{
  font-family:'Playfair Display',serif;font-size:14pt;font-weight:700;
  color:#b45309;letter-spacing:.14em;text-transform:uppercase;white-space:nowrap;
}

/* Items */
.item-list{}
.item-row{
  display:flex;align-items:baseline;padding:6.5px 6px;
  border-bottom:1px solid #f3f4f6;
}
.item-row:nth-child(odd){background:#fdfaf6;}
.item-row:last-child{border-bottom:none;}
.item-left{display:flex;align-items:baseline;gap:8px;flex-shrink:0;max-width:65%;}
.item-name{font-size:11pt;font-weight:700;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.item-label{font-size:8pt;color:#9ca3af;font-style:italic;white-space:nowrap;}
.item-dots{
  flex:1;min-width:20px;
  border-bottom:1px dotted #d1d5db;
  margin:0 10px;position:relative;top:-4px;
}
.item-price{
  font-family:'Playfair Display',serif;font-size:13.5pt;font-weight:700;
  color:#111;white-space:nowrap;letter-spacing:-.01em;
}

/* Footer */
.page-footer{
  margin-top:.28in;padding-top:.15in;
  border-top:1px solid #e5e7eb;
  display:flex;justify-content:space-between;align-items:center;
}
.footer-note{font-size:7pt;color:#9ca3af;font-style:italic;}
.footer-page{font-size:7pt;color:#6b7280;font-weight:700;letter-spacing:.12em;text-transform:uppercase;}

@media print{
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
}
</style>
</head>
<body>
${pagesHTML}
</body>
</html>`;

        const win = window.open('', '_blank', 'width=960,height=760');
        if (!win) { alert('Please allow pop-ups to open the print menu.'); return; }
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 900);
    };

    const escapeHtml = (s: string) =>
        String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const togglePerLocationPricing = async (enabled: boolean) => {
        setPerLocationPricing(enabled);
        await fetch('/api/admin/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ per_location_pricing: enabled ? 'true' : 'false' })
        });
    };

    const getMargin = (unitCost: number, salePrice: number) => {
        if (!salePrice || salePrice <= 0) return null;
        return ((salePrice - unitCost) / salePrice * 100).toFixed(1);
    };

    const filteredItems = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

    const itemTypes = [...new Set(items.map(i => i.type))];
    const orderedTypes = [
        ...categories.filter(c => itemTypes.includes(c)),
        ...itemTypes.filter(t => !categories.includes(t)),
    ];
    const grouped: Record<string, Item[]> = {};
    orderedTypes.forEach(type => {
        grouped[type] = filteredItems.filter(i => i.type === type);
    });

    const effectivePrice = (item: Item) => {
        if (perLocationPricing && selectedLocationId && item.location_sale_price != null) {
            return item.location_sale_price;
        }
        return item.sale_price;
    };

    // Show the package price column whenever any item has the per-product flag set,
    // regardless of the org-level setting (which only gates the print button).
    const showPackagePriceCol = items.some(i => i.package_sale_enabled);

    if (loading) return <div className={styles.container}>Loading...</div>;

    return (
        <div className={styles.card}>
            {/* Header controls */}
            <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <p style={{ color: '#9ca3af', fontSize: '0.9rem', margin: 0 }}>
                        Unit prices are set on the{' '}
                        <Link href="/admin/products" style={{ color: '#3b82f6', textDecoration: 'underline' }}>
                            Product List
                        </Link>
                        {' '}and are read-only here. Set a sale price per item to enable profit reporting.
                    </p>
                    {packageSaleEnabled && (
                        <button
                            type="button"
                            onClick={printPackageMenu}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '0.45rem 1rem',
                                background: 'linear-gradient(135deg, #d97706, #b45309)',
                                color: 'white', border: 'none', borderRadius: '6px',
                                cursor: 'pointer', fontWeight: 700, fontSize: '0.875rem',
                                whiteSpace: 'nowrap', flexShrink: 0,
                                boxShadow: '0 2px 8px rgba(180,83,9,0.35)'
                            }}
                        >
                            <Printer size={15} />
                            Print Package Menu
                        </button>
                    )}
                </div>

                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
                    <input
                        className={styles.input}
                        placeholder="Search items..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ flex: 1, minWidth: '200px' }}
                    />

                    {/* Per-location pricing toggle */}
                    {locations.length > 1 && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'white', whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: '0.9rem', color: '#9ca3af' }}>Per-location prices</span>
                            <div
                                onClick={() => togglePerLocationPricing(!perLocationPricing)}
                                style={{
                                    width: '42px', height: '24px', borderRadius: '12px', cursor: 'pointer',
                                    background: perLocationPricing ? '#3b82f6' : '#374151',
                                    position: 'relative', transition: 'background 0.2s', flexShrink: 0
                                }}
                            >
                                <div style={{
                                    position: 'absolute', top: '3px',
                                    left: perLocationPricing ? '21px' : '3px',
                                    width: '18px', height: '18px', borderRadius: '50%',
                                    background: 'white', transition: 'left 0.2s'
                                }} />
                            </div>
                        </label>
                    )}

                    {/* Location selector (shown when per-location pricing is on) */}
                    {perLocationPricing && locations.length > 1 && (
                        <select
                            className={styles.input}
                            value={selectedLocationId ?? ''}
                            onChange={e => setSelectedLocationId(parseInt(e.target.value))}
                            style={{ width: 'auto' }}
                            title="Select location"
                            aria-label="Select location"
                        >
                            {locations.map(l => (
                                <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                        </select>
                    )}
                </div>

                {perLocationPricing && selectedLocationId && (
                    <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '0.4rem', fontSize: '0.82rem', color: '#93c5fd', marginBottom: '0.5rem' }}>
                        Editing prices for <strong>{locations.find(l => l.id === selectedLocationId)?.name}</strong>.
                        Location prices override the global sale price for this location only.
                    </div>
                )}
            </div>

            {orderedTypes.map(type => {
                const typeItems = grouped[type];
                if (!typeItems?.length) return null;
                return (
                    <div key={type} style={{ marginBottom: '3rem' }}>
                        <h2 className={styles.cardTitle} style={{ borderBottom: '1px solid #374151', paddingBottom: '0.5rem', marginBottom: '1rem', color: '#d97706' }}>
                            {type}
                        </h2>
                        <div className={styles.tableContainer}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th style={{ width: '30%' }}>Name</th>
                                        <th style={{ width: '18%' }}>
                                            Unit Price ($)
                                            <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 'normal', marginLeft: '6px' }}>(from product)</span>
                                        </th>
                                        <th style={{ width: '18%' }}>
                                            {perLocationPricing && selectedLocationId
                                                ? `${locations.find(l => l.id === selectedLocationId)?.name} Price ($)`
                                                : 'Sale Price ($)'}
                                        </th>
                                        {perLocationPricing && selectedLocationId && (
                                            <th style={{ width: '18%' }}>
                                                Global Price ($)
                                                <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 'normal', marginLeft: '4px' }}>(fallback)</span>
                                            </th>
                                        )}
                                        {showPackagePriceCol && (
                                            <th style={{ width: '14%' }}>
                                                Package Price ($)
                                                <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 'normal', marginLeft: '4px' }}>(per order qty)</span>
                                            </th>
                                        )}
                                        <th style={{ width: '14%' }}>Margin</th>
                                        <th style={{ width: '10%' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {typeItems.map(item => {
                                        const locKey = `${item.id}_${selectedLocationId}`;
                                        const globalKey = String(item.id);
                                        const sizes = parseSizes(item.order_size);
                                        const hasSizes = sizes.length > 0;

                                        // For margin: use first size price if available, else sale_price
                                        const firstSizePrice = hasSizes
                                            ? parseFloat(sizePriceEdits[`${item.id}_${sizes[0].label}`] ?? '')
                                            : NaN;
                                        const activePriceVal = perLocationPricing && selectedLocationId
                                            ? (salePriceEdits[locKey] ?? '')
                                            : (salePriceEdits[globalKey] ?? '');
                                        const activePriceNum = parseFloat(activePriceVal);
                                        const displayPrice = hasSizes
                                            ? (isNaN(firstSizePrice) ? 0 : firstSizePrice)
                                            : (isNaN(activePriceNum) ? (effectivePrice(item) ?? 0) : activePriceNum);
                                        const margin = displayPrice > 0 ? getMargin(item.unit_cost || 0, displayPrice) : null;

                                        return (
                                            <tr key={item.id}>
                                                <td style={{ fontWeight: 600 }}>{item.name}</td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <span style={{ color: '#e5e7eb', fontWeight: 600 }}>
                                                            ${Number(item.unit_cost || 0).toFixed(2)}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => router.push(`/admin/products?editId=${item.id}`)}
                                                            style={{ fontSize: '0.75rem', color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', padding: 0, whiteSpace: 'nowrap' }}
                                                        >
                                                            Edit →
                                                        </button>
                                                    </div>
                                                </td>
                                                <td>
                                                    {hasSizes ? (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                                            {sizes.map(size => {
                                                                const sk = `${item.id}_${size.label}`;
                                                                return (
                                                                    <div key={size.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                        <span style={{ fontSize: '0.75rem', color: '#9ca3af', minWidth: '36px', textAlign: 'right' }}>
                                                                            {size.label}
                                                                        </span>
                                                                        <input
                                                                            type="number"
                                                                            step="0.01"
                                                                            min="0"
                                                                            className={styles.input}
                                                                            style={{ padding: '0.25rem', fontSize: '0.9em', width: '90px', marginBottom: 0 }}
                                                                            value={sizePriceEdits[sk] ?? ''}
                                                                            placeholder="0.00"
                                                                            onChange={e => setSizePriceEdits(prev => ({ ...prev, [sk]: e.target.value }))}
                                                                            onBlur={() => saveSizePrice(item.id, size.label)}
                                                                        />
                                                                        {sizeSavedKey === sk && (
                                                                            <span style={{ color: '#10b981', fontSize: '0.8rem', fontWeight: 600 }}>✓</span>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : (
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            min="0"
                                                            className={styles.input}
                                                            style={{ padding: '0.25rem', fontSize: '0.9em', width: '100px', marginBottom: 0 }}
                                                            value={activePriceVal}
                                                            placeholder="0.00"
                                                            onChange={e => {
                                                                const key = perLocationPricing && selectedLocationId ? locKey : globalKey;
                                                                setSalePriceEdits(prev => ({ ...prev, [key]: e.target.value }));
                                                            }}
                                                            onBlur={() => savePrice(item.id, !!(perLocationPricing && selectedLocationId))}
                                                        />
                                                    )}
                                                </td>
                                                {perLocationPricing && selectedLocationId && (
                                                    <td>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            min="0"
                                                            className={styles.input}
                                                            style={{ padding: '0.25rem', fontSize: '0.9em', width: '100px', marginBottom: 0 }}
                                                            value={salePriceEdits[globalKey] ?? ''}
                                                            placeholder="0.00"
                                                            onChange={e => setSalePriceEdits(prev => ({ ...prev, [globalKey]: e.target.value }))}
                                                            onBlur={() => savePrice(item.id, false)}
                                                        />
                                                    </td>
                                                )}
                                                {showPackagePriceCol && (
                                                    <td>
                                                        {item.package_sale_enabled ? (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                <input
                                                                    type="number"
                                                                    step="0.01"
                                                                    min="0"
                                                                    className={styles.input}
                                                                    style={{ padding: '0.25rem', fontSize: '0.9em', width: '90px', marginBottom: 0 }}
                                                                    value={packagePriceEdits[globalKey] ?? ''}
                                                                    placeholder="0.00"
                                                                    onChange={e => setPackagePriceEdits(prev => ({ ...prev, [globalKey]: e.target.value }))}
                                                                    onBlur={() => savePackagePrice(item.id)}
                                                                />
                                                                {pkgSavedKey === globalKey && (
                                                                    <span style={{ color: '#10b981', fontSize: '0.8rem', fontWeight: 600 }}>✓</span>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span style={{ color: '#4b5563', fontSize: '0.8rem' }}>—</span>
                                                        )}
                                                    </td>
                                                )}
                                                <td>
                                                    {margin !== null ? (
                                                        <span style={{ color: parseFloat(margin) >= 0 ? '#10b981' : '#ef4444', fontWeight: 600, fontSize: '0.9rem' }}>
                                                            {margin}%
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: '#4b5563' }}>—</span>
                                                    )}
                                                </td>
                                                <td>
                                                    <button
                                                        type="button"
                                                        onClick={() => router.push(`/admin/products?editId=${item.id}`)}
                                                        style={{ background: '#374151', color: '#d1d5db', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                                                    >
                                                        Edit Product
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
