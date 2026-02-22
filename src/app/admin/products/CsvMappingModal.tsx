import React, { useState, useEffect } from 'react';
import styles from '../admin.module.css'; // Assuming we can use the same styles or similar

interface CsvMappingModalProps {
    file: File;
    onClose: () => void;
    onImport: (file: File, mapping: Record<string, number>) => void;
}

export default function CsvMappingModal({ file, onClose, onImport }: CsvMappingModalProps) {
    const [headers, setHeaders] = useState<string[]>([]);
    const [previewRows, setPreviewRows] = useState<string[][]>([]);
    const [mapping, setMapping] = useState<Record<string, number | undefined>>({});
    const [loading, setLoading] = useState(true);

    const dbFields = [
        { key: 'name', label: 'Item Name (Required)', required: true },
        { key: 'type', label: 'Category (Required)', required: true },
        { key: 'secondary_type', label: 'Sub-Category', required: false },
        { key: 'supplier', label: 'Supplier Name', required: false },
        { key: 'unit_cost', label: 'Unit Cost', required: false },
        { key: 'quantity', label: 'Quantity (Stock)', required: false },
        { key: 'order_size', label: 'Order Size', required: false },
        { key: 'low_stock_threshold', label: 'Low Stock Level', required: false }
    ];

    useEffect(() => {
        parseFile();
    }, [file]);

    const parseFile = async () => {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');

        if (lines.length === 0) {
            alert('Empty file');
            onClose();
            return;
        }

        // Simple CSV Parser
        const parseLine = (line: string) => {
            const values = [];
            let current = '';
            let inQuote = false;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    inQuote = !inQuote;
                } else if (char === ',' && !inQuote) {
                    values.push(current.trim().replace(/^"|"$/g, '')); // Remove surrounding quotes
                    current = '';
                } else {
                    current += char;
                }
            }
            values.push(current.trim().replace(/^"|"$/g, ''));
            return values;
        };

        const parsedHeaders = parseLine(lines[0]);
        const previews = lines.slice(1, 6).map(parseLine);

        setHeaders(parsedHeaders);
        setPreviewRows(previews);

        // Auto-Match
        const newMapping: Record<string, number> = {};
        dbFields.forEach(field => {
            const index = parsedHeaders.findIndex(h => h.toLowerCase().includes(field.label.split(' ')[0].toLowerCase()) || h.toLowerCase() === field.key);
            if (index !== -1) newMapping[field.key] = index;
        });

        setMapping(newMapping);
        setLoading(false);
    };

    const handleImport = () => {
        // Validate
        if (mapping['name'] === undefined || mapping['type'] === undefined) {
            alert('Please map Name and Category columns.');
            return;
        }
        const cleanMapping: Record<string, number> = {};
        Object.entries(mapping).forEach(([key, val]) => {
            if (val !== undefined) cleanMapping[key] = val;
        });
        onImport(file, cleanMapping);
    };

    if (loading) return null;

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 200 }}>
            <div style={{ background: '#111827', padding: '2rem', borderRadius: '1rem', width: '90%', maxWidth: '800px', border: '1px solid #374151', maxHeight: '90vh', overflowY: 'auto', color: 'white' }}>
                <h2 style={{ marginTop: 0 }}>Map CSV Columns</h2>
                <p className="text-gray-400 mb-4">Match your CSV columns to the database fields.</p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>

                    {/* Mapping Form */}
                    <div>
                        <h3 className="text-lg font-bold mb-2">Column Mapping</h3>
                        {dbFields.map(field => (
                            <div key={field.key} style={{ marginBottom: '1rem' }}>
                                <label className="block text-sm font-medium mb-1" style={{ color: field.required ? 'white' : '#9ca3af' }}>
                                    {field.label}
                                </label>
                                <select
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', background: '#374151', color: 'white', border: 'none' }}
                                    value={mapping[field.key] !== undefined ? mapping[field.key] : ''}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setMapping(prev => ({ ...prev, [field.key]: val === '' ? undefined : parseInt(val) }));
                                    }}
                                >
                                    <option value="">(Skip)</option>
                                    {headers.map((h, i) => (
                                        <option key={i} value={i}>{h} (Col {i + 1})</option>
                                    ))}
                                </select>
                            </div>
                        ))}
                    </div>

                    {/* Preview */}
                    <div>
                        <h3 className="text-lg font-bold mb-2">File Preview</h3>
                        <div style={{ overflowX: 'auto', background: '#1f2937', padding: '1rem', borderRadius: '0.5rem', fontSize: '0.8rem' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>
                                        {headers.map((h, i) => (
                                            <th key={i} style={{ padding: '4px', borderBottom: '1px solid #374151', textAlign: 'left', color: Object.values(mapping).includes(i) ? '#10b981' : '#6b7280' }}>
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewRows.map((row, r) => (
                                        <tr key={r}>
                                            {row.map((cell, c) => (
                                                <td key={c} style={{ padding: '4px', borderBottom: '1px solid #374151' }}>
                                                    {cell}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem' }}>
                    <button onClick={onClose} style={{ padding: '0.5rem 1rem', background: 'transparent', color: '#9ca3af', border: '1px solid #374151', borderRadius: '0.5rem', cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleImport} style={{ padding: '0.5rem 1rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold' }}>
                        Import Products
                    </button>
                </div>
            </div>
        </div>
    );
}
