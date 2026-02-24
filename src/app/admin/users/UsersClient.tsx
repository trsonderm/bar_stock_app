'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../admin.module.css';

interface User {
    id: number;
    first_name: string;
    last_name: string;
    email?: string;
    role: string;
    permissions: string; // JSON string from DB
    pin_hash: string;
}

export default function UsersClient({ overrideOrgId }: { overrideOrgId?: number }) {
    const router = useRouter();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);

    // Form State
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [pin, setPin] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [phone, setPhone] = useState('');
    const [bio, setBio] = useState('');
    const [notes, setNotes] = useState('');

    const [canAddStock, setCanAddStock] = useState(false);
    const [canSubtractStock, setCanSubtractStock] = useState(false);
    const [canAddItem, setCanAddItem] = useState(false);
    const [canAudit, setCanAudit] = useState(false);
    const [canViewReports, setCanViewReports] = useState(false);
    const [canManageProducts, setCanManageProducts] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Locations & Shifts
    const [locations, setLocations] = useState<{ id: number, name: string }[]>([]);
    const [assignedLocations, setAssignedLocations] = useState<number[]>([]);

    const [shifts, setShifts] = useState<any[]>([]);
    const [assignedShifts, setAssignedShifts] = useState<number[]>([]);

    // Edit Mode
    const [editingId, setEditingId] = useState<number | null>(null);

    const fetchUsers = async () => {
        try {
            const url = overrideOrgId ? `/api/admin/users?orgId=${overrideOrgId}` : '/api/admin/users';
            const res = await fetch(url);
            if (!res.ok) {
                const err = await res.json();
                console.error('Failed to fetch users:', err);
                return;
            }
            const data = await res.json();
            console.log('Received Users:', data);

            setUsers(data.users || []);
        } catch (error: any) {
            console.error('Error loading users:', error);
            alert('Error loading users: ' + String(error));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const handler = (event: ErrorEvent) => {
            if (event.message.includes('expected pattern')) {
                alert('CAUGHT SYNTAX ERROR: ' + event.error?.stack);
            }
        };
        window.addEventListener('error', handler);
        return () => window.removeEventListener('error', handler);
    }, []);

    // Fetch Settings info for Shifts & Locations
    useEffect(() => {
        // We need locations and shifts to populate the form
        fetch('/api/user/locations').then(r => r.json()).then(d => setLocations(d.locations || []));
        fetch('/api/admin/settings/shifts').then(r => r.json()).then(d => setShifts(d.shifts || []));
    }, []);

    useEffect(() => {
        fetchUsers();
    }, [overrideOrgId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validation
        if (!pin && (!email || !password) && !editingId) {
            alert('Must provide PIN or Email/Password');
            return;
        }

        if (pin && pin.length !== 4) {
            alert('PIN must be 4 digits');
            return;
        }

        setSubmitting(true);

        const permissions = [];
        if (canAddStock) permissions.push('add_stock');
        if (canSubtractStock) permissions.push('subtract_stock');
        if (canAddItem) permissions.push('add_item_name');
        if (canAudit) permissions.push('audit');
        if (canViewReports) permissions.push('view_reports');
        if (canManageProducts) permissions.push('manage_products');

        const role = isAdmin ? 'admin' : 'user';

        try {
            const baseUrl = editingId ? '/api/admin/users' : '/api/admin/users';
            const url = overrideOrgId ? `${baseUrl}?orgId=${overrideOrgId}` : baseUrl;
            const method = editingId ? 'PUT' : 'POST';
            const body = {
                id: editingId, // Ignored on POST
                firstName,
                lastName,
                pin,
                email,
                password, // Only send if set
                permissions,
                role,
                phone,
                bio,
                notes,
                organizationId: overrideOrgId, // Pass explicit org if override
                assignedLocations,
                assignedShifts
            };

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                resetForm();
                fetchUsers();
                alert(editingId ? 'User Updated' : 'User Created');
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

    const resetForm = () => {
        setFirstName('');
        setLastName('');
        setPin('');
        setEmail('');
        setPassword('');
        setPhone('');
        setBio('');
        setNotes('');
        setCanAddStock(false);
        setCanSubtractStock(false);
        setCanAddItem(false);
        setCanAudit(false);
        setCanViewReports(false);
        setCanManageProducts(false);
        setIsAdmin(false);
        setEditingId(null);
        setAssignedLocations([]);
        setAssignedShifts([]);
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure?')) return;
        const url = overrideOrgId ? `/api/admin/users?orgId=${overrideOrgId}` : '/api/admin/users';
        await fetch(url, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        fetchUsers();
    };

    const parsePerms = (json: string | any[]) => {
        try {
            let p: any[] = [];
            if (Array.isArray(json)) {
                p = json;
            } else if (typeof json === 'string') {
                try {
                    p = JSON.parse(json);
                } catch (e) {
                    console.error('JSON Parse Error for permissions:', json, e);
                    return json;
                }
            } else {
                console.warn('Unknown permissions format:', json);
                return '';
            }

            if (!Array.isArray(p)) return '';

            if (p.includes('all')) return 'Full Admin';
            const map: any = { 'add_stock': 'Add Stock', 'subtract_stock': 'Subtract Stock', 'add_item_name': 'Add Items', 'audit': 'Audit', 'view_reports': 'View Reports', 'manage_products': 'Manage Products' };
            return p.map((perm: string) => map[perm] || perm).join(', ');
        } catch (e) {
            console.error('parsePerms fatal:', e);
            return '';
        }
    };

    const handleEdit = (u: any) => {
        setEditingId(u.id);
        setFirstName(u.first_name);
        setLastName(u.last_name);
        setPin(u.pin_hash || '');
        setEmail(u.email || '');
        setPassword('');
        setPhone(u.phone || '');
        setBio(u.bio || '');
        setNotes(u.notes || '');

        const perms: string[] = [];
        try {
            if (Array.isArray(u.permissions)) {
                perms.push(...u.permissions);
            } else if (typeof u.permissions === 'string') {
                perms.push(...JSON.parse(u.permissions));
            }
        } catch { }

        setCanAddStock(perms.includes('add_stock') || perms.includes('all'));
        setCanSubtractStock(perms.includes('subtract_stock') || perms.includes('all'));
        setCanAddItem(perms.includes('add_item_name') || perms.includes('all'));
        setCanAudit(perms.includes('audit') || perms.includes('all'));
        setCanViewReports(perms.includes('view_reports') || perms.includes('all'));
        setCanManageProducts(perms.includes('manage_products') || perms.includes('all'));
        setIsAdmin(u.role === 'admin');
        setAssignedLocations(u.assigned_locations || []);

        // The API now returns assigned_shifts
        setAssignedShifts(u.assigned_shifts || []);
    };

    return (
        <>
            <div className={styles.grid}>
                <div className={styles.card}>
                    <div className={styles.cardTitle}>{editingId ? 'Edit User' : 'Create New User'}</div>
                    <form onSubmit={handleSubmit}>
                        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                            <div style={{ flex: 1 }}>
                                <label className={styles.statLabel}>First Name</label>
                                <input className={styles.table} style={{ background: '#1f2937', color: 'white', padding: '0.5rem', border: '1px solid #374151', borderRadius: '0.25rem', width: '100%' }} value={firstName} onChange={e => setFirstName(e.target.value)} required />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label className={styles.statLabel}>Last Name</label>
                                <input className={styles.table} style={{ background: '#1f2937', color: 'white', padding: '0.5rem', border: '1px solid #374151', borderRadius: '0.25rem', width: '100%' }} value={lastName} onChange={e => setLastName(e.target.value)} required />
                            </div>
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label className={styles.statLabel}>Email (Optional - For Admin Login)</label>
                            <input className={styles.table} type="email" style={{ background: '#1f2937', color: 'white', padding: '0.5rem', border: '1px solid #374151', borderRadius: '0.25rem', width: '100%' }} value={email} onChange={e => setEmail(e.target.value)} />
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label className={styles.statLabel}>Password {editingId && '(Leave blank to keep current)'}</label>
                            <input className={styles.table} type="password" style={{ background: '#1f2937', color: 'white', padding: '0.5rem', border: '1px solid #374151', borderRadius: '0.25rem', width: '100%' }} value={password} onChange={e => setPassword(e.target.value)} />
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label className={styles.statLabel}>PIN (4 digits - Optional if Email set)</label>
                            <input className={styles.table} type="text" maxLength={4} style={{ background: '#1f2937', color: 'white', padding: '0.5rem', border: '1px solid #374151', borderRadius: '0.25rem', width: '100%' }} value={pin} onChange={e => setPin(e.target.value)} />
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                            <div style={{ flex: 1 }}>
                                <label className={styles.statLabel}>Phone (Optional)</label>
                                <input className={styles.table} style={{ background: '#1f2937', color: 'white', padding: '0.5rem', border: '1px solid #374151', borderRadius: '0.25rem', width: '100%' }} value={phone} onChange={e => setPhone(e.target.value)} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label className={styles.statLabel}>Notes (Optional)</label>
                                <input className={styles.table} style={{ background: '#1f2937', color: 'white', padding: '0.5rem', border: '1px solid #374151', borderRadius: '0.25rem', width: '100%' }} value={notes} onChange={e => setNotes(e.target.value)} />
                            </div>
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label className={styles.statLabel}>Bio (Optional)</label>
                            <textarea className={styles.table} style={{ background: '#1f2937', color: 'white', padding: '0.5rem', border: '1px solid #374151', borderRadius: '0.25rem', width: '100%' }} rows={2} value={bio} onChange={e => setBio(e.target.value)} />
                        </div>

                        {locations.length > 0 && (
                            <div style={{ marginBottom: '1rem' }}>
                                <div className={styles.statLabel}>Assigned Locations</div>
                                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                                    {locations.map(loc => (
                                        <label key={loc.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white' }}>
                                            <input
                                                type="checkbox"
                                                checked={assignedLocations.includes(loc.id)}
                                                onChange={e => {
                                                    if (e.target.checked) setAssignedLocations([...assignedLocations, loc.id]);
                                                    else setAssignedLocations(assignedLocations.filter(id => id !== loc.id));
                                                }}
                                            />
                                            {loc.name}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        {shifts.length > 0 && (
                            <div style={{ marginBottom: '1rem' }}>
                                <div className={styles.statLabel}>Assigned Shifts</div>
                                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                                    {shifts.map(shift => (
                                        <label key={shift.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white' }}>
                                            <input
                                                type="checkbox"
                                                checked={assignedShifts.includes(shift.id)}
                                                onChange={e => {
                                                    if (e.target.checked) setAssignedShifts([...assignedShifts, shift.id]);
                                                    else setAssignedShifts(assignedShifts.filter(id => id !== shift.id));
                                                }}
                                            />
                                            {shift.label} ({shift.start_time}-{shift.end_time})
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div style={{ marginBottom: '1rem' }}>
                            <div className={styles.statLabel} style={{ marginBottom: '0.5rem' }}>Permissions & Access</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
                                <div
                                    onClick={() => setCanAddStock(!canAddStock)}
                                    style={{
                                        background: canAddStock ? '#3b82f6' : '#374151', color: 'white',
                                        padding: '0.75rem', borderRadius: '0.5rem', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: '0.75rem', transition: 'all 0.2s', border: '1px solid #4b5563'
                                    }}>
                                    <input type="checkbox" checked={canAddStock} readOnly style={{ width: '18px', height: '18px', accentColor: 'white', cursor: 'pointer' }} />
                                    <span style={{ fontWeight: 500 }}>Add Stock (+)</span>
                                </div>
                                <div
                                    onClick={() => setCanSubtractStock(!canSubtractStock)}
                                    style={{
                                        background: canSubtractStock ? '#3b82f6' : '#374151', color: 'white',
                                        padding: '0.75rem', borderRadius: '0.5rem', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: '0.75rem', transition: 'all 0.2s', border: '1px solid #4b5563'
                                    }}>
                                    <input type="checkbox" checked={canSubtractStock} readOnly style={{ width: '18px', height: '18px', accentColor: 'white', cursor: 'pointer' }} />
                                    <span style={{ fontWeight: 500 }}>Subtract Stock (-)</span>
                                </div>
                                <div
                                    onClick={() => setCanAddItem(!canAddItem)}
                                    style={{
                                        background: canAddItem ? '#3b82f6' : '#374151', color: 'white',
                                        padding: '0.75rem', borderRadius: '0.5rem', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: '0.75rem', transition: 'all 0.2s', border: '1px solid #4b5563'
                                    }}>
                                    <input type="checkbox" checked={canAddItem} readOnly style={{ width: '18px', height: '18px', accentColor: 'white', cursor: 'pointer' }} />
                                    <span style={{ fontWeight: 500 }}>Create Products</span>
                                </div>
                                <div
                                    onClick={() => setCanAudit(!canAudit)}
                                    style={{
                                        background: canAudit ? '#3b82f6' : '#374151', color: 'white',
                                        padding: '0.75rem', borderRadius: '0.5rem', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: '0.75rem', transition: 'all 0.2s', border: '1px solid #4b5563'
                                    }}>
                                    <input type="checkbox" checked={canAudit} readOnly style={{ width: '18px', height: '18px', accentColor: 'white', cursor: 'pointer' }} />
                                    <span style={{ fontWeight: 500 }}>Perform Audits</span>
                                </div>
                                <div
                                    onClick={() => setCanViewReports(!canViewReports)}
                                    style={{
                                        background: canViewReports ? '#3b82f6' : '#374151', color: 'white',
                                        padding: '0.75rem', borderRadius: '0.5rem', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: '0.75rem', transition: 'all 0.2s', border: '1px solid #4b5563'
                                    }}>
                                    <input type="checkbox" checked={canViewReports} readOnly style={{ width: '18px', height: '18px', accentColor: 'white', cursor: 'pointer' }} />
                                    <span style={{ fontWeight: 500 }}>View Reporting</span>
                                </div>
                                <div
                                    onClick={() => setCanManageProducts(!canManageProducts)}
                                    style={{
                                        background: canManageProducts ? '#3b82f6' : '#374151', color: 'white',
                                        padding: '0.75rem', borderRadius: '0.5rem', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: '0.75rem', transition: 'all 0.2s', border: '1px solid #4b5563'
                                    }}>
                                    <input type="checkbox" checked={canManageProducts} readOnly style={{ width: '18px', height: '18px', accentColor: 'white', cursor: 'pointer' }} />
                                    <span style={{ fontWeight: 500 }}>Manage Products</span>
                                </div>
                                <div
                                    onClick={() => setIsAdmin(!isAdmin)}
                                    style={{
                                        background: isAdmin ? '#ef4444' : '#374151', color: 'white',
                                        padding: '0.75rem', borderRadius: '0.5rem', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: '0.75rem', transition: 'all 0.2s', border: '1px solid #4b5563'
                                    }}>
                                    <input type="checkbox" checked={isAdmin} readOnly style={{ width: '18px', height: '18px', accentColor: 'white', cursor: 'pointer' }} />
                                    <span style={{ fontWeight: 500 }}>Administrator</span>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {editingId && (
                                <button
                                    type="button"
                                    onClick={resetForm}
                                    style={{ flex: 1, padding: '0.75rem', background: '#374151', color: '#d1d5db', borderRadius: '0.5rem', fontWeight: 'bold' }}
                                >
                                    Cancel
                                </button>
                            )}
                            <button
                                type="submit"
                                disabled={submitting}
                                style={{ flex: 1, padding: '0.75rem', background: '#d97706', color: 'white', borderRadius: '0.5rem', fontWeight: 'bold' }}
                            >
                                {submitting ? 'Saving...' : (editingId ? 'Update User' : 'Create User')}
                            </button>
                        </div>
                    </form>
                </div>

                <div className={styles.card} style={{ gridColumn: 'span 2' }}>
                    <div className={styles.cardTitle}>Existing Users</div>
                    <div className={styles.tableContainer}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>PIN</th>
                                    <th>Role</th>
                                    <th>Permissions</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(u => (
                                    <tr key={u.id}>
                                        <td>{u.first_name} {u.last_name}</td>
                                        <td>{u.email || '-'}</td>
                                        <td style={{ fontFamily: 'monospace', color: '#fbbf24' }}>{u.pin_hash}</td>
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


                                            <button
                                                onClick={() => handleEdit(u)}
                                                className="bg-blue-600/10 text-blue-500 px-3 py-1 rounded hover:bg-blue-600/20 font-medium"
                                            >
                                                Edit
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div >
        </>
    );
}
