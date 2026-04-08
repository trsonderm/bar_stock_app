'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Trash2, Play, Clock, Plus } from 'lucide-react';

interface SavedReport {
    id: number;
    name: string;
    description?: string;
    config: { sections?: any[] };
    is_scheduled: boolean;
    schedule_config?: any;
    created_at: string;
    updated_at: string;
}

export default function SavedReportsClient() {
    const [reports, setReports] = useState<SavedReport[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchReports = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/reports/saved');
            const data = await res.json();
            setReports(data.reports || []);
        } catch { } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchReports(); }, []);

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this saved report?')) return;
        await fetch(`/api/admin/reports/saved/${id}`, { method: 'DELETE' });
        fetchReports();
    };

    if (loading) return <div style={{ color: '#9ca3af', padding: '2rem' }}>Loading saved reports...</div>;

    return (
        <div style={{ maxWidth: '900px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <div>
                    <h2 style={{ margin: 0, marginBottom: '0.25rem', fontWeight: 700, fontSize: '1.4rem' }}>Saved Reports</h2>
                    <p style={{ margin: 0, color: '#9ca3af', fontSize: '0.9rem' }}>Custom reports built with Report Builder</p>
                </div>
                <Link
                    href="/admin/reports/builder"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1.25rem', background: '#d97706', color: 'white', borderRadius: '0.5rem', textDecoration: 'none', fontWeight: 700, fontSize: '0.9rem' }}
                >
                    <Plus size={16} /> New Report
                </Link>
            </div>

            {reports.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem 2rem', border: '2px dashed #334155', borderRadius: '1rem', color: '#4b5563' }}>
                    <p style={{ marginBottom: '1rem', fontSize: '1rem' }}>No saved reports yet.</p>
                    <Link
                        href="/admin/reports/builder"
                        style={{ padding: '0.6rem 1.5rem', background: '#d97706', color: 'white', borderRadius: '0.5rem', textDecoration: 'none', fontWeight: 700 }}
                    >
                        Build your first report
                    </Link>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {reports.map(r => (
                        <div
                            key={r.id}
                            style={{ background: '#1e293b', borderRadius: '0.75rem', border: '1px solid #334155', padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}
                        >
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 700, color: 'white', marginBottom: '0.25rem', fontSize: '1rem' }}>{r.name}</div>
                                <div style={{ fontSize: '0.8rem', color: '#6b7280', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                    <span>{r.config?.sections?.length ?? 0} section{(r.config?.sections?.length ?? 0) !== 1 ? 's' : ''}</span>
                                    {r.is_scheduled && (
                                        <span style={{ color: '#a855f7', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <Clock size={11} /> Scheduled ({r.schedule_config?.frequency || 'daily'})
                                        </span>
                                    )}
                                    <span>Updated {new Date(r.updated_at).toLocaleDateString()}</span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <Link
                                    href={`/admin/reports/builder?load=${r.id}`}
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.4rem 0.85rem', background: '#334155', color: '#93c5fd', borderRadius: '0.4rem', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 600 }}
                                >
                                    <Play size={13} /> Open
                                </Link>
                                <button
                                    onClick={() => handleDelete(r.id)}
                                    style={{ padding: '0.4rem 0.6rem', background: '#450a0a', color: '#ef4444', border: 'none', borderRadius: '0.4rem', cursor: 'pointer' }}
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
