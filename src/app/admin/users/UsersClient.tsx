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
    position?: string;
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
    const [position, setPosition] = useState('');

    const [canAddStock, setCanAddStock] = useState(false);
    const [canSubtractStock, setCanSubtractStock] = useState(false);
    const [canAddItem, setCanAddItem] = useState(false);
    const [canAudit, setCanAudit] = useState(false);
    const [canViewReports, setCanViewReports] = useState(false);
    const [canManageProducts, setCanManageProducts] = useState(false);
    const [canAddBarred, setCanAddBarred] = useState(false);
    const [canDeleteBarred, setCanDeleteBarred] = useState(false);
    const [canAddIncident, setCanAddIncident] = useState(false);
    const [canReviewIncidents, setCanReviewIncidents] = useState(false);
    const [canManageEmployees, setCanManageEmployees] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);
    const [hourlyRate, setHourlyRate] = useState('');
    const [hideFromScheduler, setHideFromScheduler] = useState(false);
    const [canApproveSchedule, setCanApproveSchedule] = useState(false);
    const [scheduleApprovalLocations, setScheduleApprovalLocations] = useState<number[]>([]);
    const [submitting, setSubmitting] = useState(false);

    // Locations & Shifts
    const [locations, setLocations] = useState<{ id: number, name: string }[]>([]);
    const [assignedLocations, setAssignedLocations] = useState<number[]>([]);

    const [shifts, setShifts] = useState<any[]>([]);
    const [assignedShifts, setAssignedShifts] = useState<number[]>([]);

    // Edit Mode
    const [editingId, setEditingId] = useState<number | null>(null);

    // Invite state
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteSending, setInviteSending] = useState(false);
    const [inviteResult, setInviteResult] = useState<{ ok: boolean; message: string; url?: string } | null>(null);
    const [invitations, setInvitations] = useState<any[]>([]);

    const fetchInvitations = async () => {
        const res = await fetch('/api/admin/invitations');
        const data = await res.json();
        setInvitations(data.invitations || []);
    };

    const sendInvite = async () => {
        if (!inviteEmail.trim()) return;
        setInviteSending(true);
        setInviteResult(null);
        try {
            const res = await fetch('/api/admin/invitations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: inviteEmail.trim() }),
            });
            const data = await res.json();
            if (res.ok) {
                setInviteResult({ ok: true, message: `Invite sent to ${inviteEmail.trim()}`, url: data.invite_url });
                setInviteEmail('');
                fetchInvitations();
            } else {
                setInviteResult({ ok: false, message: data.error || 'Failed to send invite.' });
            }
        } catch {
            setInviteResult({ ok: false, message: 'Network error. Please try again.' });
        } finally {
            setInviteSending(false);
        }
    };

    const revokeInvite = async (id: number) => {
        await fetch(`/api/admin/invitations?id=${id}`, { method: 'DELETE' });
        fetchInvitations();
    };

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
        fetch('/api/user/locations?adminAll=true').then(r => r.json()).then(d => setLocations(d.locations || []));
        fetch('/api/admin/settings/shifts').then(r => r.json()).then(d => setShifts(d.shifts || []));
    }, []);

    useEffect(() => {
        fetchUsers();
        fetchInvitations();
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
        if (canAddBarred) permissions.push('add_barred');
        if (canDeleteBarred) permissions.push('delete_barred');
        if (canAddIncident) permissions.push('add_incident');
        if (canReviewIncidents) permissions.push('review_incidents');
        if (canManageEmployees) permissions.push('manage_employees');
        if (canApproveSchedule) {
            if (scheduleApprovalLocations.length > 0) {
                scheduleApprovalLocations.forEach(locId => permissions.push(`approve_schedule_${locId}`));
            } else {
                permissions.push('approve_schedule');
            }
        }

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
                position,
                organizationId: overrideOrgId, // Pass explicit org if override
                assignedLocations,
                assignedShifts,
                hideFromScheduler,
                hourlyRate: hourlyRate !== '' ? hourlyRate : undefined,
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
        setPosition('');
        setCanAddStock(false);
        setCanSubtractStock(false);
        setCanAddItem(false);
        setCanAudit(false);
        setCanViewReports(false);
        setCanManageProducts(false);
        setCanAddBarred(false);
        setCanDeleteBarred(false);
        setCanAddIncident(false);
        setCanReviewIncidents(false);
        setCanManageEmployees(false);
        setIsAdmin(false);
        setHourlyRate('');
        setHideFromScheduler(false);
        setCanApproveSchedule(false);
        setScheduleApprovalLocations([]);
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
            const map: any = { 'add_stock': 'Add Stock', 'subtract_stock': 'Subtract Stock', 'add_item_name': 'Add Items', 'audit': 'Audit', 'view_reports': 'View Reports', 'manage_products': 'Manage Products', 'add_barred': 'Add Barred', 'delete_barred': 'Remove Barred', 'add_incident': 'Add Incident', 'review_incidents': 'Review Incidents', 'approve_schedule': 'Approve Schedule', 'manage_employees': 'Manage Employees' };
            return p.map((perm: string) => {
                if (perm.startsWith('approve_schedule_')) return 'Approve Schedule';
                return map[perm] || perm;
            }).filter((v, i, a) => a.indexOf(v) === i).join(', ');
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
        setPosition(u.position || '');

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
        setCanAddBarred(perms.includes('add_barred') || perms.includes('all'));
        setCanDeleteBarred(perms.includes('delete_barred') || perms.includes('all'));
        setCanAddIncident(perms.includes('add_incident') || perms.includes('all'));
        setCanReviewIncidents(perms.includes('review_incidents') || perms.includes('all'));
        setCanManageEmployees(perms.includes('manage_employees') || perms.includes('all'));
        setIsAdmin(u.role === 'admin');
        setHourlyRate(u.hourly_rate != null ? String(u.hourly_rate) : '');
        setHideFromScheduler(u.hide_from_scheduler || false);
        const approveLocs = perms.filter((p: string) => p.startsWith('approve_schedule_')).map((p: string) => Number(p.split('_').pop()));
        setCanApproveSchedule(perms.includes('approve_schedule') || approveLocs.length > 0);
        setScheduleApprovalLocations(approveLocs);
        setAssignedLocations(u.assigned_locations || []);

        // The API now returns assigned_shifts
        setAssignedShifts(u.assigned_shifts || []);
    };

    return (
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
            {/* Left: form */}
            <div className={styles.card} style={{ flex: '0 0 55%', minWidth: 0 }}>
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
                            <div style={{ flex: 2 }}>
                                <label className={styles.statLabel}>Position / Job Title (Optional)</label>
                                <input className={styles.table} style={{ background: '#1f2937', color: 'white', padding: '0.5rem', border: '1px solid #374151', borderRadius: '0.25rem', width: '100%' }} placeholder="e.g. Bartender, Manager, Server" value={position} onChange={e => setPosition(e.target.value)} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label className={styles.statLabel}>Hourly Rate (Optional)</label>
                                <div style={{ position: 'relative' }}>
                                    <span style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }}>$</span>
                                    <input
                                        className={styles.table}
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder="0.00"
                                        style={{ background: '#1f2937', color: 'white', padding: '0.5rem 0.5rem 0.5rem 1.3rem', border: '1px solid #374151', borderRadius: '0.25rem', width: '100%' }}
                                        value={hourlyRate}
                                        onChange={e => setHourlyRate(e.target.value)}
                                    />
                                </div>
                            </div>
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

                        <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#1f2937', borderRadius: '0.5rem', border: '1px solid #374151' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={hideFromScheduler}
                                    onChange={e => setHideFromScheduler(e.target.checked)}
                                    style={{ width: '18px', height: '18px', accentColor: '#f59e0b' }}
                                />
                                <div>
                                    <div style={{ color: 'white', fontWeight: 600 }}>Hide from Scheduler</div>
                                    <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: '2px' }}>
                                        This user will not appear in the Staff Scheduler or shift assignment lists.
                                    </div>
                                </div>
                            </label>
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <div className={styles.statLabel} style={{ marginBottom: '0.75rem' }}>Permissions & Access</div>

                            {/* Inventory */}
                            <div style={{ marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <div style={{ width: '3px', height: '14px', borderRadius: '2px', background: '#0ea5e9' }} />
                                    <span style={{ color: '#0ea5e9', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Inventory</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: '0.5rem' }}>
                                    {([
                                        { label: 'Add Stock (+)', val: canAddStock, set: setCanAddStock },
                                        { label: 'Subtract Stock (−)', val: canSubtractStock, set: setCanSubtractStock },
                                        { label: 'Create Products', val: canAddItem, set: setCanAddItem },
                                        { label: 'Manage Products', val: canManageProducts, set: setCanManageProducts },
                                        { label: 'Perform Audits', val: canAudit, set: setCanAudit },
                                        { label: 'View Reporting', val: canViewReports, set: setCanViewReports },
                                    ] as { label: string; val: boolean; set: (v: boolean) => void }[]).map(({ label, val, set }) => (
                                        <div key={label} onClick={() => set(!val)} style={{ background: val ? '#0c4a6e' : '#1e293b', color: 'white', padding: '0.6rem 0.75rem', borderRadius: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.6rem', transition: 'all 0.15s', border: `1px solid ${val ? '#0ea5e9' : '#334155'}` }}>
                                            <input type="checkbox" checked={val} readOnly style={{ width: '15px', height: '15px', accentColor: '#0ea5e9', cursor: 'pointer', flexShrink: 0 }} />
                                            <span style={{ fontWeight: 500, fontSize: '0.85rem' }}>{label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Barred List */}
                            <div style={{ marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <div style={{ width: '3px', height: '14px', borderRadius: '2px', background: '#a78bfa' }} />
                                    <span style={{ color: '#a78bfa', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Barred List</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: '0.5rem' }}>
                                    {([
                                        { label: 'Add to Barred List', val: canAddBarred, set: setCanAddBarred },
                                        { label: 'Remove from Barred List', val: canDeleteBarred, set: setCanDeleteBarred },
                                    ] as { label: string; val: boolean; set: (v: boolean) => void }[]).map(({ label, val, set }) => (
                                        <div key={label} onClick={() => set(!val)} style={{ background: val ? '#2e1065' : '#1e293b', color: 'white', padding: '0.6rem 0.75rem', borderRadius: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.6rem', transition: 'all 0.15s', border: `1px solid ${val ? '#a78bfa' : '#334155'}` }}>
                                            <input type="checkbox" checked={val} readOnly style={{ width: '15px', height: '15px', accentColor: '#a78bfa', cursor: 'pointer', flexShrink: 0 }} />
                                            <span style={{ fontWeight: 500, fontSize: '0.85rem' }}>{label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Incident Reports */}
                            <div style={{ marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <div style={{ width: '3px', height: '14px', borderRadius: '2px', background: '#fb923c' }} />
                                    <span style={{ color: '#fb923c', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Incident Reports</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: '0.5rem' }}>
                                    {([
                                        { label: 'File Incident Report', val: canAddIncident, set: setCanAddIncident },
                                        { label: 'Review Incident Reports', val: canReviewIncidents, set: setCanReviewIncidents },
                                    ] as { label: string; val: boolean; set: (v: boolean) => void }[]).map(({ label, val, set }) => (
                                        <div key={label} onClick={() => set(!val)} style={{ background: val ? '#431407' : '#1e293b', color: 'white', padding: '0.6rem 0.75rem', borderRadius: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.6rem', transition: 'all 0.15s', border: `1px solid ${val ? '#fb923c' : '#334155'}` }}>
                                            <input type="checkbox" checked={val} readOnly style={{ width: '15px', height: '15px', accentColor: '#fb923c', cursor: 'pointer', flexShrink: 0 }} />
                                            <span style={{ fontWeight: 500, fontSize: '0.85rem' }}>{label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Scheduling */}
                            <div style={{ marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <div style={{ width: '3px', height: '14px', borderRadius: '2px', background: '#34d399' }} />
                                    <span style={{ color: '#34d399', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Scheduling</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: '0.5rem' }}>
                                    <div onClick={() => { setCanApproveSchedule(!canApproveSchedule); if (canApproveSchedule) setScheduleApprovalLocations([]); }} style={{ background: canApproveSchedule ? '#052e16' : '#1e293b', color: 'white', padding: '0.6rem 0.75rem', borderRadius: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.6rem', transition: 'all 0.15s', border: `1px solid ${canApproveSchedule ? '#34d399' : '#334155'}` }}>
                                        <input type="checkbox" checked={canApproveSchedule} readOnly style={{ width: '15px', height: '15px', accentColor: '#34d399', cursor: 'pointer', flexShrink: 0 }} />
                                        <span style={{ fontWeight: 500, fontSize: '0.85rem' }}>Approve Schedules</span>
                                    </div>
                                </div>
                                {canApproveSchedule && locations.length > 0 && (
                                    <div style={{ marginTop: '0.5rem', background: '#0a0f1a', borderRadius: '0.5rem', padding: '0.65rem 0.75rem', border: '1px solid #1e3a2f' }}>
                                        <div style={{ color: '#6b7280', fontSize: '0.75rem', marginBottom: '0.4rem' }}>
                                            Restrict to specific locations <span style={{ color: '#4b5563' }}>(leave unchecked = all locations)</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                            {locations.map(loc => (
                                                <label key={loc.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#d1d5db', cursor: 'pointer', fontSize: '0.85rem' }}>
                                                    <input type="checkbox" checked={scheduleApprovalLocations.includes(loc.id)} onChange={e => { if (e.target.checked) setScheduleApprovalLocations([...scheduleApprovalLocations, loc.id]); else setScheduleApprovalLocations(scheduleApprovalLocations.filter(id => id !== loc.id)); }} />
                                                    {loc.name}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Staff Management */}
                            <div style={{ marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <div style={{ width: '3px', height: '14px', borderRadius: '2px', background: '#f59e0b' }} />
                                    <span style={{ color: '#f59e0b', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Staff Management</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: '0.5rem' }}>
                                    <div onClick={() => setCanManageEmployees(!canManageEmployees)} style={{ background: canManageEmployees ? '#451a03' : '#1e293b', color: 'white', padding: '0.6rem 0.75rem', borderRadius: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.6rem', transition: 'all 0.15s', border: `1px solid ${canManageEmployees ? '#f59e0b' : '#334155'}` }}>
                                        <input type="checkbox" checked={canManageEmployees} readOnly style={{ width: '15px', height: '15px', accentColor: '#f59e0b', cursor: 'pointer', flexShrink: 0 }} />
                                        <span style={{ fontWeight: 500, fontSize: '0.85rem' }}>Manage Employees</span>
                                    </div>
                                </div>
                            </div>

                            {/* Admin */}
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <div style={{ width: '3px', height: '14px', borderRadius: '2px', background: '#f87171' }} />
                                    <span style={{ color: '#f87171', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Admin</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: '0.5rem' }}>
                                    <div
                                        onClick={() => setIsAdmin(!isAdmin)}
                                        style={{ background: isAdmin ? '#450a0a' : '#1e293b', color: 'white', padding: '0.6rem 0.75rem', borderRadius: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.6rem', transition: 'all 0.15s', border: `1px solid ${isAdmin ? '#f87171' : '#334155'}` }}
                                    >
                                        <input type="checkbox" checked={isAdmin} readOnly style={{ width: '15px', height: '15px', accentColor: '#f87171', cursor: 'pointer', flexShrink: 0 }} />
                                        <div>
                                            <span style={{ fontWeight: 500, fontSize: '0.85rem' }}>Administrator</span>
                                            <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '1px' }}>Full access to all features</div>
                                        </div>
                                    </div>
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

            {/* Right column: invite + users list */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>
                {/* ── Invite by Email ──────────────────────────────────── */}
                <div className={styles.card}>
                    <div className={styles.cardTitle} style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>✉ Invite by Email</div>
                    <p style={{ color: '#9ca3af', fontSize: '0.78rem', margin: '0 0 0.75rem' }}>
                        Send a registration link. The recipient sets up their own name, password, and PIN.
                    </p>
                    <input
                        type="email"
                        value={inviteEmail}
                        onChange={e => setInviteEmail(e.target.value)}
                        onKeyDown={async e => { if (e.key === 'Enter') { e.preventDefault(); await sendInvite(); } }}
                        placeholder="staff@yourbar.com"
                        style={{ width: '100%', background: '#111827', border: '1px solid #374151', borderRadius: '8px', color: 'white', padding: '0.55rem 0.75rem', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', marginBottom: '0.5rem' }}
                    />
                    <button
                        onClick={sendInvite}
                        disabled={inviteSending || !inviteEmail.trim()}
                        style={{ width: '100%', background: '#059669', color: 'white', border: 'none', borderRadius: '8px', padding: '0.55rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem', opacity: (inviteSending || !inviteEmail.trim()) ? 0.5 : 1 }}>
                        {inviteSending ? 'Sending…' : 'Send Invite'}
                    </button>

                    {inviteResult && (
                        <div style={{ marginTop: '0.6rem', background: inviteResult.ok ? '#052e16' : '#7f1d1d', border: `1px solid ${inviteResult.ok ? '#16a34a' : '#ef4444'}`, borderRadius: '8px', padding: '0.5rem 0.65rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                            <span style={{ color: inviteResult.ok ? '#34d399' : '#fca5a5', fontSize: '0.78rem', flex: 1 }}>{inviteResult.message}</span>
                            {inviteResult.url && (
                                <button onClick={() => { navigator.clipboard.writeText(inviteResult!.url!); }}
                                    style={{ background: '#374151', border: 'none', color: '#d1d5db', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                                    Copy
                                </button>
                            )}
                            <button onClick={() => setInviteResult(null)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 0, fontSize: '1rem', lineHeight: 1 }}>×</button>
                        </div>
                    )}

                    {invitations.filter(i => i.is_active).length > 0 && (
                        <div style={{ marginTop: '1rem' }}>
                            <div style={{ color: '#6b7280', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Pending</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                {invitations.filter(i => i.is_active).map(inv => (
                                    <div key={inv.id} style={{ background: '#111827', borderRadius: '6px', padding: '0.4rem 0.6rem', border: '1px solid #1f2937' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <span style={{ color: '#60a5fa', fontSize: '0.78rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.email}</span>
                                            <button onClick={() => revokeInvite(inv.id)}
                                                style={{ background: 'none', border: '1px solid #374151', color: '#9ca3af', borderRadius: '4px', padding: '1px 6px', cursor: 'pointer', fontSize: '0.7rem', flexShrink: 0 }}>
                                                Revoke
                                            </button>
                                        </div>
                                        <div style={{ color: '#4b5563', fontSize: '0.7rem', marginTop: '2px' }}>
                                            expires {new Date(inv.expires_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Existing Users */}
                <div className={styles.card}>
                    <div className={styles.cardTitle}>Existing Users</div>
                    <div className={styles.tableContainer} style={{ maxHeight: '520px', overflowY: 'auto' }}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Position</th>
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
                                        <td style={{ color: u.position ? '#93c5fd' : '#4b5563', fontSize: '0.85rem' }}>{u.position || '—'}</td>
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
            </div>
        </div>
    );
}
