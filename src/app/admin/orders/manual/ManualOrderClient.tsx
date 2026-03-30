'use client';

import { useState, useEffect } from 'react';
import styles from '../../admin.module.css';

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

export default function ManualOrderClient({ user }: { user: any }) {
    const [items, setItems] = useState<Item[]>([]);
    const [suppliers, setSuppliers] = useState<{ id: number, name: string }[]>([]);
    const [selectedSupplierId, setSelectedSupplierId] = useState<number | 'all'>('all');

    interface CartItem {
        itemId: number;
        itemName: string;
        packLabel: string;
        packAmount: number;
        orderQty: number;
    }
    // cart mapping `${itemId}-${packAmount}` to CartItem
    const [cart, setCart] = useState<Record<string, CartItem>>({});
    const [showPreview, setShowPreview] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
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
            return {
                ...prev,
                [key]: {
                    itemId: item.id,
                    itemName: item.name,
                    packLabel: opt.label,
                    packAmount: opt.amount,
                    orderQty: next
                }
            };
        });
    };

    const parseOrderSize = (os: any): OrderSizeOption[] => {
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
    };

    const openPreview = () => setShowPreview(true);
    const closePreview = () => setShowPreview(false);

    const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId) || null;

    const handlePrint = () => {
        const printContent = document.getElementById('printable-order')?.innerHTML;
        if (!printContent) return;
        const win = window.open('', '', 'height=800,width=800');
        if (!win) return;
        win.document.write(`
            <html><head><title>Purchase Order</title>
            <style>
                body { font-family: sans-serif; padding: 40px; color: #111827; }
                h1 { margin-bottom: 5px; color: #1f2937; }
                h3 { margin-top: 0; color: #4b5563; font-weight: normal; }
                .meta { margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #e5e7eb; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border-bottom: 1px solid #e5e7eb; padding: 12px 8px; text-align: left; }
                th { background-color: #f9fafb; font-weight: bold; color: #374151; }
                td { color: #1f2937; }
                .qty { text-align: center; font-weight: bold; }
            </style>
            </head><body>
            ${printContent}
            </body></html>
        `);
        win.document.close();
        win.focus();
        setTimeout(() => {
            win.print();
            win.close();
        }, 250);
    };

    const [sendEmail, setSendEmail] = useState(false);
    const [sendSms, setSendSms] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const submitOrder = async () => {
        const orderItems = Object.values(cart);
        if (orderItems.length === 0) {
            alert('Your order is empty.');
            return;
        }

        setSubmitting(true);
        try {
            const dbItems = orderItems.map(c => ({
                item_id: c.itemId,
                quantity: c.orderQty * c.packAmount // Total units expected
            }));

            const res = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    supplier_id: selectedSupplierId === 'all' ? null : selectedSupplierId,
                    expected_delivery_date: new Date(Date.now() + 86400000 * 2).toISOString(), // Dummy +2 days
                    items: dbItems,
                    send_email: sendEmail,
                    send_sms: sendSms
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
                        onClick={openPreview}
                        style={{ background: '#10b981', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', fontWeight: 'bold', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }}
                        disabled={Object.keys(cart).length === 0}
                    >
                        Preview Order ({Object.keys(cart).length} items)
                    </button>
                </div>

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
                                    <tr key={item.id} style={{ background: hasOrders ? 'rgba(52, 211, 153, 0.1)' : 'transparent' }}>
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
                                                            <button
                                                                onClick={() => handleAdjust(item, opt, -1)}
                                                                disabled={currentPackQty < 1}
                                                                style={{
                                                                    background: 'transparent', color: currentPackQty >= 1 ? '#ef4444' : '#6b7280', border: 'none', padding: '0.25rem 0.75rem', fontSize: '1rem', fontWeight: 'bold', cursor: currentPackQty >= 1 ? 'pointer' : 'not-allowed'
                                                                }}
                                                            >
                                                                -
                                                            </button>
                                                            <span style={{ padding: '0 0.5rem', color: '#d1d5db', fontSize: '0.85rem' }}>
                                                                {opt.label} ({opt.amount})
                                                            </span>
                                                            <button
                                                                onClick={() => handleAdjust(item, opt, 1)}
                                                                style={{
                                                                    background: 'transparent', color: '#10b981', border: 'none', padding: '0.25rem 0.75rem', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer'
                                                                }}
                                                            >
                                                                +
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredItems.length === 0 && (
                                <tr>
                                    <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
                                        No products found for this supplier.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {showPreview && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
                    <div style={{ background: '#111827', padding: '2rem', borderRadius: '1rem', width: '90%', maxWidth: '600px', border: '1px solid #374151', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                        <h2 style={{ color: 'white', marginTop: 0 }}>Order Preview</h2>
                        
                        <div style={{ overflowY: 'auto', flexGrow: 1, paddingRight: '1rem', marginBottom: '1.5rem' }}>
                            {/* Hidden printable template */}
                            <div id="printable-order" style={{ display: 'none' }}>
                                <div className="meta">
                                    <h1>Purchase Order</h1>
                                    <h3><strong>Supplier:</strong> {selectedSupplier?.name || 'Multiple Suppliers'}</h3>
                                    <h3><strong>Ordered By:</strong> {user?.first_name || 'Admin'}</h3>
                                    <h3><strong>Date:</strong> {new Date().toLocaleString()}</h3>
                                </div>
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Product Name</th>
                                            <th>Package Size</th>
                                            <th className="qty">Order Qty</th>
                                            <th className="qty">Total Units</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Object.values(cart).map((c, i) => (
                                            <tr key={i}>
                                                <td>{c.itemName}</td>
                                                <td>{c.packLabel} ({c.packAmount})</td>
                                                <td className="qty">{c.orderQty}</td>
                                                <td className="qty">{c.orderQty * c.packAmount}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* UI Table */}
                            <table style={{ width: '100%', color: 'white', textAlign: 'left', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #374151' }}>
                                        <th style={{ padding: '0.5rem' }}>Product</th>
                                        <th style={{ padding: '0.5rem', textAlign: 'center' }}>Order Qty</th>
                                        <th style={{ padding: '0.5rem', textAlign: 'center' }}>Total Units</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.values(cart).map((c, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid #1f2937' }}>
                                            <td style={{ padding: '0.5rem' }}>{c.itemName} <span style={{color: '#9ca3af', fontSize: '0.85rem'}}>({c.packLabel})</span></td>
                                            <td style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 'bold', color: '#34d399', fontSize: '1.1rem' }}>{c.orderQty}</td>
                                            <td style={{ padding: '0.5rem', textAlign: 'center', color: '#9ca3af' }}>+{c.orderQty * c.packAmount}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div style={{ padding: '1rem', background: '#1f2937', borderRadius: '0.5rem', marginBottom: '1.5rem' }}>
                            <h4 style={{ margin: '0 0 0.75rem 0', color: 'white', fontSize: '0.95rem' }}>Submission Options</h4>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#d1d5db' }}>
                                    <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
                                    Email Supplier
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#d1d5db' }}>
                                    <input type="checkbox" checked={sendSms} onChange={(e) => setSendSms(e.target.checked)} />
                                    Text Supplier
                                </label>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', flexWrap: 'wrap' }}>
                            <button onClick={handlePrint} style={{ padding: '0.65rem 1.25rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold' }}>
                                🖨️ Print PDF
                            </button>
                            <div style={{ flexGrow: 1 }}></div>
                            <button onClick={closePreview} style={{ padding: '0.65rem 1.25rem', background: 'transparent', color: '#9ca3af', border: '1px solid #374151', borderRadius: '0.5rem', cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button onClick={submitOrder} disabled={submitting} style={{ padding: '0.65rem 1.25rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: 'bold', opacity: submitting ? 0.7 : 1 }}>
                                {submitting ? 'Submitting...' : 'Confirm Order'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

