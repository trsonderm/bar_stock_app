'use client';

import { useState } from 'react';
import { FileText, Clock, CheckCircle } from 'lucide-react';

export default function HistoryClient({ orders }: { orders: any[] }) {
    const [searchTerm, setSearchTerm] = useState('');

    const filtered = orders.filter(o => 
        (o.supplier_name || 'Multiple').toLowerCase().includes(searchTerm.toLowerCase()) || 
        o.id.toString().includes(searchTerm)
    );

    return (
        <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h1 className="text-white" style={{ fontSize: '2rem', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <FileText size={32} color="#3b82f6" />
                    Order Ledger
                </h1>
                <input 
                    type="text" 
                    placeholder="Search by ID or Supplier..." 
                    className="bg-slate-800 text-white border-slate-700"
                    style={{ padding: '0.75rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--mui-border)', outline: 'none', background: 'var(--mui-bg-paper)' }}
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
            </div>

            <div style={{ background: 'var(--mui-bg-paper)', borderRadius: '1rem', border: '1px solid var(--mui-border)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--mui-border)' }}>
                            <th className="text-slate-300" style={{ padding: '1rem', fontWeight: 'bold' }}>Order ID</th>
                            <th className="text-slate-300" style={{ padding: '1rem', fontWeight: 'bold' }}>Supplier</th>
                            <th className="text-slate-300" style={{ padding: '1rem', fontWeight: 'bold' }}>Total Units</th>
                            <th className="text-slate-300" style={{ padding: '1rem', fontWeight: 'bold' }}>Order Date</th>
                            <th className="text-slate-300" style={{ padding: '1rem', fontWeight: 'bold' }}>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map(order => {
                            const isPending = order.status === 'PENDING';
                            return (
                                <tr key={order.id} style={{ borderBottom: '1px solid var(--mui-border)', transition: 'background 0.2s' }}>
                                    <td className="text-white" style={{ padding: '1rem', fontWeight: 'bold' }}>#{order.id}</td>
                                    <td className="text-white" style={{ padding: '1rem' }}>{order.supplier_name || 'Multiple Suppliers'}</td>
                                    <td className="text-slate-300" style={{ padding: '1rem' }}>{order.total_units} units</td>
                                    <td className="text-slate-300" style={{ padding: '1rem' }}>{new Date(order.created_at).toLocaleString()}</td>
                                    <td style={{ padding: '1rem' }}>
                                        <span style={{ 
                                            padding: '0.35rem 0.75rem', 
                                            borderRadius: '2rem', 
                                            fontSize: '0.85rem', 
                                            fontWeight: 'bold', 
                                            background: isPending ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                                            color: isPending ? '#f59e0b' : '#10b981',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.35rem'
                                        }}>
                                            {isPending ? <Clock size={14} /> : <CheckCircle size={14} />}
                                            {order.status}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan={5} className="text-slate-400" style={{ padding: '3rem', textAlign: 'center' }}>
                                    No purchase orders found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
