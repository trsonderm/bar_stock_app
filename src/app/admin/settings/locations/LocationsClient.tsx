'use client';

import { useState, useEffect } from 'react';
import styles from '../../admin.module.css';

interface Location {
    id: number;
    name: string;
    address: string;
}

export default function LocationsClient() {
    const [locations, setLocations] = useState<Location[]>([]);
    const [loading, setLoading] = useState(true);

    // Form State
    const [name, setName] = useState('');
    const [address, setAddress] = useState('');
    const [editingId, setEditingId] = useState<number | null>(null);

    useEffect(() => {
        fetchLocations();
    }, []);

    const fetchLocations = async () => {
        try {
            const res = await fetch('/api/admin/locations');
            const data = await res.json();
            if (data.locations) setLocations(data.locations);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const method = editingId ? 'PUT' : 'POST';
            const body = { id: editingId, name, address };

            const res = await fetch('/api/admin/locations', {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                resetForm();
                fetchLocations();
            } else {
                alert('Failed to save location');
            }
        } catch (e) {
            alert('Error saving location');
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure? This will delete all inventory records for this location.')) return;
        try {
            const res = await fetch(`/api/admin/locations?id=${id}`, { method: 'DELETE' });
            if (res.ok) fetchLocations();
        } catch (e) {
            alert('Error deleting location');
        }
    };

    const handleEdit = (loc: Location) => {
        setEditingId(loc.id);
        setName(loc.name);
        setAddress(loc.address || '');
    };

    const resetForm = () => {
        setEditingId(null);
        setName('');
        setAddress('');
    };

    return (
        <div className={styles.container}>
            <h1 className={styles.pageTitle}>Manage Locations</h1>

            <div className={styles.card}>
                <h3 className={styles.cardTitle}>{editingId ? 'Edit Location' : 'Add New Location'}</h3>
                <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem', maxWidth: '500px' }}>
                    <div>
                        <label className={styles.statLabel}>Name</label>
                        <input className={styles.input} value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Main Bar, Patio..." />
                    </div>
                    <div>
                        <label className={styles.statLabel}>Address (Optional)</label>
                        <input className={styles.input} value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St" />
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button type="submit" className={styles.submitBtn} style={{ background: editingId ? '#3b82f6' : '#d97706' }}>
                            {editingId ? 'Update Location' : 'Create Location'}
                        </button>
                        {editingId && <button type="button" onClick={resetForm} style={{ background: 'transparent', color: '#9ca3af', border: 'none', cursor: 'pointer' }}>Cancel</button>}
                    </div>
                </form>
            </div>

            <div className={styles.card}>
                <h3 className={styles.cardTitle}>Existing Locations</h3>
                <div className={styles.tableContainer}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Address</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {locations.map(loc => (
                                <tr key={loc.id}>
                                    <td>{loc.name}</td>
                                    <td>{loc.address || '-'}</td>
                                    <td style={{ textAlign: 'right' }}>
                                        <button onClick={() => handleEdit(loc)} style={{ marginRight: '1rem', background: 'transparent', border: 'none', color: '#60a5fa', cursor: 'pointer' }}>Edit</button>
                                        <button onClick={() => handleDelete(loc.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}>Delete</button>
                                    </td>
                                </tr>
                            ))}
                            {locations.length === 0 && !loading && <tr><td colSpan={3} style={{ textAlign: 'center', color: '#6b7280' }}>No locations found.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
