'use client';

import { useState, useEffect } from 'react';
import { Database, Table as TableIcon, Plus, Trash2, Save, X, RefreshCw, ChevronLeft, ChevronRight, Edit2 } from 'lucide-react';

export default function DatabasePage() {
    const [tables, setTables] = useState<string[]>([]);
    const [selectedTable, setSelectedTable] = useState<string>('');

    // Table Data
    const [columns, setColumns] = useState<any[]>([]);
    const [rows, setRows] = useState<any[]>([]);
    const [pk, setPk] = useState('id');
    const [total, setTotal] = useState(0);

    // Loading/State
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(0);
    const limit = 50;

    // Edit State
    const [editingCell, setEditingCell] = useState<{ rowId: any, col: string } | null>(null);
    const [editValue, setEditValue] = useState('');

    // Add Row State
    const [showAddModal, setShowAddModal] = useState(false);
    const [newRowData, setNewRowData] = useState<any>({});

    useEffect(() => {
        fetch('/api/super-admin/database?action=tables')
            .then(r => r.json())
            .then(data => {
                if (data.tables) setTables(data.tables);
            });
    }, []);

    useEffect(() => {
        if (selectedTable) {
            setPage(0);
            fetchTableData(selectedTable, 0);
        }
    }, [selectedTable]);

    const fetchTableData = async (table: string, p: number) => {
        setLoading(true);
        const res = await fetch(`/api/super-admin/database?table=${table}&limit=${limit}&offset=${p * limit}`);
        const data = await res.json();
        if (data.rows) {
            setColumns(data.columns);
            setRows(data.rows);
            setPk(data.pk);
            setTotal(data.total);
            setPage(p);
        }
        setLoading(false);
    };

    const handleEditStart = (row: any, col: string) => {
        setEditingCell({ rowId: row[pk], col });
        let val = row[col];
        if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
        setEditValue(val === null ? '' : String(val));
    };

    const handleEditSave = async () => {
        if (!editingCell) return;
        const { rowId, col } = editingCell;

        let finalVal: any = editValue;
        // Basic Type conversion based on column type if needed, or rely on Postgres casting?
        // JSON parsing
        const colDef = columns.find(c => c.column_name === col);
        if (colDef && (colDef.data_type === 'json' || colDef.data_type === 'jsonb')) {
            try { finalVal = JSON.parse(editValue); } catch { }
        }
        if (editValue === '') finalVal = null; // Empty string -> null? Or empty string.

        const res = await fetch('/api/super-admin/database', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                table: selectedTable,
                pk,
                id: rowId,
                updates: { [col]: finalVal }
            })
        });

        if (res.ok) {
            // Optimistic update
            setRows(prev => prev.map(r => r[pk] === rowId ? { ...r, [col]: finalVal } : r));
            setEditingCell(null);
        } else {
            const err = await res.json();
            alert(`Update Failed: ${err.error}`);
        }
    };

    const handleDelete = async (id: any) => {
        if (!confirm('Are you sure? This cannot be undone.')) return;
        const res = await fetch('/api/super-admin/database', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table: selectedTable, pk, id })
        });
        if (res.ok) {
            fetchTableData(selectedTable, page);
        } else {
            const err = await res.json();
            alert(`Delete Failed: ${err.error}`);
        }
    };

    const handleAddSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        // Remove empty keys if any? Or send null?
        const res = await fetch('/api/super-admin/database', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table: selectedTable, data: newRowData })
        });
        if (res.ok) {
            setShowAddModal(false);
            setNewRowData({});
            fetchTableData(selectedTable, 0); // Reset to first page to see new row (if sorted DESC)
        } else {
            const err = await res.json();
            alert(`Insert Failed: ${err.error}`);
        }
    };

    return (
        <div className="flex h-[calc(100vh-64px)] overflow-hidden">
            {/* Sidebar */}
            <div className="w-64 bg-slate-900 border-r border-slate-800 p-4 overflow-y-auto hidden md:block">
                <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-4 opacity-50 pl-2">Tables</h3>
                <div className="space-y-1">
                    {tables.map(t => (
                        <button
                            key={t}
                            onClick={() => setSelectedTable(t)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${selectedTable === t
                                    ? 'bg-blue-600/20 text-blue-400 font-medium'
                                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                                }`}
                        >
                            <TableIcon size={14} />
                            {t}
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden relative">
                {!selectedTable ? (
                    <div className="flex-1 flex items-center justify-center text-slate-500 flex-col gap-4">
                        <Database size={64} className="opacity-20" />
                        <p>Select a table to browse database.</p>
                    </div>
                ) : (
                    <>
                        {/* Toolbar */}
                        <div className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/50">
                            <div className="flex items-center gap-4">
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <TableIcon className="text-blue-500" />
                                    {selectedTable}
                                </h2>
                                <span className="text-slate-500 text-sm">{total} records</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => fetchTableData(selectedTable, page)}
                                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded"
                                >
                                    <RefreshCw size={18} />
                                </button>
                                <button
                                    onClick={() => setShowAddModal(true)}
                                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                                >
                                    <Plus size={18} /> Add Row
                                </button>
                            </div>
                        </div>

                        {/* Grid */}
                        <div className="flex-1 overflow-auto">
                            {loading ? (
                                <div className="p-8 text-center text-slate-500">Loading data...</div>
                            ) : (
                                <table className="w-full border-collapse">
                                    <thead className="bg-slate-900 sticky top-0 z-10">
                                        <tr>
                                            <th className="p-3 border-b border-r border-slate-800 w-12 text-center text-slate-500">#</th>
                                            {columns.map(c => (
                                                <th key={c.column_name} className="p-3 border-b border-r border-slate-800 text-left min-w-[150px]">
                                                    <div className="text-xs font-bold text-slate-300 uppercase">{c.column_name}</div>
                                                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">{c.data_type}</div>
                                                </th>
                                            ))}
                                            <th className="p-3 border-b border-slate-800 w-20 text-center">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800">
                                        {rows.length === 0 && (
                                            <tr><td colSpan={columns.length + 2} className="p-8 text-center text-slate-500">No records found.</td></tr>
                                        )}
                                        {rows.map((row, i) => (
                                            <tr key={row[pk] || i} className="hover:bg-slate-900/50">
                                                <td className="p-3 border-r border-slate-800 text-center text-slate-600 font-mono text-xs">
                                                    {(page * limit) + i + 1}
                                                </td>
                                                {columns.map(c => {
                                                    const isEditing = editingCell && editingCell.rowId === row[pk] && editingCell.col === c.column_name;
                                                    const val = row[c.column_name];
                                                    return (
                                                        <td
                                                            key={c.column_name}
                                                            className="p-0 border-r border-slate-800 relative group"
                                                            onDoubleClick={() => handleEditStart(row, c.column_name)}
                                                        >
                                                            {isEditing ? (
                                                                <div className="absolute inset-0 z-20">
                                                                    <input
                                                                        autoFocus
                                                                        className="w-full h-full bg-slate-800 text-white px-3 border-2 border-blue-500 outline-none font-mono text-sm"
                                                                        value={editValue}
                                                                        onChange={e => setEditValue(e.target.value)}
                                                                        onBlur={handleEditSave}
                                                                        onKeyDown={e => e.key === 'Enter' && handleEditSave()}
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <div className="px-3 py-3 w-full h-full text-sm text-slate-300 font-mono truncate cursor-text" title={String(val)}>
                                                                    {typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val ?? 'NULL')}
                                                                </div>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                                <td className="p-2 text-center">
                                                    <button
                                                        onClick={() => handleDelete(row[pk])}
                                                        className="p-1.5 text-red-500/50 hover:text-red-400 hover:bg-red-900/30 rounded"
                                                        title="Delete Row"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Pagination Footer */}
                        <div className="h-14 bg-slate-900 border-t border-slate-800 flex items-center justify-between px-6">
                            <div className="text-sm text-slate-500">
                                Page {page + 1} ({page * limit + 1}-{Math.min((page + 1) * limit, total)} of {total})
                            </div>
                            <div className="flex gap-2">
                                <button
                                    className="p-2 rounded bg-slate-800 text-slate-400 hover:text-white disabled:opacity-50"
                                    disabled={page === 0}
                                    onClick={() => fetchTableData(selectedTable, page - 1)}
                                >
                                    <ChevronLeft size={18} />
                                </button>
                                <button
                                    className="p-2 rounded bg-slate-800 text-slate-400 hover:text-white disabled:opacity-50"
                                    disabled={((page + 1) * limit) >= total}
                                    onClick={() => fetchTableData(selectedTable, page + 1)}
                                >
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Add Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                    <div className="bg-slate-900 border border-slate-700 rounded-xl w-[600px] max-h-[80vh] flex flex-col shadow-2xl">
                        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-white">Add Row to {selectedTable}</h3>
                            <button onClick={() => setShowAddModal(false)}><X className="text-slate-400 hover:text-white" /></button>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1 space-y-4">
                            {columns.map(c => (
                                <div key={c.column_name}>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                                        {c.column_name}
                                        {c.is_nullable === 'NO' && !c.column_default && <span className="text-red-500 ml-1">*</span>}
                                        {c.column_name === pk && <span className="text-blue-500 ml-1">(Primary Key)</span>}
                                    </label>
                                    <input
                                        className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white text-sm focus:border-blue-500 outline-none"
                                        placeholder={c.column_default ? `Default: ${c.column_default}` : ''}
                                        value={newRowData[c.column_name] || ''}
                                        onChange={e => setNewRowData({ ...newRowData, [c.column_name]: e.target.value })}
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="p-6 border-t border-slate-800 flex justify-end gap-3">
                            <button className="px-4 py-2 rounded text-slate-400 hover:text-white" onClick={() => setShowAddModal(false)}>Cancel</button>
                            <button className="px-4 py-2 rounded bg-blue-600 text-white font-medium hover:bg-blue-500" onClick={handleAddSubmit}>Insert Record</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
