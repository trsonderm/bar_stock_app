'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../admin.module.css';

interface Category {
    id: number;
    name: string;
    stock_options: number[];
    sub_categories: string[];
    enable_low_stock_reporting: boolean;
}

export default function CategoriesClient() {
    const router = useRouter();
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);

    // Create/Edit State
    const [name, setName] = useState('');
    const [selectedOptions, setSelectedOptions] = useState<number[]>([1]);
    const [subCats, setSubCats] = useState<string[]>([]);
    const [newSubCat, setNewSubCat] = useState('');
    const [enableReporting, setEnableReporting] = useState(true);

    const [editingId, setEditingId] = useState<number | null>(null);

    const PRESETS = [1, 4, 5, 6, 8, 10, 12, 18, 24, 30];

    const [stockMode, setStockMode] = useState<string>('CATEGORY');

    useEffect(() => {
        fetchCategories();
        fetch('/api/admin/settings').then(r => r.json()).then(d => {
            if (d.settings?.stock_count_mode) setStockMode(d.settings.stock_count_mode);
        });
    }, []);

    const fetchCategories = async () => {
        try {
            const res = await fetch('/api/admin/categories');
            const data = await res.json();
            if (data.categories) setCategories(data.categories);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!name.trim()) return;

        try {
            const res = await fetch('/api/admin/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name.trim(),
                    stock_options: selectedOptions.sort((a, b) => a - b),
                    sub_categories: subCats,
                    enable_low_stock_reporting: enableReporting
                })
            });
            if (res.ok) {
                resetForm();
                fetchCategories();
            } else {
                const err = await res.json();
                alert(err.error || 'Failed to create');
            }
        } catch (e) {
            alert('Error creating category');
        }
    };

    const handleUpdate = async () => {
        if (!editingId || !name.trim()) return;

        try {
            const res = await fetch('/api/admin/categories', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: editingId,
                    name: name.trim(),
                    stock_options: selectedOptions.sort((a, b) => a - b),
                    sub_categories: subCats,
                    enable_low_stock_reporting: enableReporting
                })
            });
            if (res.ok) {
                resetForm();
                fetchCategories();
            } else {
                const err = await res.json();
                alert(err.error || 'Failed to update');
            }
        } catch (e) {
            alert('Error updating category');
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure? Only unused categories can be deleted.')) return;
        try {
            const res = await fetch(`/api/admin/categories?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                fetchCategories();
            } else {
                const err = await res.json();
                alert(err.error || 'Failed to delete');
            }
        } catch (e) {
            alert('Error deleting');
        }
    };

    const handleEditClick = (cat: any) => {
        setEditingId(cat.id);
        setName(cat.name);
        setSelectedOptions(cat.stock_options || [1]);
        setSubCats(cat.sub_categories || []);
        setEnableReporting(cat.enable_low_stock_reporting !== false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const resetForm = () => {
        setEditingId(null);
        setName('');
        setSelectedOptions([1]);
        setSubCats([]);
        setNewSubCat('');
        setEnableReporting(true);
    };

    const toggleOption = (opt: number) => {
        setSelectedOptions(prev =>
            prev.includes(opt)
                ? prev.filter(p => p !== opt)
                : [...prev, opt]
        );
    };

    const addSubCat = () => {
        if (newSubCat.trim() && !subCats.includes(newSubCat.trim())) {
            setSubCats([...subCats, newSubCat.trim()]);
            setNewSubCat('');
        }
    };

    if (loading) return <div className={styles.container}>Loading...</div>;

    return (
        <div className={styles.card}>
            <div style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #374151', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0 }}>{editingId ? 'Edit Category' : 'Add New Category'}</h3>
                    {editingId && <button onClick={resetForm} style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '4px', cursor: 'pointer', padding: '4px 8px' }}>Cancel Edit</button>}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                    <div>
                        <label className={styles.label}>Category Name</label>
                        <input
                            className={styles.input}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Snacks, Merch..."
                        />
                        <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input
                                type="checkbox"
                                checked={enableReporting}
                                onChange={e => setEnableReporting(e.target.checked)}
                                style={{ width: '18px', height: '18px' }}
                            />
                            <label style={{ fontSize: '0.9rem', color: '#d1d5db' }}>Include in "Bottle Levels" Report</label>
                        </div>
                    </div>

                    <div>
                        <label className={styles.label}>Category Amounts (Stock Buttons)</label>
                        {stockMode === 'PRODUCT' && (
                            <div style={{ gridColumn: 'span 1', background: '#1f2937', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #374151' }}>
                                <label className={styles.label} style={{ color: '#9ca3af' }}>Stock Options</label>
                                <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                                    Stock options are disabled because "Product Level Counting" is active in Settings.
                                </p>
                            </div>
                        )}
                        {stockMode === 'CATEGORY' && (
                            <div style={{ gridColumn: 'span 1' }}>
                                <label className={styles.label}>Default Stock Increment Buttons</label>
                                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <select
                                        className={styles.input}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            if (val && !selectedOptions.includes(val)) {
                                                setSelectedOptions([...selectedOptions, val]);
                                            }
                                            e.target.value = '';
                                        }}
                                    >
                                        <option value="">Select a preset button...</option>
                                        {PRESETS.map(p => (
                                            <option key={p} value={p}>+{p}</option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const custom = prompt('Enter custom number:');
                                            if (custom) {
                                                const val = parseInt(custom);
                                                if (val && !selectedOptions.includes(val)) {
                                                    setSelectedOptions([...selectedOptions, val]);
                                                }
                                            }
                                        }}
                                        style={{ background: '#374151', color: 'white', border: 'none', borderRadius: '4px', padding: '0 1rem', cursor: 'pointer' }}
                                    >
                                        Add
                                    </button>
                                </div>

                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    {selectedOptions.map(opt => (
                                        <span
                                            key={opt}
                                            style={{
                                                background: '#1f2937',
                                                color: '#e5e7eb',
                                                padding: '4px 8px',
                                                borderRadius: '4px',
                                                border: '1px solid #4b5563',
                                                fontSize: '0.9rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px'
                                            }}
                                        >
                                            {opt > 0 ? `+${opt}` : opt}
                                            <span
                                                onClick={() => setSelectedOptions(selectedOptions.filter(o => o !== opt))}
                                                style={{ cursor: 'pointer', color: '#9ca3af', fontWeight: 'bold' }}
                                            >×</span>
                                        </span>
                                    ))}
                                    {selectedOptions.length === 0 && <span style={{ color: '#6b7280', fontStyle: 'italic' }}>No buttons defined.</span>}
                                </div>
                            </div>
                        )}
                    </div>

                    <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #374151', paddingTop: '1rem' }}>
                        <label className={styles.label}>Sub-Categories (Optional)</label>
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <input
                                className={styles.input}
                                style={{ maxWidth: '300px' }}
                                placeholder="e.g. IPA, Stout..."
                                value={newSubCat}
                                onChange={(e) => setNewSubCat(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addSubCat();
                                    }
                                }}
                            />
                            <button
                                type="button"
                                onClick={addSubCat}
                                style={{ background: '#374151', color: 'white', border: 'none', borderRadius: '4px', padding: '0 1rem', cursor: 'pointer' }}
                            >
                                Add
                            </button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {subCats.map(sub => (
                                <span key={sub} style={{ background: '#1f2937', color: '#e5e7eb', padding: '4px 8px', borderRadius: '15px', border: '1px solid #4b5563', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {sub}
                                    <span
                                        onClick={() => setSubCats(subCats.filter(s => s !== sub))}
                                        style={{ cursor: 'pointer', color: '#9ca3af', fontWeight: 'bold' }}
                                    >×</span>
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                <button
                    className={styles.submitBtn}
                    onClick={editingId ? handleUpdate : handleCreate}
                    style={{ marginTop: '1rem', width: 'auto', padding: '0.5rem 2rem', background: editingId ? '#3b82f6' : '#d97706' }}
                >
                    {editingId ? 'Update Category' : 'Create Category'}
                </button>
            </div>

            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Category Name</th>
                            {stockMode === 'CATEGORY' && <th>Stock Buttons</th>}
                            <th>Sub-Categories</th>
                            <th style={{ width: '150px', textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {categories.map((cat: any) => (
                            <tr key={cat.id}>
                                <td>{cat.name}</td>
                                {stockMode === 'CATEGORY' && (
                                    <td>
                                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                                            {(cat.stock_options || [1]).map((n: number) => (
                                                <span key={n} style={{ background: '#374151', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem' }}>+{n}</span>
                                            ))}
                                        </div>
                                    </td>
                                )}
                                <td>
                                    {cat.sub_categories?.length > 0 ? cat.sub_categories.join(', ') : <span style={{ color: '#6b7280' }}>-</span>}
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                    <button
                                        onClick={() => handleEditClick(cat)}
                                        style={{
                                            background: '#3b82f6',
                                            color: 'white',
                                            border: 'none',
                                            padding: '4px 8px',
                                            borderRadius: '4px',
                                            cursor: 'pointer',
                                            marginRight: '0.5rem'
                                        }}
                                    >
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => handleDelete(cat.id)}
                                        style={{
                                            background: '#ef4444',
                                            color: 'white',
                                            border: 'none',
                                            padding: '4px 8px',
                                            borderRadius: '4px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
