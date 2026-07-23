'use client';

import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Settings2, ChevronDown, ChevronUp } from 'lucide-react';
import styles from '../../admin.module.css';

interface Location {
    id: number;
    name: string;
    address: string;
    settings?: Record<string, any>;
}

interface AuditSettings {
    shift_audit_enabled: boolean;
    shift_begin_audit_enabled: boolean;
    shift_end_audit_enabled: boolean;
    shift_begin_audit_all: boolean;
    shift_end_audit_all: boolean;
}

function defaultAudit(): AuditSettings {
    return {
        shift_audit_enabled: false,
        shift_begin_audit_enabled: false,
        shift_end_audit_enabled: false,
        shift_begin_audit_all: false,
        shift_end_audit_all: false,
    };
}

function Toggle({ checked, onChange, label, sub }: { checked: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
    return (
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer', userSelect: 'none' }}>
            <div
                onClick={() => onChange(!checked)}
                style={{
                    position: 'relative', width: 40, height: 22, flexShrink: 0, marginTop: 2,
                    background: checked ? '#3b82f6' : '#374151', borderRadius: 11, cursor: 'pointer',
                    transition: 'background 0.2s',
                }}
            >
                <div style={{
                    position: 'absolute', top: 3, left: checked ? 20 : 3, width: 16, height: 16,
                    background: 'white', borderRadius: '50%', transition: 'left 0.2s',
                }} />
            </div>
            <div>
                <div style={{ color: '#e5e7eb', fontSize: '0.875rem', fontWeight: 500 }}>{label}</div>
                {sub && <div style={{ color: '#9ca3af', fontSize: '0.8rem', marginTop: 1 }}>{sub}</div>}
            </div>
        </label>
    );
}

export default function LocationsClient() {
    const [locations, setLocations] = useState<Location[]>([]);
    const [loading, setLoading] = useState(true);

    const [name, setName] = useState('');
    const [address, setAddress] = useState('');
    const [editingId, setEditingId] = useState<number | null>(null);
    const [showForm, setShowForm] = useState(false);

    // Audit settings panel state
    const [auditLocId, setAuditLocId] = useState<number | null>(null);
    const [auditSettings, setAuditSettings] = useState<AuditSettings>(defaultAudit());
    const [auditSaving, setAuditSaving] = useState(false);
    const [auditSaved, setAuditSaved] = useState(false);

    useEffect(() => { fetchLocations(); }, []);

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
            const res = await fetch('/api/admin/locations', {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: editingId, name, address }),
            });
            if (res.ok) { resetForm(); fetchLocations(); }
            else { const d = await res.json(); alert(d.error || 'Failed to save location'); }
        } catch { alert('Error saving location'); }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure? This will delete all inventory records for this location.')) return;
        try {
            const res = await fetch(`/api/admin/locations?id=${id}`, { method: 'DELETE' });
            if (res.ok) fetchLocations();
        } catch { alert('Error deleting location'); }
    };

    const handleEdit = (loc: Location) => {
        setEditingId(loc.id);
        setName(loc.name);
        setAddress(loc.address || '');
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const resetForm = () => { setEditingId(null); setName(''); setAddress(''); setShowForm(false); };

    const openAudit = async (loc: Location) => {
        if (auditLocId === loc.id) { setAuditLocId(null); return; }
        setAuditLocId(loc.id);
        setAuditSaved(false);
        try {
            const res = await fetch(`/api/admin/locations/audit-settings?locationId=${loc.id}`);
            const data = await res.json();
            setAuditSettings({ ...defaultAudit(), ...(data.settings || {}) });
        } catch {
            setAuditSettings(defaultAudit());
        }
    };

    const saveAudit = async () => {
        if (!auditLocId) return;
        setAuditSaving(true);
        try {
            const res = await fetch('/api/admin/locations/audit-settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ locationId: auditLocId, settings: auditSettings }),
            });
            if (res.ok) { setAuditSaved(true); setTimeout(() => setAuditSaved(false), 2000); }
        } finally {
            setAuditSaving(false);
        }
    };

    const setA = (key: keyof AuditSettings, val: boolean) =>
        setAuditSettings(prev => ({ ...prev, [key]: val }));

    return (
        <div className={styles.container}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h1 className={styles.pageTitle}>Manage Locations</h1>
                {!showForm && (
                    <button
                        onClick={() => { setEditingId(null); setName(''); setAddress(''); setShowForm(true); }}
                        style={{ background: '#3b82f6', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', border: 'none', display: 'flex', gap: '0.5rem', alignItems: 'center', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                        <Plus size={20} /> Add Location
                    </button>
                )}
            </div>

            {showForm && (
                <div className={styles.card} style={{ marginBottom: '2rem' }}>
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
                            <button type="submit" className={styles.submitBtn} style={{ background: editingId ? '#3b82f6' : '#10b981' }}>
                                {editingId ? 'Update Location' : 'Create Location'}
                            </button>
                            <button type="button" onClick={resetForm} style={{ background: 'transparent', color: '#9ca3af', border: 'none', cursor: 'pointer' }}>Cancel</button>
                        </div>
                    </form>
                </div>
            )}

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
                                <>
                                    <tr key={loc.id}>
                                        <td>{loc.name}</td>
                                        <td>{loc.address || '-'}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button onClick={() => openAudit(loc)} title="Shift audit settings"
                                                style={{ marginRight: '0.5rem', background: auditLocId === loc.id ? '#1d4ed8' : 'transparent', border: '1px solid #374151', borderRadius: '4px', color: '#a78bfa', cursor: 'pointer', padding: '3px 6px', display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.75rem' }}>
                                                <Settings2 size={13} />
                                                Shift Audit
                                                {auditLocId === loc.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                            </button>
                                            <button onClick={() => handleEdit(loc)} title="Edit location"
                                                style={{ marginRight: '0.5rem', background: 'transparent', border: 'none', color: '#60a5fa', cursor: 'pointer', padding: '4px', display: 'inline-flex', alignItems: 'center' }}>
                                                <Pencil size={14} />
                                            </button>
                                            <button onClick={() => handleDelete(loc.id)} title="Delete location"
                                                style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', display: 'inline-flex', alignItems: 'center' }}>
                                                <Trash2 size={14} />
                                            </button>
                                        </td>
                                    </tr>

                                    {/* Inline audit settings panel */}
                                    {auditLocId === loc.id && (
                                        <tr key={`audit-${loc.id}`}>
                                            <td colSpan={3} style={{ padding: 0 }}>
                                                <div style={{ background: '#0f172a', border: '1px solid #1e3a5f', borderRadius: '8px', margin: '4px 0 8px', padding: '1.25rem 1.5rem' }}>
                                                    <div style={{ color: '#93c5fd', fontWeight: 700, fontSize: '0.85rem', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                                        Shift Audit Settings — {loc.name}
                                                    </div>

                                                    <div style={{ display: 'grid', gap: '1rem' }}>
                                                        {/* Master switch */}
                                                        <Toggle
                                                            checked={auditSettings.shift_audit_enabled}
                                                            onChange={v => setA('shift_audit_enabled', v)}
                                                            label="Allow Shift Audits"
                                                            sub="Master switch — enables shift audit feature for this location"
                                                        />

                                                        {auditSettings.shift_audit_enabled && (
                                                            <div style={{ paddingLeft: '1rem', borderLeft: '2px solid #1e3a5f', display: 'grid', gap: '0.85rem' }}>

                                                                {/* Begin audit */}
                                                                <div>
                                                                    <Toggle
                                                                        checked={auditSettings.shift_begin_audit_enabled}
                                                                        onChange={v => setA('shift_begin_audit_enabled', v)}
                                                                        label="Shift Begin Audit"
                                                                        sub="Show 'Begin Shift Audit' button in the stock view"
                                                                    />
                                                                    {auditSettings.shift_begin_audit_enabled && (
                                                                        <div style={{ marginTop: '0.5rem', paddingLeft: '1rem' }}>
                                                                            <Toggle
                                                                                checked={auditSettings.shift_begin_audit_all}
                                                                                onChange={v => setA('shift_begin_audit_all', v)}
                                                                                label="Apply to all products"
                                                                                sub="When off, only products with the 'Shift Begin Audit' flag are included"
                                                                            />
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {/* End audit */}
                                                                <div>
                                                                    <Toggle
                                                                        checked={auditSettings.shift_end_audit_enabled}
                                                                        onChange={v => setA('shift_end_audit_enabled', v)}
                                                                        label="Shift End Audit"
                                                                        sub="Show 'End Shift Audit' button in the stock view"
                                                                    />
                                                                    {auditSettings.shift_end_audit_enabled && (
                                                                        <div style={{ marginTop: '0.5rem', paddingLeft: '1rem' }}>
                                                                            <Toggle
                                                                                checked={auditSettings.shift_end_audit_all}
                                                                                onChange={v => setA('shift_end_audit_all', v)}
                                                                                label="Apply to all products"
                                                                                sub="When off, only products with the 'Shift End Audit' flag are included"
                                                                            />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                                        <button
                                                            onClick={saveAudit}
                                                            disabled={auditSaving}
                                                            style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '0.5rem 1.25rem', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem', opacity: auditSaving ? 0.6 : 1 }}
                                                        >
                                                            {auditSaving ? 'Saving…' : 'Save'}
                                                        </button>
                                                        {auditSaved && <span style={{ color: '#34d399', fontSize: '0.85rem' }}>Saved ✓</span>}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </>
                            ))}
                            {locations.length === 0 && !loading && (
                                <tr><td colSpan={3} style={{ textAlign: 'center', color: '#6b7280' }}>No locations found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
