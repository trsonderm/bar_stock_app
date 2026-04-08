'use client';

import { useState, useEffect, useCallback } from 'react';
import { Package, Clock, CheckCircle, Trash2, Edit, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';

interface Order {
    id: number;
    status: string;
    tracking_status: string;
    expected_delivery_date: string;
    created_at: string;
    confirmed_at?: string;
    archived_at?: string;
    resubmit_of?: number;
    resubmit_note?: string;
    supplier_name?: string;
    submitted_by_name?: string;
    confirmed_by_name?: string;
    item_count: number;
    total_ordered: number;
}

interface OrderItem {
    id: number;
    item_id: number;
    item_name: string;
    item_type: string;
    quantity: number;
    received_quantity?: number;
    stock_unit_label: string;
}

export default function OrderTrackingClient({ user }: { user: any }) {
    const [current, setCurrent] = useState<Order[]>([]);
    const [history, setHistory] = useState<Order[]>([]);
    const [archived, setArchived] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [showHistory, setShowHistory] = useState(false);

    // Receive modal state
    const [receiveOrder, setReceiveOrder] = useState<Order | null>(null);
    const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
    const [receivedQtys, setReceivedQtys] = useState<Record<number, string>>({});
    const [receivingLoading, setReceivingLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Edit modal state
    const [editOrder, setEditOrder] = useState<Order | null>(null);
    const [editItems, setEditItems] = useState<OrderItem[]>([]);
    const [editQtys, setEditQtys] = useState<Record<number, string>>({});
    const [editDelivery, setEditDelivery] = useState('');
    const [editNote, setEditNote] = useState('');
    const [editSubmitting, setEditSubmitting] = useState(false);

    const fetchOrders = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/orders');
            const data = await res.json();
            if (data.current) setCurrent(data.current);
            if (data.history) setHistory(data.history);
            if (data.archived) setArchived(data.archived);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchOrders(); }, [fetchOrders]);

    const openReceiveModal = async (order: Order) => {
        setReceiveOrder(order);
        setReceivingLoading(true);
        try {
            const res = await fetch(`/api/admin/orders/${order.id}`);
            const data = await res.json();
            if (data.items) {
                setOrderItems(data.items);
                const qtys: Record<number, string> = {};
                data.items.forEach((i: OrderItem) => {
                    qtys[i.id] = String(i.quantity);
                });
                setReceivedQtys(qtys);
            }
        } catch (e) {
            alert('Failed to load order items');
        } finally {
            setReceivingLoading(false);
        }
    };

    const adjustReceived = (itemId: number, delta: number) => {
        setReceivedQtys(prev => {
            const cur = Math.max(0, (parseInt(prev[itemId]) || 0) + delta);
            return { ...prev, [itemId]: String(cur) };
        });
    };

    const confirmReceived = async () => {
        if (!receiveOrder) return;
        setSubmitting(true);
        try {
            const receivedItems = orderItems.map(i => ({
                purchase_order_item_id: i.id,
                item_id: i.item_id,
                item_name: i.item_name,
                ordered_qty: i.quantity,
                received_qty: receivedQtys[i.id] ?? '0',
            }));

            const res = await fetch(`/api/admin/orders/${receiveOrder.id}/receive`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ receivedItems }),
            });

            if (!res.ok) {
                const d = await res.json();
                throw new Error(d.error || 'Failed');
            }

            alert('Order confirmed received! Inventory updated.');
            setReceiveOrder(null);
            fetchOrders();
        } catch (e: any) {
            alert(e.message || 'Error confirming order');
        } finally {
            setSubmitting(false);
        }
    };

    const deleteOrder = async (id: number) => {
        if (!confirm('Delete this order? This cannot be undone.')) return;
        try {
            const res = await fetch(`/api/admin/orders/${id}`, { method: 'DELETE' });
            if (!res.ok) {
                const d = await res.json();
                throw new Error(d.error || 'Failed to delete');
            }
            fetchOrders();
        } catch (e: any) {
            alert(e.message || 'Error deleting order');
        }
    };

    const openEditModal = async (order: Order) => {
        setEditOrder(order);
        setEditDelivery(order.expected_delivery_date ? order.expected_delivery_date.split('T')[0] : '');
        setEditNote('');
        try {
            const res = await fetch(`/api/admin/orders/${order.id}`);
            const data = await res.json();
            if (data.items) {
                setEditItems(data.items);
                const qtys: Record<number, string> = {};
                data.items.forEach((i: OrderItem) => { qtys[i.id] = String(i.quantity); });
                setEditQtys(qtys);
            }
        } catch {
            alert('Failed to load order items for editing');
        }
    };

    const submitEdit = async () => {
        if (!editOrder) return;
        setEditSubmitting(true);
        try {
            const items = editItems.map(i => ({
                item_id: i.item_id,
                quantity: parseInt(editQtys[i.id]) || 0,
            })).filter(i => i.quantity > 0);

            const res = await fetch(`/api/admin/orders/${editOrder.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items,
                    expected_delivery_date: editDelivery,
                    supplier_id: null,
                    note: editNote || 'Edited and resubmitted',
                }),
            });

            if (!res.ok) {
                const d = await res.json();
                throw new Error(d.error || 'Failed');
            }

            alert('Order resubmitted. Previous order archived.');
            setEditOrder(null);
            fetchOrders();
        } catch (e: any) {
            alert(e.message || 'Error resubmitting order');
        } finally {
            setEditSubmitting(false);
        }
    };

    const statusBadge = (order: Order) => {
        const ts = order.tracking_status || order.status;
        const map: Record<string, { bg: string; color: string; label: string }> = {
            PENDING: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', label: 'Pending' },
            IN_TRANSIT: { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6', label: 'In Transit' },
            PARTIALLY_RECEIVED: { bg: 'rgba(168,85,247,0.15)', color: '#a855f7', label: 'Partial' },
            RECEIVED: { bg: 'rgba(16,185,129,0.15)', color: '#10b981', label: 'Received' },
            DELIVERED: { bg: 'rgba(16,185,129,0.15)', color: '#10b981', label: 'Delivered' },
        };
        const s = map[ts] || { bg: 'rgba(107,114,128,0.15)', color: '#6b7280', label: ts };
        return (
            <span style={{ padding: '0.3rem 0.75rem', borderRadius: '2rem', fontSize: '0.8rem', fontWeight: 700, background: s.bg, color: s.color }}>
                {s.label}
            </span>
        );
    };

    if (loading) return <div style={{ padding: '2rem', color: '#9ca3af' }}>Loading orders...</div>;

    return (
        <div style={{ padding: '2rem', maxWidth: '1100px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
                <Package size={28} color="#3b82f6" />
                <h1 style={{ color: 'white', fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>Order Tracking</h1>
            </div>

            {/* Current Orders */}
            <section style={{ marginBottom: '3rem' }}>
                <h2 style={{ color: '#d97706', fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', borderBottom: '1px solid #374151', paddingBottom: '0.5rem' }}>
                    Current Orders ({current.length})
                </h2>
                {current.length === 0 ? (
                    <p style={{ color: '#6b7280', textAlign: 'center', padding: '2rem' }}>No pending orders.</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {current.map(order => (
                            <div key={order.id} style={{ background: '#1f2937', borderRadius: '0.75rem', border: '1px solid #374151', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                        <span style={{ color: 'white', fontWeight: 700 }}>Order #{order.id}</span>
                                        {statusBadge(order)}
                                        {order.resubmit_of && (
                                            <span style={{ fontSize: '0.75rem', color: '#a855f7', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                <RotateCcw size={12} /> Resubmitted
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
                                        {order.supplier_name || 'No Supplier'} &bull; {order.item_count} items &bull; {order.total_ordered} units
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                                        Ordered: {new Date(order.created_at).toLocaleDateString()}
                                        {order.expected_delivery_date && (
                                            <> &bull; Expected: {new Date(order.expected_delivery_date).toLocaleDateString()}</>
                                        )}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                                    <button
                                        onClick={() => openReceiveModal(order)}
                                        style={{ padding: '0.5rem 1rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                                    >
                                        Receive
                                    </button>
                                    <button
                                        onClick={() => openEditModal(order)}
                                        style={{ padding: '0.5rem 0.75rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}
                                        title="Edit & Resubmit"
                                    >
                                        <Edit size={14} />
                                    </button>
                                    <button
                                        onClick={() => deleteOrder(order.id)}
                                        style={{ padding: '0.5rem 0.75rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}
                                        title="Delete Order"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* History */}
            <section>
                <button
                    onClick={() => setShowHistory(v => !v)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', padding: 0 }}
                >
                    {showHistory ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    Order History ({history.length + archived.length})
                </button>
                {showHistory && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {[...history, ...archived].length === 0 && (
                            <p style={{ color: '#6b7280', padding: '1rem' }}>No order history yet.</p>
                        )}
                        {[...history, ...archived].sort((a, b) =>
                            new Date(b.confirmed_at || b.archived_at || b.created_at).getTime() -
                            new Date(a.confirmed_at || a.archived_at || a.created_at).getTime()
                        ).map(order => (
                            <div key={order.id} style={{ background: '#111827', borderRadius: '0.5rem', border: '1px solid #1f2937', padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', opacity: order.archived_at ? 0.7 : 1 }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        <span style={{ color: order.archived_at ? '#9ca3af' : 'white', fontWeight: 600 }}>
                                            Order #{order.id}
                                        </span>
                                        {order.archived_at ? (
                                            <span style={{ padding: '0.2rem 0.6rem', borderRadius: '2rem', fontSize: '0.75rem', fontWeight: 700, background: 'rgba(168,85,247,0.15)', color: '#a855f7' }}>
                                                Archived / Edited
                                            </span>
                                        ) : statusBadge(order)}
                                        {order.resubmit_of && (
                                            <span style={{ fontSize: '0.75rem', color: '#a855f7' }}>
                                                Resubmission of #{order.resubmit_of}
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                                        {order.supplier_name || 'No Supplier'} &bull; {order.item_count} items
                                        {order.confirmed_at && <> &bull; Received {new Date(order.confirmed_at).toLocaleDateString()}</>}
                                        {order.archived_at && <> &bull; Archived {new Date(order.archived_at).toLocaleDateString()}</>}
                                    </div>
                                    {order.resubmit_note && (
                                        <div style={{ fontSize: '0.75rem', color: '#6b7280', fontStyle: 'italic' }}>{order.resubmit_note}</div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Receive Modal */}
            {receiveOrder && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1300 }}>
                    <div style={{ background: '#111827', padding: '2rem', borderRadius: '1rem', width: '90%', maxWidth: '560px', border: '1px solid #374151', maxHeight: '90vh', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ color: 'white', margin: 0 }}>Receive Order #{receiveOrder.id}</h2>
                            <button onClick={() => setReceiveOrder(null)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
                        </div>
                        {receiveOrder.supplier_name && (
                            <p style={{ color: '#9ca3af', margin: 0, fontSize: '0.9rem' }}>Supplier: <strong style={{ color: '#e5e7eb' }}>{receiveOrder.supplier_name}</strong></p>
                        )}
                        {receivingLoading ? (
                            <p style={{ color: '#9ca3af' }}>Loading items...</p>
                        ) : (
                            <div style={{ overflowY: 'auto', flex: 1 }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid #374151' }}>
                                            <th style={{ textAlign: 'left', padding: '0.5rem', color: '#9ca3af', fontSize: '0.85rem' }}>Item</th>
                                            <th style={{ textAlign: 'center', padding: '0.5rem', color: '#9ca3af', fontSize: '0.85rem' }}>Ordered</th>
                                            <th style={{ textAlign: 'center', padding: '0.5rem', color: '#9ca3af', fontSize: '0.85rem' }}>Received</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {orderItems.map(item => (
                                            <tr key={item.id} style={{ borderBottom: '1px solid #1f2937' }}>
                                                <td style={{ padding: '0.6rem 0.5rem', color: 'white', fontWeight: 500 }}>{item.item_name}</td>
                                                <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center', color: '#9ca3af' }}>{item.quantity}</td>
                                                <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                                                        <button
                                                            onClick={() => adjustReceived(item.id, -1)}
                                                            disabled={(parseInt(receivedQtys[item.id]) || 0) <= 0}
                                                            style={{ background: '#374151', color: '#ef4444', border: 'none', borderRadius: '4px', width: '28px', height: '28px', cursor: 'pointer', fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                        >−</button>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            value={receivedQtys[item.id] ?? '0'}
                                                            onChange={e => setReceivedQtys(prev => ({ ...prev, [item.id]: e.target.value }))}
                                                            style={{ width: '52px', textAlign: 'center', background: '#1f2937', border: '1px solid #374151', color: 'white', borderRadius: '4px', padding: '0.25rem' }}
                                                        />
                                                        <button
                                                            onClick={() => adjustReceived(item.id, 1)}
                                                            style={{ background: '#374151', color: '#10b981', border: 'none', borderRadius: '4px', width: '28px', height: '28px', cursor: 'pointer', fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                        >+</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                            <button onClick={() => setReceiveOrder(null)} style={{ padding: '0.6rem 1.25rem', background: 'transparent', color: '#9ca3af', border: '1px solid #374151', borderRadius: '0.5rem', cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button
                                onClick={confirmReceived}
                                disabled={submitting}
                                style={{ padding: '0.6rem 1.5rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: 700, opacity: submitting ? 0.7 : 1 }}
                            >
                                {submitting ? 'Confirming...' : 'Confirm Received'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit / Resubmit Modal */}
            {editOrder && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1300 }}>
                    <div style={{ background: '#111827', padding: '2rem', borderRadius: '1rem', width: '90%', maxWidth: '560px', border: '1px solid #374151', maxHeight: '90vh', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ color: 'white', margin: 0 }}>Edit & Resubmit Order #{editOrder.id}</h2>
                            <button onClick={() => setEditOrder(null)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
                        </div>
                        <p style={{ color: '#9ca3af', margin: 0, fontSize: '0.85rem' }}>
                            The original order will be archived. A new order with your changes will be created and appear as resubmitted.
                        </p>
                        <div>
                            <label style={{ color: '#9ca3af', fontSize: '0.85rem', display: 'block', marginBottom: '0.25rem' }}>Next Delivery Date</label>
                            <input
                                type="date"
                                value={editDelivery}
                                onChange={e => setEditDelivery(e.target.value)}
                                style={{ background: '#1f2937', border: '1px solid #374151', color: 'white', padding: '0.5rem', borderRadius: '0.25rem', width: '100%' }}
                            />
                        </div>
                        <div style={{ overflowY: 'auto', flex: 1 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #374151' }}>
                                        <th style={{ textAlign: 'left', padding: '0.5rem', color: '#9ca3af', fontSize: '0.85rem' }}>Item</th>
                                        <th style={{ textAlign: 'center', padding: '0.5rem', color: '#9ca3af', fontSize: '0.85rem' }}>Quantity</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {editItems.map(item => (
                                        <tr key={item.id} style={{ borderBottom: '1px solid #1f2937' }}>
                                            <td style={{ padding: '0.5rem', color: 'white', fontSize: '0.9rem' }}>{item.item_name}</td>
                                            <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                                                    <button
                                                        onClick={() => setEditQtys(prev => ({ ...prev, [item.id]: String(Math.max(0, (parseInt(prev[item.id]) || 0) - 1)) }))}
                                                        style={{ background: '#374151', color: '#ef4444', border: 'none', borderRadius: '4px', width: '26px', height: '26px', cursor: 'pointer', fontWeight: 700 }}
                                                    >−</button>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={editQtys[item.id] ?? String(item.quantity)}
                                                        onChange={e => setEditQtys(prev => ({ ...prev, [item.id]: e.target.value }))}
                                                        style={{ width: '52px', textAlign: 'center', background: '#1f2937', border: '1px solid #374151', color: 'white', borderRadius: '4px', padding: '0.25rem' }}
                                                    />
                                                    <button
                                                        onClick={() => setEditQtys(prev => ({ ...prev, [item.id]: String((parseInt(prev[item.id]) || 0) + 1) }))}
                                                        style={{ background: '#374151', color: '#10b981', border: 'none', borderRadius: '4px', width: '26px', height: '26px', cursor: 'pointer', fontWeight: 700 }}
                                                    >+</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div>
                            <label style={{ color: '#9ca3af', fontSize: '0.85rem', display: 'block', marginBottom: '0.25rem' }}>Note (optional)</label>
                            <input
                                value={editNote}
                                onChange={e => setEditNote(e.target.value)}
                                placeholder="Reason for edit..."
                                style={{ width: '100%', background: '#1f2937', border: '1px solid #374151', color: 'white', padding: '0.5rem', borderRadius: '0.25rem', boxSizing: 'border-box' }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                            <button onClick={() => setEditOrder(null)} style={{ padding: '0.6rem 1.25rem', background: 'transparent', color: '#9ca3af', border: '1px solid #374151', borderRadius: '0.5rem', cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button
                                onClick={submitEdit}
                                disabled={editSubmitting}
                                style={{ padding: '0.6rem 1.5rem', background: '#d97706', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: editSubmitting ? 'not-allowed' : 'pointer', fontWeight: 700, opacity: editSubmitting ? 0.7 : 1 }}
                            >
                                {editSubmitting ? 'Resubmitting...' : 'Resubmit Order'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
