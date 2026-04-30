'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, Save, User } from 'lucide-react';

interface Profile {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    bio: string;
    display_name: string;
    profile_picture: string | null;
    notification_preferences: Record<string, boolean>;
}

// ── Simple canvas circle-crop component ──────────────────────────────────────
function CircleCropper({ src, onSave, onCancel }: {
    src: string;
    onSave: (dataUrl: string) => void;
    onCancel: () => void;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [scale, setScale] = useState(1);
    const [offsetX, setOffsetX] = useState(0);
    const [offsetY, setOffsetY] = useState(0);
    const [dragging, setDragging] = useState(false);
    const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
    const imgRef = useRef<HTMLImageElement | null>(null);
    const SIZE = 280;

    useEffect(() => {
        const img = new Image();
        img.onload = () => {
            imgRef.current = img;
            setScale(Math.max(SIZE / img.width, SIZE / img.height));
            setOffsetX(0);
            setOffsetY(0);
        };
        img.src = src;
    }, [src]);

    useEffect(() => {
        const img = imgRef.current;
        const canvas = canvasRef.current;
        if (!img || !canvas) return;
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, SIZE, SIZE);
        // Clip to circle
        ctx.save();
        ctx.beginPath();
        ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
        ctx.clip();
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, SIZE / 2 - w / 2 + offsetX, SIZE / 2 - h / 2 + offsetY, w, h);
        ctx.restore();
        // Draw circle border
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 1, 0, Math.PI * 2);
        ctx.stroke();
    }, [scale, offsetX, offsetY]);

    const onMouseDown = (e: React.MouseEvent) => {
        setDragging(true);
        dragStart.current = { x: e.clientX, y: e.clientY, ox: offsetX, oy: offsetY };
    };
    const onMouseMove = (e: React.MouseEvent) => {
        if (!dragging) return;
        setOffsetX(dragStart.current.ox + e.clientX - dragStart.current.x);
        setOffsetY(dragStart.current.oy + e.clientY - dragStart.current.y);
    };
    const onMouseUp = () => setDragging(false);

    const handleSave = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        onSave(canvas.toDataURL('image/jpeg', 0.85));
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1.5rem',
        }}>
            <h3 style={{ color: 'white', margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Crop Profile Picture</h3>
            <p style={{ color: '#9ca3af', margin: 0, fontSize: '0.85rem' }}>Drag to reposition • Scroll or use slider to zoom</p>
            <canvas
                ref={canvasRef}
                width={SIZE}
                height={SIZE}
                style={{ borderRadius: '50%', cursor: dragging ? 'grabbing' : 'grab', border: '2px solid #374151' }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
                onWheel={e => setScale(s => Math.max(0.3, Math.min(5, s - e.deltaY * 0.002)))}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Zoom</span>
                <input type="range" min="0.3" max="5" step="0.05" value={scale}
                    onChange={e => setScale(parseFloat(e.target.value))}
                    style={{ width: '180px', accentColor: '#3b82f6' }} />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={handleSave} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '0.6rem 1.5rem', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>
                    Use This Photo
                </button>
                <button onClick={onCancel} style={{ background: '#374151', color: '#d1d5db', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
                    Cancel
                </button>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ProfileClient() {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [form, setForm] = useState<Partial<Profile>>({});
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');
    const [cropSrc, setCropSrc] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetch('/api/admin/profile').then(r => r.json()).then(d => {
            setProfile(d.user);
            setForm({
                display_name: d.user.display_name || '',
                phone: d.user.phone || '',
                bio: d.user.bio || '',
                profile_picture: d.user.profile_picture || null,
                notification_preferences: d.user.notification_preferences || {},
            });
        });
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => setCropSrc(ev.target?.result as string);
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleCropSave = (dataUrl: string) => {
        setForm(f => ({ ...f, profile_picture: dataUrl }));
        setCropSrc(null);
    };

    const handleSave = async () => {
        setSaving(true);
        setMsg('');
        const res = await fetch('/api/admin/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form),
        });
        setSaving(false);
        setMsg(res.ok ? 'Profile saved.' : 'Failed to save.');
        setTimeout(() => setMsg(''), 3000);
    };

    const inp: React.CSSProperties = {
        background: '#1f2937', border: '1px solid #374151', borderRadius: '8px',
        color: 'white', padding: '0.6rem 0.9rem', fontSize: '0.9rem', width: '100%', outline: 'none',
    };
    const label: React.CSSProperties = { color: '#9ca3af', fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' };

    if (!profile) return <div style={{ padding: '2rem', color: 'white' }}>Loading…</div>;

    return (
        <div style={{ maxWidth: '640px', margin: '2rem auto', padding: '0 1rem', color: 'white' }}>
            {cropSrc && (
                <CircleCropper src={cropSrc} onSave={handleCropSave} onCancel={() => setCropSrc(null)} />
            )}

            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>My Profile</h1>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '2rem' }}>Update your display name, picture, and notification preferences.</p>

            {/* Avatar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2rem' }}>
                <div style={{ position: 'relative' }}>
                    {form.profile_picture ? (
                        <img src={form.profile_picture} alt="avatar" style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', border: '3px solid #374151' }} />
                    ) : (
                        <div style={{ width: 96, height: 96, borderRadius: '50%', background: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', fontWeight: 700, border: '3px solid #374151' }}>
                            {profile.first_name?.[0]?.toUpperCase()}
                        </div>
                    )}
                    <button
                        onClick={() => fileRef.current?.click()}
                        style={{ position: 'absolute', bottom: 0, right: 0, background: '#3b82f6', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                        <Camera size={14} color="white" />
                    </button>
                </div>
                <div>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{profile.first_name} {profile.last_name}</div>
                    <div style={{ color: '#6b7280', fontSize: '0.85rem' }}>{profile.email}</div>
                    <button onClick={() => fileRef.current?.click()} style={{ marginTop: '0.5rem', background: 'none', border: '1px solid #374151', borderRadius: '6px', color: '#9ca3af', padding: '4px 12px', cursor: 'pointer', fontSize: '0.8rem' }}>
                        Change Photo
                    </button>
                </div>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
            </div>

            <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '12px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '1.5rem' }}>
                <div>
                    <label style={label}>Display Name</label>
                    <input style={inp} value={form.display_name || ''} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} placeholder={`${profile.first_name} ${profile.last_name}`} />
                    <p style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '0.3rem' }}>Shown on feed posts and messages instead of your real name.</p>
                </div>
                <div>
                    <label style={label}>Phone</label>
                    <input style={inp} value={form.phone || ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(555) 000-0000" />
                </div>
                <div>
                    <label style={label}>Bio</label>
                    <textarea style={{ ...inp, minHeight: '80px', resize: 'vertical' as const }} value={form.bio || ''} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} placeholder="Say something about yourself…" />
                </div>
            </div>

            <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: '0 0 1rem', fontSize: '0.95rem', fontWeight: 700 }}>Email Notifications</h3>
                {[
                    { key: 'new_message', label: 'New message received' },
                    { key: 'post_tag', label: 'Tagged in a post' },
                    { key: 'low_stock', label: 'Low stock alerts' },
                    { key: 'shift_report', label: 'Shift report' },
                ].map(({ key, label: lbl }) => (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={!!(form.notification_preferences as any)?.[key]}
                            onChange={e => setForm(f => ({
                                ...f,
                                notification_preferences: { ...(f.notification_preferences || {}), [key]: e.target.checked },
                            }))}
                            style={{ width: 16, height: 16, accentColor: '#3b82f6' }}
                        />
                        <span style={{ color: '#e5e7eb', fontSize: '0.875rem' }}>{lbl}</span>
                    </label>
                ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button onClick={handleSave} disabled={saving} style={{ background: '#1d4ed8', color: 'white', border: 'none', padding: '0.65rem 1.5rem', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', opacity: saving ? 0.7 : 1 }}>
                    <Save size={15} /> {saving ? 'Saving…' : 'Save Profile'}
                </button>
                {msg && <span style={{ color: msg.includes('Failed') ? '#ef4444' : '#34d399', fontSize: '0.85rem' }}>{msg}</span>}
            </div>
        </div>
    );
}
