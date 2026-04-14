'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import styles from '../../admin.module.css';
import { PenLine } from 'lucide-react';

interface OrderSizeOption {
    label: string;
    amount: number;
}

interface Item {
    id: number;
    name: string;
    type: string;
    quantity: number;
    supplier?: string;
    supplier_id?: number;
    order_size?: OrderSizeOption[] | number[] | number;
}

interface CartItem {
    itemId: number;
    itemName: string;
    packLabel: string;
    packAmount: number;
    orderQty: number;
}

interface Signature {
    id: number;
    label: string;
    data: string;
    is_active: boolean;
}

interface Branding {
    logo_url: string | null;
    brand_color: string;
    brand_name: string;
    logo_position: 'left' | 'center' | 'right';
}

export default function ManualOrderClient({ user }: { user: any }) {
    const [items, setItems] = useState<Item[]>([]);
    const [suppliers, setSuppliers] = useState<{ id: number, name: string }[]>([]);
    const [selectedSupplierId, setSelectedSupplierId] = useState<number | 'all'>('all');
    const [cart, setCart] = useState<Record<string, CartItem>>({});
    const [showPreview, setShowPreview] = useState(false);
    const [loading, setLoading] = useState(true);

    const [myLocations, setMyLocations] = useState<{ id: number, name: string }[]>([]);
    const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);

    const [signatures, setSignatures] = useState<Signature[]>([]);
    const [selectedSigId, setSelectedSigId] = useState<number | null>(null);
    const [branding, setBranding] = useState<Branding>({ logo_url: null, brand_color: '#f59e0b', brand_name: '', logo_position: 'left' });

    // Draggable signature state
    const [sigPos, setSigPos] = useState({ x: 20, y: 20 });
    const dragging = useRef(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const previewRef = useRef<HTMLDivElement>(null);

    const [sendEmail, setSendEmail] = useState(false);
    const [sendSms, setSendSms] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchData();
        fetch('/api/settings/signatures').then(r => r.json()).then(d => {
            const sigs: Signature[] = d.signatures || [];
            setSignatures(sigs);
            const active = sigs.find(s => s.is_active);
            if (active) setSelectedSigId(active.id);
        });
        fetch('/api/admin/branding').then(r => r.json()).then(d => {
            if (d) setBranding(d);
        });
        fetch('/api/user/locations').then(r => r.json()).then(d => {
            const locs = d.locations || [];
            setMyLocations(locs);
            const cookieMatch = document.cookie.match(/current_location_id=(\d+)/);
            const cookieLocId = cookieMatch ? parseInt(cookieMatch[1]) : null;
            if (cookieLocId && locs.find((l: any) => l.id === cookieLocId)) {
                setSelectedLocationId(cookieLocId);
            } else if (locs.length > 0) {
                setSelectedLocationId(locs[0].id);
            }
        });
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [itemsRes, suppRes] = await Promise.all([
                fetch('/api/inventory?sort=name'),
                fetch('/api/admin/suppliers')
            ]);
            const itemsData = await itemsRes.json();
            const suppData = await suppRes.json();
            if (itemsData.items) setItems(itemsData.items);
            if (suppData.suppliers) setSuppliers(suppData.suppliers);
        } catch (e) {
            console.error(e);
            alert('Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    const handleAdjust = (item: Item, opt: OrderSizeOption, change: number) => {
        const key = `${item.id}-${opt.amount}`;
        setCart(prev => {
            const current = prev[key]?.orderQty || 0;
            const next = Math.max(0, current + change);
            if (next === 0) {
                const updated = { ...prev };
                delete updated[key];
                return updated;
            }
            return { ...prev, [key]: { itemId: item.id, itemName: item.name, packLabel: opt.label, packAmount: opt.amount, orderQty: next } };
        });
    };

    const parseOrderSize = (os: any): OrderSizeOption[] => {
        if (!os) return [{ label: 'Unit', amount: 1 }];
        if (Array.isArray(os)) {
            if (os.length > 0 && typeof os[0] === 'object' && os[0] !== null && 'amount' in os[0]) return os as OrderSizeOption[];
            return (os as number[]).map(n => ({ label: n === 1 ? 'Unit' : n.toString(), amount: n }));
        }
        if (typeof os === 'number') return [{ label: os === 1 ? 'Unit' : os.toString(), amount: os }];
        return [{ label: 'Unit', amount: 1 }];
    };

    const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId) || null;
    const selectedSig = signatures.find(s => s.id === selectedSigId) || null;

    // ── Drag handlers ────────────────────────────────────────────────────────
    const onSigMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        dragging.current = true;
        dragOffset.current = { x: e.clientX - sigPos.x, y: e.clientY - sigPos.y };
    };

    const onMouseMove = useCallback((e: MouseEvent) => {
        if (!dragging.current || !previewRef.current) return;
        const rect = previewRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - dragOffset.current.x, rect.width - 160));
        const y = Math.max(0, Math.min(e.clientY - dragOffset.current.y, rect.height - 80));
        setSigPos({ x, y });
    }, []);

    const onMouseUp = useCallback(() => { dragging.current = false; }, []);

    useEffect(() => {
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [onMouseMove, onMouseUp]);

    // ── Print ────────────────────────────────────────────────────────────────
    const handlePrint = () => {
        const cartItems = Object.values(cart);
        const logoHtml = branding.logo_url
            ? `<img src="${branding.logo_url}" style="height:56px;object-fit:contain;" />`
            : '';
        const brandNameHtml = branding.brand_name
            ? `<span style="font-size:1.3rem;font-weight:700;color:${branding.brand_color};font-family:sans-serif;">${branding.brand_name}</span>`
            : '';
        const headerJustify = branding.logo_position === 'center' ? 'center' : branding.logo_position === 'right' ? 'flex-end' : 'flex-start';

        const sigHtml = selectedSig
            ? `<div style="position:absolute;left:${sigPos.x}px;top:${sigPos.y}px;">
                <img src="${selectedSig.data}" style="height:64px;object-fit:contain;" />
                <div style="font-size:0.75rem;color:#6b7280;text-align:center;margin-top:2px;">${selectedSig.label}</div>
               </div>`
            : '';

        const rows = cartItems.map(c => `
            <tr>
                <td>${c.itemName}</td>
                <td>${c.packLabel} (${c.packAmount})</td>
                <td class="qty">${c.orderQty}</td>
                <td class="qty">${c.orderQty * c.packAmount}</td>
            </tr>`).join('');

        const win = window.open('', '', 'height=900,width=800');
        if (!win) return;
        win.document.write(`
            <html><head><title>Purchase Order</title>
            <style>
                body { font-family: sans-serif; padding: 40px; color: #111827; position: relative; }
                .header { display: flex; align-items: center; justify-content: ${headerJustify}; gap: 12px; padding-bottom: 16px; border-bottom: 3px solid ${branding.brand_color}; margin-bottom: 20px; }
                .meta { margin-bottom: 24px; }
                .meta p { margin: 4px 0; color: #374151; font-size: 0.9rem; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border-bottom: 1px solid #e5e7eb; padding: 10px 8px; text-align: left; }
                th { background-color: #f9fafb; font-weight: bold; color: #374151; }
                .qty { text-align: center; font-weight: bold; }
                .sig-area { position: relative; min-height: 120px; margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 12px; }
            </style>
            </head><body>
            <div class="header">${logoHtml}${brandNameHtml}</div>
            <div class="meta">
                <h2 style="margin:0 0 8px;color:#1f2937;">Purchase Order</h2>
                <p><strong>Supplier:</strong> ${selectedSupplier?.name || 'Multiple Suppliers'}</p>
                <p><strong>Ordered By:</strong> ${user?.first_name || 'Admin'} ${user?.last_name || ''}</p>
                <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
            </div>
            <table>
                <thead><tr>
                    <th>Product Name</th><th>Package Size</th>
                    <th class="qty">Order Qty</th><th class="qty">Total Units</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
            <div class="sig-area" style="position:relative;min-height:120px;">
                ${sigHtml}
            </div>
            </body></html>
        `);
        win.document.close();
        win.focus();
        setTimeout(() => { win.print(); win.close(); }, 300);
    };

    const submitOrder = async () => {
        const orderItems = Object.values(cart);
        if (orderItems.length === 0) { alert('Your order is empty.'); return; }
        setSubmitting(true);
        try {
            const dbItems = orderItems.map(c => ({ item_id: c.itemId, quantity: c.orderQty * c.packAmount }));
            const locationId = selectedLocationId;

            const res = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    supplier_id: selectedSupplierId === 'all' ? null : selectedSupplierId,
                    expected_delivery_date: new Date(Date.now() + 86400000 * 2).toISOString(),
                    items: dbItems,
                    send_email: sendEmail,
                    send_sms: sendSms,
                    location_id: locationId,
                })
            });

            if (!res.ok) throw new Error('Order submission failed');
            alert('Order submitted successfully!');
            setCart({});
            setShowPreview(false);
            setSendEmail(false);
            setSendSms(false);
        } catch (e) {
            console.error(e);
            alert('Failed to submit the order.');
        } finally {
            setSubmitting(false);
        }
    };

    const filteredItems = items.filter(i => {
        if (selectedSupplierId === 'all') return true;
        return i.supplier_id === selectedSupplierId || suppliers.find(s => s.id === selectedSupplierId)?.name === i.supplier;
    });

    if (loading) return <div className={styles.container}>Loading Manual Order...</div>;

    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <h2 className={styles.cardTitle}>Manual Order Entry</h2>
                    <button
                        onClick={() => setShowPreview(true)}
                        style={{ background: '#10b981', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', fontWeight: 'bold', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }}
                        disabled={Object.keys(cart).length === 0}
                    >
                        Preview Order ({Object.keys(cart).length} items)
                    </button>
                </div>

                {myLocations.length > 1 && (
                    <div style={{ marginBottom: '1.5rem' }}>
                        <label className={styles.statLabel} style={{ display: 'block', marginBottom: '0.5rem' }}>Location</label>
                        <select
                            className={styles.input}
                            value={selectedLocationId ?? ''}
                            onChange={e => setSelectedLocationId(parseInt(e.target.value))}
                            style={{ maxWidth: '300px' }}
                        >
                            {myLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                    </div>
                )}

                <div style={{ marginBottom: '2rem' }}>
                    <label className={styles.statLabel} style={{ display: 'block', marginBottom: '0.5rem' }}>Select Supplier</label>
                    <select
                        className={styles.input}
                        value={selectedSupplierId}
                        onChange={e => setSelectedSupplierId(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                        style={{ maxWidth: '300px' }}
                    >
                        <option value="all">Check All Suppliers</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>

                <div className={styles.tableContainer}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Product Name</th>
                                <th>In Stock</th>
                                <th style={{ textAlign: 'center' }}>Total Order Qty</th>
                                <th style={{ textAlign: 'right' }}>Adjust Order</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredItems.map(item => {
                                const orderSizeOptions = parseOrderSize(item.order_size);
                                const itemCartEntries = Object.values(cart).filter(c => c.itemId === item.id);
                                const hasOrders = itemCartEntries.length > 0;
                                return (
                                    <tr key={item.id} style={{ background: hasOrders ? 'rgba(52,211,153,0.1)' : 'transparent' }}>
                                        <td style={{ fontWeight: 'bold' }}>{item.name}</td>
                                        <td style={{ color: item.quantity === 0 ? '#ef4444' : '#9ca3af' }}>
                                            {Number(item.quantity).toFixed(2).replace(/\.00$/, '')}
                                        </td>
                                        <td style={{ textAlign: 'center', fontSize: '0.95rem', fontWeight: 'bold' }}>
                                            {hasOrders ? itemCartEntries.map(c => (
                                                <div key={c.packAmount} style={{ color: '#34d399' }}>{c.orderQty} {c.packLabel}</div>
                                            )) : '-'}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                                {orderSizeOptions.map((opt, idx) => {
                                                    const key = `${item.id}-${opt.amount}`;
                                                    const currentPackQty = cart[key]?.orderQty || 0;
                                                    return (
                                                        <div key={idx} style={{ display: 'flex', alignItems: 'center', background: '#374151', borderRadius: '8px', padding: '2px', border: '1px solid #4b5563' }}>
                                                            <button onClick={() => handleAdjust(item, opt, -1)} disabled={currentPackQty < 1}
                                                                style={{ background: 'transparent', color: currentPackQty >= 1 ? '#ef4444' : '#6b7280', border: 'none', padding: '0.25rem 0.75rem', fontSize: '1rem', fontWeight: 'bold', cursor: currentPackQty >= 1 ? 'pointer' : 'not-allowed' }}>−</button>
                                                            <span style={{ padding: '0 0.5rem', color: '#d1d5db', fontSize: '0.85rem' }}>{opt.label} ({opt.amount})</span>
                                                            <button onClick={() => handleAdjust(item, opt, 1)}
                                                                style={{ background: 'transparent', color: '#10b981', border: 'none', padding: '0.25rem 0.75rem', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer' }}>+</button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredItems.length === 0 && (
                                <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>No products found for this supplier.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Preview Modal ─────────────────────────────────────────────── */}
            {showPreview && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
                    <div style={{ background: '#111827', padding: '1.5rem', borderRadius: '1rem', width: '92%', maxWidth: '720px', border: '1px solid #374151', maxHeight: '95vh', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ color: 'white', margin: 0, fontSize: '1.25rem' }}>Order Preview</h2>
                            <button onClick={() => setShowPreview(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.3rem' }}>✕</button>
                        </div>

                        {/* Signature Picker */}
                        {signatures.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: '#1f2937', borderRadius: '0.5rem', padding: '0.75rem 1rem', border: '1px solid #374151' }}>
                                <PenLine size={16} color="#a855f7" />
                                <label style={{ color: '#9ca3af', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>Signature:</label>
                                <select
                                    value={selectedSigId ?? ''}
                                    onChange={e => setSelectedSigId(e.target.value ? parseInt(e.target.value) : null)}
                                    style={{ flex: 1, background: '#111827', border: '1px solid #374151', color: 'white', padding: '0.4rem 0.5rem', borderRadius: '0.375rem', fontSize: '0.85rem' }}
                                >
                                    <option value="">— No signature —</option>
                                    {signatures.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                                </select>
                                {selectedSig && (
                                    <img src={selectedSig.data} alt="sig preview" style={{ height: '32px', objectFit: 'contain', background: '#fff', padding: '2px', borderRadius: '4px' }} />
                                )}
                            </div>
                        )}

                        {selectedSig && (
                            <p style={{ margin: 0, fontSize: '0.75rem', color: '#6b7280', textAlign: 'center' }}>
                                Drag the signature in the preview below to reposition it
                            </p>
                        )}

                        {/* ── Print Preview (white paper look) ── */}
                        <div
                            ref={previewRef}
                            style={{ background: '#fff', borderRadius: '0.5rem', padding: '1.5rem', flexGrow: 1, overflowY: 'auto', position: 'relative', userSelect: 'none', minHeight: '300px', cursor: 'default' }}
                        >
                            {/* Branding Header */}
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: branding.logo_position === 'center' ? 'center' : branding.logo_position === 'right' ? 'flex-end' : 'flex-start',
                                gap: '12px',
                                paddingBottom: '12px',
                                borderBottom: `3px solid ${branding.brand_color}`,
                                marginBottom: '16px',
                            }}>
                                {branding.logo_url && (
                                    <img src={branding.logo_url} alt="logo" style={{ height: '48px', objectFit: 'contain' }} />
                                )}
                                {branding.brand_name && (
                                    <span style={{ fontWeight: 700, fontSize: '1.2rem', color: branding.brand_color, fontFamily: 'sans-serif' }}>{branding.brand_name}</span>
                                )}
                            </div>

                            {/* Order Meta */}
                            <div style={{ marginBottom: '12px' }}>
                                <h3 style={{ margin: '0 0 6px', color: '#1f2937', fontSize: '1.1rem' }}>Purchase Order</h3>
                                <p style={{ margin: '2px 0', fontSize: '0.85rem', color: '#374151' }}><strong>Supplier:</strong> {selectedSupplier?.name || 'Multiple Suppliers'}</p>
                                <p style={{ margin: '2px 0', fontSize: '0.85rem', color: '#374151' }}><strong>Ordered By:</strong> {user?.first_name || 'Admin'} {user?.last_name || ''}</p>
                                <p style={{ margin: '2px 0', fontSize: '0.85rem', color: '#374151' }}><strong>Date:</strong> {new Date().toLocaleString()}</p>
                            </div>

                            {/* Items Table */}
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: '#f9fafb', borderBottom: `2px solid ${branding.brand_color}` }}>
                                        <th style={{ padding: '8px', textAlign: 'left', color: '#374151' }}>Product</th>
                                        <th style={{ padding: '8px', textAlign: 'left', color: '#374151' }}>Package</th>
                                        <th style={{ padding: '8px', textAlign: 'center', color: '#374151' }}>Order Qty</th>
                                        <th style={{ padding: '8px', textAlign: 'center', color: '#374151' }}>Total Units</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.values(cart).map((c, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                            <td style={{ padding: '7px 8px', color: '#1f2937', fontWeight: 500 }}>{c.itemName}</td>
                                            <td style={{ padding: '7px 8px', color: '#6b7280' }}>{c.packLabel} ({c.packAmount})</td>
                                            <td style={{ padding: '7px 8px', textAlign: 'center', fontWeight: 700, color: '#111827' }}>{c.orderQty}</td>
                                            <td style={{ padding: '7px 8px', textAlign: 'center', color: '#6b7280' }}>{c.orderQty * c.packAmount}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* Signature placeholder area */}
                            <div style={{ marginTop: '32px', borderTop: '1px solid #e5e7eb', paddingTop: '8px', minHeight: '80px', position: 'relative' }}>
                                {selectedSig ? (
                                    <div
                                        onMouseDown={onSigMouseDown}
                                        style={{
                                            position: 'absolute',
                                            left: sigPos.x,
                                            top: sigPos.y,
                                            cursor: 'grab',
                                            userSelect: 'none',
                                            border: '1px dashed #a855f7',
                                            borderRadius: '4px',
                                            padding: '4px 8px',
                                            background: 'rgba(168,85,247,0.05)',
                                            display: 'inline-flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                        }}
                                        title="Drag to reposition"
                                    >
                                        <img src={selectedSig.data} alt="signature" style={{ height: '56px', objectFit: 'contain', pointerEvents: 'none' }} />
                                        <span style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '2px' }}>{selectedSig.label}</span>
                                    </div>
                                ) : (
                                    <span style={{ color: '#d1d5db', fontSize: '0.8rem' }}>Signature area</span>
                                )}
                            </div>
                        </div>

                        {/* Options + Actions */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#d1d5db', fontSize: '0.9rem' }}>
                                <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} /> Email Supplier
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#d1d5db', fontSize: '0.9rem' }}>
                                <input type="checkbox" checked={sendSms} onChange={e => setSendSms(e.target.checked)} /> Text Supplier
                            </label>
                            <div style={{ flexGrow: 1 }} />
                            <button onClick={handlePrint} style={{ padding: '0.6rem 1.1rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 600 }}>
                                🖨️ Print PDF
                            </button>
                            <button onClick={() => setShowPreview(false)} style={{ padding: '0.6rem 1.1rem', background: 'transparent', color: '#9ca3af', border: '1px solid #374151', borderRadius: '0.5rem', cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button onClick={submitOrder} disabled={submitting} style={{ padding: '0.6rem 1.25rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: 700, opacity: submitting ? 0.7 : 1 }}>
                                {submitting ? 'Submitting...' : 'Confirm Order'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
