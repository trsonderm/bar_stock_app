'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../admin.module.css';

interface User {
    id: number;
    first_name: string;
    last_name: string;
    role: string;
    permissions: string; // JSON string from DB, we parse it
}

export default function UsersClient() {
    const router = useRouter();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);

    // Form State
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [pin, setPin] = useState('');
    const [canAddStock, setCanAddStock] = useState(false);
    const [canAddItem, setCanAddItem] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const fetchUsers = () => {
        fetch('/api/admin/users')
            .then(res => res.json())
            .then(data => {
                setUsers(data.users);
                setLoading(false);
            });
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (pin.length !== 4) {
            alert('PIN must be 4 digits');
            return;
        }
        setSubmitting(true);

        const permissions = [];
        if (canAddStock) permissions.push('add_stock');
        if (canAddItem) permissions.push('add_item_name');

        const role = isAdmin ? 'admin' : 'user';

        try {
            const res = await fetch('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ firstName, lastName, pin, permissions, role })
            });

            if (res.ok) {
                setFirstName('');
                setLastName('');
                setPin('');
                setCanAddStock(false);
                setCanAddItem(false);
                setIsAdmin(false);
                fetchUsers();
                alert('User Created');
            } else {
                const d = await res.json();
                alert(d.error);
            }
        } catch (e) {
            alert('Error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure?')) return;
        await fetch('/api/admin/users', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        fetchUsers();
    };

    const parsePerms = (json: string) => {
        try {
            const p = JSON.parse(json);
            if (p.includes('all')) return 'Full Admin';
            return p.map((perm: string) => perm === 'add_stock' ? 'Add Stock' : perm === 'add_item_name' ? 'Add Items' : perm).join(', ');
        } catch { return ''; }
    };

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1 className={styles.title}>User Management</h1>
                <div className={styles.nav}>
                    <button onClick={() => router.push('/admin/dashboard')}>Dashboard</button>
                    <button onClick={() => router.push('/admin/query')}>Query</button>
                    <button onClick={() => router.push('/admin/settings')}>Settings</button>
                    <button onClick={() => router.push('/admin/prices')}>Prices</button>
                    <button onClick={() => router.push('/admin/categories')}>Categories</button>
                    <button onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); router.push('/'); }}>Logout</button>
                </div>
            </header>

            <div className={styles.grid}>
                <div className={styles.card}>
                    <div className={styles.cardTitle}>Create New User</div>
                    <form onSubmit={handleSubmit}>
                        <div style={{ marginBottom: '1rem' }}>
                            <label className={styles.statLabel}>First Name</label>
                            <input className={styles.table} style={{ background: '#1f2937', color: 'white', padding: '0.5rem', border: '1px solid #374151', borderRadius: '0.25rem', width: '100%' }} value={firstName} onChange={e => setFirstName(e.target.value)} required />
                        </div>
                        <div style={{ marginBottom: '1rem' }}>
                            <label className={styles.statLabel}>Last Name</label>
                            <input className={styles.table} style={{ background: '#1f2937', color: 'white', padding: '0.5rem', border: '1px solid #374151', borderRadius: '0.25rem', width: '100%' }} value={lastName} onChange={e => setLastName(e.target.value)} required />
                        </div>
                        <div style={{ marginBottom: '1rem' }}>
                            <label className={styles.statLabel}>PIN (4 digits)</label>
                            <input className={styles.table} type="text" maxLength={4} style={{ background: '#1f2937', color: 'white', padding: '0.5rem', border: '1px solid #374151', borderRadius: '0.25rem', width: '100%' }} value={pin} onChange={e => setPin(e.target.value)} required />
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <div className={styles.statLabel}>Permissions</div>
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white' }}>
                                    <input type="checkbox" checked={canAddStock} onChange={e => setCanAddStock(e.target.checked)} />
                                    Can Add Stock
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white' }}>
                                    <input type="checkbox" checked={canAddItem} onChange={e => setCanAddItem(e.target.checked)} />
                                    Can Create Items
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fbbf24', fontWeight: 'bold' }}>
                                    <input type="checkbox" checked={isAdmin} onChange={e => setIsAdmin(e.target.checked)} />
                                    Is Admin User
                                </label>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={submitting}
                            style={{ width: '100%', padding: '0.75rem', background: '#d97706', color: 'white', borderRadius: '0.5rem', fontWeight: 'bold' }}
                        >
                            {submitting ? 'Creating...' : 'Create User'}
                        </button>
                    </form>
                </div>

                <div className={styles.card} style={{ gridColumn: 'span 2' }}>
                    <div className={styles.cardTitle}>Existing Users</div>
                    <div className={styles.tableContainer}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Role</th>
                                    <th>Permissions</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(u => (
                                    <tr key={u.id}>
                                        <td>{u.first_name} {u.last_name}</td>
                                        <td>{u.role}</td>
                                        <td>{parsePerms(u.permissions)}</td>
                                        <td>
                                            {u.role !== 'admin' && (
                                                <button
                                                    onClick={() => handleDelete(u.id)}
                                                    style={{ color: '#ef4444', fontWeight: 'bold' }}
                                                >
                                                    Delete
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
