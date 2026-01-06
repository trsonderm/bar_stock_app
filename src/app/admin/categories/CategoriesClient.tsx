'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../admin.module.css';

interface Category {
    id: number;
    name: string;
    stock_options: number[];
}

export default function CategoriesClient() {
    const router = useRouter();
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [newCatName, setNewCatName] = useState('');
    const [selectedOptions, setSelectedOptions] = useState<number[]>([1]);

    // Editing State
    const [editingId, setEditingId] = useState<number | null>(null);

    const PRESETS = [1, 4, 5, 6, 8, 10, 12, 18, 24, 30];

    useEffect(() => {
        fetchCategories();
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
        if (!newCatName.trim()) return;

        try {
            const res = await fetch('/api/admin/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newCatName.trim(),
                    stock_options: selectedOptions.sort((a, b) => a - b)
                })
            });
            if (res.ok) {
                setNewCatName('');
                setSelectedOptions([1]);
                fetchCategories();
            } else {
                const err = await res.json();
                alert(err.error || 'Failed to create');
            }
        } catch (e) {
            alert('Error creating category');
        }
    };

    const handleEditClick = (cat: any) => {
        setEditingId(cat.id);
        setNewCatName(cat.name);
        setSelectedOptions(cat.stock_options || [1]);
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setNewCatName('');
        setSelectedOptions([1]);
    };

    const handleUpdate = async () => {
        if (!editingId || !newCatName.trim()) return;

        try {
            const res = await fetch('/api/admin/categories', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: editingId,
                    name: newCatName.trim(),
                    stock_options: selectedOptions.sort((a, b) => a - b)
                })
            });
            if (res.ok) {
                handleCancelEdit();
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

    const toggleOption = (opt: number) => {
        setSelectedOptions(prev =>
            prev.includes(opt)
                ? prev.filter(p => p !== opt)
                : [...prev, opt]
        );
    };

    if (loading) return <div className={styles.container}>Loading...</div>;

    return (
        <>
            <div className={styles.card}>
                <div style={{ marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #374151', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
                        <h3 style={{ margin: 0 }}>{editingId ? 'Edit Category' : 'Add New Category'}</h3>
                        {editingId && <button onClick={handleCancelEdit} style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '4px', cursor: 'pointer', padding: '4px 8px' }}>Cancel Edit</button>}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                        <div>
                            <label className={styles.label}>Category Name</label>
                            <input
                                className={styles.input}
                                value={newCatName}
                                onChange={(e) => setNewCatName(e.target.value)}
                                placeholder="e.g. Snacks, Merch..."
                            />
                        </div>

                        <div>
                            <label className={styles.label}>Stock Buttons (Quantity Types)</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                                {PRESETS.map(opt => (
                                    <button
                                        key={opt}
                                        onClick={() => toggleOption(opt)}
                                        style={{
                                            padding: '0.5rem',
                                            borderRadius: '0.25rem',
                                            border: '1px solid #4b5563',
                                            background: selectedOptions.includes(opt) ? '#d97706' : '#1f2937',
                                            color: 'white',
                                            cursor: 'pointer',
                                            minWidth: '40px'
                                        }}
                                    >
                                        +{opt}
                                    </button>
                                ))}
                            </div>
                            <small style={{ color: '#9ca3af', marginTop: '0.5rem', display: 'block' }}>
                                These buttons will appear in the inventory list for items of this category.
                            </small>
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
                                <th>Stock Buttons</th>
                                <th style={{ width: '150px', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {categories.map((cat: any) => (
                                <tr key={cat.id}>
                                    <td>{cat.name}</td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                                            {(cat.stock_options || [1]).map((n: number) => (
                                                <span key={n} style={{ background: '#374151', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem' }}>+{n}</span>
                                            ))}
                                        </div>
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
        </>
    );
}
