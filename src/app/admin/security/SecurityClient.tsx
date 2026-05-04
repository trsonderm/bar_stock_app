'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { AlertTriangle, Trash2, Plus, X, User, ArchiveRestore, Clock } from 'lucide-react';

interface BarredPerson {
    id: number;
    name: string;
    aliases: string[];
    photo: string | null;
    description: string | null;
    barred_by_name: string | null;
    barred_by_display: string | null;
    trespassed: boolean;
    barred_until: string | null;
    is_archived: boolean;
    archived_at: string | null;
    created_at: string;
}

interface MediaItem {
    type: 'image' | 'video';
    data: string;
    name: string;
}

interface Incident {
    id: number;
    barred_person_id: number | null;
    barred_person_name: string | null;
    barred_person_photo: string | null;
    person_name: string | null;
    description: string;
    submitted_by_name: string;
    media: MediaItem[];
    created_at: string;
}

type Duration = 'permanent' | '1week' | '30days' | 'custom';

function computeBarredUntil(duration: Duration, customDate: string): string | null {
    if (duration === 'permanent') return null;
    if (duration === '1week') {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        return d.toISOString();
    }
    if (duration === '30days') {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return d.toISOString();
    }
    return customDate ? new Date(customDate).toISOString() : null;
}

function formatUntil(iso: string | null): string {
    if (!iso) return 'Permanent';
    const d = new Date(iso);
    const diff = d.getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const days = Math.ceil(diff / 86400000);
    if (days === 1) return 'Expires tomorrow';
    if (days < 30) return `Expires in ${days}d`;
    return `Until ${d.toLocaleDateString()}`;
}

function Avatar({ name, src, size = 48 }: { name: string; src?: string | null; size?: number }) {
    if (src) return <img src={src} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
    return (
        <div style={{ width: size, height: size, borderRadius: '50%', background: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.38, color: '#9ca3af', flexShrink: 0 }}>
            <User size={size * 0.45} />
        </div>
    );
}

function timeAgo(iso: string) {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(iso).toLocaleDateString();
}

function DurationPicker({ value, onChange, customDate, onCustomDate }: {
    value: Duration;
    onChange: (d: Duration) => void;
    customDate: string;
    onCustomDate: (v: string) => void;
}) {
    const options: { key: Duration; label: string }[] = [
        { key: 'permanent', label: 'Permanent' },
        { key: '1week', label: '1 Week' },
        { key: '30days', label: '30 Days' },
        { key: 'custom', label: 'Custom' },
    ];
    return (
        <div>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {options.map(o => (
                    <button key={o.key} onClick={() => onChange(o.key)} type="button"
                        style={{ padding: '0.4rem 0.85rem', borderRadius: '6px', border: `1px solid ${value === o.key ? '#3b82f6' : '#374151'}`, background: value === o.key ? '#1d4ed8' : '#1f2937', color: value === o.key ? 'white' : '#9ca3af', cursor: 'pointer', fontSize: '0.8rem', fontWeight: value === o.key ? 700 : 400 }}>
                        {o.label}
                    </button>
                ))}
            </div>
            {value === 'custom' && (
                <input type="date" value={customDate} onChange={e => onCustomDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    style={{ marginTop: '0.5rem', background: '#111827', border: '1px solid #374151', borderRadius: '8px', color: 'white', padding: '0.5rem 0.75rem', fontSize: '0.875rem', outline: 'none', width: '100%' }} />
            )}
        </div>
    );
}

// ── Canvas circle cropper ──────────────────────────────────────────────────
function CircleCropper({ src, onSave, onCancel }: { src: string; onSave: (dataUrl: string) => void; onCancel: () => void }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [scale, setScale] = useState(1);
    const [ox, setOx] = useState(0);
    const [oy, setOy] = useState(0);
    const [dragging, setDragging] = useState(false);
    const drag = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
    const imgRef = useRef<HTMLImageElement | null>(null);
    const SIZE = 260;

    useEffect(() => {
        const img = new Image();
        img.onload = () => { imgRef.current = img; setScale(Math.max(SIZE / img.width, SIZE / img.height)); setOx(0); setOy(0); };
        img.src = src;
    }, [src]);

    useEffect(() => {
        const img = imgRef.current; const canvas = canvasRef.current;
        if (!img || !canvas) return;
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, SIZE, SIZE);
        ctx.save();
        ctx.beginPath();
        ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
        ctx.clip();
        const w = img.width * scale; const h = img.height * scale;
        ctx.drawImage(img, SIZE / 2 - w / 2 + ox, SIZE / 2 - h / 2 + oy, w, h);
        ctx.restore();
        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 1, 0, Math.PI * 2); ctx.stroke();
    }, [scale, ox, oy]);

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ color: 'white', margin: 0 }}>Crop Photo</h3>
            <p style={{ color: '#9ca3af', margin: 0, fontSize: '0.85rem' }}>Drag to reposition · Scroll or slider to zoom</p>
            <canvas ref={canvasRef} width={SIZE} height={SIZE}
                style={{ borderRadius: '50%', cursor: dragging ? 'grabbing' : 'grab', border: '2px solid #374151' }}
                onMouseDown={e => { setDragging(true); drag.current = { x: e.clientX, y: e.clientY, ox, oy }; }}
                onMouseMove={e => { if (!dragging) return; setOx(drag.current.ox + e.clientX - drag.current.x); setOy(drag.current.oy + e.clientY - drag.current.y); }}
                onMouseUp={() => setDragging(false)} onMouseLeave={() => setDragging(false)}
                onWheel={e => setScale(s => Math.max(0.3, Math.min(5, s - e.deltaY * 0.002)))}
            />
            <input type="range" min="0.3" max="5" step="0.05" value={scale} onChange={e => setScale(parseFloat(e.target.value))} style={{ width: '200px', accentColor: '#ef4444' }} />
            <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={() => onSave(canvasRef.current!.toDataURL('image/jpeg', 0.85))}
                    style={{ background: '#ef4444', color: 'white', border: 'none', padding: '0.6rem 1.5rem', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>
                    Use Photo
                </button>
                <button onClick={onCancel} style={{ background: '#374151', color: '#d1d5db', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '8px', cursor: 'pointer' }}>
                    Cancel
                </button>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function SecurityClient({
    myUserId, myName, canAddBarred, canDeleteBarred, canAddIncident,
}: {
    myUserId: number;
    myName: string;
    canAddBarred: boolean;
    canDeleteBarred: boolean;
    canAddIncident: boolean;
}) {
    const [tab, setTab] = useState<'barred' | 'incidents'>('barred');
    const [barredTab, setBarredTab] = useState<'active' | 'archived'>('active');
    const [barred, setBarred] = useState<BarredPerson[]>([]);
    const [archivedBarred, setArchivedBarred] = useState<BarredPerson[]>([]);
    const [incidents, setIncidents] = useState<Incident[]>([]);
    const [loading, setLoading] = useState(true);

    // Add barred modal
    const [showAddBarred, setShowAddBarred] = useState(false);
    const [bName, setBName] = useState('');
    const [bAliasInput, setBaliasInput] = useState('');
    const [bAliases, setBAliases] = useState<string[]>([]);
    const [bDescription, setBDescription] = useState('');
    const [bTrespassed, setBTrespassed] = useState(false);
    const [bPhoto, setBPhoto] = useState<string | null>(null);
    const [bCropSrc, setBCropSrc] = useState<string | null>(null);
    const [bDuration, setBDuration] = useState<Duration>('permanent');
    const [bCustomDate, setBCustomDate] = useState('');
    const [bSaving, setBSaving] = useState(false);
    const bFileRef = useRef<HTMLInputElement>(null);

    // Restore modal
    const [restorePerson, setRestorePerson] = useState<BarredPerson | null>(null);
    const [rDuration, setRDuration] = useState<Duration>('permanent');
    const [rCustomDate, setRCustomDate] = useState('');
    const [rSaving, setRSaving] = useState(false);

    // Add incident modal
    const [showAddIncident, setShowAddIncident] = useState(false);
    const [iPersonId, setIPersonId] = useState('');
    const [iPersonName, setIPersonName] = useState('');
    const [iDescription, setIDescription] = useState('');
    const [iMedia, setIMedia] = useState<MediaItem[]>([]);
    const [iSaving, setISaving] = useState(false);
    const iMediaRef = useRef<HTMLInputElement>(null);

    // Trespass notification banner
    const [showTrespassBanner, setShowTrespassBanner] = useState(false);
    const [trespassName, setTrespassName] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        const [bRes, bArchRes, iRes] = await Promise.all([
            fetch('/api/admin/security/barred').then(r => r.json()),
            fetch('/api/admin/security/barred?archived=true').then(r => r.json()),
            fetch('/api/admin/security/incidents').then(r => r.json()),
        ]);
        setBarred(bRes.barred || []);
        setArchivedBarred(bArchRes.barred || []);
        setIncidents(iRes.incidents || []);
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        const trespassed = barred.filter(p => p.trespassed);
        if (trespassed.length > 0) {
            setTrespassName(trespassed.map(p => p.name).join(', '));
            setShowTrespassBanner(true);
        }
    }, [barred]);

    const handleBarredPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => setBCropSrc(ev.target?.result as string);
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        files.forEach(file => {
            if (file.size > 50 * 1024 * 1024) { alert(`${file.name} exceeds 50MB limit`); return; }
            const reader = new FileReader();
            reader.onload = ev => {
                const data = ev.target?.result as string;
                const type = file.type.startsWith('video/') ? 'video' : 'image';
                setIMedia(prev => [...prev, { type, data, name: file.name }]);
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    };

    const saveBarred = async () => {
        if (!bName.trim()) return;
        setBSaving(true);
        const barred_until = computeBarredUntil(bDuration, bCustomDate);
        const res = await fetch('/api/admin/security/barred', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: bName.trim(), aliases: bAliases, photo: bPhoto, description: bDescription, trespassed: bTrespassed, barred_until }),
        });
        setBSaving(false);
        if (res.ok) {
            setShowAddBarred(false);
            setBName(''); setBAliases([]); setBDescription(''); setBTrespassed(false); setBPhoto(null);
            setBDuration('permanent'); setBCustomDate('');
            load();
        }
    };

    const deleteBarred = async (id: number, name: string) => {
        if (!confirm(`Permanently delete ${name} from barred list?`)) return;
        await fetch(`/api/admin/security/barred?id=${id}`, { method: 'DELETE' });
        load();
    };

    const restoreBarred = async () => {
        if (!restorePerson) return;
        setRSaving(true);
        const barred_until = computeBarredUntil(rDuration, rCustomDate);
        await fetch('/api/admin/security/barred', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: restorePerson.id, barred_until }),
        });
        setRSaving(false);
        setRestorePerson(null);
        setRDuration('permanent');
        setRCustomDate('');
        load();
    };

    const saveIncident = async () => {
        if (!iDescription.trim()) return;
        setISaving(true);
        const res = await fetch('/api/admin/security/incidents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                barred_person_id: iPersonId ? parseInt(iPersonId) : null,
                person_name: iPersonName || null,
                description: iDescription,
                media: iMedia,
            }),
        });
        setISaving(false);
        if (res.ok) {
            setShowAddIncident(false);
            setIPersonId(''); setIPersonName(''); setIDescription(''); setIMedia([]);
            load();
        }
    };

    const deleteIncident = async (id: number) => {
        if (!confirm('Delete this incident report?')) return;
        await fetch(`/api/admin/security/incidents?id=${id}`, { method: 'DELETE' });
        load();
    };

    const card: React.CSSProperties = { background: '#1f2937', border: '1px solid #374151', borderRadius: '12px', padding: '1.25rem', marginBottom: '0.75rem' };
    const inp: React.CSSProperties = { width: '100%', background: '#111827', border: '1px solid #374151', borderRadius: '8px', color: 'white', padding: '0.6rem 0.9rem', fontSize: '0.9rem', outline: 'none' };
    const lbl: React.CSSProperties = { color: '#9ca3af', fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' };

    const activeBarred = barred;

    return (
        <div style={{ maxWidth: '860px', margin: '0 auto', padding: '1.5rem 1rem', color: 'white' }}>
            {bCropSrc && <CircleCropper src={bCropSrc} onSave={url => { setBPhoto(url); setBCropSrc(null); }} onCancel={() => setBCropSrc(null)} />}

            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>Security</h1>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.25rem' }}>Manage barred persons and incident reports for your venue.</p>

            {showTrespassBanner && (
                <div style={{ background: '#7f1d1d', border: '2px solid #ef4444', borderRadius: '10px', padding: '0.9rem 1.1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <AlertTriangle size={22} color="#fca5a5" style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                        <div style={{ color: '#fca5a5', fontWeight: 700, fontSize: '0.95rem' }}>⚠ TRESPASS NOTICE</div>
                        <div style={{ color: '#fecaca', fontSize: '0.875rem', marginTop: '2px' }}>
                            The following person(s) have active trespass orders and must not be allowed entry: <strong>{trespassName}</strong>
                        </div>
                    </div>
                    <button onClick={() => setShowTrespassBanner(false)} style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', flexShrink: 0 }}>
                        <X size={18} />
                    </button>
                </div>
            )}

            {/* Main tabs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', background: '#111827', borderRadius: '8px', border: '1px solid #374151', overflow: 'hidden', flex: 1, minWidth: '200px' }}>
                    {(['barred', 'incidents'] as const).map(t => (
                        <button key={t} onClick={() => setTab(t)} style={{
                            flex: 1, padding: '0.6rem 1rem', border: 'none', fontWeight: tab === t ? 700 : 400,
                            background: tab === t ? '#1d4ed8' : 'transparent', color: tab === t ? 'white' : '#9ca3af',
                            cursor: 'pointer', fontSize: '0.875rem', textTransform: 'capitalize',
                        }}>
                            {t === 'barred' ? `🚫 Barred List (${activeBarred.length})` : `📋 Incidents (${incidents.length})`}
                        </button>
                    ))}
                </div>
                {tab === 'barred' && canAddBarred && (
                    <button onClick={() => setShowAddBarred(true)}
                        style={{ background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', padding: '0.6rem 1rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem' }}>
                        <Plus size={15} /> Add Person
                    </button>
                )}
                {tab === 'incidents' && canAddIncident && (
                    <button onClick={() => setShowAddIncident(true)}
                        style={{ background: '#d97706', color: 'white', border: 'none', borderRadius: '8px', padding: '0.6rem 1rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem' }}>
                        <Plus size={15} /> Add Incident
                    </button>
                )}
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', color: '#6b7280', padding: '3rem' }}>Loading…</div>
            ) : tab === 'barred' ? (
                <>
                    {/* Active / Archived sub-tabs */}
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                        {(['active', 'archived'] as const).map(st => (
                            <button key={st} onClick={() => setBarredTab(st)} style={{
                                padding: '0.4rem 1rem', borderRadius: '6px', border: `1px solid ${barredTab === st ? '#374151' : 'transparent'}`,
                                background: barredTab === st ? '#374151' : 'transparent', color: barredTab === st ? 'white' : '#6b7280',
                                cursor: 'pointer', fontSize: '0.8rem', fontWeight: barredTab === st ? 700 : 400,
                            }}>
                                {st === 'active' ? `Active (${activeBarred.length})` : `Archived (${archivedBarred.length})`}
                            </button>
                        ))}
                    </div>

                    {barredTab === 'active' ? (
                        activeBarred.length === 0 ? (
                            <div style={{ textAlign: 'center', color: '#6b7280', padding: '3rem', border: '2px dashed #374151', borderRadius: '12px' }}>
                                No persons on the barred list.
                            </div>
                        ) : activeBarred.map(person => (
                            <div key={person.id} style={{ ...card, display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                <div style={{ position: 'relative', flexShrink: 0 }}>
                                    <Avatar name={person.name} src={person.photo} size={72} />
                                    {person.trespassed && (
                                        <div style={{ position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)', background: '#dc2626', color: 'white', fontSize: '0.6rem', fontWeight: 700, padding: '1px 6px', borderRadius: '999px', whiteSpace: 'nowrap' }}>
                                            TRESPASS
                                        </div>
                                    )}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        <div>
                                            <span style={{ fontWeight: 700, fontSize: '1rem', color: 'white' }}>{person.name}</span>
                                            {person.trespassed && (
                                                <span style={{ background: '#7f1d1d', color: '#fca5a5', fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', marginLeft: '0.5rem', border: '1px solid #dc2626' }}>
                                                    ⚠ TRESPASSED
                                                </span>
                                            )}
                                        </div>
                                        {canDeleteBarred && (
                                            <button onClick={() => deleteBarred(person.id, person.name)}
                                                style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '4px', flexShrink: 0 }}>
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                    {person.aliases?.length > 0 && (
                                        <div style={{ color: '#9ca3af', fontSize: '0.8rem', marginTop: '3px' }}>
                                            Also known as: {person.aliases.join(', ')}
                                        </div>
                                    )}
                                    {person.description && (
                                        <p style={{ color: '#d1d5db', fontSize: '0.875rem', margin: '0.4rem 0 0', lineHeight: 1.5 }}>{person.description}</p>
                                    )}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                                        <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                                            Barred by {person.barred_by_display || person.barred_by_name || 'Unknown'} · {timeAgo(person.created_at)}
                                        </span>
                                        {person.barred_until && (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#f59e0b', fontSize: '0.72rem', fontWeight: 600 }}>
                                                <Clock size={11} /> {formatUntil(person.barred_until)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        archivedBarred.length === 0 ? (
                            <div style={{ textAlign: 'center', color: '#6b7280', padding: '3rem', border: '2px dashed #374151', borderRadius: '12px' }}>
                                No archived persons.
                            </div>
                        ) : archivedBarred.map(person => (
                            <div key={person.id} style={{ ...card, display: 'flex', gap: '1rem', alignItems: 'flex-start', opacity: 0.8 }}>
                                <Avatar name={person.name} src={person.photo} size={60} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#9ca3af' }}>{person.name}</span>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            {canAddBarred && (
                                                <button onClick={() => { setRestorePerson(person); setRDuration('permanent'); setRCustomDate(''); }}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>
                                                    <ArchiveRestore size={13} /> Restore
                                                </button>
                                            )}
                                            {canDeleteBarred && (
                                                <button onClick={() => deleteBarred(person.id, person.name)}
                                                    style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '4px' }}>
                                                    <Trash2 size={15} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {person.description && (
                                        <p style={{ color: '#6b7280', fontSize: '0.8rem', margin: '0.3rem 0 0', lineHeight: 1.4 }}>{person.description}</p>
                                    )}
                                    <div style={{ color: '#4b5563', fontSize: '0.72rem', marginTop: '0.3rem' }}>
                                        Archived {person.archived_at ? timeAgo(person.archived_at) : ''} · Barred by {person.barred_by_display || person.barred_by_name || 'Unknown'}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </>
            ) : (
                <>
                    {incidents.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#6b7280', padding: '3rem', border: '2px dashed #374151', borderRadius: '12px' }}>
                            No incident reports yet.
                        </div>
                    ) : incidents.map(inc => (
                        <div key={inc.id} style={{ ...card, display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                            <div style={{ flexShrink: 0 }}>
                                <Avatar name={inc.barred_person_name || inc.person_name || '?'} src={inc.barred_person_photo} size={52} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
                                    <div>
                                        <span style={{ fontWeight: 700, color: 'white', fontSize: '0.95rem' }}>
                                            {inc.barred_person_name || inc.person_name || 'Unknown person'}
                                        </span>
                                        {inc.barred_person_id && (
                                            <span style={{ background: '#1e3a5f', color: '#60a5fa', fontSize: '0.72rem', padding: '2px 7px', borderRadius: '999px', marginLeft: '0.5rem' }}>on barred list</span>
                                        )}
                                    </div>
                                    <button onClick={() => deleteIncident(inc.id)}
                                        style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '4px', flexShrink: 0 }}>
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                                <p style={{ color: '#d1d5db', fontSize: '0.875rem', margin: '0.35rem 0 0', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{inc.description}</p>
                                {inc.media && inc.media.length > 0 && (
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
                                        {inc.media.map((m, i) => (
                                            m.type === 'image' ? (
                                                <a key={i} href={m.data} target="_blank" rel="noreferrer">
                                                    <img src={m.data} alt={m.name} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: '6px', border: '1px solid #374151', cursor: 'pointer' }} />
                                                </a>
                                            ) : (
                                                <video key={i} src={m.data} controls style={{ width: 160, maxHeight: 120, borderRadius: '6px', border: '1px solid #374151' }} />
                                            )
                                        ))}
                                    </div>
                                )}
                                <div style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '0.4rem' }}>
                                    Reported by {inc.submitted_by_name} · {timeAgo(inc.created_at)}
                                </div>
                            </div>
                        </div>
                    ))}
                </>
            )}

            {/* ── Add Barred Modal ───────────────────────────────────────────────── */}
            {showAddBarred && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: '12px', width: '100%', maxWidth: '500px', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid #1f2937' }}>
                            <h2 style={{ margin: 0, color: 'white', fontSize: '1.05rem', fontWeight: 700 }}>Add Person to Barred List</h2>
                            <button onClick={() => setShowAddBarred(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1 }}>×</button>
                        </div>
                        <div style={{ padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                            {/* Photo */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => bFileRef.current?.click()}>
                                    <Avatar name={bName || '?'} src={bPhoto} size={72} />
                                    <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0 }}
                                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0'; }}>
                                        <span style={{ color: 'white', fontSize: '0.7rem', fontWeight: 700 }}>PHOTO</span>
                                    </div>
                                </div>
                                <div>
                                    <button onClick={() => bFileRef.current?.click()}
                                        style={{ background: '#374151', color: '#d1d5db', border: 'none', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer', fontSize: '0.8rem' }}>
                                        Upload Photo
                                    </button>
                                    {bPhoto && (
                                        <button onClick={() => setBPhoto(null)}
                                            style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '0.8rem', marginLeft: '0.5rem' }}>
                                            Remove
                                        </button>
                                    )}
                                    <p style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '4px' }}>Drag & resize after upload</p>
                                </div>
                                <input ref={bFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleBarredPhotoChange} />
                            </div>

                            {/* Name */}
                            <div>
                                <label style={lbl}>Full Name *</label>
                                <input value={bName} onChange={e => setBName(e.target.value)} style={inp} placeholder="First Last" autoFocus />
                            </div>

                            {/* Aliases */}
                            <div>
                                <label style={lbl}>Aliases / Also Known As</label>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <input value={bAliasInput} onChange={e => setBaliasInput(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && bAliasInput.trim()) {
                                                e.preventDefault();
                                                setBAliases(prev => [...prev, bAliasInput.trim()]);
                                                setBaliasInput('');
                                            }
                                        }}
                                        style={{ ...inp, flex: 1 }} placeholder="Type alias and press Enter" />
                                    <button onClick={() => { if (bAliasInput.trim()) { setBAliases(prev => [...prev, bAliasInput.trim()]); setBaliasInput(''); } }}
                                        style={{ background: '#374151', border: 'none', borderRadius: '8px', color: 'white', padding: '0 1rem', cursor: 'pointer' }}>+</button>
                                </div>
                                {bAliases.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
                                        {bAliases.map((a, i) => (
                                            <span key={i} style={{ background: '#374151', color: '#d1d5db', padding: '3px 10px', borderRadius: '999px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                {a}
                                                <button onClick={() => setBAliases(prev => prev.filter((_, j) => j !== i))}
                                                    style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 0, fontSize: '0.9rem', lineHeight: 1 }}>×</button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Description */}
                            <div>
                                <label style={lbl}>Description / Reason Barred</label>
                                <textarea value={bDescription} onChange={e => setBDescription(e.target.value)}
                                    placeholder="Describe what happened and why this person is barred…"
                                    style={{ ...inp, minHeight: '80px', resize: 'vertical' as const }} />
                            </div>

                            {/* Duration */}
                            <div>
                                <label style={lbl}>Ban Duration</label>
                                <DurationPicker value={bDuration} onChange={setBDuration} customDate={bCustomDate} onCustomDate={setBCustomDate} />
                            </div>

                            {/* Trespass checkbox */}
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer', background: bTrespassed ? '#7f1d1d' : '#1f2937', border: `2px solid ${bTrespassed ? '#ef4444' : '#374151'}`, borderRadius: '8px', padding: '0.75rem', transition: 'all 0.2s' }}>
                                <input type="checkbox" checked={bTrespassed} onChange={e => setBTrespassed(e.target.checked)}
                                    style={{ width: 18, height: 18, marginTop: '1px', accentColor: '#ef4444', flexShrink: 0, cursor: 'pointer' }} />
                                <div>
                                    <div style={{ color: bTrespassed ? '#fca5a5' : 'white', fontWeight: 700 }}>⚠ Trespass Order Issued</div>
                                    <div style={{ color: bTrespassed ? '#fecaca' : '#6b7280', fontSize: '0.8rem', marginTop: '2px' }}>
                                        Checking this will display a visible trespass warning on the security page. This person is legally barred from the premises.
                                    </div>
                                </div>
                            </label>
                        </div>
                        <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid #1f2937', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowAddBarred(false)}
                                style={{ background: 'none', border: '1px solid #374151', color: '#9ca3af', padding: '0.6rem 1rem', borderRadius: '8px', cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button onClick={saveBarred} disabled={bSaving || !bName.trim()}
                                style={{ background: '#dc2626', color: 'white', border: 'none', padding: '0.6rem 1.25rem', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', opacity: (bSaving || !bName.trim()) ? 0.5 : 1 }}>
                                {bSaving ? 'Saving…' : 'Add to Barred List'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Restore Modal ─────────────────────────────────────────────────── */}
            {restorePerson && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: '12px', width: '100%', maxWidth: '420px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid #1f2937' }}>
                            <h2 style={{ margin: 0, color: 'white', fontSize: '1.05rem', fontWeight: 700 }}>Restore to Active List</h2>
                            <button onClick={() => setRestorePerson(null)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1 }}>×</button>
                        </div>
                        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <p style={{ color: '#d1d5db', margin: 0, fontSize: '0.9rem' }}>
                                Restore <strong>{restorePerson.name}</strong> to the active barred list. Set a new ban duration:
                            </p>
                            <DurationPicker value={rDuration} onChange={setRDuration} customDate={rCustomDate} onCustomDate={setRCustomDate} />
                        </div>
                        <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid #1f2937', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button onClick={() => setRestorePerson(null)}
                                style={{ background: 'none', border: '1px solid #374151', color: '#9ca3af', padding: '0.6rem 1rem', borderRadius: '8px', cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button onClick={restoreBarred} disabled={rSaving}
                                style={{ background: '#1d4ed8', color: 'white', border: 'none', padding: '0.6rem 1.25rem', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', opacity: rSaving ? 0.5 : 1 }}>
                                {rSaving ? 'Restoring…' : 'Restore'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Add Incident Modal ─────────────────────────────────────────────── */}
            {showAddIncident && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: '12px', width: '100%', maxWidth: '500px', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid #1f2937' }}>
                            <h2 style={{ margin: 0, color: 'white', fontSize: '1.05rem', fontWeight: 700 }}>Add Incident Report</h2>
                            <button onClick={() => setShowAddIncident(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1 }}>×</button>
                        </div>
                        <div style={{ padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                            {/* Link to barred person or free text */}
                            <div>
                                <label style={lbl}>Person Involved</label>
                                <select value={iPersonId} onChange={e => { setIPersonId(e.target.value); if (e.target.value) setIPersonName(''); }}
                                    style={{ ...inp, marginBottom: '0.5rem' }}>
                                    <option value="">— Select from barred list (optional) —</option>
                                    {activeBarred.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                                {!iPersonId && (
                                    <input value={iPersonName} onChange={e => setIPersonName(e.target.value)}
                                        placeholder="Or enter name manually…" style={inp} />
                                )}
                            </div>

                            {/* Description */}
                            <div>
                                <label style={lbl}>Incident Description *</label>
                                <textarea value={iDescription} onChange={e => setIDescription(e.target.value)}
                                    placeholder="Describe what happened, date/time, actions taken…"
                                    style={{ ...inp, minHeight: '100px', resize: 'vertical' as const }}
                                    autoFocus />
                            </div>

                            {/* Media upload */}
                            <div>
                                <label style={lbl}>Photos / Videos (max 50MB each)</label>
                                <button onClick={() => iMediaRef.current?.click()} type="button"
                                    style={{ background: '#374151', color: '#d1d5db', border: '1px dashed #4b5563', borderRadius: '8px', padding: '0.6rem 1rem', cursor: 'pointer', fontSize: '0.85rem', width: '100%' }}>
                                    + Attach Photos or Videos
                                </button>
                                <input ref={iMediaRef} type="file" accept="image/*,video/*" multiple style={{ display: 'none' }} onChange={handleMediaChange} />
                                {iMedia.length > 0 && (
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                                        {iMedia.map((m, i) => (
                                            <div key={i} style={{ position: 'relative' }}>
                                                {m.type === 'image' ? (
                                                    <img src={m.data} alt={m.name} style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: '6px', border: '1px solid #374151' }} />
                                                ) : (
                                                    <div style={{ width: 70, height: 70, background: '#1f2937', borderRadius: '6px', border: '1px solid #374151', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: '#9ca3af', textAlign: 'center', padding: '4px' }}>
                                                        🎬 {m.name.slice(0, 12)}
                                                    </div>
                                                )}
                                                <button onClick={() => setIMedia(prev => prev.filter((_, j) => j !== i))}
                                                    style={{ position: 'absolute', top: -6, right: -6, background: '#ef4444', border: 'none', borderRadius: '50%', width: 18, height: 18, color: 'white', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                                                    ×
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div style={{ background: '#1f2937', borderRadius: '6px', padding: '0.6rem 0.8rem' }}>
                                <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>Submitted by: </span>
                                <span style={{ color: '#d1d5db', fontSize: '0.8rem', fontWeight: 600 }}>{myName}</span>
                            </div>
                        </div>
                        <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid #1f2937', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowAddIncident(false)}
                                style={{ background: 'none', border: '1px solid #374151', color: '#9ca3af', padding: '0.6rem 1rem', borderRadius: '8px', cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button onClick={saveIncident} disabled={iSaving || !iDescription.trim()}
                                style={{ background: '#d97706', color: 'white', border: 'none', padding: '0.6rem 1.25rem', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', opacity: (iSaving || !iDescription.trim()) ? 0.5 : 1 }}>
                                {iSaving ? 'Saving…' : 'Submit Report'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
