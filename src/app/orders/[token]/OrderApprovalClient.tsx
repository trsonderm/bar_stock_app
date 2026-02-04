'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function OrderApprovalClient({ token }: { token: string }) {
    const router = useRouter();
    const [order, setOrder] = useState<any>(null);
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);

    // Add Item State
    const [isAddMode, setIsAddMode] = useState(false);
    const [availableItems, setAvailableItems] = useState<any[]>([]); // To add more products
    const [newItemId, setNewItemId] = useState('');

    useEffect(() => {
        // Fetch Order Details
        fetch(`/api/orders/public?token=${token}`)
            .then(res => res.json())
            .then(data => {
                if (data.order) {
                    setOrder(data.order);
                    setItems(JSON.parse(data.order.items_json));
                }
                setLoading(false);
            });
    }, [token]);

    const handleQuantityChange = (index: number, qty: number) => {
        const newItems = [...items];
        newItems[index].quantity = qty;
        setItems(newItems);
    };

    const handleRemove = (index: number) => {
        const newItems = items.filter((_, i) => i !== index);
        setItems(newItems);
    };

    const handleApprove = async () => {
        setProcessing(true);
        try {
            const res = await fetch('/api/orders/public/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, items, action: 'approve' })
            });
            if (res.ok) {
                alert('Order Approved and Sent to Supplier!');
                router.push('/order-confirmed'); // or show success state
            } else {
                alert('Error approving order');
            }
        } finally {
            setProcessing(false);
        }
    };

    const handleDecline = async () => {
        if (!confirm('Are you sure you want to decline this order?')) return;
        setProcessing(true);
        try {
            await fetch('/api/orders/public/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, action: 'decline' })
            });
            alert('Order Declined');
        } finally {
            setProcessing(false);
        }
    };

    if (loading) return <div className="p-10 text-center">Loading Order...</div>;
    if (!order) return <div className="p-10 text-center text-red-500">Invalid or Expired Link</div>;

    if (order.status !== 'pending') {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
                    <h1 className="text-2xl font-bold mb-4">Order {order.status === 'sent' ? 'Approved' : 'Declined'}</h1>
                    <p>This order has already been processed.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8 font-sans">
            <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden">
                <div className="bg-blue-600 px-8 py-6 flex justify-between items-center text-white">
                    <div>
                        <h1 className="text-2xl font-bold">Review Order</h1>
                        <p className="opacity-90">ID: #{order.id} • {order.supplier_name}</p>
                    </div>
                </div>

                <div className="p-8">
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-8 text-yellow-800 text-sm">
                        Please review the items below. You can edit quantities or remove items. Once approved, the email will be sent to the supplier immediately.
                    </div>

                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-gray-200 text-gray-500 text-sm">
                                <th className="py-3">Item</th>
                                <th className="py-3 text-center w-24">Qty</th>
                                <th className="py-3 w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, idx) => (
                                <tr key={idx} className="border-b border-gray-100 last:border-0 group hover:bg-gray-50 transition-colors">
                                    <td className="py-4 font-medium text-gray-900">{item.name}</td>
                                    <td className="py-4 text-center">
                                        <input
                                            type="number"
                                            min="1"
                                            value={item.quantity}
                                            onChange={e => handleQuantityChange(idx, parseInt(e.target.value))}
                                            className="w-16 text-center border border-gray-300 rounded p-1 focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </td>
                                    <td className="py-4 text-right">
                                        <button onClick={() => handleRemove(idx)} className="text-gray-400 hover:text-red-500">
                                            &times;
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {items.length === 0 && (
                        <div className="text-center py-8 text-gray-500 italic bg-gray-50 rounded-lg mt-4">
                            No items in order.
                        </div>
                    )}

                    {/* Action Bar */}
                    <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-end">
                        <button
                            onClick={handleDecline}
                            disabled={processing}
                            className="px-6 py-3 border border-gray-300 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors"
                        >
                            Decline Order
                        </button>
                        <button
                            onClick={handleApprove}
                            disabled={processing || items.length === 0}
                            className="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-500 shadow-lg shadow-blue-500/30 transition-all disabled:opacity-50"
                        >
                            {processing ? 'Processing...' : 'Approve & Send Email'}
                        </button>
                    </div>
                </div>
            </div>
            <div className="text-center mt-8 text-gray-500 text-sm">
                Powered by TopShelf Inventory
            </div>
        </div>
    );
}
