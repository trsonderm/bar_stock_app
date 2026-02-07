'use client';

import { useState, useEffect } from 'react';
import { Database, Copy, AlertTriangle, RefreshCw, Layers } from 'lucide-react';

export default function MaintenancePage() {
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
        <div className="p-8 max-w-7xl mx-auto text-white">
            <header className="mb-8">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                    Database Maintenance
                </h1>
                <p className="text-slate-400 mt-2">Manage duplicates, orphans, and raw data across organizations.</p>
            </header>

            <div className="flex justify-between items-center mb-8 bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                <div className="flex items-center gap-4">
                    <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">Active Scope:</span>
                    <select
                        value={selectedOrg}
                        onChange={e => setSelectedOrg(e.target.value)}
                        className="bg-slate-950 text-white px-4 py-2 rounded-lg border border-slate-700 outline-none focus:border-blue-500 min-w-[250px]"
                    >
                        {organizations.map(o => (
                            <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-8 border-b border-slate-800">
                {[
                    { id: 'EXPLORER', label: 'Table Explorer', icon: Database },
                    { id: 'DUPLICATES', label: 'Duplicate Cleaner', icon: Copy },
                    { id: 'ORPHANS', label: 'Orphan Detective', icon: AlertTriangle }
                ].map(t => {
                    const Icon = t.icon;
                    return (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id as any)}
                            className={`flex items-center gap-2 px-6 py-3 font-medium transition-all rounded-t-lg ${tab === t.id
                                    ? 'bg-slate-800 text-blue-400 border-x border-t border-slate-700 mb-[-1px] border-b-slate-800'
                                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900'
                                }`}
                        >
                            <Icon size={16} />
                            {t.label}
                        </button>
                    )
                })}
            </div>

            {tab === 'EXPLORER' && (
                <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
                    <div className="flex gap-4 mb-6">
                        <select
                            value={selectedTable}
                            onChange={e => setSelectedTable(e.target.value)}
                            className="bg-slate-950 text-white p-2.5 rounded-lg border border-slate-700 flex-1 outline-none focus:border-blue-500"
                        >
                            <option value="">Select Table...</option>
                            {tables.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <button
                            onClick={fetchTable}
                            disabled={!selectedTable}
                            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg font-medium transition-colors flex items-center gap-2"
                        >
                            <RefreshCw size={18} /> Load Data
                        </button>
                    </div>

                    {tableData ? (
                        <div className="overflow-hidden rounded-lg border border-slate-800">
                            <div className="bg-slate-950 px-4 py-2 border-b border-slate-800 text-xs font-mono text-slate-500 flex justify-between">
                                <span>Table: {selectedTable}</span>
                                <span>{tableData.total} Records</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left text-slate-400">
                                    <thead className="bg-slate-950 text-slate-300 uppercase font-bold text-xs">
                                        <tr>
                                            {tableData.columns.map((c: any) => <th key={c.column_name} className="px-4 py-3 border-b border-r border-slate-800 last:border-r-0 whitespace-nowrap">{c.column_name}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800">
                                        {tableData.rows.map((r: any, i: number) => (
                                            <tr key={i} className="hover:bg-slate-800/50">
                                                {tableData.columns.map((c: any) => (
                                                    <td key={c.column_name} className="px-4 py-3 border-r border-slate-800 last:border-r-0 max-w-[200px] truncate">
                                                        {typeof r[c.column_name] === 'object' ? JSON.stringify(r[c.column_name]) : String(r[c.column_name])}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-12 text-slate-600 italic">Select a table to view raw data</div>
                    )}
                </div>
            )}

            {tab === 'DUPLICATES' && (
                <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
                    <div className="flex gap-4 mb-6 items-end">
                        <div className="flex-1">
                            <label className="block text-slate-500 text-xs font-bold uppercase mb-1">Entity Type</label>
                            <select value={dupType} onChange={e => setDupType(e.target.value)} className="w-full bg-slate-950 text-white p-2.5 rounded-lg border border-slate-700 outline-none focus:border-blue-500">
                                <option value="items">Item Names (Normalized)</option>
                            </select>
                        </div>
                        <button onClick={fetchDuplicates} className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-2.5 rounded-lg font-bold shadow-lg shadow-orange-900/20 transition-all flex items-center gap-2">
                            Scan for Duplicates
                        </button>
                    </div>

                    <div className="space-y-4">
                        {duplicates.length === 0 && <div className="text-center py-12 text-slate-600 italic">No duplicates found. System clean.</div>}
                        {duplicates.map((dup, i) => (
                            <div key={i} className="bg-slate-950 p-6 rounded-xl border border-slate-800 relative group hover:border-orange-500/50 transition-colors">
                                <div className="absolute top-4 right-4 bg-orange-900/30 text-orange-400 px-3 py-1 rounded-full text-xs font-bold">
                                    {dup.ids.length} Conflicts
                                </div>
                                <h3 className="font-bold text-lg text-white mb-4 flex items-center gap-2">
                                    <Layers className="text-orange-500" /> "{dup.norm_name}"
                                </h3>
                                <div className="space-y-2">
                                    {dup.ids.map((id: number, idx: number) => (
                                        <div key={id} className="flex justify-between items-center bg-slate-900 p-3 rounded-lg border border-slate-800">
                                            <span className="text-slate-300 font-mono text-sm">ID: <span className="text-white font-bold">{id}</span> - "{dup.names[idx]}"</span>
                                            <button
                                                onClick={() => mergeDuplicates(id, dup.ids.filter((oid: number) => oid !== id))}
                                                className="bg-green-600 hover:bg-green-500 text-white text-xs px-3 py-1.5 rounded font-bold transition-colors"
                                            >
                                                Keep This & Merge Others
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
                <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
                    <div className="flex gap-4 mb-6 items-end">
                        <div className="flex-1">
                            <label className="block text-slate-500 text-xs font-bold uppercase mb-1">Orphan Type</label>
                            <select value={orphanType} onChange={e => setOrphanType(e.target.value)} className="w-full bg-slate-950 text-white p-2.5 rounded-lg border border-slate-700 outline-none focus:border-blue-500">
                                <option value="inventory_items">Inventory Records with Invalid Item ID</option>
                            </select>
                        </div>
                        <button onClick={fetchOrphans} className="bg-red-600 hover:bg-red-500 text-white px-6 py-2.5 rounded-lg font-bold shadow-lg shadow-red-900/20 transition-all">
                            Scan for Orphans
                        </button>
                    </div>

                    {orphans.length > 0 && (
                        <div className="mb-6 p-6 bg-red-900/10 rounded-xl border border-red-900/50">
                            <h3 className="text-red-400 font-bold mb-4 flex items-center gap-2">
                                <AlertTriangle /> Bulk Actions ({orphans.length} records)
                            </h3>
                            <div className="flex flex-col md:flex-row gap-4">
                                <button onClick={() => fixOrphans('delete')} className="bg-red-600 hover:bg-red-500 text-white px-6 py-2.5 rounded-lg font-bold transition-colors">
                                    Delete All Orphans
                                </button>
                                <div className="flex gap-2 flex-1">
                                    <input
                                        type="number"
                                        placeholder="Target Item ID"
                                        value={linkTargetId}
                                        onChange={e => setLinkTargetId(e.target.value)}
                                        className="bg-slate-950 text-white p-2.5 rounded-lg border border-slate-700 w-full outline-none focus:border-blue-500"
                                    />
                                    <button onClick={() => fixOrphans('link')} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg font-bold whitespace-nowrap transition-colors">
                                        Link All to ID
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {orphans.length > 0 && (
                        <div className="overflow-x-auto rounded-lg border border-slate-800">
                            <table className="w-full text-sm text-left text-slate-400">
                                <thead className="bg-slate-950 text-slate-300 uppercase font-bold text-xs">
                                    <tr>
                                        <th className="px-4 py-3 border-b border-r border-slate-800 w-24">ID</th>
                                        <th className="px-4 py-3 border-b border-slate-800">Record Data</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    {orphans.map(o => (
                                        <tr key={o.id} className="hover:bg-slate-900/50">
                                            <td className="px-4 py-3 border-r border-slate-800 font-mono text-white">{o.id}</td>
                                            <td className="px-4 py-3 font-mono text-xs">{JSON.stringify(o)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {orphans.length === 0 && <div className="text-center py-12 text-slate-600 italic">No orphans found. Database integrity is 100%.</div>}
                </div>
            )}

            {loading && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
                    <div className="bg-slate-900 p-8 rounded-2xl flex flex-col items-center gap-4 shadow-2xl border border-slate-800">
                        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-white font-medium animate-pulse">Processing...</span>
                    </div>
                </div>
            )}
        </div>
    );
}
