'use client';

import { useState, useEffect } from 'react';
import styles from '../admin.module.css';

export default function DBToolsClient() {
    const [organizations, setOrganizations] = useState<any[]>([]);
    const [selectedOrg, setSelectedOrg] = useState<string>('');
    const [tab, setTab] = useState<'EXPLORER' | 'DUPLICATES' | 'ORPHANS'>('EXPLORER');

    // Explorer State
    const [tables, setTables] = useState<string[]>([]);
    const [selectedTable, setSelectedTable] = useState('');
    const [tableData, setTableData] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    // Duplicates State
    const [dupType, setDupType] = useState('items');
    const [duplicates, setDuplicates] = useState<any[]>([]);

    // Orphans State
    const [orphanType, setOrphanType] = useState('inventory_items');
    const [orphans, setOrphans] = useState<any[]>([]);
    const [linkTargetId, setLinkTargetId] = useState('');

    useEffect(() => {
        fetch('/api/super-admin/organizations').then(r => r.json()).then(d => {
            if (d.organizations) {
                setOrganizations(d.organizations);
                if (d.organizations.length > 0) setSelectedOrg(d.organizations[0].id);
            }
        });

        // Load Tables
        fetch('/api/super-admin/database?action=tables').then(r => r.json()).then(d => {
            if (d.tables) setTables(d.tables);
        });
    }, []);

    const fetchTable = async () => {
        if (!selectedTable || !selectedOrg) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/super-admin/database?table=${selectedTable}&organizationId=${selectedOrg}`);
            const data = await res.json();
            setTableData(data);
        } catch { alert('Error'); }
        setLoading(false);
    };

    const fetchDuplicates = async () => {
        if (!selectedOrg) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/super-admin/tools/duplicates?type=${dupType}&organizationId=${selectedOrg}`);
            const data = await res.json();
            setDuplicates(data.duplicates || []);
        } catch { alert('Error'); }
        setLoading(false);
    };

    const mergeDuplicates = async (keepId: number, mergeIds: number[]) => {
        if (!confirm(`Keep ID ${keepId} and merge ${mergeIds.length} others?`)) return;
        setLoading(true);
        try {
            const res = await fetch('/api/super-admin/tools/duplicates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: dupType, keepId, mergeIds })
            });
            if (res.ok) fetchDuplicates();
            else alert('Failed');
        } catch { }
        setLoading(false);
    };

    const fetchOrphans = async () => {
        if (!selectedOrg) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/super-admin/tools/orphans?type=${orphanType}&organizationId=${selectedOrg}`);
            const data = await res.json();
            setOrphans(data.orphans || []);
        } catch { alert('Error'); }
        setLoading(false);
    };

    const fixOrphans = async (action: 'delete' | 'link') => {
        const ids = orphans.map(o => o.id);
        if (!confirm(`${action.toUpperCase()} ${ids.length} orphans?`)) return;

        setLoading(true);
        try {
            const res = await fetch('/api/super-admin/tools/orphans', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: orphanType,
                    fixAction: action,
                    orphanIds: ids,
                    targetId: action === 'link' ? parseInt(linkTargetId) : undefined
                })
            });
            if (res.ok) fetchOrphans();
            else alert('Failed');
        } catch { }
        setLoading(false);
    };

    return (
        <div className={styles.container}>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-white">DB Tools</h1>
                <select
                    value={selectedOrg}
                    onChange={e => setSelectedOrg(e.target.value)}
                    className="bg-gray-800 text-white p-2 rounded border border-gray-600"
                >
                    {organizations.map(o => (
                        <option key={o.id} value={o.id}>{o.name} (ID: {o.id})</option>
                    ))}
                </select>
            </div>

            <div className="flex gap-4 mb-6 border-b border-gray-700 pb-1">
                {['EXPLORER', 'DUPLICATES', 'ORPHANS'].map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t as any)}
                        className={`px-4 py-2 font-bold ${tab === t ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-white'}`}
                    >
                        {t}
                    </button>
                ))}
            </div>

            {tab === 'EXPLORER' && (
                <div className={styles.card}>
                    <div className="flex gap-4 mb-4">
                        <select
                            value={selectedTable}
                            onChange={e => setSelectedTable(e.target.value)}
                            className="bg-gray-800 text-white p-2 rounded border border-gray-600 flex-1"
                        >
                            <option value="">Select Table...</option>
                            {tables.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <button onClick={fetchTable} className="bg-blue-600 text-white p-2 rounded px-4">Load</button>
                    </div>

                    {tableData && (
                        <div className="overflow-x-auto">
                            <div className="text-sm text-gray-400 mb-2">Total Rows: {tableData.total}</div>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        {tableData.columns.map((c: any) => <th key={c.column_name}>{c.column_name}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {tableData.rows.map((r: any, i: number) => (
                                        <tr key={i}>
                                            {tableData.columns.map((c: any) => (
                                                <td key={c.column_name} style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {typeof r[c.column_name] === 'object' ? JSON.stringify(r[c.column_name]) : String(r[c.column_name])}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {tab === 'DUPLICATES' && (
                <div className={styles.card}>
                    <div className="flex gap-4 mb-4 items-end">
                        <div className="flex-1">
                            <label className="block text-gray-400 text-xs mb-1">Type</label>
                            <select value={dupType} onChange={e => setDupType(e.target.value)} className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600">
                                <option value="items">Item Names</option>
                            </select>
                        </div>
                        <button onClick={fetchDuplicates} className="bg-orange-600 text-white p-2 rounded px-4 h-10 font-bold">Scan</button>
                    </div>

                    <div className="space-y-4">
                        {duplicates.length === 0 && <p className="text-gray-500">No duplicates found.</p>}
                        {duplicates.map((dup, i) => (
                            <div key={i} className="bg-gray-900 p-4 rounded border border-gray-700">
                                <h3 className="font-bold text-lg text-white mb-2 underline">{dup.norm_name}</h3>
                                <div className="space-y-2">
                                    {dup.ids.map((id: number, idx: number) => (
                                        <div key={id} className="flex justify-between items-center bg-gray-800 p-2 rounded">
                                            <span className="text-white">ID: {id} - "{dup.names[idx]}"</span>
                                            <button
                                                onClick={() => mergeDuplicates(id, dup.ids.filter((oid: number) => oid !== id))}
                                                className="bg-green-600 text-white text-xs px-2 py-1 rounded"
                                            >
                                                Keep This
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {tab === 'ORPHANS' && (
                <div className={styles.card}>
                    <div className="flex gap-4 mb-4 items-end">
                        <div className="flex-1">
                            <label className="block text-gray-400 text-xs mb-1">Type</label>
                            <select value={orphanType} onChange={e => setOrphanType(e.target.value)} className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600">
                                <option value="inventory_items">Inventory without valid Item Name</option>
                            </select>
                        </div>
                        <button onClick={fetchOrphans} className="bg-red-600 text-white p-2 rounded px-4 h-10 font-bold">Scan</button>
                    </div>

                    {orphans.length > 0 && (
                        <div className="mb-4 p-4 bg-gray-900 rounded border border-red-900">
                            <h3 className="text-red-400 font-bold mb-2">Bulk Actions ({orphans.length} records)</h3>
                            <div className="flex gap-4">
                                <button onClick={() => fixOrphans('delete')} className="bg-red-600 text-white px-4 py-2 rounded">Delete All</button>
                                <div className="flex gap-2">
                                    <input
                                        type="number"
                                        placeholder="Target Item ID"
                                        value={linkTargetId}
                                        onChange={e => setLinkTargetId(e.target.value)}
                                        className="bg-gray-800 text-white p-2 rounded border border-gray-600 w-32"
                                    />
                                    <button onClick={() => fixOrphans('link')} className="bg-blue-600 text-white px-4 py-2 rounded">Link All</button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="overflow-x-auto">
                        <table className={styles.table}>
                            <thead>
                                <tr><th>ID</th><th>Data</th></tr>
                            </thead>
                            <tbody>
                                {orphans.map(o => (
                                    <tr key={o.id}>
                                        <td>{o.id}</td>
                                        <td>{JSON.stringify(o)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {loading && <div className="fixed inset-0 bg-black/50 flex items-center justify-center text-white z-50">Loading...</div>}
        </div>
    );
}
