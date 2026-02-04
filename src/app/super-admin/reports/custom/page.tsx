'use client';

import { useState, useEffect } from 'react';

export default function CustomReportClient() {
    const [tables, setTables] = useState<string[]>([]);
    const [columns, setColumns] = useState<string[]>([]);

    // Selection
    const [selectedTable, setSelectedTable] = useState('');
    const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
    const [dateRange, setDateRange] = useState({ start: '', end: '' });

    // Results
    const [rows, setRows] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Load tables (reusing DB Browser API for simplicity)
        fetch('/api/super-admin/database', {
            method: 'POST',
            body: JSON.stringify({ action: 'tables' })
        })
            .then(res => res.json())
            .then(data => setTables(data.tables || []));
    }, []);

    const fetchColumns = async (table: string) => {
        setSelectedTable(table);
        setSelectedColumns([]);
        // Quick hack: fetch one row to get column names or query info schema
        // Let's us query empty
        const res = await fetch('/api/super-admin/database', {
            method: 'POST',
            body: JSON.stringify({ action: 'query', query: `SELECT * FROM ${table} LIMIT 1` })
        });
        const data = await res.json();
        if (data.result && data.result.length > 0) {
            setColumns(Object.keys(data.result[0]));
        } else if (data.result && data.result.length === 0) {
            // If empty, we might not get keys. Fallback to a "describe" if we had one, 
            // or just show "No data to infer columns"
            // For now, let's assume tables have data or we skip.
            setColumns([]);
        }
    };

    const toggleColumn = (col: string) => {
        if (selectedColumns.includes(col)) {
            setSelectedColumns(selectedColumns.filter(c => c !== col));
        } else {
            setSelectedColumns([...selectedColumns, col]);
        }
    };

    const generateReport = async () => {
        if (!selectedTable || selectedColumns.length === 0) return;
        setLoading(true);

        const cols = selectedColumns.join(', ');
        let query = `SELECT ${cols} FROM ${selectedTable}`;

        // Very basic date filtering assumption: look for common date columns
        // This is a "power tool" limitation: it's hard to guess the date column.
        // We will just run the SELECT for now.

        // LIMIT for safety
        query += ` LIMIT 500`;

        try {
            const res = await fetch('/api/super-admin/database', {
                method: 'POST',
                body: JSON.stringify({ action: 'query', query })
            });
            const data = await res.json();
            setRows(data.result || []);
        } catch (e) {
            alert('Error generating report');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-8 h-screen flex flex-col">
            <h1 className="text-3xl font-bold text-white mb-6">Custom Report Builder</h1>

            <div className="flex flex-1 gap-6 overflow-hidden">
                {/* Configuration Sidebar */}
                <div className="w-80 bg-gray-800 border border-gray-700 rounded-xl p-6 overflow-y-auto flex flex-col gap-6">
                    <div>
                        <label className="block text-gray-400 text-sm font-bold uppercase mb-2">1. Select Source</label>
                        <select
                            className="w-full bg-gray-900 border border-gray-700 text-white rounded p-2"
                            value={selectedTable}
                            onChange={e => fetchColumns(e.target.value)}
                        >
                            <option value="">-- Choose Table --</option>
                            {tables.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>

                    {selectedTable && (
                        <div>
                            <label className="block text-gray-400 text-sm font-bold uppercase mb-2">2. Select Columns</label>
                            <div className="bg-gray-900 border border-gray-700 rounded p-2 max-h-64 overflow-y-auto space-y-2">
                                {columns.length === 0 && <div className="text-gray-500 text-sm italic">No columns found (table might be empty)</div>}
                                {columns.map(col => (
                                    <label key={col} className="flex items-center gap-2 cursor-pointer hover:bg-gray-800 p-1 rounded">
                                        <input
                                            type="checkbox"
                                            checked={selectedColumns.includes(col)}
                                            onChange={() => toggleColumn(col)}
                                            className="rounded border-gray-600 bg-gray-700 text-blue-600"
                                        />
                                        <span className="text-gray-300 text-sm font-mono">{col}</span>
                                    </label>
                                ))}
                            </div>
                            <div className="flex justify-end mt-2">
                                <button onClick={() => setSelectedColumns(columns)} className="text-xs text-blue-400 hover:text-blue-300 mr-2">Select All</button>
                                <button onClick={() => setSelectedColumns([])} className="text-xs text-gray-500 hover:text-gray-400">Clear</button>
                            </div>
                        </div>
                    )}

                    <div>
                        <button
                            onClick={generateReport}
                            disabled={!selectedTable || selectedColumns.length === 0 || loading}
                            className={`w-full py-3 rounded-lg font-bold text-white shadow-lg transition
                                ${!selectedTable ? 'bg-gray-700 cursor-not-allowed text-gray-500' : 'bg-green-600 hover:bg-green-500 shadow-green-900/20'}`}
                        >
                            {loading ? 'Building...' : 'Generate Report'}
                        </button>
                    </div>
                </div>

                {/* Preview / Results */}
                <div className="flex-1 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden flex flex-col">
                    <div className="p-4 bg-gray-900/50 border-b border-gray-700 flex justify-between items-center">
                        <h3 className="text-gray-400 font-bold">Report Preview</h3>
                        <div className="text-xs text-gray-500">Max 500 rows</div>
                    </div>

                    <div className="flex-1 overflow-auto p-4">
                        {rows.length > 0 ? (
                            <table className="w-full text-left font-mono text-sm text-gray-300">
                                <thead className="text-gray-500 bg-gray-900/50 sticky top-0">
                                    <tr>
                                        {selectedColumns.map(col => (
                                            <th key={col} className="p-3 border-b border-gray-700">{col}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700">
                                    {rows.map((row, i) => (
                                        <tr key={i} className="hover:bg-gray-700/50">
                                            {selectedColumns.map((col, j) => (
                                                <td key={j} className="p-3 border-r border-gray-700/50 last:border-0 truncate max-w-xs">{String(row[col])}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-600 italic">
                                Select source and columns to generate data
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
