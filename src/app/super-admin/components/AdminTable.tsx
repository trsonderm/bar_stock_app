import React from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';

interface Column<T> {
    header: string;
    accessorKey?: keyof T;
    cell?: (item: T) => React.ReactNode;
    className?: string;
}

interface AdminTableProps<T> {
    data: T[];
    columns: Column<T>[];
    keyField: keyof T;
    isLoading?: boolean;
    searchPlaceholder?: string;
    onSearch?: (query: string) => void;
    pagination?: {
        currentPage: number;
        totalPages: number;
        onPageChange: (page: number) => void;
    };
    actions?: (item: T) => React.ReactNode;
}

export function AdminTable<T>({
    data,
    columns,
    keyField,
    isLoading,
    searchPlaceholder = "Search...",
    onSearch,
    pagination,
    actions
}: AdminTableProps<T>) {
    return (
        <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-sm">
            {onSearch && (
                <div className="p-4 border-b border-slate-800 bg-slate-900/50">
                    <div className="relative max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                            type="text"
                            placeholder={searchPlaceholder}
                            onChange={(e) => onSearch(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg pl-9 pr-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none placeholder:text-slate-500 transition-all"
                        />
                    </div>
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-950/50 border-b border-slate-800">
                            {columns.map((col, idx) => (
                                <th key={idx} className={`py-4 px-6 text-xs font-semibold uppercase tracking-wider text-slate-400 ${col.className || ''}`}>
                                    {col.header}
                                </th>
                            ))}
                            {actions && <th className="py-4 px-6 text-xs font-semibold uppercase tracking-wider text-slate-400 text-right">Actions</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                        {isLoading ? (
                            Array.from({ length: 5 }).map((_, idx) => (
                                <tr key={idx} className="animate-pulse">
                                    {columns.map((_, colIdx) => (
                                        <td key={colIdx} className="py-4 px-6">
                                            <div className="h-4 bg-slate-800 rounded w-24"></div>
                                        </td>
                                    ))}
                                    {actions && <td className="py-4 px-6"><div className="h-4 bg-slate-800 rounded w-12 ml-auto"></div></td>}
                                </tr>
                            ))
                        ) : data.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length + (actions ? 1 : 0)} className="py-12 text-center text-slate-500 italic">
                                    No records found
                                </td>
                            </tr>
                        ) : (
                            data.map((item) => (
                                <tr key={String(item[keyField])} className="hover:bg-slate-800/30 transition-colors group">
                                    {columns.map((col, idx) => (
                                        <td key={idx} className={`py-4 px-6 text-sm text-slate-300 ${col.className || ''}`}>
                                            {col.cell ? col.cell(item) : String(item[col.accessorKey as keyof T])}
                                        </td>
                                    ))}
                                    {actions && (
                                        <td className="py-4 px-6 text-right">
                                            {actions(item)}
                                        </td>
                                    )}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t border-slate-800 bg-slate-900/50">
                    <p className="text-sm text-slate-500">
                        Page <span className="font-medium text-slate-300">{pagination.currentPage}</span> of <span className="font-medium text-slate-300">{pagination.totalPages}</span>
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => pagination.onPageChange(Math.max(1, pagination.currentPage - 1))}
                            disabled={pagination.currentPage === 1}
                            className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => pagination.onPageChange(Math.min(pagination.totalPages, pagination.currentPage + 1))}
                            disabled={pagination.currentPage === pagination.totalPages}
                            className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
