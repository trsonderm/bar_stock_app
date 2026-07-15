'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { AlertTriangle, Trash2, Plus, X, User, ArchiveRestore, Clock, Edit2, ChevronDown, ChevronUp, Download, Mail } from 'lucide-react';
import { buildZip, parseDataUri, mimeToExt } from '@/lib/incident-zip';
import { generateIncidentPdf } from '@/lib/incident-pdf';

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

interface IncidentPerson {
    id: number;
    first_name: string | null;
    last_name: string | null;
    aliases: string[];
    race: string | null;
    height: string | null;
    weight: string | null;
    hair_color: string | null;
    clothing_description: string | null;
    description: string | null;
    media: MediaItem[];
}

interface IncidentTimeline {
    id: number;
    segment_date: string | null;
    segment_time: string | null;
    description: string;
    sort_order: number;
}

interface Incident {
    id: number;
    barred_person_id: number | null;
    barred_person_name: string | null;
    barred_person_photo: string | null;
    person_name: string | null;
    description: string | null;
    submitted_by_name: string;
    media: MediaItem[];
    incident_date: string | null;
    incident_time: string | null;
    reported_by_name: string | null;
    case_number: string | null;
    office_name: string | null;
    created_at: string;
    persons: IncidentPerson[];
    timeline: IncidentTimeline[];
}

interface Employee {
    id: number;
    first_name: string;
    last_name: string;
    display_name: string | null;
    email: string | null;
}

// Form state for a single person being added to an incident
interface PersonDraft {
    _key: string;
    first_name: string;
    last_name: string;
    aliasInput: string;
    aliases: string[];
    race: string;
    height: string;
    weight: string;
    hair_color: string;
    clothing_description: string;
    description: string;
    media: MediaItem[];
}

interface TimelineDraft {
    _key: string;
    segment_date: string;
    segment_time: string;
    description: string;
}

type Duration = 'permanent' | '1week' | '30days' | 'custom';

const RACE_OPTIONS = [
    'White / Caucasian',
    'Black / African American',
    'Hispanic / Latino',
    'Asian / Pacific Islander',
    'Middle Eastern / North African',
    'Native American / Alaska Native',
    'Multiracial',
    'Unknown / Other',
];

function makeDraftKey() { return Math.random().toString(36).slice(2); }

function blankPerson(): PersonDraft {
    return { _key: makeDraftKey(), first_name: '', last_name: '', aliasInput: '', aliases: [], race: '', height: '', weight: '', hair_color: '', clothing_description: '', description: '', media: [] };
}

function computeBarredUntil(duration: Duration, customDate: string): string | null {
    if (duration === 'permanent') return null;
    if (duration === '1week') { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString(); }
    if (duration === '30days') { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString(); }
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

function formatIncidentDate(date: string | null, time: string | null): string {
    if (!date) return '';
    const dateOnly = date.split('T')[0]; // pg DATE columns arrive as ISO timestamps after JSON.stringify
    const d = new Date(dateOnly + (time ? `T${time}` : 'T00:00:00'));
    if (isNaN(d.getTime())) return '';
    const datePart = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const timePart = time ? ' at ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
    return datePart + timePart;
}

// ── Incident export helpers ────────────────────────────────────────────────

async function exportIncident(inc: Incident): Promise<void> {
    const getName = (p: IncidentPerson | undefined) =>
        (p?.last_name || p?.first_name || '').replace(/[^a-zA-Z0-9]/g, '');
    const name1 = getName(inc.persons?.[0]);
    const name2 = getName(inc.persons?.[1]);
    const incDate = inc.incident_date || new Date(inc.created_at).toISOString().split('T')[0];
    const dateTag = incDate.split('T')[0].replace(/-/g, '_');
    const filename = ['Incident', name1, name2, dateTag].filter(Boolean).join('_') + '.zip';

    // Collect media files
    const mediaEntries: { name: string; data: Uint8Array }[] = [];
    let mIdx = 1;
    const addMedia = (items: MediaItem[], prefix: string) => {
        for (const m of items) {
            const p = parseDataUri(m.data);
            if (!p) continue;
            mediaEntries.push({ name: `${prefix}_${mIdx++}.${mimeToExt(p.mime)}`, data: p.bytes });
        }
    };
    addMedia(inc.media || [], 'incident_media');
    (inc.persons || []).forEach((p, pi) => addMedia(p.media || [], `person${pi + 1}_media`));

    const pdfBytes = await generateIncidentPdf(inc as any);
    const zipBytes = buildZip([{ name: 'report.pdf', data: pdfBytes }, ...mediaEntries]);

    const url = URL.createObjectURL(new Blob([zipBytes.buffer.slice(zipBytes.byteOffset, zipBytes.byteOffset + zipBytes.byteLength) as ArrayBuffer], { type: 'application/zip' }));
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────

function DurationPicker({ value, onChange, customDate, onCustomDate }: {
    value: Duration; onChange: (d: Duration) => void; customDate: string; onCustomDate: (v: string) => void;
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

function compressImage(dataUrl: string, maxDim = 600, quality = 0.82): Promise<string> {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
            const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
            const w = Math.round(img.width * scale); const h = Math.round(img.height * scale);
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
    });
}

function CircleCropper({ src, onSave, onCancel }: { src: string; onSave: (dataUrl: string) => void; onCancel: () => void }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [scale, setScale] = useState(1);
    const [ox, setOx] = useState(0); const [oy, setOy] = useState(0);
    const [dragging, setDragging] = useState(false);
    const drag = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
    const imgRef = useRef<HTMLImageElement | null>(null);
    const SIZE = 360;
    useEffect(() => {
        const img = new Image();
        img.onload = () => { imgRef.current = img; setScale(Math.max(SIZE / img.width, SIZE / img.height)); setOx(0); setOy(0); };
        img.src = src;
    }, [src]);
    useEffect(() => {
        const img = imgRef.current; const canvas = canvasRef.current;
        if (!img || !canvas) return;
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, SIZE, SIZE); ctx.save();
        ctx.beginPath(); ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2); ctx.clip();
        const w = img.width * scale; const h = img.height * scale;
        ctx.drawImage(img, SIZE / 2 - w / 2 + ox, SIZE / 2 - h / 2 + oy, w, h); ctx.restore();
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
                onWheel={e => setScale(s => Math.max(0.3, Math.min(5, s - e.deltaY * 0.002)))} />
            <input type="range" min="0.3" max="5" step="0.05" value={scale} onChange={e => setScale(parseFloat(e.target.value))} style={{ width: '200px', accentColor: '#ef4444' }} />
            <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={() => onSave(canvasRef.current!.toDataURL('image/jpeg', 0.85))}
                    style={{ background: '#ef4444', color: 'white', border: 'none', padding: '0.6rem 1.5rem', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>Use Photo</button>
                <button onClick={onCancel} style={{ background: '#374151', color: '#d1d5db', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
            </div>
        </div>
    );
}

// Reusable mini media strip used inside the person form and incident-level media
function MediaStrip({ items, onAdd, onRemove, fileRef, label = 'Add Photos / Video' }: {
    items: MediaItem[]; onAdd: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onRemove: (i: number) => void; fileRef: React.RefObject<HTMLInputElement>; label?: string;
}) {
    return (
        <div>
            {items.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.5rem' }}>
                    {items.map((m, i) => (
                        <div key={i} style={{ position: 'relative', width: 64, height: 64, flexShrink: 0 }}>
                            {m.type === 'image'
                                ? <img src={m.data} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '6px', border: '1px solid #374151' }} />
                                : <div style={{ width: 64, height: 64, background: '#1f2937', borderRadius: '6px', border: '1px solid #374151', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: '#9ca3af', textAlign: 'center', padding: '4px' }}>🎬 {m.name.slice(0, 10)}</div>
                            }
                            <button type="button" onClick={() => onRemove(i)}
                                style={{ position: 'absolute', top: -5, right: -5, background: '#ef4444', border: 'none', borderRadius: '50%', width: 16, height: 16, color: 'white', cursor: 'pointer', fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>×</button>
                        </div>
                    ))}
                </div>
            )}
            <button type="button" onClick={() => fileRef.current?.click()}
                style={{ background: '#374151', color: '#d1d5db', border: '1px dashed #4b5563', borderRadius: '6px', padding: '0.45rem 0.9rem', cursor: 'pointer', fontSize: '0.8rem', width: '100%' }}>
                + {label}
            </button>
            <input ref={fileRef} type="file" accept="image/*,video/*" multiple style={{ display: 'none' }} onChange={onAdd} />
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function SecurityClient({
    myUserId, myName, canAddBarred, canDeleteBarred, canAddIncident,
}: {
    myUserId: number; myName: string;
    canAddBarred: boolean; canDeleteBarred: boolean; canAddIncident: boolean;
}) {
    const [tab, setTab] = useState<'barred' | 'incidents'>('barred');
    const [barredTab, setBarredTab] = useState<'active' | 'archived'>('active');
    const [barred, setBarred] = useState<BarredPerson[]>([]);
    const [archivedBarred, setArchivedBarred] = useState<BarredPerson[]>([]);
    const [incidents, setIncidents] = useState<Incident[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);

    // ── Barred — Add modal ──
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

    // ── Barred — Import modal ──
    const [showImportBarred, setShowImportBarred] = useState(false);
    const [importRows, setImportRows] = useState<Array<{ name: string; aliases: string[]; description: string; barred_until: string | null; trespassed: boolean; photo_filename: string }>>([]);
    const [importing, setImporting] = useState(false);
    const importFileRef = useRef<HTMLInputElement>(null);

    // ── Barred — Restore modal ──
    const [restorePerson, setRestorePerson] = useState<BarredPerson | null>(null);
    const [rDuration, setRDuration] = useState<Duration>('permanent');
    const [rCustomDate, setRCustomDate] = useState('');
    const [rSaving, setRSaving] = useState(false);

    // ── Barred — Edit modal ──
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

    // ── Incidents — view expanded state ──
    const [expandedInc, setExpandedInc] = useState<Set<number>>(new Set());

    // ── Incidents — Add modal ──
    const [showAddIncident, setShowAddIncident] = useState(false);
    const [iDate, setIDate] = useState('');
    const [iTime, setITime] = useState('');
    const [iMedia, setIMedia] = useState<MediaItem[]>([]);          // incident-level media
    const iMediaRef = useRef<HTMLInputElement>(null);

    // Persons involved list
    const [iPersons, setIPersons] = useState<PersonDraft[]>([]);
    const [iShowPersonForm, setIShowPersonForm] = useState(false);
    const [iCurrentPerson, setICurrentPerson] = useState<PersonDraft>(blankPerson());
    const iPersonMediaRef = useRef<HTMLInputElement>(null);

    // Timeline entries
    const [iTimeline, setITimeline] = useState<TimelineDraft[]>([]);

    // Reporter
    const [iReporterUserId, setIReporterUserId] = useState<string>('');
    const [iReporterName, setIReporterName] = useState('');

    // Case details
    const [iCaseNumber, setICaseNumber] = useState('');
    const [iOfficeName, setIOfficeName] = useState('');

    const [iSaving, setISaving] = useState(false);

    // ── Incident email modal ──
    const [emailIncident, setEmailIncident] = useState<Incident | null>(null);
    const [emailTo, setEmailTo] = useState('');
    const [emailSending, setEmailSending] = useState(false);
    const [emailDone, setEmailDone] = useState(false);
    const [emailError, setEmailError] = useState('');
    const [exportingId, setExportingId] = useState<number | null>(null);

    // Trespass notification banner
    const [showTrespassBanner, setShowTrespassBanner] = useState(false);
    const [trespassName, setTrespassName] = useState('');

    const addMediaFromFile = (
        file: File,
        setter: React.Dispatch<React.SetStateAction<MediaItem[]>>,
        cropTrigger?: (data: string, idx: number, currentLen: number) => void
    ) => {
        if (file.size > 50 * 1024 * 1024) { alert(`${file.name} exceeds 50MB`); return; }
        const reader = new FileReader();
        reader.onload = async ev => {
            let data = ev.target?.result as string;
            const type: 'image' | 'video' = file.type.startsWith('video/') ? 'video' : 'image';
            // Compress images before storing — keeps payloads well under server limits
            if (type === 'image') data = await compressImage(data, 1400, 0.85);
            setter(prev => {
                if (cropTrigger && type === 'image') {
                    cropTrigger(data, prev.length, prev.length);
                }
                return [...prev, { type, data, name: file.name }];
            });
        };
        reader.readAsDataURL(file);
    };

    const load = useCallback(async () => {
        setLoading(true);
        const [bRes, bArchRes, iRes, empRes] = await Promise.all([
            fetch('/api/admin/security/barred').then(r => r.json()),
            fetch('/api/admin/security/barred?archived=true').then(r => r.json()),
            fetch('/api/admin/security/incidents').then(r => r.json()),
            fetch('/api/admin/users').then(r => r.json()).catch(() => ({ users: [] })),
        ]);
        setBarred(bRes.barred || []);
        setArchivedBarred(bArchRes.barred || []);
        setIncidents(iRes.incidents || []);
        setEmployees(empRes.users || []);
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        const trespassed = barred.filter(p => p.trespassed);
        if (trespassed.length > 0) { setTrespassName(trespassed.map(p => p.name).join(', ')); setShowTrespassBanner(true); }
    }, [barred]);

    const handleBarredMediaAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        let firstImage = true;
        files.forEach(file => {
            if (file.size > 50 * 1024 * 1024) { alert(`${file.name} exceeds 50MB`); return; }
            const reader = new FileReader();
            reader.onload = ev => {
                const data = ev.target?.result as string;
                if (file.type.startsWith('image/') && firstImage) {
                    const idx = bPhotos.length;
                    setBPhotos(prev => [...prev, { type: 'image', data, name: file.name }]);
                    setBCropSrc(data); setBCropForIdx(idx); firstImage = false;
                } else {
                    const type = file.type.startsWith('video/') ? 'video' : 'image';
                    setBPhotos(prev => [...prev, { type: type as 'image' | 'video', data, name: file.name }]);
                }
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    };

    const downloadImportTemplate = () => {
        const csv = ['name,aliases,description,duration,trespassed,photo_filename', 'John Doe,Johnny|JD,Aggressive behavior - multiple incidents,permanent,no,john_doe.jpg', 'Jane Smith,,Theft on 2025-01-15,30days,no,', 'Bob Johnson,Bobby,Trespass order issued,permanent,yes,'].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'barred_list_template.csv'; a.click();
        URL.revokeObjectURL(url);
    };

    const parseCsvLine = (line: string): string[] => {
        const result: string[] = []; let current = ''; let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') { if (inQuotes && line[i + 1] === '"') { current += '"'; i++; } else inQuotes = !inQuotes; }
            else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
            else { current += ch; }
        }
        result.push(current); return result;
    };

    const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            const text = ev.target?.result as string;
            const lines = text.split(/\r?\n/).filter(Boolean);
            if (lines.length < 2) { alert('CSV appears empty or has no data rows'); return; }
            const header = lines[0].toLowerCase().split(',').map(h => h.trim());
            const nameIdx = header.indexOf('name');
            if (nameIdx === -1) { alert('CSV must have a "name" column'); return; }
            const aliasIdx = header.indexOf('aliases'); const descIdx = header.indexOf('description');
            const durIdx = header.indexOf('duration'); const tresIdx = header.indexOf('trespassed');
            const photoIdx = header.indexOf('photo_filename');
            const rows = lines.slice(1).map(line => {
                const cols = parseCsvLine(line); const name = cols[nameIdx]?.trim() || ''; if (!name) return null;
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
        reader.readAsText(file); e.target.value = '';
    };

    const handleImport = async () => {
        if (importRows.length === 0) return;
        setImporting(true); let ok = 0;
        for (const row of importRows) {
            const res = await fetch('/api/admin/security/barred', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: row.name, aliases: row.aliases, photo: null, media: [], description: row.description || null, trespassed: row.trespassed, barred_until: row.barred_until }) });
            if (res.ok) ok++;
        }
        setImporting(false); setShowImportBarred(false); setImportRows([]);
        alert(`Imported ${ok} of ${importRows.length} person(s). Photos must be added manually via Edit.`);
        load();
    };

    const saveBarred = async () => {
        if (!bName.trim()) return;
        setBSaving(true);
        const barred_until = computeBarredUntil(bDuration, bCustomDate);
        const rawPrimaryB = bPhotos[bPrimaryIdx]?.type === 'image' ? bPhotos[bPrimaryIdx] : bPhotos.find(m => m.type === 'image');
        const rawMediaB = bPhotos.filter(m => m !== rawPrimaryB);
        const shrinkB = async (m: MediaItem): Promise<MediaItem> => {
            if (m.type !== 'image' || !m.data.startsWith('data:') || m.data.length < 150_000) return m;
            return { ...m, data: await compressImage(m.data) };
        };
        const primaryPhoto = rawPrimaryB ? await shrinkB(rawPrimaryB) : null;
        const additionalMedia = await Promise.all(rawMediaB.map(shrinkB));
        const res = await fetch('/api/admin/security/barred', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: bName.trim(), aliases: bAliases, photo: primaryPhoto?.data || null, media: additionalMedia, description: bDescription, trespassed: bTrespassed, barred_until }) });
        setBSaving(false);
        if (res.ok) { setShowAddBarred(false); setBName(''); setBAliases([]); setBDescription(''); setBTrespassed(false); setBPhotos([]); setBPrimaryIdx(0); setBDuration('permanent'); setBCustomDate(''); load(); }
    };

    const deleteBarred = async (id: number, name: string) => {
        if (!confirm(`Permanently delete ${name} from barred list?`)) return;
        await fetch(`/api/admin/security/barred?id=${id}`, { method: 'DELETE' }); load();
    };

    const restoreBarred = async () => {
        if (!restorePerson) return;
        setRSaving(true);
        const barred_until = computeBarredUntil(rDuration, rCustomDate);
        await fetch('/api/admin/security/barred', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: restorePerson.id, barred_until }) });
        setRSaving(false); setRestorePerson(null); setRDuration('permanent'); setRCustomDate(''); load();
    };

    const openEdit = (person: BarredPerson) => {
        setEditPerson(person); setEName(person.name);
        setEAliases(Array.isArray(person.aliases) ? person.aliases : []); setEAliasInput('');
        setEDescription(person.description || ''); setETrespassed(person.trespassed);
        const photos: MediaItem[] = [];
        if (person.photo) photos.push({ type: 'image', data: person.photo, name: 'photo' });
        if (Array.isArray(person.media)) person.media.forEach((m: MediaItem) => photos.push(m));
        setEPhotos(photos); setEPrimaryIdx(0);
        if (!person.barred_until) { setEDuration('permanent'); } else { setEDuration('custom'); setECustomDate(new Date(person.barred_until).toISOString().split('T')[0]); }
    };

    const saveEdit = async () => {
        if (!editPerson || !eName.trim()) return;
        setESaving(true);
        const barred_until = computeBarredUntil(eDuration, eCustomDate);
        const rawPrimary = ePhotos[ePrimaryIdx]?.type === 'image' ? ePhotos[ePrimaryIdx] : ePhotos.find(m => m.type === 'image');
        const rawMedia = ePhotos.filter(m => m !== rawPrimary);
        const shrink = async (m: MediaItem): Promise<MediaItem> => { if (m.type !== 'image' || !m.data.startsWith('data:') || m.data.length < 150_000) return m; return { ...m, data: await compressImage(m.data) }; };
        const primaryPhoto = rawPrimary ? await shrink(rawPrimary) : null;
        const additionalMedia = await Promise.all(rawMedia.map(shrink));
        try {
            const res = await fetch('/api/admin/security/barred', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editPerson.id, name: eName.trim(), aliases: eAliases, photo: primaryPhoto?.data || null, media: additionalMedia, description: eDescription, trespassed: eTrespassed, barred_until }) });
            if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || 'Failed to save. Photo may be too large — try cropping it first.'); setESaving(false); return; }
        } catch { alert('Network error saving changes.'); setESaving(false); return; }
        setESaving(false); setEditPerson(null); load();
    };

    const handleEditMediaAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []); let firstImage = true;
        files.forEach(file => {
            if (file.size > 50 * 1024 * 1024) { alert(`${file.name} exceeds 50MB`); return; }
            const reader = new FileReader();
            reader.onload = ev => {
                const data = ev.target?.result as string;
                if (file.type.startsWith('image/') && firstImage) { const idx = ePhotos.length; setEPhotos(prev => [...prev, { type: 'image', data, name: file.name }]); setECropSrc(data); setECropForIdx(idx); firstImage = false; }
                else { const type = file.type.startsWith('video/') ? 'video' : 'image'; setEPhotos(prev => [...prev, { type: type as 'image' | 'video', data, name: file.name }]); }
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    };

    // ── Incident handlers ──────────────────────────────────────────────────

    const openAddIncident = () => {
        const now = new Date();
        setIDate(now.toISOString().split('T')[0]);
        setITime(now.toTimeString().slice(0, 5));
        setIMedia([]); setIPersons([]); setIShowPersonForm(false);
        setICurrentPerson(blankPerson());
        setITimeline([{ _key: makeDraftKey(), segment_date: now.toISOString().split('T')[0], segment_time: now.toTimeString().slice(0, 5), description: '' }]);
        setIReporterUserId(String(myUserId)); setIReporterName(myName);
        setICaseNumber(''); setIOfficeName('');
        setShowAddIncident(true);
    };

    const handleIncidentMediaAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
        Array.from(e.target.files || []).forEach(file => addMediaFromFile(file, setIMedia));
        e.target.value = '';
    };

    const handlePersonMediaAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
        Array.from(e.target.files || []).forEach(file => {
            if (file.size > 50 * 1024 * 1024) { alert(`${file.name} exceeds 50MB`); return; }
            const reader = new FileReader();
            reader.onload = async ev => {
                let data = ev.target?.result as string;
                const type: 'image' | 'video' = file.type.startsWith('video/') ? 'video' : 'image';
                if (type === 'image') data = await compressImage(data, 1400, 0.85);
                setICurrentPerson(prev => ({ ...prev, media: [...prev.media, { type, data, name: file.name }] }));
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    };

    const addPersonToList = () => {
        const p = iCurrentPerson;
        if (!p.first_name.trim() && !p.last_name.trim()) { alert('Please enter at least a first or last name for this person.'); return; }
        setIPersons(prev => [...prev, { ...p, aliasInput: '' }]);
        setICurrentPerson(blankPerson());
        setIShowPersonForm(false);
    };

    const addTimelineEntry = () => {
        const now = new Date();
        setITimeline(prev => [...prev, { _key: makeDraftKey(), segment_date: now.toISOString().split('T')[0], segment_time: now.toTimeString().slice(0, 5), description: '' }]);
    };

    const updateTimeline = (key: string, field: keyof TimelineDraft, value: string) => {
        setITimeline(prev => prev.map(t => t._key === key ? { ...t, [field]: value } : t));
    };

    const removeTimelineEntry = (key: string) => {
        setITimeline(prev => prev.filter(t => t._key !== key));
    };

    const saveIncident = async () => {
        if (iTimeline.every(t => !t.description.trim()) && iPersons.length === 0) {
            alert('Please add at least one timeline entry or person involved.'); return;
        }
        setISaving(true);
        const reporterEmp = employees.find(e => String(e.id) === iReporterUserId);
        const reporterName = reporterEmp ? `${reporterEmp.first_name} ${reporterEmp.last_name}` : iReporterName;

        const res = await fetch('/api/admin/security/incidents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                incident_date: iDate || null,
                incident_time: iTime || null,
                media: iMedia,
                persons: iPersons.map(({ _key, aliasInput, ...rest }) => rest),
                timeline: iTimeline.filter(t => t.description.trim()).map(({ _key, ...rest }) => rest),
                reported_by_user_id: iReporterUserId ? parseInt(iReporterUserId) : null,
                reported_by_name: reporterName,
                case_number: iCaseNumber.trim() || null,
                office_name: iOfficeName.trim() || null,
            }),
        });
        setISaving(false);
        if (res.ok) { setShowAddIncident(false); load(); }
        else { const d = await res.json().catch(() => ({})); alert(d.error || 'Failed to save incident.'); }
    };

    const deleteIncident = async (id: number) => {
        if (!confirm('Delete this incident report? This cannot be undone.')) return;
        await fetch(`/api/admin/security/incidents?id=${id}`, { method: 'DELETE' }); load();
    };

    const card: React.CSSProperties = { background: '#1f2937', border: '1px solid #374151', borderRadius: '12px', padding: '1.25rem', marginBottom: '0.75rem' };
    const inp: React.CSSProperties = { width: '100%', background: '#111827', border: '1px solid #374151', borderRadius: '8px', color: 'white', padding: '0.6rem 0.9rem', fontSize: '0.9rem', outline: 'none' };
    const lbl: React.CSSProperties = { color: '#9ca3af', fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' };
    const sectionHead: React.CSSProperties = { color: '#f59e0b', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.6rem', padding: '0.5rem 0', borderBottom: '1px solid #374151' };

    const activeBarred = barred;

    return (
        <div style={{ maxWidth: '860px', margin: '0 auto', padding: '1.5rem 1rem', color: 'white' }}>
            {bCropSrc && <CircleCropper src={bCropSrc} onSave={url => { if (bCropForIdx !== null) { setBPhotos(prev => prev.map((m, i) => i === bCropForIdx ? { ...m, data: url } : m)); setBCropForIdx(null); } setBCropSrc(null); }} onCancel={() => { setBCropSrc(null); setBCropForIdx(null); }} />}
            {eCropSrc && <CircleCropper src={eCropSrc} onSave={url => { if (eCropForIdx !== null) { setEPhotos(prev => prev.map((m, i) => i === eCropForIdx ? { ...m, data: url } : m)); setECropForIdx(null); } setECropSrc(null); }} onCancel={() => { setECropSrc(null); setECropForIdx(null); }} />}

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
                    <button onClick={() => setShowTrespassBanner(false)} style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', flexShrink: 0 }}><X size={18} /></button>
                </div>
            )}

            {/* ── Main tabs ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', background: '#111827', borderRadius: '8px', border: '1px solid #374151', overflow: 'hidden', flex: 1, minWidth: '200px' }}>
                    {(['barred', 'incidents'] as const).map(t => (
                        <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '0.6rem 1rem', border: 'none', fontWeight: tab === t ? 700 : 400, background: tab === t ? '#1d4ed8' : 'transparent', color: tab === t ? 'white' : '#9ca3af', cursor: 'pointer', fontSize: '0.875rem' }}>
                            {t === 'barred' ? `🚫 Barred List (${activeBarred.length})` : `📋 Incident Reports (${incidents.length})`}
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
                    <button onClick={openAddIncident}
                        style={{ background: '#d97706', color: 'white', border: 'none', borderRadius: '8px', padding: '0.6rem 1rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem' }}>
                        <Plus size={15} /> New Report
                    </button>
                )}
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', color: '#6b7280', padding: '3rem' }}>Loading…</div>
            ) : tab === 'barred' ? (
                <>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                        {(['active', 'archived'] as const).map(st => (
                            <button key={st} onClick={() => setBarredTab(st)} style={{ padding: '0.4rem 1rem', borderRadius: '6px', border: `1px solid ${barredTab === st ? '#374151' : 'transparent'}`, background: barredTab === st ? '#374151' : 'transparent', color: barredTab === st ? 'white' : '#6b7280', cursor: 'pointer', fontSize: '0.8rem', fontWeight: barredTab === st ? 700 : 400 }}>
                                {st === 'active' ? `Active (${activeBarred.length})` : `Archived (${archivedBarred.length})`}
                            </button>
                        ))}
                    </div>

                    {barredTab === 'active' ? (
                        activeBarred.length === 0 ? (
                            <div style={{ textAlign: 'center', color: '#6b7280', padding: '3rem', border: '2px dashed #374151', borderRadius: '12px' }}>No persons on the barred list.</div>
                        ) : activeBarred.map(person => (
                            <div key={person.id} style={{ ...card, display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                <div style={{ position: 'relative', flexShrink: 0 }}>
                                    <Avatar name={person.name} src={person.photo} size={72} />
                                    {person.trespassed && <div style={{ position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)', background: '#dc2626', color: 'white', fontSize: '0.6rem', fontWeight: 700, padding: '1px 6px', borderRadius: '999px', whiteSpace: 'nowrap' }}>TRESPASS</div>}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        <div>
                                            <span style={{ fontWeight: 700, fontSize: '1rem', color: 'white' }}>{person.name}</span>
                                            {person.trespassed && <span style={{ background: '#7f1d1d', color: '#fca5a5', fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', marginLeft: '0.5rem', border: '1px solid #dc2626' }}>⚠ TRESPASSED</span>}
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                                            {canAddBarred && <button type="button" onClick={() => openEdit(person)} title="Edit" style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '4px' }}><Edit2 size={15} /></button>}
                                            {canDeleteBarred && <button type="button" onClick={() => deleteBarred(person.id, person.name)} title="Delete" style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '4px' }}><Trash2 size={16} /></button>}
                                        </div>
                                    </div>
                                    {person.aliases?.length > 0 && <div style={{ color: '#9ca3af', fontSize: '0.8rem', marginTop: '3px' }}>Also known as: {person.aliases.join(', ')}</div>}
                                    {person.description && <p style={{ color: '#d1d5db', fontSize: '0.875rem', margin: '0.4rem 0 0', lineHeight: 1.5 }}>{person.description}</p>}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                                        <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>Barred by {person.barred_by_display || person.barred_by_name || 'Unknown'} · {timeAgo(person.created_at)}</span>
                                        {person.barred_until && <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#f59e0b', fontSize: '0.72rem', fontWeight: 600 }}><Clock size={11} /> {formatUntil(person.barred_until)}</span>}
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        archivedBarred.length === 0 ? (
                            <div style={{ textAlign: 'center', color: '#6b7280', padding: '3rem', border: '2px dashed #374151', borderRadius: '12px' }}>No archived persons.</div>
                        ) : archivedBarred.map(person => (
                            <div key={person.id} style={{ ...card, display: 'flex', gap: '1rem', alignItems: 'flex-start', opacity: 0.8 }}>
                                <Avatar name={person.name} src={person.photo} size={60} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#9ca3af' }}>{person.name}</span>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            {canAddBarred && <button onClick={() => { setRestorePerson(person); setRDuration('permanent'); setRCustomDate(''); }} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}><ArchiveRestore size={13} /> Restore</button>}
                                            {canDeleteBarred && <button onClick={() => deleteBarred(person.id, person.name)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '4px' }}><Trash2 size={15} /></button>}
                                        </div>
                                    </div>
                                    {person.description && <p style={{ color: '#6b7280', fontSize: '0.8rem', margin: '0.3rem 0 0', lineHeight: 1.4 }}>{person.description}</p>}
                                    <div style={{ color: '#4b5563', fontSize: '0.72rem', marginTop: '0.3rem' }}>Archived {person.archived_at ? timeAgo(person.archived_at) : ''} · Barred by {person.barred_by_display || person.barred_by_name || 'Unknown'}</div>
                                </div>
                            </div>
                        ))
                    )}
                </>
            ) : (
                /* ── Incidents list ── */
                incidents.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#6b7280', padding: '3rem', border: '2px dashed #374151', borderRadius: '12px' }}>No incident reports yet.</div>
                ) : incidents.map(inc => {
                    const isExpanded = expandedInc.has(inc.id);
                    const dateStr = formatIncidentDate(inc.incident_date, inc.incident_time);
                    const personCount = inc.persons?.length || 0;
                    const timelineCount = inc.timeline?.length || 0;
                    return (
                        <div key={inc.id} style={card}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            {dateStr && <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: '0.9rem' }}>📅 {dateStr}</span>}
                                            {personCount > 0 && <span style={{ background: '#1e3a5f', color: '#60a5fa', fontSize: '0.72rem', padding: '2px 8px', borderRadius: '999px' }}>{personCount} person{personCount !== 1 ? 's' : ''} involved</span>}
                                            {timelineCount > 0 && <span style={{ background: '#1f2937', color: '#9ca3af', fontSize: '0.72rem', padding: '2px 8px', borderRadius: '999px' }}>{timelineCount} entry{timelineCount !== 1 ? 'ies' : 'y'}</span>}
                                            {inc.case_number && <span style={{ background: '#1c2d3a', color: '#67e8f9', fontSize: '0.72rem', padding: '2px 8px', borderRadius: '999px' }}>Case #{inc.case_number}</span>}
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', flexShrink: 0 }}>
                                            <button onClick={() => setExpandedInc(prev => { const next = new Set(prev); isExpanded ? next.delete(inc.id) : next.add(inc.id); return next; })}
                                                style={{ background: 'none', border: '1px solid #374151', color: '#9ca3af', cursor: 'pointer', padding: '4px 8px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.75rem' }}>
                                                {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                                {isExpanded ? 'Collapse' : 'View'}
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    setExportingId(inc.id);
                                                    try { await exportIncident(inc); } finally { setExportingId(null); }
                                                }}
                                                disabled={exportingId === inc.id}
                                                title="Download ZIP (PDF report + media)"
                                                style={{ background: 'none', border: '1px solid #374151', color: exportingId === inc.id ? '#4b5563' : '#60a5fa', cursor: exportingId === inc.id ? 'not-allowed' : 'pointer', padding: '4px 7px', borderRadius: '6px', display: 'flex', alignItems: 'center' }}>
                                                <Download size={13} />
                                            </button>
                                            <button
                                                onClick={() => { setEmailIncident(inc); setEmailTo(''); setEmailDone(false); setEmailError(''); }}
                                                title="Email incident report"
                                                style={{ background: 'none', border: '1px solid #374151', color: '#a78bfa', cursor: 'pointer', padding: '4px 7px', borderRadius: '6px', display: 'flex', alignItems: 'center' }}>
                                                <Mail size={13} />
                                            </button>
                                            {canAddIncident && (
                                                <button onClick={() => deleteIncident(inc.id)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '4px' }}><Trash2 size={15} /></button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Media thumbnails (incident-level) */}
                                    {inc.media && inc.media.length > 0 && (
                                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                                            {inc.media.slice(0, 4).map((m, i) => (
                                                m.type === 'image'
                                                    ? <a key={i} href={m.data} target="_blank" rel="noreferrer"><img src={m.data} alt={m.name} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: '6px', border: '1px solid #374151' }} /></a>
                                                    : <video key={i} src={m.data} controls style={{ width: 100, maxHeight: 70, borderRadius: '6px', border: '1px solid #374151' }} />
                                            ))}
                                            {inc.media.length > 4 && <span style={{ color: '#6b7280', fontSize: '0.75rem', alignSelf: 'center' }}>+{inc.media.length - 4} more</span>}
                                        </div>
                                    )}

                                    {/* First timeline entry preview when collapsed */}
                                    {!isExpanded && inc.timeline && inc.timeline.length > 0 && (
                                        <p style={{ color: '#d1d5db', fontSize: '0.875rem', margin: '0.4rem 0 0', lineHeight: 1.5, whiteSpace: 'pre-wrap', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                            {inc.timeline[0].description}
                                        </p>
                                    )}
                                    {!isExpanded && !inc.timeline?.length && inc.description && (
                                        <p style={{ color: '#d1d5db', fontSize: '0.875rem', margin: '0.4rem 0 0', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{inc.description}</p>
                                    )}
                                </div>
                            </div>

                            {/* Expanded detail */}
                            {isExpanded && (
                                <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                                    {/* Persons involved */}
                                    {inc.persons && inc.persons.length > 0 && (
                                        <div>
                                            <p style={sectionHead}>Persons Involved</p>
                                            {inc.persons.map((p, pi) => (
                                                <div key={pi} style={{ background: '#111827', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.5rem', border: '1px solid #1f2937' }}>
                                                    <div style={{ fontWeight: 700, color: 'white', marginBottom: '0.3rem' }}>
                                                        {[p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown'}
                                                        {p.aliases?.length > 0 && <span style={{ color: '#9ca3af', fontWeight: 400, fontSize: '0.8rem', marginLeft: '0.5rem' }}>aka {p.aliases.join(', ')}</span>}
                                                    </div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem 1rem', fontSize: '0.8rem', color: '#9ca3af' }}>
                                                        {p.race && <span>Race: <strong style={{ color: '#d1d5db' }}>{p.race}</strong></span>}
                                                        {p.height && <span>Height: <strong style={{ color: '#d1d5db' }}>{p.height}</strong></span>}
                                                        {p.weight && <span>Weight: <strong style={{ color: '#d1d5db' }}>{p.weight}</strong></span>}
                                                        {p.hair_color && <span>Hair: <strong style={{ color: '#d1d5db' }}>{p.hair_color}</strong></span>}
                                                    </div>
                                                    {p.clothing_description && <div style={{ color: '#d1d5db', fontSize: '0.82rem', marginTop: '0.3rem' }}>Clothing: {p.clothing_description}</div>}
                                                    {p.description && <div style={{ color: '#d1d5db', fontSize: '0.82rem', marginTop: '0.3rem' }}>{p.description}</div>}
                                                    {p.media && p.media.length > 0 && (
                                                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                                                            {p.media.map((m, mi) => (
                                                                m.type === 'image'
                                                                    ? <a key={mi} href={m.data} target="_blank" rel="noreferrer"><img src={m.data} alt={m.name} style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: '5px', border: '1px solid #374151' }} /></a>
                                                                    : <video key={mi} src={m.data} controls style={{ width: 90, maxHeight: 65, borderRadius: '5px', border: '1px solid #374151' }} />
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Timeline */}
                                    {inc.timeline && inc.timeline.length > 0 && (
                                        <div>
                                            <p style={sectionHead}>Incident Description</p>
                                            <div style={{ borderLeft: '2px solid #374151', paddingLeft: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                {inc.timeline.map((t, ti) => (
                                                    <div key={ti}>
                                                        {(t.segment_date || t.segment_time) && (
                                                            <div style={{ color: '#f59e0b', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.2rem' }}>
                                                                {t.segment_date && new Date(t.segment_date.split('T')[0] + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                                                {t.segment_time && ' · ' + t.segment_time}
                                                            </div>
                                                        )}
                                                        <p style={{ color: '#d1d5db', fontSize: '0.875rem', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{t.description}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Legacy description */}
                                    {(!inc.timeline || inc.timeline.length === 0) && inc.description && (
                                        <div>
                                            <p style={sectionHead}>Description</p>
                                            <p style={{ color: '#d1d5db', fontSize: '0.875rem', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{inc.description}</p>
                                        </div>
                                    )}

                                    {/* Footer */}
                                    <div style={{ color: '#6b7280', fontSize: '0.75rem', borderTop: '1px solid #1f2937', paddingTop: '0.6rem' }}>
                                        {(inc.case_number || inc.office_name) && (
                                            <div style={{ marginBottom: '0.3rem' }}>
                                                {inc.case_number && <><strong style={{ color: '#67e8f9' }}>Case #{inc.case_number}</strong>{inc.office_name && <span style={{ color: '#9ca3af' }}> · {inc.office_name}</span>}</>}
                                                {!inc.case_number && inc.office_name && <span style={{ color: '#9ca3af' }}>{inc.office_name}</span>}
                                            </div>
                                        )}
                                        {inc.reported_by_name && <>Reported by <strong style={{ color: '#9ca3af' }}>{inc.reported_by_name}</strong> · </>}
                                        Filed by {inc.submitted_by_name} · {timeAgo(inc.created_at)}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })
            )}

            {/* ── Add Barred Modal ── */}
            {showAddBarred && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: '12px', width: '100%', maxWidth: '500px', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid #1f2937' }}>
                            <h2 style={{ margin: 0, color: 'white', fontSize: '1.05rem', fontWeight: 700 }}>Add Person to Barred List</h2>
                            <button onClick={() => setShowAddBarred(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1 }}>×</button>
                        </div>
                        <div style={{ padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={lbl}>Photos & Video</label>
                                {bPhotos.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.6rem' }}>
                                        {bPhotos.map((m, i) => (
                                            <div key={i} style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
                                                {m.type === 'image' ? <img src={m.data} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px', border: `2px solid ${i === bPrimaryIdx ? '#10b981' : '#374151'}` }} /> : <div style={{ width: 80, height: 80, background: '#1f2937', borderRadius: '8px', border: `2px solid ${i === bPrimaryIdx ? '#10b981' : '#374151'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: '#9ca3af', textAlign: 'center', padding: '4px', gap: '2px' }}><span>🎬</span><span style={{ wordBreak: 'break-all' }}>{m.name.slice(0, 14)}</span></div>}
                                                {i === bPrimaryIdx && m.type === 'image' && <div style={{ position: 'absolute', bottom: 3, left: 3, background: '#10b981', color: 'white', fontSize: '0.55rem', padding: '1px 5px', borderRadius: '999px', fontWeight: 700, pointerEvents: 'none' }}>PRIMARY</div>}
                                                {i !== bPrimaryIdx && m.type === 'image' && <button type="button" onClick={() => setBPrimaryIdx(i)} style={{ position: 'absolute', bottom: 3, left: 3, background: 'rgba(0,0,0,0.75)', color: '#10b981', border: '1px solid #10b981', fontSize: '0.55rem', padding: '1px 5px', borderRadius: '999px', cursor: 'pointer', fontWeight: 700 }}>Primary</button>}
                                                <button type="button" onClick={() => { setBPhotos(prev => { const next = prev.filter((_, j) => j !== i); setBPrimaryIdx(p => p >= next.length ? Math.max(0, next.length - 1) : i < p ? p - 1 : p); return next; }); }} style={{ position: 'absolute', top: -6, right: -6, background: '#ef4444', border: 'none', borderRadius: '50%', width: 18, height: 18, color: 'white', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>×</button>
                                                {m.type === 'image' && <button type="button" onClick={() => { setBCropSrc(m.data); setBCropForIdx(i); }} style={{ position: 'absolute', top: -6, left: -6, background: '#374151', border: '1px solid #4b5563', borderRadius: '50%', width: 18, height: 18, color: '#d1d5db', cursor: 'pointer', fontSize: '0.65rem', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }} title="Crop">✂</button>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <button type="button" onClick={() => bFileRef.current?.click()} style={{ background: '#374151', color: '#d1d5db', border: '1px dashed #4b5563', borderRadius: '8px', padding: '0.6rem 1rem', cursor: 'pointer', fontSize: '0.85rem', width: '100%' }}>+ Add Photos or Video</button>
                                <input ref={bFileRef} type="file" accept="image/*,video/*" multiple style={{ display: 'none' }} onChange={handleBarredMediaAdd} />
                            </div>
                            <div><label style={lbl}>Full Name *</label><input value={bName} onChange={e => setBName(e.target.value)} style={inp} placeholder="First Last" autoFocus /></div>
                            <div>
                                <label style={lbl}>Aliases / Also Known As</label>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <input value={bAliasInput} onChange={e => setBaliasInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && bAliasInput.trim()) { e.preventDefault(); setBAliases(prev => [...prev, bAliasInput.trim()]); setBaliasInput(''); } }} style={{ ...inp, flex: 1 }} placeholder="Type alias and press Enter" />
                                    <button onClick={() => { if (bAliasInput.trim()) { setBAliases(prev => [...prev, bAliasInput.trim()]); setBaliasInput(''); } }} style={{ background: '#374151', border: 'none', borderRadius: '8px', color: 'white', padding: '0 1rem', cursor: 'pointer' }}>+</button>
                                </div>
                                {bAliases.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>{bAliases.map((a, i) => <span key={i} style={{ background: '#374151', color: '#d1d5db', padding: '3px 10px', borderRadius: '999px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' }}>{a}<button onClick={() => setBAliases(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 0, fontSize: '0.9rem', lineHeight: 1 }}>×</button></span>)}</div>}
                            </div>
                            <div><label style={lbl}>Description / Reason Barred</label><textarea value={bDescription} onChange={e => setBDescription(e.target.value)} placeholder="Describe what happened and why this person is barred…" style={{ ...inp, minHeight: '80px', resize: 'vertical' as const }} /></div>
                            <div><label style={lbl}>Ban Duration</label><DurationPicker value={bDuration} onChange={setBDuration} customDate={bCustomDate} onCustomDate={setBCustomDate} /></div>
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer', background: bTrespassed ? '#7f1d1d' : '#1f2937', border: `2px solid ${bTrespassed ? '#ef4444' : '#374151'}`, borderRadius: '8px', padding: '0.75rem' }}>
                                <input type="checkbox" checked={bTrespassed} onChange={e => setBTrespassed(e.target.checked)} style={{ width: 18, height: 18, marginTop: '1px', accentColor: '#ef4444', flexShrink: 0, cursor: 'pointer' }} />
                                <div><div style={{ color: bTrespassed ? '#fca5a5' : 'white', fontWeight: 700 }}>⚠ Trespass Order Issued</div><div style={{ color: bTrespassed ? '#fecaca' : '#6b7280', fontSize: '0.8rem', marginTop: '2px' }}>Checking this will display a visible trespass warning. This person is legally barred from the premises.</div></div>
                            </label>
                        </div>
                        <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid #1f2937', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowAddBarred(false)} style={{ background: 'none', border: '1px solid #374151', color: '#9ca3af', padding: '0.6rem 1rem', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
                            <button onClick={saveBarred} disabled={bSaving || !bName.trim()} style={{ background: '#dc2626', color: 'white', border: 'none', padding: '0.6rem 1.25rem', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', opacity: (bSaving || !bName.trim()) ? 0.5 : 1 }}>{bSaving ? 'Saving…' : 'Add to Barred List'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Restore Modal ── */}
            {restorePerson && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: '12px', width: '100%', maxWidth: '420px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid #1f2937' }}>
                            <h2 style={{ margin: 0, color: 'white', fontSize: '1.05rem', fontWeight: 700 }}>Restore to Active List</h2>
                            <button onClick={() => setRestorePerson(null)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1 }}>×</button>
                        </div>
                        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <p style={{ color: '#d1d5db', margin: 0, fontSize: '0.9rem' }}>Restore <strong>{restorePerson.name}</strong> to the active barred list. Set a new ban duration:</p>
                            <DurationPicker value={rDuration} onChange={setRDuration} customDate={rCustomDate} onCustomDate={setRCustomDate} />
                        </div>
                        <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid #1f2937', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button onClick={() => setRestorePerson(null)} style={{ background: 'none', border: '1px solid #374151', color: '#9ca3af', padding: '0.6rem 1rem', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
                            <button onClick={restoreBarred} disabled={rSaving} style={{ background: '#1d4ed8', color: 'white', border: 'none', padding: '0.6rem 1.25rem', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', opacity: rSaving ? 0.5 : 1 }}>{rSaving ? 'Restoring…' : 'Restore'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Import CSV Modal ── */}
            {showImportBarred && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: '12px', width: '100%', maxWidth: '660px', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid #1f2937' }}>
                            <h2 style={{ margin: 0, color: 'white', fontSize: '1.05rem', fontWeight: 700 }}>Import Barred List from CSV</h2>
                            <button type="button" onClick={() => { setShowImportBarred(false); setImportRows([]); }} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1 }}>×</button>
                        </div>
                        <div style={{ padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '0.875rem', fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.6 }}>
                                <strong style={{ color: '#e2e8f0' }}>Columns:</strong> name · aliases (pipe-separated) · description · duration (permanent / 1week / 30days / days) · trespassed (yes/no) · photo_filename
                                <br /><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Photos cannot be imported via CSV — upload them manually after import.</span>
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                <button type="button" onClick={downloadImportTemplate} style={{ background: '#374151', color: '#d1d5db', border: '1px solid #4b5563', borderRadius: '8px', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>⬇ Download Template</button>
                                <button type="button" onClick={() => importFileRef.current?.click()} style={{ background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>📂 Choose CSV File</button>
                                <input ref={importFileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleImportFile} />
                            </div>
                            {importRows.length > 0 && (
                                <>
                                    <div style={{ color: '#10b981', fontWeight: 600, fontSize: '0.875rem' }}>✓ {importRows.length} person{importRows.length !== 1 ? 's' : ''} ready to import</div>
                                    <div style={{ overflowX: 'auto', border: '1px solid #1f2937', borderRadius: '8px' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                            <thead><tr style={{ borderBottom: '1px solid #374151', background: '#1f2937' }}>{['Name', 'Aliases', 'Duration', 'Trespass', 'Photo Ref'].map(h => <th key={h} style={{ color: '#9ca3af', textAlign: 'left', padding: '0.5rem 0.75rem', fontWeight: 600 }}>{h}</th>)}</tr></thead>
                                            <tbody>{importRows.map((r, i) => <tr key={i} style={{ borderBottom: '1px solid #1f2937' }}><td style={{ color: 'white', padding: '0.4rem 0.75rem', fontWeight: 500 }}>{r.name}</td><td style={{ color: '#9ca3af', padding: '0.4rem 0.75rem' }}>{r.aliases.join(', ') || '—'}</td><td style={{ color: '#f59e0b', padding: '0.4rem 0.75rem' }}>{r.barred_until ? new Date(r.barred_until).toLocaleDateString() : 'Permanent'}</td><td style={{ padding: '0.4rem 0.75rem' }}>{r.trespassed ? <span style={{ color: '#ef4444', fontWeight: 700 }}>⚠ Yes</span> : <span style={{ color: '#6b7280' }}>No</span>}</td><td style={{ color: '#6b7280', padding: '0.4rem 0.75rem', fontStyle: r.photo_filename ? 'normal' : 'italic' }}>{r.photo_filename || '—'}</td></tr>)}</tbody>
                                        </table>
                                    </div>
                                </>
                            )}
                        </div>
                        <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid #1f2937', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button type="button" onClick={() => { setShowImportBarred(false); setImportRows([]); }} style={{ background: 'none', border: '1px solid #374151', color: '#9ca3af', padding: '0.6rem 1rem', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
                            <button type="button" onClick={handleImport} disabled={importing || importRows.length === 0} style={{ background: '#dc2626', color: 'white', border: 'none', padding: '0.6rem 1.25rem', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', opacity: (importing || importRows.length === 0) ? 0.5 : 1 }}>{importing ? 'Importing…' : `Import ${importRows.length} Person${importRows.length !== 1 ? 's' : ''}`}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Edit Barred Modal ── */}
            {editPerson && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: '12px', width: '100%', maxWidth: '500px', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid #1f2937' }}>
                            <h2 style={{ margin: 0, color: 'white', fontSize: '1.05rem', fontWeight: 700 }}>Edit Barred Person</h2>
                            <button type="button" onClick={() => setEditPerson(null)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1 }}>×</button>
                        </div>
                        <div style={{ padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={lbl}>Photos & Video</label>
                                {ePhotos.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.6rem' }}>
                                        {ePhotos.map((m, i) => (
                                            <div key={i} style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
                                                {m.type === 'image' ? <img src={m.data} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px', border: `2px solid ${i === ePrimaryIdx ? '#10b981' : '#374151'}` }} /> : <div style={{ width: 80, height: 80, background: '#1f2937', borderRadius: '8px', border: `2px solid ${i === ePrimaryIdx ? '#10b981' : '#374151'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: '#9ca3af', textAlign: 'center', padding: '4px', gap: '2px' }}><span>🎬</span><span style={{ wordBreak: 'break-all' }}>{m.name.slice(0, 14)}</span></div>}
                                                {i === ePrimaryIdx && m.type === 'image' && <div style={{ position: 'absolute', bottom: 3, left: 3, background: '#10b981', color: 'white', fontSize: '0.55rem', padding: '1px 5px', borderRadius: '999px', fontWeight: 700, pointerEvents: 'none' }}>PRIMARY</div>}
                                                {i !== ePrimaryIdx && m.type === 'image' && <button type="button" onClick={() => setEPrimaryIdx(i)} style={{ position: 'absolute', bottom: 3, left: 3, background: 'rgba(0,0,0,0.75)', color: '#10b981', border: '1px solid #10b981', fontSize: '0.55rem', padding: '1px 5px', borderRadius: '999px', cursor: 'pointer', fontWeight: 700 }}>Primary</button>}
                                                <button type="button" title="Remove" onClick={() => { setEPhotos(prev => { const next = prev.filter((_, j) => j !== i); setEPrimaryIdx(p => p >= next.length ? Math.max(0, next.length - 1) : i < p ? p - 1 : p); return next; }); }} style={{ position: 'absolute', top: -6, right: -6, background: '#ef4444', border: 'none', borderRadius: '50%', width: 18, height: 18, color: 'white', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>×</button>
                                                {m.type === 'image' && <button type="button" title="Crop" onClick={() => { setECropSrc(m.data); setECropForIdx(i); }} style={{ position: 'absolute', top: -6, left: -6, background: '#374151', border: '1px solid #4b5563', borderRadius: '50%', width: 18, height: 18, color: '#d1d5db', cursor: 'pointer', fontSize: '0.65rem', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>✂</button>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <button type="button" onClick={() => eFileRef.current?.click()} style={{ background: '#374151', color: '#d1d5db', border: '1px dashed #4b5563', borderRadius: '8px', padding: '0.6rem 1rem', cursor: 'pointer', fontSize: '0.85rem', width: '100%' }}>+ Add Photos or Video</button>
                                <input ref={eFileRef} type="file" accept="image/*,video/*" multiple style={{ display: 'none' }} onChange={handleEditMediaAdd} />
                            </div>
                            <div><label style={lbl}>Full Name *</label><input value={eName} onChange={e => setEName(e.target.value)} style={inp} placeholder="First Last" /></div>
                            <div>
                                <label style={lbl}>Aliases / Also Known As</label>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <input value={eAliasInput} onChange={e => setEAliasInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && eAliasInput.trim()) { e.preventDefault(); setEAliases(prev => [...prev, eAliasInput.trim()]); setEAliasInput(''); } }} style={{ ...inp, flex: 1 }} placeholder="Type alias and press Enter" />
                                    <button type="button" onClick={() => { if (eAliasInput.trim()) { setEAliases(prev => [...prev, eAliasInput.trim()]); setEAliasInput(''); } }} style={{ background: '#374151', border: 'none', borderRadius: '8px', color: 'white', padding: '0 1rem', cursor: 'pointer' }}>+</button>
                                </div>
                                {eAliases.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>{eAliases.map((a, i) => <span key={i} style={{ background: '#374151', color: '#d1d5db', padding: '3px 10px', borderRadius: '999px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' }}>{a}<button type="button" onClick={() => setEAliases(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 0, fontSize: '0.9rem', lineHeight: 1 }}>×</button></span>)}</div>}
                            </div>
                            <div><label style={lbl}>Description / Reason Barred</label><textarea value={eDescription} onChange={e => setEDescription(e.target.value)} placeholder="Describe what happened and why this person is barred…" style={{ ...inp, minHeight: '80px', resize: 'vertical' as const }} /></div>
                            <div><label style={lbl}>Ban Duration</label><DurationPicker value={eDuration} onChange={setEDuration} customDate={eCustomDate} onCustomDate={setECustomDate} /></div>
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer', background: eTrespassed ? '#7f1d1d' : '#1f2937', border: `2px solid ${eTrespassed ? '#ef4444' : '#374151'}`, borderRadius: '8px', padding: '0.75rem' }}>
                                <input type="checkbox" checked={eTrespassed} onChange={e => setETrespassed(e.target.checked)} style={{ width: 18, height: 18, marginTop: '1px', accentColor: '#ef4444', flexShrink: 0, cursor: 'pointer' }} />
                                <div><div style={{ color: eTrespassed ? '#fca5a5' : 'white', fontWeight: 700 }}>⚠ Trespass Order Issued</div><div style={{ color: eTrespassed ? '#fecaca' : '#6b7280', fontSize: '0.8rem', marginTop: '2px' }}>This person is legally barred from the premises.</div></div>
                            </label>
                        </div>
                        <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid #1f2937', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button type="button" onClick={() => setEditPerson(null)} style={{ background: 'none', border: '1px solid #374151', color: '#9ca3af', padding: '0.6rem 1rem', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
                            <button type="button" onClick={saveEdit} disabled={eSaving || !eName.trim()} style={{ background: '#dc2626', color: 'white', border: 'none', padding: '0.6rem 1.25rem', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', opacity: (eSaving || !eName.trim()) ? 0.5 : 1 }}>{eSaving ? 'Saving…' : 'Save Changes'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Add Incident Modal ── */}
            {showAddIncident && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: '12px', width: '100%', maxWidth: '680px', maxHeight: '95vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', borderBottom: '1px solid #1f2937' }}>
                            <h2 style={{ margin: 0, color: 'white', fontSize: '1.1rem', fontWeight: 700 }}>New Incident Report</h2>
                            <button onClick={() => setShowAddIncident(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.4rem', lineHeight: 1 }}>×</button>
                        </div>
                        <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                            {/* ── Date & Time ── */}
                            <div>
                                <p style={sectionHead}>Date & Time of Incident</p>
                                <div style={{ display: 'flex', gap: '0.75rem' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={lbl}>Date</label>
                                        <input type="date" value={iDate} onChange={e => setIDate(e.target.value)} style={inp} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={lbl}>Time</label>
                                        <input type="time" value={iTime} onChange={e => setITime(e.target.value)} style={inp} />
                                    </div>
                                </div>
                            </div>

                            {/* ── Case Details ── */}
                            <div>
                                <p style={sectionHead}>Case Details (Optional)</p>
                                <div style={{ display: 'flex', gap: '0.75rem' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={lbl}>Case Number</label>
                                        <input type="text" value={iCaseNumber} onChange={e => setICaseNumber(e.target.value)} style={inp} placeholder="e.g. 2026-0042" />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={lbl}>Office / Agency</label>
                                        <input type="text" value={iOfficeName} onChange={e => setIOfficeName(e.target.value)} style={inp} placeholder="e.g. Metro PD" />
                                    </div>
                                </div>
                            </div>

                            {/* ── Incident Media ── */}
                            <div>
                                <p style={sectionHead}>Incident Photos & Video</p>
                                <MediaStrip items={iMedia} onAdd={handleIncidentMediaAdd} onRemove={i => setIMedia(prev => prev.filter((_, j) => j !== i))} fileRef={iMediaRef} label="Attach Incident Photos or Video" />
                            </div>

                            {/* ── Persons Involved ── */}
                            <div>
                                <p style={sectionHead}>Persons Involved</p>

                                {/* Added persons list */}
                                {iPersons.length > 0 && (
                                    <div style={{ marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {iPersons.map((p, pi) => (
                                            <div key={p._key} style={{ background: '#1f2937', borderRadius: '8px', padding: '0.6rem 0.85rem', border: '1px solid #374151', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                                                <div>
                                                    <div style={{ fontWeight: 600, color: 'white', fontSize: '0.9rem' }}>{[p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown'}</div>
                                                    <div style={{ color: '#9ca3af', fontSize: '0.75rem', marginTop: '2px' }}>
                                                        {[p.race, p.height && `Ht: ${p.height}`, p.hair_color && `Hair: ${p.hair_color}`].filter(Boolean).join(' · ')}
                                                    </div>
                                                    {p.aliases.length > 0 && <div style={{ color: '#6b7280', fontSize: '0.72rem', marginTop: '1px' }}>aka {p.aliases.join(', ')}</div>}
                                                    {p.media.length > 0 && <div style={{ color: '#6b7280', fontSize: '0.72rem', marginTop: '1px' }}>📷 {p.media.length} photo{p.media.length !== 1 ? 's' : ''}/video{p.media.length !== 1 ? 's' : ''}</div>}
                                                </div>
                                                <button type="button" onClick={() => setIPersons(prev => prev.filter((_, j) => j !== pi))} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '2px', flexShrink: 0 }}><X size={14} /></button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Add person form */}
                                {iShowPersonForm ? (
                                    <div style={{ background: '#0f172a', border: '1px solid #374151', borderRadius: '10px', padding: '1rem' }}>
                                        <div style={{ color: '#60a5fa', fontWeight: 700, fontSize: '0.82rem', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Person Details</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                                                <div>
                                                    <label style={lbl}>First Name</label>
                                                    <input value={iCurrentPerson.first_name} onChange={e => setICurrentPerson(p => ({ ...p, first_name: e.target.value }))} style={inp} placeholder="First" />
                                                </div>
                                                <div>
                                                    <label style={lbl}>Last Name</label>
                                                    <input value={iCurrentPerson.last_name} onChange={e => setICurrentPerson(p => ({ ...p, last_name: e.target.value }))} style={inp} placeholder="Last" />
                                                </div>
                                            </div>

                                            {/* Aliases */}
                                            <div>
                                                <label style={lbl}>Aliases</label>
                                                <div style={{ display: 'flex', gap: '0.4rem' }}>
                                                    <input value={iCurrentPerson.aliasInput} onChange={e => setICurrentPerson(p => ({ ...p, aliasInput: e.target.value }))}
                                                        onKeyDown={e => { if (e.key === 'Enter' && iCurrentPerson.aliasInput.trim()) { e.preventDefault(); setICurrentPerson(p => ({ ...p, aliases: [...p.aliases, p.aliasInput.trim()], aliasInput: '' })); } }}
                                                        style={{ ...inp, flex: 1, fontSize: '0.82rem' }} placeholder="Type and press Enter" />
                                                    <button type="button" onClick={() => { if (iCurrentPerson.aliasInput.trim()) { setICurrentPerson(p => ({ ...p, aliases: [...p.aliases, p.aliasInput.trim()], aliasInput: '' })); } }}
                                                        style={{ background: '#374151', border: 'none', borderRadius: '6px', color: 'white', padding: '0 0.75rem', cursor: 'pointer', fontSize: '0.9rem' }}>+</button>
                                                </div>
                                                {iCurrentPerson.aliases.length > 0 && (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.4rem' }}>
                                                        {iCurrentPerson.aliases.map((a, ai) => (
                                                            <span key={ai} style={{ background: '#1e293b', color: '#94a3b8', padding: '2px 8px', borderRadius: '999px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                {a}<button type="button" onClick={() => setICurrentPerson(p => ({ ...p, aliases: p.aliases.filter((_, j) => j !== ai) }))} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Race */}
                                            <div>
                                                <label style={lbl}>Race / Ethnicity</label>
                                                <input list="race-options" value={iCurrentPerson.race} onChange={e => setICurrentPerson(p => ({ ...p, race: e.target.value }))} style={inp} placeholder="Select or type…" />
                                                <datalist id="race-options">
                                                    {RACE_OPTIONS.map(r => <option key={r} value={r} />)}
                                                </datalist>
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                                                <div><label style={lbl}>Height</label><input value={iCurrentPerson.height} onChange={e => setICurrentPerson(p => ({ ...p, height: e.target.value }))} style={inp} placeholder={`e.g. 5'10"`} /></div>
                                                <div><label style={lbl}>Weight</label><input value={iCurrentPerson.weight} onChange={e => setICurrentPerson(p => ({ ...p, weight: e.target.value }))} style={inp} placeholder="e.g. 180 lbs" /></div>
                                            </div>

                                            <div><label style={lbl}>Hair Color</label><input value={iCurrentPerson.hair_color} onChange={e => setICurrentPerson(p => ({ ...p, hair_color: e.target.value }))} style={inp} placeholder="e.g. Brown, short" /></div>
                                            <div><label style={lbl}>Clothing Description</label><input value={iCurrentPerson.clothing_description} onChange={e => setICurrentPerson(p => ({ ...p, clothing_description: e.target.value }))} style={inp} placeholder="e.g. Red hoodie, blue jeans" /></div>
                                            <div><label style={lbl}>Additional Description</label><textarea value={iCurrentPerson.description} onChange={e => setICurrentPerson(p => ({ ...p, description: e.target.value }))} placeholder="Tattoos, distinguishing features, behavior…" style={{ ...inp, minHeight: '60px', resize: 'vertical' as const, fontSize: '0.85rem' }} /></div>

                                            {/* Person media */}
                                            <div>
                                                <label style={lbl}>Photo / Video of This Person</label>
                                                <MediaStrip items={iCurrentPerson.media} onAdd={handlePersonMediaAdd} onRemove={i => setICurrentPerson(p => ({ ...p, media: p.media.filter((_, j) => j !== i) }))} fileRef={iPersonMediaRef} label="Attach Photo or Video" />
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
                                            <button type="button" onClick={() => { setICurrentPerson(blankPerson()); setIShowPersonForm(false); }} style={{ background: 'none', border: '1px solid #374151', color: '#9ca3af', padding: '0.5rem 0.9rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>Cancel</button>
                                            <button type="button" onClick={addPersonToList} style={{ background: '#1d4ed8', color: 'white', border: 'none', padding: '0.5rem 1.1rem', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>Add Person</button>
                                        </div>
                                    </div>
                                ) : (
                                    <button type="button" onClick={() => setIShowPersonForm(true)}
                                        style={{ background: '#1f2937', color: '#60a5fa', border: '1px dashed #3b82f6', borderRadius: '8px', padding: '0.6rem 1rem', cursor: 'pointer', fontSize: '0.85rem', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                                        <Plus size={14} /> Add Person Involved
                                    </button>
                                )}
                            </div>

                            {/* ── Description Timeline ── */}
                            <div>
                                <p style={sectionHead}>Incident Description</p>
                                <p style={{ color: '#6b7280', fontSize: '0.78rem', margin: '-0.25rem 0 0.75rem' }}>Add one or more entries, each with a date/time stamp.</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {iTimeline.map((t, ti) => (
                                        <div key={t._key} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', padding: '0.75rem' }}>
                                            <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.6rem', alignItems: 'flex-end' }}>
                                                <div style={{ flex: 1 }}>
                                                    <label style={{ ...lbl, marginBottom: '0.3rem' }}>Date</label>
                                                    <input type="date" value={t.segment_date} onChange={e => updateTimeline(t._key, 'segment_date', e.target.value)} style={{ ...inp, fontSize: '0.82rem', padding: '0.45rem 0.7rem' }} />
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <label style={{ ...lbl, marginBottom: '0.3rem' }}>Time</label>
                                                    <input type="time" value={t.segment_time} onChange={e => updateTimeline(t._key, 'segment_time', e.target.value)} style={{ ...inp, fontSize: '0.82rem', padding: '0.45rem 0.7rem' }} />
                                                </div>
                                                {iTimeline.length > 1 && (
                                                    <button type="button" onClick={() => removeTimelineEntry(t._key)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '4px', marginBottom: '2px', flexShrink: 0 }}><X size={14} /></button>
                                                )}
                                            </div>
                                            <textarea value={t.description} onChange={e => updateTimeline(t._key, 'description', e.target.value)}
                                                placeholder={`Description for entry ${ti + 1}…`}
                                                style={{ ...inp, minHeight: '80px', resize: 'vertical' as const, fontSize: '0.85rem' }} />
                                        </div>
                                    ))}
                                    <button type="button" onClick={addTimelineEntry}
                                        style={{ background: 'transparent', color: '#9ca3af', border: '1px dashed #374151', borderRadius: '8px', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.82rem', width: '100%' }}>
                                        + Add Another Entry
                                    </button>
                                </div>
                            </div>

                            {/* ── Reported By ── */}
                            <div>
                                <p style={sectionHead}>Reported By</p>
                                <select value={iReporterUserId} onChange={e => setIReporterUserId(e.target.value)} style={inp}>
                                    <option value="">— Select employee —</option>
                                    {employees.map(emp => (
                                        <option key={emp.id} value={emp.id}>
                                            {emp.first_name} {emp.last_name}{emp.display_name && emp.display_name !== `${emp.first_name} ${emp.last_name}` ? ` (${emp.display_name})` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #1f2937', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowAddIncident(false)} style={{ background: 'none', border: '1px solid #374151', color: '#9ca3af', padding: '0.6rem 1rem', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
                            <button onClick={saveIncident} disabled={iSaving}
                                style={{ background: '#d97706', color: 'white', border: 'none', padding: '0.6rem 1.5rem', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', opacity: iSaving ? 0.5 : 1 }}>
                                {iSaving ? 'Saving…' : 'Submit Report'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Email incident report modal ── */}
            {emailIncident && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '12px', width: '100%', maxWidth: '480px', overflow: 'hidden' }}>
                        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #1f2937', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <Mail size={16} style={{ color: '#a78bfa' }} />
                                <span style={{ fontWeight: 700, color: 'white', fontSize: '0.95rem' }}>Email Incident Report</span>
                            </div>
                            <button onClick={() => setEmailIncident(null)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '2px' }}><X size={16} /></button>
                        </div>

                        <div style={{ padding: '1.25rem 1.5rem' }}>
                            {emailDone ? (
                                <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✓</div>
                                    <div style={{ color: '#34d399', fontWeight: 700, marginBottom: '0.25rem' }}>Report sent!</div>
                                    <div style={{ color: '#6b7280', fontSize: '0.85rem' }}>The incident report ZIP was emailed to {emailTo}</div>
                                </div>
                            ) : (
                                <>
                                    <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: '0 0 1rem' }}>
                                        A PDF report with all media will be zipped and sent as an email attachment.
                                    </p>

                                    {employees.filter(e => e.email).length > 0 && (
                                        <div style={{ marginBottom: '0.75rem' }}>
                                            <label style={{ display: 'block', fontSize: '0.8rem', color: '#9ca3af', marginBottom: '0.35rem' }}>Quick-select an org user</label>
                                            <select
                                                value=""
                                                onChange={e => { if (e.target.value) setEmailTo(e.target.value); }}
                                                style={{ width: '100%', background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: 'white', padding: '0.5rem 0.75rem', fontSize: '0.875rem', outline: 'none' }}>
                                                <option value="">— Select to pre-fill —</option>
                                                {employees.filter(e => e.email).map(e => (
                                                    <option key={e.id} value={e.email!}>
                                                        {e.first_name} {e.last_name} ({e.email})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    <div style={{ marginBottom: '1rem' }}>
                                        <label style={{ display: 'block', fontSize: '0.8rem', color: '#9ca3af', marginBottom: '0.35rem' }}>Recipient email address</label>
                                        <input
                                            type="email"
                                            value={emailTo}
                                            onChange={e => { setEmailTo(e.target.value); setEmailError(''); }}
                                            placeholder="recipient@example.com"
                                            style={{ width: '100%', background: '#1f2937', border: `1px solid ${emailError ? '#ef4444' : '#374151'}`, borderRadius: '8px', color: 'white', padding: '0.5rem 0.75rem', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }}
                                        />
                                        {emailError && <p style={{ color: '#ef4444', fontSize: '0.8rem', margin: '0.35rem 0 0' }}>{emailError}</p>}
                                    </div>
                                </>
                            )}
                        </div>

                        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #1f2937', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button onClick={() => setEmailIncident(null)} style={{ background: 'none', border: '1px solid #374151', color: '#9ca3af', padding: '0.6rem 1rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem' }}>
                                {emailDone ? 'Close' : 'Cancel'}
                            </button>
                            {!emailDone && (
                                <button
                                    disabled={emailSending || !emailTo.trim()}
                                    onClick={async () => {
                                        setEmailError('');
                                        setEmailSending(true);
                                        try {
                                            const res = await fetch('/api/admin/security/incidents/email-report', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ incidentId: emailIncident!.id, to: emailTo.trim() }),
                                            });
                                            const data = await res.json();
                                            if (!res.ok) throw new Error(data.error || 'Failed to send');
                                            setEmailDone(true);
                                        } catch (err: any) {
                                            setEmailError(err.message || 'Failed to send email');
                                        } finally {
                                            setEmailSending(false);
                                        }
                                    }}
                                    style={{ background: emailSending || !emailTo.trim() ? '#374151' : '#7c3aed', color: 'white', border: 'none', padding: '0.6rem 1.25rem', borderRadius: '8px', fontWeight: 700, cursor: emailSending || !emailTo.trim() ? 'not-allowed' : 'pointer', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <Mail size={14} />
                                    {emailSending ? 'Sending…' : 'Send Report'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
