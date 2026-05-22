'use client';

import * as XLSX from 'xlsx';

export function downloadCSV(data: any[], filename: string) {
    if (!data || !data.length) return;

    const headers = Object.keys(data[0]);
    const csvContent = [
        headers.join(','),
        ...data.map(row => headers.map(header => {
            const val = row[header];
            if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
                return `"${val.replace(/"/g, '""')}"`;
            }
            return val ?? '';
        }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export function downloadXLSX(data: any[], filename: string) {
    if (!data || !data.length) return;
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

export function downloadSpreadsheet(data: any[], filename: string, format: 'xlsx' | 'csv' = 'xlsx') {
    if (!data || !data.length) return;
    if (format === 'csv') {
        downloadCSV(data, filename);
    } else {
        downloadXLSX(data, filename);
    }
}
