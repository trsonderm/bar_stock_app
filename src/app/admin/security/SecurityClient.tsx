'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { AlertTriangle, Trash2, Plus, X, User, ArchiveRestore, Clock, Edit2 } from 'lucide-react';

interface BarredPerson {
    id: number;
    name: string;
    aliases: string[];
    photo: string | null;
    media?: MediaItem[];
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
    const [bPhotos, setBPhotos] = useState<MediaItem[]>([]);
    const [bPrimaryIdx, setBPrimaryIdx] = useState(0);
    const [bCropSrc, setBCropSrc] = useState<string | null>(null);
    const [bCropForIdx, setBCropForIdx] = useState<number | null>(null);
    const [bDuration, setBDuration] = useState<Duration>('permanent');
    const [bCustomDate, setBCustomDate] = useState('');
    const [bSaving, setBSaving] = useState(false);
    const bFileRef = useRef<HTMLInputElement>(null);
    // Import modal
    const [showImportBarred, setShowImportBarred] = useState(false);
    const [importRows, setImportRows] = useState<Array<{ name: string; aliases: string[]; description: string; barred_until: string | null; trespassed: boolean; photo_filename: string }>>([]);
    const [importing, setImporting] = useState(false);
    const importFileRef = useRef<HTMLInputElement>(null);

    // Restore modal
    const [restorePerson, setRestorePerson] = useState<BarredPerson | null>(null);
    const [rDuration, setRDuration] = useState<Duration>('permanent');
    const [rCustomDate, setRCustomDate] = useState('');
    const [rSaving, setRSaving] = useState(false);

    // Edit barred modal
    const [editPerson, setEditPerson] = useState<BarredPerson | null>(null);
    const [eName, setEName] = useState('');
    const [eAliasInput, setEAliasInput] = useState('');
    const [eAliases, setEAliases] = useState<string[]>([]);
    const [eDescription, setEDescription] = useState('');
    const [eTrespassed, setETrespassed] = useState(false);
    const [ePhotos, setEPhotos] = useState<MediaItem[]>([]);
    const [ePrimaryIdx, setEPrimaryIdx] = useState(0);
    const [eCropSrc, setECropSrc] = useState<string | null>(null);
    const [eCropForIdx, setECropForIdx] = useState<number | null>(null);
    const [eDuration, setEDuration] = useState<Duration>('permanent');
    const [eCustomDate, setECustomDate] = useState('');
    const [eSaving, setESaving] = useState(false);
    const eFileRef = useRef<HTMLInputElement>(null);

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

    const handleBarredMediaAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        files.forEach(file => {
            if (file.size > 50 * 1024 * 1024) { alert(`${file.name} exceeds 50MB`); return; }
            const reader = new FileReader();
            reader.onload = ev => {
                const data = ev.target?.result as string;
                const type = file.type.startsWith('video/') ? 'video' : 'image';
                setBPhotos(prev => [...prev, { type: type as 'image' | 'video', data, name: file.name }]);
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    };

    const downloadImportTemplate = () => {
        const csv = [
            'name,aliases,description,duration,trespassed,photo_filename',
            'John Doe,Johnny|JD,Aggressive behavior - multiple incidents,permanent,no,john_doe.jpg',
            'Jane Smith,,Theft on 2025-01-15,30days,no,',
            'Bob Johnson,Bobby,Trespass order issued,permanent,yes,',
        ].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'barred_list_template.csv'; a.click();
        URL.revokeObjectURL(url);
    };

    const parseCsvLine = (line: string): string[] => {
        const result: string[] = [];
        let current = ''; let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
                else inQuotes = !inQuotes;
            } else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
            else { current += ch; }
        }
        result.push(current);
        return result;
    };

    const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            const text = ev.target?.result as string;
            const lines = text.split(/\r?\n/).filter(Boolean);
            if (lines.length < 2) { alert('CSV appears empty or has no data rows'); return; }
            const header = lines[0].toLowerCase().split(',').map(h => h.trim());
            const nameIdx = header.indexOf('name');
            if (nameIdx === -1) { alert('CSV must have a "name" column'); return; }
            const aliasIdx = header.indexOf('aliases');
            const descIdx = header.indexOf('description');
            const durIdx = header.indexOf('duration');
            const tresIdx = header.indexOf('trespassed');
            const photoIdx = header.indexOf('photo_filename');
            const rows = lines.slice(1).map(line => {
                const cols = parseCsvLine(line);
                const name = cols[nameIdx]?.trim() || '';
                if (!name) return null;
                const aliases = aliasIdx !== -1 && cols[aliasIdx] ? cols[aliasIdx].split('|').map(a => a.trim()).filter(Boolean) : [];
                const description = descIdx !== -1 ? cols[descIdx]?.trim() || '' : '';
                const dur = durIdx !== -1 ? cols[durIdx]?.trim().toLowerCase() : 'permanent';
                const trespassed = tresIdx !== -1 ? ['yes', 'true', '1'].includes((cols[tresIdx] || '').trim().toLowerCase()) : false;
                const photo_filename = photoIdx !== -1 ? cols[photoIdx]?.trim() || '' : '';
                let barred_until: string | null = null;
                if (dur && dur !== 'permanent') {
                    if (dur === '1week') { const d = new Date(); d.setDate(d.getDate() + 7); barred_until = d.toISOString(); }
                    else if (dur === '30days') { const d = new Date(); d.setDate(d.getDate() + 30); barred_until = d.toISOString(); }
                    else { const days = parseInt(dur); if (!isNaN(days) && days > 0) { const d = new Date(); d.setDate(d.getDate() + days); barred_until = d.toISOString(); } }
                }
                return { name, aliases, description, barred_until, trespassed, photo_filename };
            }).filter(Boolean) as typeof importRows;
            setImportRows(rows);
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const handleImport = async () => {
        if (importRows.length === 0) return;
        setImporting(true);
        let ok = 0;
        for (const row of importRows) {
            const res = await fetch('/api/admin/security/barred', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: row.name, aliases: row.aliases, photo: null, media: [], description: row.description || null, trespassed: row.trespassed, barred_until: row.barred_until }),
            });
            if (res.ok) ok++;
        }
        setImporting(false);
        setShowImportBarred(false);
        setImportRows([]);
        alert(`Imported ${ok} of ${importRows.length} person(s). Photos must be added manually via Edit.`);
        load();
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
        const primaryPhoto = bPhotos[bPrimaryIdx]?.type === 'image' ? bPhotos[bPrimaryIdx] : bPhotos.find(m => m.type === 'image');
        const additionalMedia = bPhotos.filter(m => m !== primaryPhoto);
        const res = await fetch('/api/admin/security/barred', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: bName.trim(), aliases: bAliases, photo: primaryPhoto?.data || null, media: additionalMedia, description: bDescription, trespassed: bTrespassed, barred_until }),
        });
        setBSaving(false);
        if (res.ok) {
            setShowAddBarred(false);
            setBName(''); setBAliases([]); setBDescription(''); setBTrespassed(false);
            setBPhotos([]); setBPrimaryIdx(0);
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

    const openEdit = (person: BarredPerson) => {
        setEditPerson(person);
        setEName(person.name);
        setEAliases(Array.isArray(person.aliases) ? person.aliases : []);
        setEAliasInput('');
        setEDescription(person.description || '');
        setETrespassed(person.trespassed);
        // Reconstruct media array from photo + media fields
        const photos: MediaItem[] = [];
        if (person.photo) photos.push({ type: 'image', data: person.photo, name: 'photo' });
        if (Array.isArray(person.media)) {
            person.media.forEach((m: MediaItem) => photos.push(m));
        }
        setEPhotos(photos);
        setEPrimaryIdx(0);
        // Infer duration from barred_until
        if (!person.barred_until) {
            setEDuration('permanent');
        } else {
            setEDuration('custom');
            setECustomDate(new Date(person.barred_until).toISOString().split('T')[0]);
        }
    };

    const saveEdit = async () => {
        if (!editPerson || !eName.trim()) return;
        setESaving(true);
        const barred_until = computeBarredUntil(eDuration, eCustomDate);
        const primaryPhoto = ePhotos[ePrimaryIdx]?.type === 'image' ? ePhotos[ePrimaryIdx] : ePhotos.find(m => m.type === 'image');
        const additionalMedia = ePhotos.filter(m => m !== primaryPhoto);
        await fetch('/api/admin/security/barred', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: editPerson.id,
                name: eName.trim(),
                aliases: eAliases,
                photo: primaryPhoto?.data || null,
                media: additionalMedia,
                description: eDescription,
                trespassed: eTrespassed,
                barred_until,
            }),
        });
        setESaving(false);
        setEditPerson(null);
        load();
    };

    const handleEditMediaAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        files.forEach(file => {
            if (file.size > 50 * 1024 * 1024) { alert(`${file.name} exceeds 50MB`); return; }
            const reader = new FileReader();
            reader.onload = ev => {
                const data = ev.target?.result as string;
                const type = file.type.startsWith('video/') ? 'video' : 'image';
                setEPhotos(prev => [...prev, { type: type as 'image' | 'video', data, name: file.name }]);
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
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
            {bCropSrc && <CircleCropper src={bCropSrc}
                onSave={url => {
                    if (bCropForIdx !== null) {
                        setBPhotos(prev => prev.map((m, i) => i === bCropForIdx ? { ...m, data: url } : m));
                        setBCropForIdx(null);
                    }
                    setBCropSrc(null);
                }}
                onCancel={() => { setBCropSrc(null); setBCropForIdx(null); }} />}

            {eCropSrc && <CircleCropper src={eCropSrc}
                onSave={url => {
                    if (eCropForIdx !== null) {
                        setEPhotos(prev => prev.map((m, i) => i === eCropForIdx ? { ...m, data: url } : m));
                        setECropForIdx(null);
                    }
                    setECropSrc(null);
                }}
                onCancel={() => { setECropSrc(null); setECropForIdx(null); }} />}

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
                    <>
                        <button type="button" onClick={() => setShowImportBarred(true)}
                            style={{ background: '#374151', color: '#d1d5db', border: '1px solid #4b5563', borderRadius: '8px', padding: '0.6rem 1rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem' }}>
                            ⬆ Import CSV
                        </button>
                        <button type="button" onClick={() => setShowAddBarred(true)}
                            style={{ background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', padding: '0.6rem 1rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem' }}>
                            <Plus size={15} /> Add Person
                        </button>
                    </>
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
                                        <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                                            {canAddBarred && (
                                                <button type="button" onClick={() => openEdit(person)} title="Edit person"
                                                    style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '4px' }}>
                                                    <Edit2 size={15} />
                                                </button>
                                            )}
                                            {canDeleteBarred && (
                                                <button type="button" onClick={() => deleteBarred(person.id, person.name)} title="Delete person"
                                                    style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '4px' }}>
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
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

                            {/* Photos & Video */}
                            <div>
                                <label style={lbl}>Photos & Video</label>
                                {bPhotos.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.6rem' }}>
                                        {bPhotos.map((m, i) => (
                                            <div key={i} style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
                                                {m.type === 'image' ? (
                                                    <img src={m.data} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px', border: `2px solid ${i === bPrimaryIdx ? '#10b981' : '#374151'}` }} />
                                                ) : (
                                                    <div style={{ width: 80, height: 80, background: '#1f2937', borderRadius: '8px', border: `2px solid ${i === bPrimaryIdx ? '#10b981' : '#374151'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: '#9ca3af', textAlign: 'center', padding: '4px', gap: '2px' }}>
                                                        <span>🎬</span>
                                                        <span style={{ wordBreak: 'break-all' }}>{m.name.slice(0, 14)}</span>
                                                    </div>
                                                )}
                                                {i === bPrimaryIdx && m.type === 'image' && (
                                                    <div style={{ position: 'absolute', bottom: 3, left: 3, background: '#10b981', color: 'white', fontSize: '0.55rem', padding: '1px 5px', borderRadius: '999px', fontWeight: 700, pointerEvents: 'none' }}>PRIMARY</div>
                                                )}
                                                {i !== bPrimaryIdx && m.type === 'image' && (
                                                    <button type="button" onClick={() => setBPrimaryIdx(i)}
                                                        style={{ position: 'absolute', bottom: 3, left: 3, background: 'rgba(0,0,0,0.75)', color: '#10b981', border: '1px solid #10b981', fontSize: '0.55rem', padding: '1px 5px', borderRadius: '999px', cursor: 'pointer', fontWeight: 700 }}>
                                                        Primary
                                                    </button>
                                                )}
                                                <button type="button" onClick={() => {
                                                    setBPhotos(prev => {
                                                        const next = prev.filter((_, j) => j !== i);
                                                        setBPrimaryIdx(p => p >= next.length ? Math.max(0, next.length - 1) : i < p ? p - 1 : p);
                                                        return next;
                                                    });
                                                }} style={{ position: 'absolute', top: -6, right: -6, background: '#ef4444', border: 'none', borderRadius: '50%', width: 18, height: 18, color: 'white', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>×</button>
                                                {m.type === 'image' && (
                                                    <button type="button" onClick={() => { setBCropSrc(m.data); setBCropForIdx(i); }}
                                                        style={{ position: 'absolute', top: -6, left: -6, background: '#374151', border: '1px solid #4b5563', borderRadius: '50%', width: 18, height: 18, color: '#d1d5db', cursor: 'pointer', fontSize: '0.65rem', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }} title="Crop">✂</button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <button type="button" onClick={() => bFileRef.current?.click()}
                                    style={{ background: '#374151', color: '#d1d5db', border: '1px dashed #4b5563', borderRadius: '8px', padding: '0.6rem 1rem', cursor: 'pointer', fontSize: '0.85rem', width: '100%' }}>
                                    + Add Photos or Video
                                </button>
                                <input ref={bFileRef} type="file" accept="image/*,video/*" multiple style={{ display: 'none' }} onChange={handleBarredMediaAdd} />
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

            {/* ── Import CSV Modal ──────────────────────────────────────────────── */}
            {showImportBarred && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: '12px', width: '100%', maxWidth: '660px', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid #1f2937' }}>
                            <h2 style={{ margin: 0, color: 'white', fontSize: '1.05rem', fontWeight: 700 }}>Import Barred List from CSV</h2>
                            <button type="button" onClick={() => { setShowImportBarred(false); setImportRows([]); }} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1 }}>×</button>
                        </div>
                        <div style={{ padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '0.875rem', fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.6 }}>
                                <strong style={{ color: '#e2e8f0' }}>Columns:</strong> name · aliases (pipe-separated) · description · duration (permanent / 1week / 30days / number of days) · trespassed (yes/no) · photo_filename
                                <br /><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Photos cannot be imported via CSV — upload them manually after import.</span>
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                <button type="button" onClick={downloadImportTemplate}
                                    style={{ background: '#374151', color: '#d1d5db', border: '1px solid #4b5563', borderRadius: '8px', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    ⬇ Download Template
                                </button>
                                <button type="button" onClick={() => importFileRef.current?.click()}
                                    style={{ background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    📂 Choose CSV File
                                </button>
                                <input ref={importFileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleImportFile} />
                            </div>
                            {importRows.length > 0 && (
                                <>
                                    <div style={{ color: '#10b981', fontWeight: 600, fontSize: '0.875rem' }}>
                                        ✓ {importRows.length} person{importRows.length !== 1 ? 's' : ''} ready to import
                                    </div>
                                    <div style={{ overflowX: 'auto', border: '1px solid #1f2937', borderRadius: '8px' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid #374151', background: '#1f2937' }}>
                                                    {['Name', 'Aliases', 'Duration', 'Trespass', 'Photo Ref'].map(h => (
                                                        <th key={h} style={{ color: '#9ca3af', textAlign: 'left', padding: '0.5rem 0.75rem', fontWeight: 600 }}>{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {importRows.map((r, i) => (
                                                    <tr key={i} style={{ borderBottom: '1px solid #1f2937' }}>
                                                        <td style={{ color: 'white', padding: '0.4rem 0.75rem', fontWeight: 500 }}>{r.name}</td>
                                                        <td style={{ color: '#9ca3af', padding: '0.4rem 0.75rem' }}>{r.aliases.join(', ') || '—'}</td>
                                                        <td style={{ color: '#f59e0b', padding: '0.4rem 0.75rem' }}>{r.barred_until ? new Date(r.barred_until).toLocaleDateString() : 'Permanent'}</td>
                                                        <td style={{ padding: '0.4rem 0.75rem' }}>
                                                            {r.trespassed ? <span style={{ color: '#ef4444', fontWeight: 700 }}>⚠ Yes</span> : <span style={{ color: '#6b7280' }}>No</span>}
                                                        </td>
                                                        <td style={{ color: '#6b7280', padding: '0.4rem 0.75rem', fontStyle: r.photo_filename ? 'normal' : 'italic' }}>
                                                            {r.photo_filename || '—'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}
                        </div>
                        <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid #1f2937', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button type="button" onClick={() => { setShowImportBarred(false); setImportRows([]); }}
                                style={{ background: 'none', border: '1px solid #374151', color: '#9ca3af', padding: '0.6rem 1rem', borderRadius: '8px', cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button type="button" onClick={handleImport} disabled={importing || importRows.length === 0}
                                style={{ background: '#dc2626', color: 'white', border: 'none', padding: '0.6rem 1.25rem', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', opacity: (importing || importRows.length === 0) ? 0.5 : 1 }}>
                                {importing ? 'Importing…' : `Import ${importRows.length} Person${importRows.length !== 1 ? 's' : ''}`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Edit Barred Modal ─────────────────────────────────────────────── */}
            {editPerson && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: '12px', width: '100%', maxWidth: '500px', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid #1f2937' }}>
                            <h2 style={{ margin: 0, color: 'white', fontSize: '1.05rem', fontWeight: 700 }}>Edit Barred Person</h2>
                            <button type="button" onClick={() => setEditPerson(null)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1 }}>×</button>
                        </div>
                        <div style={{ padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                            {/* Photos & Video */}
                            <div>
                                <label style={lbl}>Photos & Video</label>
                                {ePhotos.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.6rem' }}>
                                        {ePhotos.map((m, i) => (
                                            <div key={i} style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
                                                {m.type === 'image' ? (
                                                    <img src={m.data} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px', border: `2px solid ${i === ePrimaryIdx ? '#10b981' : '#374151'}` }} />
                                                ) : (
                                                    <div style={{ width: 80, height: 80, background: '#1f2937', borderRadius: '8px', border: `2px solid ${i === ePrimaryIdx ? '#10b981' : '#374151'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: '#9ca3af', textAlign: 'center', padding: '4px', gap: '2px' }}>
                                                        <span>🎬</span><span style={{ wordBreak: 'break-all' }}>{m.name.slice(0, 14)}</span>
                                                    </div>
                                                )}
                                                {i === ePrimaryIdx && m.type === 'image' && (
                                                    <div style={{ position: 'absolute', bottom: 3, left: 3, background: '#10b981', color: 'white', fontSize: '0.55rem', padding: '1px 5px', borderRadius: '999px', fontWeight: 700, pointerEvents: 'none' }}>PRIMARY</div>
                                                )}
                                                {i !== ePrimaryIdx && m.type === 'image' && (
                                                    <button type="button" onClick={() => setEPrimaryIdx(i)}
                                                        style={{ position: 'absolute', bottom: 3, left: 3, background: 'rgba(0,0,0,0.75)', color: '#10b981', border: '1px solid #10b981', fontSize: '0.55rem', padding: '1px 5px', borderRadius: '999px', cursor: 'pointer', fontWeight: 700 }}>
                                                        Primary
                                                    </button>
                                                )}
                                                <button type="button" title="Remove" onClick={() => {
                                                    setEPhotos(prev => {
                                                        const next = prev.filter((_, j) => j !== i);
                                                        setEPrimaryIdx(p => p >= next.length ? Math.max(0, next.length - 1) : i < p ? p - 1 : p);
                                                        return next;
                                                    });
                                                }} style={{ position: 'absolute', top: -6, right: -6, background: '#ef4444', border: 'none', borderRadius: '50%', width: 18, height: 18, color: 'white', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>×</button>
                                                {m.type === 'image' && (
                                                    <button type="button" title="Crop" onClick={() => { setECropSrc(m.data); setECropForIdx(i); }}
                                                        style={{ position: 'absolute', top: -6, left: -6, background: '#374151', border: '1px solid #4b5563', borderRadius: '50%', width: 18, height: 18, color: '#d1d5db', cursor: 'pointer', fontSize: '0.65rem', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>✂</button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <button type="button" onClick={() => eFileRef.current?.click()}
                                    style={{ background: '#374151', color: '#d1d5db', border: '1px dashed #4b5563', borderRadius: '8px', padding: '0.6rem 1rem', cursor: 'pointer', fontSize: '0.85rem', width: '100%' }}>
                                    + Add Photos or Video
                                </button>
                                <input ref={eFileRef} type="file" accept="image/*,video/*" multiple style={{ display: 'none' }} onChange={handleEditMediaAdd} />
                            </div>

                            {/* Name */}
                            <div>
                                <label style={lbl}>Full Name *</label>
                                <input value={eName} onChange={e => setEName(e.target.value)} style={inp} placeholder="First Last" />
                            </div>

                            {/* Aliases */}
                            <div>
                                <label style={lbl}>Aliases / Also Known As</label>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <input value={eAliasInput} onChange={e => setEAliasInput(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && eAliasInput.trim()) {
                                                e.preventDefault();
                                                setEAliases(prev => [...prev, eAliasInput.trim()]);
                                                setEAliasInput('');
                                            }
                                        }}
                                        style={{ ...inp, flex: 1 }} placeholder="Type alias and press Enter" />
                                    <button type="button" onClick={() => { if (eAliasInput.trim()) { setEAliases(prev => [...prev, eAliasInput.trim()]); setEAliasInput(''); } }}
                                        style={{ background: '#374151', border: 'none', borderRadius: '8px', color: 'white', padding: '0 1rem', cursor: 'pointer' }}>+</button>
                                </div>
                                {eAliases.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
                                        {eAliases.map((a, i) => (
                                            <span key={i} style={{ background: '#374151', color: '#d1d5db', padding: '3px 10px', borderRadius: '999px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                {a}
                                                <button type="button" onClick={() => setEAliases(prev => prev.filter((_, j) => j !== i))}
                                                    style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 0, fontSize: '0.9rem', lineHeight: 1 }}>×</button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Description */}
                            <div>
                                <label style={lbl}>Description / Reason Barred</label>
                                <textarea value={eDescription} onChange={e => setEDescription(e.target.value)}
                                    placeholder="Describe what happened and why this person is barred…"
                                    style={{ ...inp, minHeight: '80px', resize: 'vertical' as const }} />
                            </div>

                            {/* Duration */}
                            <div>
                                <label style={lbl}>Ban Duration</label>
                                <DurationPicker value={eDuration} onChange={setEDuration} customDate={eCustomDate} onCustomDate={setECustomDate} />
                            </div>

                            {/* Trespass */}
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer', background: eTrespassed ? '#7f1d1d' : '#1f2937', border: `2px solid ${eTrespassed ? '#ef4444' : '#374151'}`, borderRadius: '8px', padding: '0.75rem', transition: 'all 0.2s' }}>
                                <input type="checkbox" checked={eTrespassed} onChange={e => setETrespassed(e.target.checked)}
                                    style={{ width: 18, height: 18, marginTop: '1px', accentColor: '#ef4444', flexShrink: 0, cursor: 'pointer' }} />
                                <div>
                                    <div style={{ color: eTrespassed ? '#fca5a5' : 'white', fontWeight: 700 }}>⚠ Trespass Order Issued</div>
                                    <div style={{ color: eTrespassed ? '#fecaca' : '#6b7280', fontSize: '0.8rem', marginTop: '2px' }}>
                                        This person is legally barred from the premises.
                                    </div>
                                </div>
                            </label>
                        </div>
                        <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid #1f2937', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button type="button" onClick={() => setEditPerson(null)}
                                style={{ background: 'none', border: '1px solid #374151', color: '#9ca3af', padding: '0.6rem 1rem', borderRadius: '8px', cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button type="button" onClick={saveEdit} disabled={eSaving || !eName.trim()}
                                style={{ background: '#dc2626', color: 'white', border: 'none', padding: '0.6rem 1.25rem', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', opacity: (eSaving || !eName.trim()) ? 0.5 : 1 }}>
                                {eSaving ? 'Saving…' : 'Save Changes'}
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
