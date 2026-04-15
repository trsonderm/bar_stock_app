'use client';

import { useState, useEffect } from 'react';

interface Config {
    local_lookup_enabled: boolean;
    external_lookup_enabled: boolean;
    external_lookup_provider: string;
    upcitemdb_api_key: string;
    barcodelookup_api_key: string;
    auto_fill_on_scan: boolean;
    save_scanned_barcodes: boolean;
    fallback_to_manual: boolean;
}

const DEFAULT: Config = {
    local_lookup_enabled: true,
    external_lookup_enabled: false,
    external_lookup_provider: 'upcitemdb',
    upcitemdb_api_key: '',
    barcodelookup_api_key: '',
    auto_fill_on_scan: true,
    save_scanned_barcodes: true,
    fallback_to_manual: true,
};

export default function BottleLookupClient() {
    const [config, setConfig] = useState<Config>(DEFAULT);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        fetch('/api/super-admin/bottle-lookup')
            .then(r => r.json())
            .then(d => { if (d.config) setConfig(d.config); })
            .finally(() => setLoading(false));
    }, []);

    const handleSave = async () => {
        setSaving(true);
        setSaved(false);
        try {
            const res = await fetch('/api/super-admin/bottle-lookup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config),
            });
            if (res.ok) setSaved(true);
        } finally {
            setSaving(false);
        }
    };

    const set = (key: keyof Config, value: any) => setConfig(prev => ({ ...prev, [key]: value }));

    if (loading) return <div style={{ color: '#9ca3af', padding: '2rem' }}>Loading...</div>;

    return (
        <div style={{ maxWidth: '720px', margin: '0 auto', padding: '2rem' }}>
            <h1 style={{ color: 'white', fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>Bottle Lookup Settings</h1>
            <p style={{ color: '#6b7280', marginBottom: '2rem', fontSize: '0.9rem' }}>
                Configure how barcodes are resolved when scanning bottles in stock view and product management.
            </p>

            {/* Local Lookup */}
            <Section title="Local Lookup">
                <Row label="Enable local barcode lookup" description="Search your own inventory database for matching barcodes first.">
                    <Toggle value={config.local_lookup_enabled} onChange={v => set('local_lookup_enabled', v)} />
                </Row>
                <Row label="Save scanned barcodes" description="When a barcode is scanned and matched to a product, store it for future lookups.">
                    <Toggle value={config.save_scanned_barcodes} onChange={v => set('save_scanned_barcodes', v)} />
                </Row>
            </Section>

            {/* External Lookup */}
            <Section title="External Web Lookup">
                <Row label="Enable external barcode lookup" description="When not found locally, look up the barcode via an external database service.">
                    <Toggle value={config.external_lookup_enabled} onChange={v => set('external_lookup_enabled', v)} />
                </Row>

                {config.external_lookup_enabled && (
                    <>
                        <Row label="Lookup provider" description="Which external service to use for barcode lookups.">
                            <select
                                value={config.external_lookup_provider}
                                onChange={e => set('external_lookup_provider', e.target.value)}
                                style={inputStyle}
                            >
                                <option value="upcitemdb">UPCitemdb (free tier available)</option>
                                <option value="open_food_facts">Open Food Facts (free, no key)</option>
                                <option value="barcodelookup">Barcode Lookup (paid)</option>
                                <option value="none">None</option>
                            </select>
                        </Row>

                        {config.external_lookup_provider === 'upcitemdb' && (
                            <Row label="UPCitemdb API Key" description="Optional — free tier works without a key (limited rate). Get a key at upcitemdb.com.">
                                <input
                                    type="password"
                                    value={config.upcitemdb_api_key}
                                    onChange={e => set('upcitemdb_api_key', e.target.value)}
                                    placeholder="Leave blank for free tier"
                                    style={inputStyle}
                                />
                            </Row>
                        )}

                        {config.external_lookup_provider === 'barcodelookup' && (
                            <Row label="Barcode Lookup API Key" description="Required. Sign up at barcodelookup.com.">
                                <input
                                    type="password"
                                    value={config.barcodelookup_api_key}
                                    onChange={e => set('barcodelookup_api_key', e.target.value)}
                                    placeholder="API key..."
                                    style={inputStyle}
                                />
                            </Row>
                        )}

                        {config.external_lookup_provider === 'open_food_facts' && (
                            <div style={{ background: '#1e3a5f', border: '1px solid #1d4ed8', borderRadius: '8px', padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#93c5fd', marginBottom: '0.75rem' }}>
                                Open Food Facts is a free, open database — no API key needed. Coverage is best for food/beverage products.
                            </div>
                        )}
                    </>
                )}
            </Section>

            {/* Behavior */}
            <Section title="Scan Behavior">
                <Row label="Auto-fill form on scan" description="Automatically populate product name, type, and other fields when a barcode is recognized.">
                    <Toggle value={config.auto_fill_on_scan} onChange={v => set('auto_fill_on_scan', v)} />
                </Row>
                <Row label="Fallback to manual entry" description="If barcode is not detected automatically, allow user to type the barcode.">
                    <Toggle value={config.fallback_to_manual} onChange={v => set('fallback_to_manual', v)} />
                </Row>
            </Section>

            {/* How it works */}
            <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem', fontSize: '0.85rem', color: '#9ca3af' }}>
                <strong style={{ color: '#d1d5db', display: 'block', marginBottom: '0.5rem' }}>How Barcode Lookup Works</strong>
                <ol style={{ margin: 0, paddingLeft: '1.25rem', lineHeight: '1.8' }}>
                    <li>Camera opens and scans the bottle's barcode (UPC/EAN/Code128).</li>
                    <li>If <strong>local lookup</strong> is enabled, searches your inventory for an existing product with that barcode.</li>
                    <li>If not found locally and <strong>external lookup</strong> is enabled, queries the selected external service.</li>
                    <li>If <strong>auto-fill</strong> is enabled, product name and type fields are pre-populated.</li>
                    <li>If nothing is found, the barcode is shown and the user fills details manually.</li>
                </ol>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{ background: saving ? '#374151' : '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '0.6rem 1.75rem', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.95rem' }}
                >
                    {saving ? 'Saving...' : 'Save Settings'}
                </button>
                {saved && <span style={{ color: '#4ade80', fontSize: '0.9rem' }}>Saved successfully</span>}
            </div>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', marginBottom: '1.5rem', overflow: 'hidden' }}>
            <div style={{ background: '#111827', padding: '0.6rem 1rem', borderBottom: '1px solid #374151' }}>
                <span style={{ color: '#d1d5db', fontWeight: 600, fontSize: '0.9rem' }}>{title}</span>
            </div>
            <div style={{ padding: '0.5rem 0' }}>{children}</div>
        </div>
    );
}

function Row({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderBottom: '1px solid #374151', gap: '1rem' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#f3f4f6', fontSize: '0.9rem', fontWeight: 500 }}>{label}</div>
                {description && <div style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '0.15rem' }}>{description}</div>}
            </div>
            <div style={{ flexShrink: 0, minWidth: '200px', textAlign: 'right' }}>{children}</div>
        </div>
    );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            type="button"
            onClick={() => onChange(!value)}
            style={{
                width: '44px', height: '24px',
                borderRadius: '12px',
                background: value ? '#2563eb' : '#374151',
                border: 'none',
                cursor: 'pointer',
                position: 'relative',
                transition: 'background 0.2s',
            }}
        >
            <span style={{
                position: 'absolute',
                top: '3px',
                left: value ? '22px' : '3px',
                width: '18px', height: '18px',
                borderRadius: '50%',
                background: 'white',
                transition: 'left 0.2s',
            }} />
        </button>
    );
}

const inputStyle: React.CSSProperties = {
    background: '#111827',
    border: '1px solid #4b5563',
    borderRadius: '6px',
    color: 'white',
    padding: '0.4rem 0.75rem',
    fontSize: '0.875rem',
    width: '100%',
};
