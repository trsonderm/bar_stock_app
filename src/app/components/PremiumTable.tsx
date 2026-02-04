'use client';

import { useState } from 'react';

interface Column<T> {
    header: string;
    accessor: keyof T | ((row: T) => React.ReactNode);
    className?: string;
}

interface PremiumTableProps<T> {
    data: T[];
    columns: Column<T>[];
    searchPlaceholder?: string;
    onRowClick?: (row: T) => void;
    actions?: (row: T) => React.ReactNode;
}

export default function PremiumTable<T extends { id: number | string }>({
    data,
    columns,
    searchPlaceholder = 'Search...',
    onRowClick,
    actions
}: PremiumTableProps<T>) {
    const [search, setSearch] = useState('');

    const filteredData = data.filter(row =>
        Object.values(row as any).some(val =>
            String(val).toLowerCase().includes(search.toLowerCase())
        )
    );

    return (
        <div className="bg-gray-800/50 backdrop-blur-xl border border-gray-700/50 rounded-xl overflow-hidden shadow-2xl">
            {/* Header / Toolbar */}
            <div className="p-6 border-b border-gray-700/50 flex justify-between items-center bg-gradient-to-r from-gray-900/50 to-gray-800/50">
                <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="h-5 w-5 text-gray-500 group-focus-within:text-blue-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <input
                        type="text"
                        placeholder={searchPlaceholder}
                        className="pl-10 pr-4 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all w-64"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <div className="text-sm text-gray-400 font-mono">
                    {filteredData.length} entries
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-gray-700/50">
                            {columns.map((col, idx) => (
                                <th key={idx} className={`p-4 text-xs font-bold text-gray-400 uppercase tracking-wider ${col.className || ''}`}>
                                    {col.header}
                                </th>
                            ))}
                            {actions && <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Actions</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700/30">
                        {filteredData.map((row, idx) => (
                            <tr
                                key={row.id}
                                onClick={() => onRowClick && onRowClick(row)}
                                className={`
                                    group transition-all duration-200 hover:bg-white/5 
                                    ${onRowClick ? 'cursor-pointer' : ''}
                                    opacity-0 animate-fade-in-up
                                `}
                                style={{ animationDelay: `${idx * 0.05}s`, animationFillMode: 'forwards' }}
                            >
                                {columns.map((col, colIdx) => (
                                    <td key={colIdx} className="p-4 text-sm text-gray-300 whitespace-nowrap">
                                        {typeof col.accessor === 'function'
                                            ? col.accessor(row)
                                            : (row[col.accessor] as React.ReactNode)}
                                    </td>
                                ))}
                                {actions && (
                                    <td className="p-4 text-right whitespace-nowrap text-sm font-medium">
                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex justify-end gap-2">
                                            {actions(row)}
                                        </div>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {filteredData.length === 0 && (
                <div className="p-8 text-center text-gray-500 italic">
                    No results found matching "{search}"
                </div>
            )}

            <style jsx global>{`
                @keyframes fade-in-up {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in-up {
                    animation: fade-in-up 0.5s ease-out forwards;
                }
            `}</style>
        </div>
    );
}
