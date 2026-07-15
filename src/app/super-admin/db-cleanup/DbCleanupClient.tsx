'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, ChevronRight, ChevronDown, AlertTriangle, Trash2, CheckSquare, Square, RotateCcw, Building2, MapPin, User, Package, Tag, AlertOctagon, Ban, BarChart2, Clock, DollarSign, Calendar, ShoppingCart, Truck, Ticket, RefreshCw } from 'lucide-react';

type Step = 'org' | 'type' | 'record' | 'links' | 'confirm' | 'done';

interface Org { id: number; name: string; subdomain: string; billing_status: string; subscription_plan: string; }
interface Loc { id: number; name: string; address: string; }
interface LinkedGroup {
    key: string; table: string; label: string;
    previewCols: string[]; count: number; rows: any[];
    cascade: boolean; isMainRow: boolean; error?: boolean;
}

const OBJECT_TYPES: { key: string; label: string; icon: any; color: string; bg: string; desc: string }[] = [
    { key: 'organization', label: 'Organization', icon: Building2, color: 'text-red-400', bg: 'bg-red-950/40 border-red-800/60', desc: 'Delete an entire org and all its data' },
    { key: 'location', label: 'Location', icon: MapPin, color: 'text-orange-400', bg: 'bg-orange-950/40 border-orange-800/60', desc: 'Remove a location and its linked records' },
    { key: 'user', label: 'User', icon: User, color: 'text-blue-400', bg: 'bg-blue-950/40 border-blue-800/60', desc: 'Delete a user and their activity' },
    { key: 'item', label: 'Item / Product', icon: Package, color: 'text-emerald-400', bg: 'bg-emerald-950/40 border-emerald-800/60', desc: 'Remove a product and its inventory' },
    { key: 'category', label: 'Category', icon: Tag, color: 'text-violet-400', bg: 'bg-violet-950/40 border-violet-800/60', desc: 'Delete a category and sub-categories' },
    { key: 'incident', label: 'Security Incident', icon: AlertOctagon, color: 'text-rose-400', bg: 'bg-rose-950/40 border-rose-800/60', desc: 'Remove an incident and its timeline' },
    { key: 'barred_person', label: 'Barred Person', icon: Ban, color: 'text-pink-400', bg: 'bg-pink-950/40 border-pink-800/60', desc: 'Delete someone from the barred list' },
    { key: 'custom_report', label: 'Custom Report', icon: BarChart2, color: 'text-cyan-400', bg: 'bg-cyan-950/40 border-cyan-800/60', desc: 'Remove a saved report and its schedules' },
    { key: 'shift', label: 'Shift', icon: Clock, color: 'text-amber-400', bg: 'bg-amber-950/40 border-amber-800/60', desc: 'Delete a shift and its schedule entries' },
    { key: 'shift_close', label: 'Shift Close', icon: DollarSign, color: 'text-lime-400', bg: 'bg-lime-950/40 border-lime-800/60', desc: 'Remove a shift close record' },
    { key: 'schedule', label: 'Schedule Entry', icon: Calendar, color: 'text-sky-400', bg: 'bg-sky-950/40 border-sky-800/60', desc: 'Delete a specific scheduled shift' },
    { key: 'purchase_order', label: 'Purchase Order', icon: ShoppingCart, color: 'text-indigo-400', bg: 'bg-indigo-950/40 border-indigo-800/60', desc: 'Remove a PO and its line items' },
    { key: 'supplier', label: 'Supplier', icon: Truck, color: 'text-teal-400', bg: 'bg-teal-950/40 border-teal-800/60', desc: 'Delete a supplier and its item links' },
    { key: 'support_ticket', label: 'Support Ticket', icon: Ticket, color: 'text-yellow-400', bg: 'bg-yellow-950/40 border-yellow-800/60', desc: 'Remove a ticket and its messages' },
    { key: 'price_override', label: 'Price Override', icon: DollarSign, color: 'text-fuchsia-400', bg: 'bg-fuchsia-950/40 border-fuchsia-800/60', desc: 'Delete a location-specific price override' },
];

const STEP_LABELS: Record<Step, string> = {
    org: '1. Organization', type: '2. Object Type', record: '3. Select Record',
    links: '4. Review Data', confirm: '5. Confirm', done: 'Done',
};

function fmt(val: any): string {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    if (typeof val === 'object') return JSON.stringify(val).slice(0, 60);
    const s = String(val);
    return s.length > 60 ? s.slice(0, 60) + '…' : s;
}

export default function DbCleanupClient() {
    const [step, setStep] = useState<Step>('org');

    // Step 1: Org
    const [orgSearch, setOrgSearch] = useState('');
    const [orgs, setOrgs] = useState<Org[]>([]);
    const [orgsLoading, setOrgsLoading] = useState(false);
    const [selectedOrg, setSelectedOrg] = useState<Org | null>(null);

    // Step 2: Type + Location
    const [selectedType, setSelectedType] = useState('');
    const [locations, setLocations] = useState<Loc[]>([]);
    const [selectedLocation, setSelectedLocation] = useState<Loc | null>(null);

    // Step 3: Records
    const [recordSearch, setRecordSearch] = useState('');
    const [records, setRecords] = useState<any[]>([]);
    const [recordsLoading, setRecordsLoading] = useState(false);
    const [selectedRecord, setSelectedRecord] = useState<any | null>(null);

    // Step 4: Linked groups
    const [linkedGroups, setLinkedGroups] = useState<LinkedGroup[]>([]);
    const [linksLoading, setLinksLoading] = useState(false);
    const [checked, setChecked] = useState<Record<string, boolean>>({});
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    // Step 5 / Delete
    const [confirmText, setConfirmText] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [deleteResults, setDeleteResults] = useState<{ key: string; table: string; rowCount: number }[]>([]);
    const [deleteError, setDeleteError] = useState('');

    // Load orgs on search change
    useEffect(() => {
        setOrgsLoading(true);
        const t = setTimeout(async () => {
            try {
                const res = await fetch(`/api/super-admin/db-cleanup?action=orgs&q=${encodeURIComponent(orgSearch)}`);
                const d = await res.json();
                setOrgs(d.orgs || []);
            } finally { setOrgsLoading(false); }
        }, 250);
        return () => clearTimeout(t);
    }, [orgSearch]);

    // Load locations when org selected
    useEffect(() => {
        if (!selectedOrg) { setLocations([]); return; }
        fetch(`/api/super-admin/db-cleanup?action=locations&orgId=${selectedOrg.id}`)
            .then(r => r.json()).then(d => setLocations(d.locations || []));
    }, [selectedOrg]);

    // Load records
    const loadRecords = useCallback(async () => {
        if (!selectedType || (!selectedOrg && selectedType !== 'organization')) return;
        setRecordsLoading(true);
        try {
            const orgId = selectedOrg?.id || 0;
            const locId = selectedLocation?.id || '';
            const url = `/api/super-admin/db-cleanup?action=records&type=${selectedType}&orgId=${orgId}&locationId=${locId}&q=${encodeURIComponent(recordSearch)}`;
            const res = await fetch(url);
            const d = await res.json();
            setRecords(d.records || []);
        } finally { setRecordsLoading(false); }
    }, [selectedType, selectedOrg, selectedLocation, recordSearch]);

    useEffect(() => {
        if (step === 'record') {
            const t = setTimeout(loadRecords, 250);
            return () => clearTimeout(t);
        }
    }, [step, loadRecords, recordSearch]);

    // Load linked groups
    useEffect(() => {
        if (step !== 'links' || !selectedRecord || !selectedType) return;
        setLinksLoading(true);
        setLinkedGroups([]);
        setChecked({});
        fetch(`/api/super-admin/db-cleanup?action=linked&type=${selectedType}&id=${selectedRecord.id}`)
            .then(r => r.json())
            .then(d => {
                const groups: LinkedGroup[] = d.groups || [];
                setLinkedGroups(groups);
                const init: Record<string, boolean> = {};
                groups.forEach(g => { init[g.key] = true; });
                setChecked(init);
            })
            .finally(() => setLinksLoading(false));
    }, [step, selectedRecord, selectedType]);

    const getTypeDef = () => OBJECT_TYPES.find(t => t.key === selectedType);

    const selectOrg = (org: Org) => {
        setSelectedOrg(org);
        setSelectedLocation(null);
        setSelectedType('');
        setSelectedRecord(null);
        setStep('type');
    };

    const selectType = (typeKey: string) => {
        setSelectedType(typeKey);
        setSelectedRecord(null);
        setRecordSearch('');
        setStep('record');
    };

    const selectRecord = (rec: any) => {
        setSelectedRecord(rec);
        setStep('links');
    };

    const toggleCheck = (key: string) => setChecked(p => ({ ...p, [key]: !p[key] }));
    const checkAll = () => { const n: Record<string, boolean> = {}; linkedGroups.forEach(g => { n[g.key] = true; }); setChecked(n); };
    const uncheckAll = () => { const n: Record<string, boolean> = {}; linkedGroups.forEach(g => { n[g.key] = false; }); setChecked(n); };

    const selectedCount = Object.values(checked).filter(Boolean).length;
    const totalLinkedRows = linkedGroups.filter(g => checked[g.key]).reduce((s, g) => s + g.count, 0);

    const handleDelete = async () => {
        setDeleting(true);
        setDeleteError('');
        try {
            const selectedKeys = Object.entries(checked).filter(([, v]) => v).map(([k]) => k);
            const res = await fetch('/api/super-admin/db-cleanup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mainType: selectedType, mainId: selectedRecord.id, selectedKeys }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Delete failed');
            setDeleteResults(d.results || []);
            setStep('done');
        } catch (err: any) {
            setDeleteError(err.message);
        } finally {
            setDeleting(false);
        }
    };

    const reset = () => {
        setStep('org');
        setSelectedOrg(null);
        setSelectedType('');
        setSelectedLocation(null);
        setSelectedRecord(null);
        setLinkedGroups([]);
        setChecked({});
        setConfirmText('');
        setDeleteResults([]);
        setDeleteError('');
        setOrgSearch('');
        setRecordSearch('');
    };

    const typeDef = getTypeDef();

    return (
        <div style={{ minHeight: '100vh', background: '#050810', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif' }}>
            {/* Header */}
            <div style={{ background: '#0f1623', borderBottom: '1px solid #1e2d45', padding: '1.25rem 2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <Trash2 size={22} color="#ef4444" />
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#f1f5f9' }}>Smart Delete — Database Cleanup</h1>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>Drill down, preview linked records, and cleanly delete with FK-safe ordering</p>
                </div>
            </div>

            {/* Breadcrumb steps */}
            <div style={{ background: '#0a1020', borderBottom: '1px solid #1e2d45', padding: '0.6rem 2rem', display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }}>
                {(['org', 'type', 'record', 'links', 'confirm', 'done'] as Step[]).map((s, i, arr) => {
                    const done = arr.indexOf(step) > i;
                    const active = step === s;
                    return (
                        <span key={s} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: active ? 700 : 400, color: active ? '#60a5fa' : done ? '#34d399' : '#475569', cursor: done ? 'pointer' : 'default' }}
                                onClick={() => { if (done && s !== 'done') setStep(s); }}>
                                {STEP_LABELS[s]}
                            </span>
                            {i < arr.length - 1 && <ChevronRight size={12} color="#334155" />}
                        </span>
                    );
                })}
            </div>

            <div style={{ padding: '2rem', maxWidth: 900, margin: '0 auto' }}>

                {/* STEP 1: Select Organization */}
                {step === 'org' && (
                    <div>
                        <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#94a3b8', marginBottom: '1rem' }}>Select Organization</h2>
                        <div style={{ position: 'relative', marginBottom: '1rem' }}>
                            <Search size={16} color="#64748b" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                            <input value={orgSearch} onChange={e => setOrgSearch(e.target.value)} placeholder="Search organizations…"
                                style={{ width: '100%', background: '#0f1a2e', border: '1px solid #1e3a5f', borderRadius: 8, padding: '0.65rem 0.75rem 0.65rem 2.2rem', color: '#e2e8f0', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                        {orgsLoading && <p style={{ color: '#475569', fontSize: '0.85rem' }}>Loading…</p>}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            {orgs.map(org => (
                                <button key={org.id} onClick={() => selectOrg(org)}
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f1a2e', border: '1px solid #1e2d45', borderRadius: 8, padding: '0.75rem 1rem', cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s' }}
                                    onMouseOver={e => (e.currentTarget.style.borderColor = '#3b82f6')}
                                    onMouseOut={e => (e.currentTarget.style.borderColor = '#1e2d45')}>
                                    <div>
                                        <div style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '0.9rem' }}>{org.name}</div>
                                        <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: 2 }}>{org.subdomain ? `@${org.subdomain} · ` : ''}{org.billing_status} · {org.subscription_plan}</div>
                                    </div>
                                    <span style={{ fontSize: '0.72rem', color: '#475569', background: '#1e2d45', borderRadius: 4, padding: '2px 6px' }}>ID {org.id}</span>
                                </button>
                            ))}
                            {!orgsLoading && orgs.length === 0 && <p style={{ color: '#475569', fontSize: '0.85rem' }}>No organizations found.</p>}
                        </div>
                    </div>
                )}

                {/* STEP 2: Select Object Type */}
                {step === 'type' && selectedOrg && (
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                            <button onClick={() => setStep('org')} style={{ background: 'none', border: '1px solid #1e2d45', borderRadius: 6, padding: '0.3rem 0.7rem', color: '#94a3b8', cursor: 'pointer', fontSize: '0.8rem' }}>← Back</button>
                            <div>
                                <span style={{ color: '#475569', fontSize: '0.8rem' }}>Organization:</span>
                                <span style={{ color: '#60a5fa', fontWeight: 600, marginLeft: 6, fontSize: '0.9rem' }}>{selectedOrg.name}</span>
                            </div>
                        </div>

                        {/* Optional location filter */}
                        {locations.length > 0 && (
                            <div style={{ marginBottom: '1.25rem' }}>
                                <label style={{ color: '#64748b', fontSize: '0.78rem', display: 'block', marginBottom: 6 }}>Filter by location (optional):</label>
                                <select value={selectedLocation?.id || ''} onChange={e => {
                                    const loc = locations.find(l => l.id === parseInt(e.target.value));
                                    setSelectedLocation(loc || null);
                                }} style={{ background: '#0f1a2e', border: '1px solid #1e3a5f', borderRadius: 6, padding: '0.45rem 0.75rem', color: '#e2e8f0', fontSize: '0.85rem' }}>
                                    <option value="">All Locations</option>
                                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                </select>
                            </div>
                        )}

                        <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#94a3b8', marginBottom: '1rem' }}>Select Object Type to Delete</h2>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.65rem' }}>
                            {OBJECT_TYPES.map(t => {
                                const Icon = t.icon;
                                return (
                                    <button key={t.key} onClick={() => selectType(t.key)}
                                        style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', background: '#0f1a2e', border: '1px solid #1e2d45', borderRadius: 10, padding: '0.85rem 1rem', cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s' }}
                                        onMouseOver={e => (e.currentTarget.style.borderColor = '#3b82f6')}
                                        onMouseOut={e => (e.currentTarget.style.borderColor = '#1e2d45')}>
                                        <Icon size={18} style={{ marginTop: 2, flexShrink: 0, color: t.color.replace('text-', '').replace('-400', '') === t.color ? '#94a3b8' : '#94a3b8' }} />
                                        <div>
                                            <div style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '0.88rem' }}>{t.label}</div>
                                            <div style={{ color: '#64748b', fontSize: '0.73rem', marginTop: 2 }}>{t.desc}</div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* STEP 3: Select Record */}
                {step === 'record' && selectedOrg && selectedType && (
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                            <button onClick={() => setStep('type')} style={{ background: 'none', border: '1px solid #1e2d45', borderRadius: 6, padding: '0.3rem 0.7rem', color: '#94a3b8', cursor: 'pointer', fontSize: '0.8rem' }}>← Back</button>
                            <div style={{ color: '#64748b', fontSize: '0.85rem' }}>
                                <span style={{ color: '#60a5fa', fontWeight: 600 }}>{selectedOrg.name}</span>
                                <span style={{ margin: '0 0.4rem', color: '#334155' }}>›</span>
                                <span style={{ color: '#e2e8f0' }}>{typeDef?.label}</span>
                                {selectedLocation && <><span style={{ margin: '0 0.4rem', color: '#334155' }}>›</span><span style={{ color: '#94a3b8' }}>{selectedLocation.name}</span></>}
                            </div>
                        </div>
                        <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#94a3b8', marginBottom: '1rem' }}>Select Record</h2>
                        <div style={{ position: 'relative', marginBottom: '1rem' }}>
                            <Search size={16} color="#64748b" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                            <input value={recordSearch} onChange={e => setRecordSearch(e.target.value)} placeholder={`Search ${typeDef?.label.toLowerCase()}s…`}
                                style={{ width: '100%', background: '#0f1a2e', border: '1px solid #1e3a5f', borderRadius: 8, padding: '0.65rem 0.75rem 0.65rem 2.2rem', color: '#e2e8f0', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                        {recordsLoading && <p style={{ color: '#475569', fontSize: '0.85rem' }}>Loading records…</p>}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            {records.map((rec, i) => {
                                const name = getRecordDisplay(rec, selectedType);
                                const sub = getRecordSub(rec, selectedType);
                                return (
                                    <button key={rec.id ?? i} onClick={() => selectRecord(rec)}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f1a2e', border: '1px solid #1e2d45', borderRadius: 8, padding: '0.7rem 1rem', cursor: 'pointer', textAlign: 'left' }}
                                        onMouseOver={e => (e.currentTarget.style.borderColor = '#ef4444')}
                                        onMouseOut={e => (e.currentTarget.style.borderColor = '#1e2d45')}>
                                        <div>
                                            <div style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '0.88rem' }}>{name}</div>
                                            {sub && <div style={{ color: '#64748b', fontSize: '0.73rem', marginTop: 2 }}>{sub}</div>}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ fontSize: '0.72rem', color: '#475569', background: '#1e2d45', borderRadius: 4, padding: '2px 6px' }}>ID {rec.id}</span>
                                            <Trash2 size={14} color="#ef4444" />
                                        </div>
                                    </button>
                                );
                            })}
                            {!recordsLoading && records.length === 0 && <p style={{ color: '#475569', fontSize: '0.85rem' }}>No records found.</p>}
                            {records.length === 100 && <p style={{ color: '#475569', fontSize: '0.78rem', textAlign: 'center', marginTop: 8 }}>Showing first 100 — refine your search to narrow results.</p>}
                        </div>
                    </div>
                )}

                {/* STEP 4: Review Linked Data */}
                {step === 'links' && selectedRecord && (
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <button onClick={() => setStep('record')} style={{ background: 'none', border: '1px solid #1e2d45', borderRadius: 6, padding: '0.3rem 0.7rem', color: '#94a3b8', cursor: 'pointer', fontSize: '0.8rem' }}>← Back</button>
                                <div>
                                    <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Linked data for </span>
                                    <span style={{ color: '#f87171', fontWeight: 700, fontSize: '0.9rem' }}>{getRecordDisplay(selectedRecord, selectedType)}</span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button onClick={checkAll} style={{ background: 'none', border: '1px solid #1e3a5f', borderRadius: 5, padding: '0.3rem 0.6rem', color: '#60a5fa', cursor: 'pointer', fontSize: '0.75rem' }}>Check All</button>
                                <button onClick={uncheckAll} style={{ background: 'none', border: '1px solid #1e3a5f', borderRadius: 5, padding: '0.3rem 0.6rem', color: '#94a3b8', cursor: 'pointer', fontSize: '0.75rem' }}>Uncheck All</button>
                            </div>
                        </div>

                        <div style={{ background: '#1a0a0a', border: '1px solid #7f1d1d', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <AlertTriangle size={16} color="#ef4444" style={{ flexShrink: 0 }} />
                            <span style={{ color: '#fca5a5', fontSize: '0.83rem' }}>
                                Review carefully. Checked items will be <strong>permanently deleted</strong> from the database. Uncheck any tables you want to preserve.
                            </span>
                        </div>

                        {linksLoading && <p style={{ color: '#475569', fontSize: '0.85rem' }}>Scanning linked records…</p>}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {linkedGroups.map(g => {
                                const isChecked = checked[g.key] ?? true;
                                const isExpanded = expanded[g.key] ?? false;
                                return (
                                    <div key={g.key} style={{ background: '#0c1525', border: `1px solid ${isChecked ? (g.isMainRow ? '#7f1d1d' : '#1e3a5f') : '#1e2d45'}`, borderRadius: 8, overflow: 'hidden', opacity: isChecked ? 1 : 0.5 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.7rem 1rem', cursor: 'pointer' }}
                                            onClick={() => toggleCheck(g.key)}>
                                            <span style={{ flexShrink: 0, color: isChecked ? '#ef4444' : '#475569' }}>
                                                {isChecked ? <CheckSquare size={18} /> : <Square size={18} />}
                                            </span>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                    <span style={{ fontWeight: 600, color: g.isMainRow ? '#fca5a5' : '#e2e8f0', fontSize: '0.88rem' }}>{g.label}</span>
                                                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', background: '#1e2d45', borderRadius: 4, padding: '1px 6px', fontFamily: 'monospace' }}>{g.table}</span>
                                                    {g.cascade && <span style={{ fontSize: '0.68rem', color: '#6ee7b7', background: '#064e3b', borderRadius: 4, padding: '1px 6px' }}>CASCADE</span>}
                                                    {g.error && <span style={{ fontSize: '0.68rem', color: '#fbbf24', background: '#451a03', borderRadius: 4, padding: '1px 6px' }}>table missing</span>}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
                                                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: g.count > 0 ? '#ef4444' : '#475569' }}>{g.count} row{g.count !== 1 ? 's' : ''}</span>
                                                {g.count > 0 && (
                                                    <button onClick={e => { e.stopPropagation(); setExpanded(p => ({ ...p, [g.key]: !p[g.key] })); }}
                                                        style={{ background: 'none', border: '1px solid #1e3a5f', borderRadius: 4, padding: '2px 6px', color: '#64748b', cursor: 'pointer', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 3 }}>
                                                        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                                        {isExpanded ? 'Hide' : 'Show'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        {isExpanded && g.rows.length > 0 && (
                                            <div style={{ borderTop: '1px solid #1e2d45', overflowX: 'auto' }}>
                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                                    <thead>
                                                        <tr style={{ background: '#0a1020' }}>
                                                            {g.previewCols.map(col => (
                                                                <th key={col} style={{ padding: '0.4rem 0.75rem', textAlign: 'left', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #1e2d45', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.68rem', letterSpacing: '0.05em' }}>{col}</th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {g.rows.map((row, ri) => (
                                                            <tr key={ri} style={{ borderBottom: '1px solid #0f1a2e' }}>
                                                                {g.previewCols.map(col => (
                                                                    <td key={col} style={{ padding: '0.4rem 0.75rem', color: '#94a3b8', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{fmt(row[col])}</td>
                                                                ))}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                                {g.count > 5 && (
                                                    <div style={{ padding: '0.4rem 0.75rem', color: '#475569', fontSize: '0.72rem', background: '#0a1020' }}>…and {g.count - 5} more rows</div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {!linksLoading && (
                            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ color: '#64748b', fontSize: '0.83rem' }}>{selectedCount} table{selectedCount !== 1 ? 's' : ''} selected · ~{totalLinkedRows} row{totalLinkedRows !== 1 ? 's' : ''} to delete</span>
                                <button disabled={selectedCount === 0} onClick={() => setStep('confirm')}
                                    style={{ background: selectedCount === 0 ? '#1e2d45' : '#991b1b', color: selectedCount === 0 ? '#475569' : 'white', border: 'none', borderRadius: 7, padding: '0.55rem 1.4rem', cursor: selectedCount === 0 ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.88rem' }}>
                                    Review & Confirm →
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* STEP 5: Confirm */}
                {step === 'confirm' && selectedRecord && (
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                            <button onClick={() => setStep('links')} style={{ background: 'none', border: '1px solid #1e2d45', borderRadius: 6, padding: '0.3rem 0.7rem', color: '#94a3b8', cursor: 'pointer', fontSize: '0.8rem' }}>← Back</button>
                            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#f87171' }}>⚠️ Confirm Permanent Deletion</h2>
                        </div>

                        <div style={{ background: '#1a0a0a', border: '1px solid #7f1d1d', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
                            <div style={{ marginBottom: '1rem' }}>
                                <div style={{ color: '#fca5a5', fontWeight: 700, fontSize: '0.9rem', marginBottom: 4 }}>You are about to delete:</div>
                                <div style={{ color: '#ef4444', fontSize: '1rem', fontWeight: 800 }}>{getRecordDisplay(selectedRecord, selectedType)}</div>
                                <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>ID {selectedRecord.id} · {typeDef?.label}</div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                {linkedGroups.filter(g => checked[g.key] && g.count > 0).map(g => (
                                    <div key={g.key} style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.82rem', padding: '0.25rem 0', borderBottom: '1px solid #2d1515' }}>
                                        <span>{g.label}</span>
                                        <span style={{ color: '#ef4444', fontWeight: 600 }}>{g.count} rows</span>
                                    </div>
                                ))}
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fca5a5', fontSize: '0.85rem', fontWeight: 700, paddingTop: '0.5rem' }}>
                                    <span>Total rows to delete</span>
                                    <span>{totalLinkedRows}</span>
                                </div>
                            </div>
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.83rem', marginBottom: 8 }}>Type <strong style={{ color: '#ef4444' }}>CONFIRM DELETE</strong> to enable the delete button:</label>
                            <input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="CONFIRM DELETE"
                                style={{ background: '#0f1a2e', border: '1px solid #7f1d1d', borderRadius: 7, padding: '0.65rem 1rem', color: '#e2e8f0', fontSize: '0.9rem', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                        </div>

                        {deleteError && (
                            <div style={{ background: '#1a0a0a', border: '1px solid #7f1d1d', borderRadius: 7, padding: '0.75rem 1rem', color: '#fca5a5', fontSize: '0.83rem', marginBottom: '1rem' }}>
                                ❌ {deleteError}
                            </div>
                        )}

                        <button
                            disabled={confirmText !== 'CONFIRM DELETE' || deleting}
                            onClick={handleDelete}
                            style={{ background: confirmText === 'CONFIRM DELETE' && !deleting ? '#dc2626' : '#3f1212', color: confirmText === 'CONFIRM DELETE' ? 'white' : '#64748b', border: 'none', borderRadius: 8, padding: '0.75rem 2rem', fontWeight: 800, fontSize: '1rem', cursor: confirmText === 'CONFIRM DELETE' && !deleting ? 'pointer' : 'not-allowed', width: '100%' }}>
                            {deleting ? '⏳ Deleting…' : '🗑️ Delete Permanently'}
                        </button>
                    </div>
                )}

                {/* DONE */}
                {step === 'done' && (
                    <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>✅</div>
                        <h2 style={{ color: '#34d399', fontSize: '1.2rem', fontWeight: 700, marginBottom: 8 }}>Deletion Complete</h2>
                        <p style={{ color: '#64748b', fontSize: '0.88rem', marginBottom: '1.5rem' }}>The following tables were affected:</p>
                        <div style={{ background: '#0c1525', border: '1px solid #1e3a5f', borderRadius: 10, padding: '1rem', marginBottom: '1.5rem', maxWidth: 480, margin: '0 auto 1.5rem' }}>
                            {deleteResults.map(r => (
                                <div key={r.key} style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.83rem', padding: '0.3rem 0', borderBottom: '1px solid #1e2d45' }}>
                                    <span style={{ fontFamily: 'monospace' }}>{r.table}</span>
                                    <span style={{ color: r.rowCount > 0 ? '#34d399' : '#475569', fontWeight: 600 }}>{r.rowCount} deleted</span>
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                            <button onClick={() => { setStep('record'); setSelectedRecord(null); setConfirmText(''); setDeleteResults([]); }}
                                style={{ background: '#1e3a5f', color: '#60a5fa', border: 'none', borderRadius: 7, padding: '0.6rem 1.4rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem' }}>
                                Delete Another Record
                            </button>
                            <button onClick={reset}
                                style={{ background: '#0f1a2e', color: '#94a3b8', border: '1px solid #1e2d45', borderRadius: 7, padding: '0.6rem 1.4rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <RotateCcw size={15} /> Start Over
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// Helper display functions (mirrors server-side displayName/subLabel per type)
function getRecordDisplay(rec: any, type: string): string {
    switch (type) {
        case 'organization': return rec.name || `Org #${rec.id}`;
        case 'location': return rec.name || `Location #${rec.id}`;
        case 'user': return rec.first_name && rec.last_name ? `${rec.first_name} ${rec.last_name}` : rec.email || `User #${rec.id}`;
        case 'item': return rec.name || `Item #${rec.id}`;
        case 'category': return rec.name || `Category #${rec.id}`;
        case 'incident': return rec.person_name || `Incident #${rec.id}`;
        case 'barred_person': return rec.name || `Barred #${rec.id}`;
        case 'custom_report': return rec.name || `Report #${rec.id}`;
        case 'shift': return rec.label || `Shift #${rec.id}`;
        case 'shift_close': return rec.user_name || `Shift Close #${rec.id}`;
        case 'schedule': return rec.user_name ? `${rec.user_name} — ${rec.date || ''}` : `Schedule #${rec.id}`;
        case 'purchase_order': return `PO #${rec.id}${rec.supplier_name ? ' — ' + rec.supplier_name : ''}`;
        case 'supplier': return rec.name || `Supplier #${rec.id}`;
        case 'support_ticket': return rec.subject || `Ticket #${rec.id}`;
        case 'price_override': return rec.item_name || `Price Override #${rec.id}`;
        default: return `Record #${rec.id}`;
    }
}

function getRecordSub(rec: any, type: string): string {
    switch (type) {
        case 'organization': return `${rec.subdomain ? '@' + rec.subdomain + ' · ' : ''}${rec.billing_status} · ${rec.subscription_plan}`;
        case 'location': return rec.address || '';
        case 'user': return `${rec.email || ''} · ${rec.role}`;
        case 'item': return `${rec.type}${rec.archived_at ? ' · Archived' : ''}`;
        case 'incident': return [rec.case_number, rec.incident_date].filter(Boolean).join(' · ');
        case 'barred_person': return rec.trespassed ? 'Trespassed' : '';
        case 'custom_report': return rec.created_at ? `Created ${new Date(rec.created_at).toLocaleDateString()}` : '';
        case 'shift': return `${rec.start_time || ''} – ${rec.end_time || ''}`;
        case 'shift_close': return rec.closed_at ? new Date(rec.closed_at).toLocaleString() : '';
        case 'schedule': return `${rec.date || ''} · ${rec.shift_label || 'Shift #' + rec.shift_id}`;
        case 'purchase_order': return `${rec.status} · ${rec.created_at ? new Date(rec.created_at).toLocaleDateString() : ''}`;
        case 'supplier': return rec.contact_email || '';
        case 'support_ticket': return rec.status;
        case 'price_override': return `${rec.location_name || ''} · $${rec.sale_price}`;
        default: return '';
    }
}
