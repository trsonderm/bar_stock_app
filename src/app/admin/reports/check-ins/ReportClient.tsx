'use client';

import { useState } from 'react';
import { AlertTriangle, TrendingDown, CheckCircle } from 'lucide-react';

export default function ReportClient({ reports }: { reports: any[] }) {
    const [supplierFilter, setSupplierFilter] = useState('All');

    const uniqueSuppliers = Array.from(new Set(reports.map(r => r.supplier_name)));

    const filtered = reports.filter(r => supplierFilter === 'All' || r.supplier_name === supplierFilter);

    // Calculate total missing items
    const totalMissing = filtered.reduce((acc, r) => {
        return acc + r.variance.reduce((vacc: number, v: any) => vacc + Math.abs(v.difference), 0);
    }, 0);

    return (
        <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', color: 'white' }}>
            <div style={{ marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0 0 0.5rem 0' }}>Delivery Variance Report</h1>
                <p style={{ color: '#9ca3af', margin: 0 }}>Track missing or short-shipped items from your distributors.</p>
            </div>

            {/* Metrics Ribbon */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
                <div style={{ background: 'var(--mui-bg-paper)', padding: '1.5rem', borderRadius: '1rem', border: '1px solid var(--mui-border)' }}>
                    <h3 style={{ margin: '0 0 0.5rem 0', color: '#9ca3af', fontSize: '1rem' }}>Total Incidents</h3>
                    <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#f59e0b' }}>{filtered.length}</div>
                </div>
                <div style={{ background: 'var(--mui-bg-paper)', padding: '1.5rem', borderRadius: '1rem', border: '1px solid var(--mui-border)' }}>
                    <h3 style={{ margin: '0 0 0.5rem 0', color: '#9ca3af', fontSize: '1rem' }}>Missing Units</h3>
                    <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <TrendingDown size={36} /> {totalMissing}
                    </div>
                </div>
            </div>

            {/* Filter */}
            <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem' }}>
                <select 
                    style={{ background: 'var(--mui-bg-paper)', color: 'white', border: '1px solid var(--mui-border)', padding: '0.75rem', borderRadius: '0.5rem', minWidth: '200px' }}
                    value={supplierFilter}
                    onChange={(e) => setSupplierFilter(e.target.value)}
                >
                    <option value="All">All Distributors</option>
                    {uniqueSuppliers.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>

            {/* Variance Ledgers */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                {filtered.map(report => (
                    <div key={report.order_id} style={{ background: 'var(--mui-bg-paper)', borderRadius: '1rem', border: '1px solid var(--mui-border)', overflow: 'hidden' }}>
                        <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--mui-border)', background: 'rgba(0,0,0,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold' }}>Order #{report.order_id} • {report.supplier_name}</h3>
                                <div style={{ color: '#9ca3af', fontSize: '0.85rem', marginTop: '0.25rem' }}>Checked in: {new Date(report.delivery_date).toLocaleDateString()}</div>
                            </div>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fbbf24', fontSize: '0.85rem', fontWeight: 'bold', background: 'rgba(245, 158, 11, 0.1)', padding: '0.35rem 0.75rem', borderRadius: '2rem' }}>
                                <AlertTriangle size={16} /> Variance Detected
                            </span>
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--mui-border)' }}>
                                    <th className="text-slate-300" style={{ padding: '1rem' }}>Product</th>
                                    <th className="text-slate-300" style={{ padding: '1rem', textAlign: 'center' }}>Expected Qty</th>
                                    <th className="text-slate-300" style={{ padding: '1rem', textAlign: 'center' }}>Received Qty</th>
                                    <th className="text-slate-300" style={{ padding: '1rem', textAlign: 'center' }}>Difference</th>
                                </tr>
                            </thead>
                            <tbody>
                                {report.variance.map((v: any, idx: number) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid var(--mui-border)' }}>
                                        <td style={{ padding: '1rem', fontWeight: 'bold' }}>{v.name}</td>
                                        <td style={{ padding: '1rem', textAlign: 'center', color: '#9ca3af' }}>{v.expected}</td>
                                        <td style={{ padding: '1rem', textAlign: 'center' }}>{v.received}</td>
                                        <td style={{ padding: '1rem', textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>{v.difference} units</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ))}

                {filtered.length === 0 && (
                    <div style={{ padding: '4rem', textAlign: 'center', color: '#9ca3af', background: 'var(--mui-bg-paper)', borderRadius: '1rem', border: '1px dashed var(--mui-border)' }}>
                        <CheckCircle size={48} style={{ color: '#10b981', margin: '0 auto 1rem auto' }} />
                        <h3 style={{ margin: 0 }}>No Variances to Report</h3>
                        <p style={{ marginTop: '0.5rem' }}>All deliveries match their expected amounts.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
