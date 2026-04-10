'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../admin.module.css';
import { Smartphone, Trash2, Edit, Upload, X, Image } from 'lucide-react';
import NotificationSettings from '@/components/NotificationSettings';
import SignatureManager from '@/components/SignatureManager';

export default function SettingsClient() {
    const router = useRouter();
    const [settings, setSettings] = useState({
        report_emails: '',
        smtp_host: '',
        smtp_port: '587',
        smtp_user: '',
        smtp_pass: '',
        report_time: '08:00',
        low_stock_threshold: '5',
        report_title: 'Daily Stock Report',
        backup_time: '06:00',
        low_stock_alert_enabled: 'false',
        low_stock_alert_emails: '',
        low_stock_alert_time: '14:00',
        low_stock_alert_title: 'URGENT: Low Stock Alert',
        track_bottle_levels: 'true',
        subdomain: '',
        ai_ordering_enabled: 'false',
        ai_ordering_email: '',
        ai_ordering_phone: '',
        stock_count_mode: 'CATEGORY',
        allow_custom_increment: 'false',
        smart_order_per_location: 'false',
        per_location_pricing: 'false',
        workday_start: '06:00',
        profit_reporting_mode: 'off',           // 'off' | 'per_item' | 'total'
        order_confirmation_recipients: '[]',    // JSON array of user IDs
    });

    const [users, setUsers] = useState<any[]>([]);

    const HistoryList = () => {
        const [history, setHistory] = useState<any[]>([]);
        const [loadingH, setLoadingH] = useState(true);

        useEffect(() => {
            fetch('/api/admin/notifications?limit=20')
                .then(res => res.json())
                .then(data => {
                    if (data.notifications) setHistory(data.notifications);
                    setLoadingH(false);
                })
                .catch(() => setLoadingH(false));
        }, []);

        if (loadingH) return <div style={{ color: '#9ca3af' }}>Loading history...</div>;
        if (history.length === 0) return <div style={{ color: '#9ca3af' }}>No order history found.</div>;

        return (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {history.map(h => {
                    let details = {};
                    try { details = h.data || {}; } catch { }
                    return (
                        <li key={h.id} style={{ borderBottom: '1px solid #374151', padding: '0.5rem 0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#e5e7eb' }}>
                                <span style={{ fontWeight: 'bold' }}>{h.title}</span>
                                <span style={{ color: '#9ca3af' }}>{new Date(h.created_at).toLocaleDateString()}</span>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '0.25rem' }}>{h.message}</div>
                            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                                {(details as any).channel} to: {(details as any).recipient}
                            </div>
                        </li>
                    );
                })}
            </ul>
        );
    };
    const [options, setOptions] = useState<any[]>([]);
    const [newOption, setNewOption] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [registeringDevice, setRegisteringDevice] = useState(false);

    // Branding
    const [branding, setBranding] = useState({
        logo_url: null as string | null,
        brand_color: '#f59e0b',
        brand_name: '',
        logo_position: 'left' as 'left' | 'center' | 'right',
    });
    const [brandingSaving, setBrandingSaving] = useState(false);
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    const logoInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetch('/api/admin/settings')
            .then(res => res.json())
            .then(data => {
                setSettings(prev => ({ ...prev, ...data.settings }));
                setLoading(false);
            });
        fetch('/api/admin/branding')
            .then(r => r.json())
            .then(d => {
                if (d.logo_url !== undefined) setBranding({
                    logo_url: d.logo_url,
                    brand_color: d.brand_color || '#f59e0b',
                    brand_name: d.brand_name || '',
                    logo_position: d.logo_position || 'left',
                });
            });
        fetchOptions();
        fetchUsers();
    }, []);

    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

    useEffect(() => {
        const handler = (e: any) => {
            e.preventDefault();
            setDeferredPrompt(e);
        };
        window.addEventListener('beforeinstallprompt', handler);
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            setDeferredPrompt(null);
        }
    };

    const fetchOptions = () => {
        fetch('/api/admin/settings/options')
            .then(res => res.json())
            .then(data => setOptions(data.options || []));
    };

    const fetchUsers = () => {
        fetch('/api/admin/users').then(r => r.json()).then(d => setUsers(d.users || []));
    };

    const handleAddOption = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newOption) return;
        await fetch('/api/admin/settings/options', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: newOption })
        });
        setNewOption('');
        fetchOptions();
    };

    const handleDeleteOption = async (id: number) => {
        if (!confirm('Delete this option?')) return;
        await fetch('/api/admin/settings/options', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        fetchOptions();
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setSettings(prev => ({ ...prev, [name]: value }));
    };

    // Collect a hardware-bound fingerprint for device registration security
    async function collectDeviceFingerprint(): Promise<string> {
        const canvasHash = await (async () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = 200; canvas.height = 40;
                const ctx = canvas.getContext('2d');
                if (!ctx) return 'no-canvas';
                ctx.textBaseline = 'top';
                ctx.font = '14px Arial, sans-serif';
                ctx.fillStyle = '#f60';
                ctx.fillRect(125, 1, 62, 20);
                ctx.fillStyle = '#069';
                ctx.fillText('TopShelf\u{1F378}', 2, 15);
                ctx.fillStyle = 'rgba(102,204,0,0.7)';
                ctx.fillText('TopShelf\u{1F378}', 4, 17);
                return canvas.toDataURL('image/png').slice(-80);
            } catch { return 'canvas-error'; }
        })();

        const components = [
            navigator.userAgent,
            navigator.platform,
            navigator.language,
            String(screen.width),
            String(screen.height),
            String(screen.colorDepth),
            String(navigator.hardwareConcurrency || '0'),
            String((navigator as any).deviceMemory || '0'),
            Intl.DateTimeFormat().resolvedOptions().timeZone,
            canvasHash,
        ].join('||');

        const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(components));
        return Array.from(new Uint8Array(buffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const res = await fetch('/api/admin/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            if (res.ok) alert('Settings Saved');
            else alert('Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const handleRegisterDevice = async () => {
        const deviceLabel = prompt('Enter a name for this device (e.g. "Bar iPad", "POS Station 1"):', 'Bar Station');
        if (deviceLabel === null) return; // cancelled
        setRegisteringDevice(true);
        try {
            // Collect hardware fingerprint to bind the token to this specific device
            const fingerprintHash = await collectDeviceFingerprint();

            const res = await fetch('/api/auth/station-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    deviceName: deviceLabel || navigator.userAgent,
                    fingerprintHash,
                })
            });
            if (res.ok) {
                const data = await res.json();
                // Redirect to PIN login — use /pin if no subdomain configured
                const pinUrl = data.subdomain
                    ? `/o/${data.subdomain}`
                    : `/pin?orgId=${data.orgId}`;
                if (confirm(`Device "${deviceLabel}" registered for 90 days.\n\nThis page will now switch to PIN-only login mode. Admins can still log in with email & password from the main login page.`)) {
                    window.location.href = pinUrl;
                }
            } else {
                alert('Failed to register device.');
            }
        } catch (e) {
            console.error(e);
            alert('Error registering device.');
        } finally {
            setRegisteringDevice(false);
        }
    };

    const handleTestEmail = async () => {
        if (!settings.report_emails || !settings.smtp_host) {
            alert('Please configure SMTP settings and Report Emails first.');
            return;
        }
        if (!confirm(`Send test emails to ${settings.report_emails}?`)) return;

        try {
            const res = await fetch('/api/admin/settings/test-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            const data = await res.json();
            if (res.ok) alert(data.message || 'Emails Sent!');
            else alert(data.error || 'Failed to send emails');
        } catch (e) {
            alert('Error sending emails');
        }
    };

    const handleBrandingSave = async () => {
        setBrandingSaving(true);
        try {
            const fd = new FormData();
            if (logoFile) fd.append('logo', logoFile);
            fd.append('brand_color', branding.brand_color);
            fd.append('brand_name', branding.brand_name);
            fd.append('logo_position', branding.logo_position);
            const res = await fetch('/api/admin/branding', { method: 'POST', body: fd });
            if (res.ok) {
                const d = await res.json();
                setBranding(prev => ({ ...prev, logo_url: d.settings?.logo_url ?? prev.logo_url }));
                setLogoFile(null);
                setLogoPreview(null);
                alert('Branding saved!');
            } else alert('Failed to save branding');
        } finally {
            setBrandingSaving(false);
        }
    };

    const handleRemoveLogo = async () => {
        if (!confirm('Remove logo?')) return;
        await fetch('/api/admin/branding', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ remove_logo: true }),
        });
        setBranding(prev => ({ ...prev, logo_url: null }));
        setLogoPreview(null);
        setLogoFile(null);
    };

    if (loading) return <div className={styles.container}>Loading...</div>;

    return (
        <>
            <div className={styles.grid}>

                {/* Branding Section */}
                <div className={styles.card} style={{ gridColumn: 'span 2' }}>
                    <div className={styles.cardTitle} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Image size={20} color="#f59e0b" /> Branding
                    </div>
                    <p style={{ color: '#9ca3af', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                        Your logo and brand colors appear on printed orders and reports.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                        {/* Logo Upload */}
                        <div>
                            <label className={styles.statLabel}>Company Logo</label>
                            <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {(logoPreview || branding.logo_url) && (
                                    <div style={{ position: 'relative', display: 'inline-block' }}>
                                        <img
                                            src={logoPreview || branding.logo_url!}
                                            alt="Logo"
                                            style={{ maxHeight: '80px', maxWidth: '200px', objectFit: 'contain', background: '#fff', padding: '8px', borderRadius: '6px', border: '1px solid #374151' }}
                                        />
                                        <button
                                            onClick={() => { setLogoPreview(null); setLogoFile(null); if (!logoPreview) handleRemoveLogo(); }}
                                            style={{ position: 'absolute', top: '-6px', right: '-6px', background: '#ef4444', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', color: 'white', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        >×</button>
                                    </div>
                                )}
                                <input
                                    ref={logoInputRef}
                                    type="file"
                                    accept="image/*"
                                    style={{ display: 'none' }}
                                    onChange={e => {
                                        const f = e.target.files?.[0];
                                        if (!f) return;
                                        setLogoFile(f);
                                        const reader = new FileReader();
                                        reader.onload = ev => setLogoPreview(ev.target?.result as string);
                                        reader.readAsDataURL(f);
                                    }}
                                />
                                <button
                                    onClick={() => logoInputRef.current?.click()}
                                    style={{ padding: '0.5rem 1rem', background: '#1f2937', border: '1px dashed #4b5563', borderRadius: '0.5rem', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
                                >
                                    <Upload size={14} /> {branding.logo_url ? 'Replace Logo' : 'Upload Logo'}
                                </button>
                            </div>
                        </div>

                        {/* Brand Name */}
                        <div>
                            <label className={styles.statLabel}>Company Name (on documents)</label>
                            <input
                                className={styles.input}
                                style={{ width: '100%', marginTop: '0.5rem' }}
                                value={branding.brand_name}
                                onChange={e => setBranding(prev => ({ ...prev, brand_name: e.target.value }))}
                                placeholder="e.g. The Downtown Bar"
                            />
                        </div>

                        {/* Brand Color */}
                        <div>
                            <label className={styles.statLabel}>Accent Color</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
                                <input
                                    type="color"
                                    value={branding.brand_color}
                                    onChange={e => setBranding(prev => ({ ...prev, brand_color: e.target.value }))}
                                    style={{ width: '48px', height: '36px', border: 'none', borderRadius: '4px', cursor: 'pointer', background: 'transparent' }}
                                />
                                <input
                                    className={styles.input}
                                    value={branding.brand_color}
                                    onChange={e => setBranding(prev => ({ ...prev, brand_color: e.target.value }))}
                                    style={{ width: '110px' }}
                                    placeholder="#f59e0b"
                                />
                                <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>Used on document headers</span>
                            </div>
                        </div>

                        {/* Logo Position */}
                        <div>
                            <label className={styles.statLabel}>Logo Position on Documents</label>
                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                                {(['left', 'center', 'right'] as const).map(pos => (
                                    <button
                                        key={pos}
                                        onClick={() => setBranding(prev => ({ ...prev, logo_position: pos }))}
                                        style={{
                                            flex: 1,
                                            padding: '0.5rem',
                                            background: branding.logo_position === pos ? branding.brand_color : '#1f2937',
                                            color: branding.logo_position === pos ? 'white' : '#9ca3af',
                                            border: `1px solid ${branding.logo_position === pos ? branding.brand_color : '#374151'}`,
                                            borderRadius: '0.375rem',
                                            cursor: 'pointer',
                                            textTransform: 'capitalize',
                                            fontWeight: branding.logo_position === pos ? 700 : 400,
                                            fontSize: '0.85rem',
                                        }}
                                    >
                                        {pos}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Preview Banner */}
                    {(logoPreview || branding.logo_url || branding.brand_name) && (
                        <div style={{ marginTop: '1.5rem', background: '#fff', borderRadius: '0.5rem', padding: '1rem 1.5rem', border: `3px solid ${branding.brand_color}`, display: 'flex', alignItems: 'center', justifyContent: branding.logo_position === 'center' ? 'center' : branding.logo_position === 'right' ? 'flex-end' : 'flex-start', gap: '1rem' }}>
                            {(logoPreview || branding.logo_url) && (
                                <img src={logoPreview || branding.logo_url!} alt="Logo" style={{ height: '48px', objectFit: 'contain' }} />
                            )}
                            {branding.brand_name && (
                                <span style={{ color: branding.brand_color, fontWeight: 700, fontSize: '1.2rem', fontFamily: 'sans-serif' }}>{branding.brand_name}</span>
                            )}
                        </div>
                    )}

                    <button
                        onClick={handleBrandingSave}
                        disabled={brandingSaving}
                        style={{ marginTop: '1.5rem', padding: '0.6rem 1.5rem', background: branding.brand_color, color: 'white', border: 'none', borderRadius: '0.5rem', cursor: brandingSaving ? 'not-allowed' : 'pointer', fontWeight: 700, opacity: brandingSaving ? 0.7 : 1 }}
                    >
                        {brandingSaving ? 'Saving...' : 'Save Branding'}
                    </button>
                </div>

                {/* Organization & App Section */}
                <div className={styles.card} style={{ gridColumn: 'span 2' }}>
                    <div className={styles.cardTitle}>Organization & App</div>

                    <div style={{ marginBottom: '2rem' }}>
                        <div style={{ marginBottom: '1rem' }}>
                            <label className={styles.statLabel}>Organization URL ID (Subdomain)</label>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <span style={{ color: '#9ca3af' }}>https://www.topshelfinventory.com/o/</span>
                                <input
                                    value={settings.subdomain || ''}
                                    onChange={(e) => setSettings(prev => ({ ...prev, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                                    placeholder="downtown-bar"
                                    className={styles.table}
                                    style={{ background: '#1f2937', color: 'white', padding: '0.5rem', border: '1px solid #374151', borderRadius: '0.25rem', flex: 1 }}
                                />
                            </div>
                            <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.25rem' }}>
                                Use this ID for custom login URLs. Must be unique.
                            </p>
                            <button
                                onClick={handleSubmit}
                                disabled={saving}
                                style={{ marginTop: '0.5rem', padding: '0.5rem 1rem', background: '#3b82f6', color: 'white', borderRadius: '0.25rem', border: 'none', cursor: 'pointer' }}
                            >
                                Update URL ID
                            </button>
                        </div>
                    </div>

                    <div style={{ borderTop: '1px solid #374151', paddingTop: '1.5rem' }}>
                        <div className={styles.cardTitle} style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Smartphone size={20} className="text-green-500" /> Mobile App Shortcut
                        </div>
                        <p style={{ color: '#9ca3af', marginBottom: '1rem' }}>
                            Install this app to your Android home screen for quick fullscreen access.
                        </p>

                        {deferredPrompt ? (
                            <button
                                onClick={handleInstallClick}
                                style={{
                                    padding: '0.75rem 1.5rem',
                                    background: '#059669',
                                    color: 'white',
                                    borderRadius: '0.5rem',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem'
                                }}
                            >
                                <Smartphone size={18} /> Add to Home Screen
                            </button>
                        ) : (
                            <div style={{ background: '#1f2937', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #374151' }}>
                                <p style={{ color: '#e5e7eb', margin: '0 0 0.5rem 0', fontWeight: 'bold' }}>To install manually on Android (Chrome):</p>
                                <ol style={{ margin: 0, paddingLeft: '1.2rem', color: '#d1d5db', fontSize: '0.9rem' }}>
                                    <li>Tap the browser menu (⋮) at the top right.</li>
                                    <li>Select <strong>"Add to Home screen"</strong> or <strong>"Install App"</strong>.</li>
                                </ol>
                            </div>
                        )}
                    </div>
                </div>

                {/* Stock Count Mode Config */}
                <div className={styles.card} style={{ gridColumn: 'span 2' }}>
                    <div className={styles.cardTitle}>Global Stock Counting Mode</div>
                    <p style={{ color: '#9ca3af', marginBottom: '1rem' }}>
                        Choose how your inventory counts are entered. Changing this affects the "Stock View" and "Bottles" pages.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: '#1f2937', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #374151' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}>
                            <input
                                type="radio"
                                name="stock_count_mode"
                                value="CATEGORY"
                                checked={(settings as any).stock_count_mode === 'CATEGORY'}
                                onChange={handleChange}
                                style={{ width: '20px', height: '20px' }}
                            />
                            <div>
                                <div style={{ color: 'white', fontWeight: 'bold' }}>Category Level Counting</div>
                                <div style={{ fontSize: '0.85rem', color: '#9ca3af' }}>Stock is entered per category (e.g. "Liquor" page lists all liquors).</div>
                            </div>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}>
                            <input
                                type="radio"
                                name="stock_count_mode"
                                value="PRODUCT"
                                checked={(settings as any).stock_count_mode === 'PRODUCT'}
                                onChange={handleChange}
                                style={{ width: '20px', height: '20px' }}
                            />
                            <div>
                                <div style={{ color: 'white', fontWeight: 'bold' }}>Product Level Counting</div>
                                <div style={{ fontSize: '0.85rem', color: '#9ca3af' }}>Stock is entered on the master Product List. Good for large warehouses.</div>
                            </div>
                        </label>
                    </div>

                    <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', background: '#1f2937', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #374151' }}>
                        <input
                            type="checkbox"
                            checked={(settings as any).allow_custom_increment === 'true'}
                            onChange={(e) => setSettings(prev => ({ ...prev, allow_custom_increment: e.target.checked ? 'true' : 'false' }))}
                            style={{ width: '20px', height: '20px' }}
                        />
                        <div>
                            <div style={{ color: 'white', fontWeight: 'bold' }}>Allow Custom Increments</div>
                            <div style={{ fontSize: '0.85rem', color: '#9ca3af' }}>If enabled, staff can manually enter any quantity to add/subtract.</div>
                        </div>
                    </div>

                    <div style={{ marginTop: '1rem' }}>
                        <button onClick={handleSubmit} style={{ padding: '0.5rem 1rem', background: '#3b82f6', color: 'white', borderRadius: '0.25rem', border: 'none', cursor: 'pointer' }}>
                            Save Preference
                        </button>
                    </div>
                </div>

                <div className={styles.card} style={{ gridColumn: 'span 2' }}>
                    <div className={styles.cardTitle} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Smartphone size={20} className="text-amber-500" /> Station Mode (Kiosk)
                    </div>
                    <p style={{ color: '#9ca3af', marginBottom: '1rem' }}>
                        Register this current device to allow 90-day persistent access via PIN code only.
                        Useful for bar terminals (iPads, POS).
                    </p>
                    <div style={{ background: '#1f2937', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #374151' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h4 style={{ color: 'white', margin: '0 0 0.25rem 0' }}>Enable Persistent Access</h4>
                                <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: 0 }}>
                                    Bypasses email/password login for 90 days on this browser.
                                </p>
                            </div>
                            <button
                                onClick={handleRegisterDevice}
                                disabled={registeringDevice}
                                style={{
                                    padding: '0.5rem 1.5rem',
                                    background: registeringDevice ? '#4b5563' : '#059669',
                                    color: 'white',
                                    borderRadius: '0.25rem',
                                    border: 'none',
                                    cursor: registeringDevice ? 'not-allowed' : 'pointer',
                                    fontWeight: 'bold'
                                }}
                            >
                                {registeringDevice ? 'Registering...' : 'Register Device'}
                            </button>
                        </div>
                    </div>
                </div>

                <div className={styles.card} style={{ gridColumn: 'span 2' }}>
                    <div className={styles.cardTitle}>Smart Ordering Automation</div>
                    <p style={{ color: '#9ca3af', marginBottom: '1rem' }}>
                        Enable or disable the AI-driven smart ordering system for this organization.
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1f2937', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #374151' }}>
                        <div>
                            <div style={{ fontWeight: 'bold', color: settings.ai_ordering_enabled === 'true' ? '#10b981' : '#ef4444' }}>
                                {settings.ai_ordering_enabled === 'true' ? 'System Enabled' : 'System Disabled'}
                            </div>
                            <div style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
                                {settings.ai_ordering_enabled === 'true' ? 'Automated orders will be drafted based on stock levels.' : 'No automated ordering activity.'}
                            </div>
                        </div>
                        <label className={styles.switch}>
                            <input
                                type="checkbox"
                                checked={settings.ai_ordering_enabled === 'true'}
                                onChange={(e) => setSettings(prev => ({ ...prev, ai_ordering_enabled: e.target.checked ? 'true' : 'false' }))}
                            />
                            <span className={styles.slider}></span>
                        </label>
                    </div>

                    {settings.ai_ordering_enabled === 'true' && (
                        <div style={{ marginTop: '1rem', borderTop: '1px solid #374151', paddingTop: '1rem' }}>
                            <div style={{ marginBottom: '1rem' }}>
                                <label className={styles.statLabel}>Supplier Ordering Email (Default)</label>
                                <input
                                    name="ai_ordering_email"
                                    value={settings.ai_ordering_email || ''}
                                    onChange={handleChange}
                                    placeholder="orders@supplier.com"
                                    className={styles.input}
                                    style={{ width: '100%', background: '#111827', color: 'white', padding: '0.5rem', border: '1px solid #374151', borderRadius: '0.25rem' }}
                                />
                                <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>Fallback email if item has no specific supplier email.</p>
                            </div>
                            <div style={{ marginBottom: '1rem' }}>
                                <label className={styles.statLabel}>Ordering SMS Number</label>
                                <input
                                    name="ai_ordering_phone"
                                    value={settings.ai_ordering_phone || ''}
                                    onChange={handleChange}
                                    placeholder="+1-555-0199"
                                    className={styles.input}
                                    style={{ width: '100%', background: '#111827', color: 'white', padding: '0.5rem', border: '1px solid #374151', borderRadius: '0.25rem' }}
                                />
                            </div>
                            <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#111827', padding: '0.75rem 1rem', borderRadius: '0.5rem', border: '1px solid #374151' }}>
                                <div>
                                    <div style={{ fontWeight: 'bold', color: 'white', fontSize: '0.9rem' }}>Generate Separate Orders per Location</div>
                                    <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '2px' }}>
                                        When enabled, smart orders are grouped and sent separately for each location using its assigned supplier.
                                    </div>
                                </div>
                                <label className={styles.switch}>
                                    <input
                                        type="checkbox"
                                        checked={settings.smart_order_per_location === 'true'}
                                        onChange={e => setSettings(prev => ({ ...prev, smart_order_per_location: e.target.checked ? 'true' : 'false' }))}
                                    />
                                    <span className={styles.slider}></span>
                                </label>
                            </div>
                            <button onClick={handleSubmit} style={{ padding: '0.5rem 1rem', background: '#3b82f6', color: 'white', borderRadius: '0.25rem', border: 'none', cursor: 'pointer' }}>
                                Save Configurations
                            </button>
                        </div>
                    )}

                    <div style={{ marginTop: '1.5rem', borderTop: '1px solid #374151', paddingTop: '1rem' }}>
                        <details style={{ cursor: 'pointer' }}>
                            <summary style={{ color: '#60a5fa', fontWeight: 'bold', marginBottom: '0.5rem' }}>View Order History (Sent Emails/Texts)</summary>
                            <div style={{ background: '#111827', padding: '1rem', borderRadius: '0.5rem', maxHeight: '300px', overflowY: 'auto' }}>
                                <HistoryList />
                            </div>
                        </details>
                    </div>
                </div>

                {/* Shifts & Workday Section */}
                <div className={styles.card} style={{ gridColumn: 'span 2' }}>
                    <div className={styles.cardTitle}>Workday Configuration</div>

                    <div style={{ marginBottom: '2rem' }}>
                        <label className={styles.statLabel}>Workday Start Time (Business Day)</label>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <input
                                type="time"
                                name="workday_start"
                                value={settings.workday_start || '06:00'}
                                onChange={handleChange}
                                className={styles.input}
                                style={{ background: '#1f2937', color: 'white', padding: '0.5rem', border: '1px solid #374151', borderRadius: '0.25rem' }}
                            />
                            <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: 0 }}>
                                Transactions before this time count as the previous day.
                            </p>
                        </div>
                        <button onClick={handleSubmit} style={{ marginTop: '0.5rem', padding: '0.5rem 1rem', background: '#3b82f6', color: 'white', borderRadius: '0.25rem', border: 'none', cursor: 'pointer' }}>
                            Save Workday
                        </button>
                    </div>

                    <div style={{ borderTop: '1px solid #374151', paddingTop: '1.5rem' }}>
                        <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginBottom: '1rem' }}>
                            Shift configurations have been moved to the <a href="/admin/schedule" className="text-blue-400 hover:text-blue-300">Scheduler</a> page.
                        </p>
                    </div>
                </div>

                <div className={styles.card} style={{ gridColumn: 'span 2' }}>
                    <NotificationSettings />

                    <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #374151' }}>
                        <div className={styles.cardTitle} style={{ fontSize: '1rem' }}>Email System Test</div>
                        <p style={{ fontSize: '0.9rem', color: '#9ca3af', marginBottom: '1rem' }}>
                            Send a test email to <strong>{settings.report_emails || '(No Email Configured)'}</strong> to verify SMTP settings.
                        </p>
                        <button
                            type="button"
                            onClick={handleTestEmail}
                            style={{ padding: '0.5rem 1rem', background: '#4b5563', color: 'white', border: 'none', borderRadius: '0.25rem', cursor: 'pointer' }}
                        >
                            Test All Emails
                        </button>
                    </div>
                </div>

                <div className={styles.card} style={{ gridColumn: 'span 2' }}>
                    <SignatureManager />
                </div>

                {/* Profit Reporting Mode */}
                <div className={styles.card} style={{ gridColumn: 'span 2' }}>
                    <div className={styles.cardTitle}>Profit Reporting</div>
                    <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginBottom: '1rem' }}>
                        When sale prices are set on items, choose how profit is shown in reports.
                        Sale prices are configured on the <a href="/admin/prices" style={{ color: '#3b82f6' }}>Prices</a> page.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: '#1f2937', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #374151', marginBottom: '1rem' }}>
                        {[
                            { value: 'off', label: 'Off', desc: 'Do not show profit in reports.' },
                            { value: 'per_item', label: 'Per Item', desc: 'Show profit/loss for each item in reports.' },
                            { value: 'total', label: 'Total Profit', desc: 'Show aggregate profit/loss totals in reports.' },
                        ].map(opt => (
                            <label key={opt.value} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }}>
                                <input
                                    type="radio"
                                    name="profit_reporting_mode"
                                    value={opt.value}
                                    checked={(settings as any).profit_reporting_mode === opt.value}
                                    onChange={handleChange}
                                    style={{ width: '18px', height: '18px', marginTop: '2px' }}
                                />
                                <div>
                                    <div style={{ color: 'white', fontWeight: 600 }}>{opt.label}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>{opt.desc}</div>
                                </div>
                            </label>
                        ))}
                    </div>
                    <button onClick={handleSubmit} disabled={saving} style={{ padding: '0.5rem 1rem', background: '#3b82f6', color: 'white', borderRadius: '0.25rem', border: 'none', cursor: 'pointer' }}>
                        Save
                    </button>
                </div>

                {/* Order Confirmation Recipients */}
                <div className={styles.card} style={{ gridColumn: 'span 2' }}>
                    <div className={styles.cardTitle}>Order Confirmation Notifications</div>
                    <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginBottom: '1rem' }}>
                        Select users who will receive an email when an incoming order is confirmed received (with item counts).
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: '#1f2937', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #374151', marginBottom: '1rem', maxHeight: '220px', overflowY: 'auto' }}>
                        {users.length === 0 && <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>No users found.</span>}
                        {users.map((u: any) => {
                            let recipList: number[] = [];
                            try { recipList = JSON.parse((settings as any).order_confirmation_recipients || '[]'); } catch {}
                            const checked = recipList.includes(u.id);
                            return (
                                <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', color: 'white' }}>
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={e => {
                                            let list: number[] = [];
                                            try { list = JSON.parse((settings as any).order_confirmation_recipients || '[]'); } catch {}
                                            if (e.target.checked) {
                                                list = [...list, u.id];
                                            } else {
                                                list = list.filter((id: number) => id !== u.id);
                                            }
                                            setSettings(prev => ({ ...prev, order_confirmation_recipients: JSON.stringify(list) }));
                                        }}
                                        style={{ width: '16px', height: '16px' }}
                                    />
                                    <span>{u.first_name} {u.last_name}</span>
                                    {u.email && <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>({u.email})</span>}
                                </label>
                            );
                        })}
                    </div>
                    <button onClick={handleSubmit} disabled={saving} style={{ padding: '0.5rem 1rem', background: '#3b82f6', color: 'white', borderRadius: '0.25rem', border: 'none', cursor: 'pointer' }}>
                        Save Recipients
                    </button>
                </div>

                <div className={styles.card} style={{ gridColumn: 'span 2' }}>
                    <div className={styles.cardTitle}>Bottle Level Tracking</div>
                    <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginBottom: '1rem' }}>
                        If enabled, staff will be asked to record the "Existing Bottle Level" when they replace a bottle (Subtract Stock) for Wine/Liquor.
                    </p>

                    <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                            type="checkbox"
                            checked={settings.track_bottle_levels === 'true'}
                            onChange={(e) => setSettings(prev => ({ ...prev, track_bottle_levels: e.target.checked ? 'true' : 'false' }))}
                            style={{ width: '20px', height: '20px' }}
                        />
                        <label className={styles.statLabel} style={{ marginBottom: 0, color: 'white' }}>Enable Tracking</label>
                    </div>
                    {/* Save button again for convenience if they just toggled this */}
                    <button onClick={handleSubmit} style={{ marginBottom: '2rem', padding: '0.5rem 1rem', background: '#374151', color: 'white', borderRadius: '0.25rem', cursor: 'pointer', border: 'none' }}>
                        Save Setting
                    </button>

                    <div className={styles.cardTitle} style={{ fontSize: '1rem' }}>Previous Shift Options</div>
                    <ul style={{ listStyle: 'none', padding: 0 }}>
                        {options.map(o => (
                            <li key={o.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', background: '#1f2937', marginBottom: '0.5rem', borderRadius: '0.25rem' }}>
                                <span>{o.label}</span>
                                <button onClick={() => handleDeleteOption(o.id)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
                            </li>
                        ))}
                    </ul>
                    <form onSubmit={handleAddOption} style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                            value={newOption}
                            onChange={e => setNewOption(e.target.value)}
                            placeholder="New Option (e.g. Less than 3 shots)"
                            className={styles.table}
                            style={{ background: '#1f2937', color: 'white', padding: '0.5rem', border: '1px solid #374151', borderRadius: '0.25rem', flex: 1 }}
                        />
                        <button type="submit" style={{ padding: '0.5rem 1rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '0.25rem', cursor: 'pointer' }}>Add</button>
                    </form>
                </div>

            </div >
        </>
    );
}
