'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BlockOperation = 'add' | 'subtract' | 'display_only';

export interface TemplateBlock {
    id: string;
    type: string;
    label: string;
    operation: BlockOperation;
    color: string;
    icon: string;
    helpText: string;
}

export interface ReportDef {
    id: 'a' | 'b';
    name: string;
    blocks: TemplateBlock[];
}

// ─── Block catalog ─────────────────────────────────────────────────────────────

interface BlockMeta {
    label: string;
    icon: string;
    color: string;
    defaultOp: BlockOperation;
    help: string;
    unique?: boolean;
}

const BLOCK_META: Record<string, BlockMeta> = {
    bank_end:    { label: 'Bank End',      icon: '🏦', color: '#6366f1', defaultOp: 'add',         help: 'Counted cash in drawer at close', unique: true },
    bank_start:  { label: 'Bank Start',    icon: '💵', color: '#3b82f6', defaultOp: 'subtract',    help: 'Opening float for next shift',    unique: true },
    cash_sales:  { label: 'Cash Sales',    icon: '💰', color: '#10b981', defaultOp: 'add',         help: 'Cash received from sales',        unique: true },
    cash_tips:   { label: 'Cash Tips',     icon: '🤝', color: '#059669', defaultOp: 'add',         help: 'Cash tips received',              unique: true },
    cc_sales:    { label: 'CC Sales',      icon: '💳', color: '#0ea5e9', defaultOp: 'display_only',help: 'Credit/debit card sales',         unique: true },
    cc_tips:     { label: 'CC Tips',       icon: '💳', color: '#06b6d4', defaultOp: 'display_only',help: 'Credit/debit card tips',          unique: true },
    gross_sales: { label: 'Gross Sales',   icon: '📊', color: '#14b8a6', defaultOp: 'display_only',help: 'Total sales (cash + card)',       unique: true },
    payout:      { label: 'Payouts',       icon: '💸', color: '#ef4444', defaultOp: 'subtract',    help: 'Cash paid out from drawer',       unique: true },
    cc_tips_cash:{ label: 'CC Tips Cash',  icon: '💴', color: '#f97316', defaultOp: 'subtract',    help: 'CC tips taken as cash from bag',  unique: true },
    result:      { label: 'Result Total',  icon: '🎯', color: '#fbbf24', defaultOp: 'display_only',help: 'Shows running total at this point' },
    divider:     { label: 'Divider',       icon: '─',  color: '#374151', defaultOp: 'display_only',help: 'Visual separator' },
    custom:      { label: 'Custom Field',  icon: '📝', color: '#a855f7', defaultOp: 'subtract',    help: 'Any custom amount field' },
};

const PALETTE_ORDER = [
    'bank_end', 'bank_start', 'cash_sales', 'cash_tips',
    'cc_sales', 'cc_tips', 'gross_sales', 'payout', 'cc_tips_cash',
    'result', 'divider', 'custom',
];

const DEFAULT_BLOCKS_A: TemplateBlock[] = [
    { id: 'b_bank_end',    type: 'bank_end',    label: 'Bank End (Counted)',   operation: 'add',         color: '#6366f1', icon: '🏦', helpText: 'Counted cash in drawer at close' },
    { id: 'b_cash_sales',  type: 'cash_sales',  label: 'Cash Sales',           operation: 'display_only',color: '#10b981', icon: '💰', helpText: 'Cash received from sales' },
    { id: 'b_cash_tips',   type: 'cash_tips',   label: 'Cash Tips',            operation: 'display_only',color: '#059669', icon: '🤝', helpText: 'Cash tips received' },
    { id: 'b_payout',      type: 'payout',      label: 'Payouts',              operation: 'subtract',    color: '#ef4444', icon: '💸', helpText: 'Cash paid out from drawer' },
    { id: 'b_result',      type: 'result',      label: 'Bag to Safe',          operation: 'display_only',color: '#fbbf24', icon: '🎯', helpText: 'Shows running total at this point' },
];

// ─── Styles ────────────────────────────────────────────────────────────────────

const cs = {
    page: { minHeight: '100vh', background: '#0a0f1a', color: 'white', fontFamily: 'system-ui, sans-serif' } as React.CSSProperties,
    header: { background: '#111827', borderBottom: '1px solid #1f2937', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 } as React.CSSProperties,
    label: { display: 'block', color: '#9ca3af', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' } as React.CSSProperties,
    input: { background: '#1f2937', color: 'white', border: '1px solid #374151', borderRadius: '0.375rem', padding: '0.5rem 0.75rem', fontSize: '0.9rem', width: '100%', outline: 'none', boxSizing: 'border-box' } as React.CSSProperties,
};

// ─── Sub-components ────────────────────────────────────────────────────────────

function OpBadge({ op }: { op: BlockOperation }) {
    const config = {
        add:          { label: '+ ADD',   bg: '#14532d', color: '#86efac', border: '#16a34a' },
        subtract:     { label: '− SUB',   bg: '#7f1d1d', color: '#fca5a5', border: '#dc2626' },
        display_only: { label: 'ℹ INFO',  bg: '#1e3a5f', color: '#93c5fd', border: '#2563eb' },
    }[op];
    return (
        <span style={{ background: config.bg, color: config.color, border: `1px solid ${config.border}`, borderRadius: '0.3rem', padding: '0.2rem 0.5rem', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', flexShrink: 0 }}>
            {config.label}
        </span>
    );
}

function OpSelector({ value, onChange }: { value: BlockOperation; onChange: (op: BlockOperation) => void }) {
    const opts: { op: BlockOperation; label: string; activeColor: string }[] = [
        { op: 'add',          label: '+',    activeColor: '#16a34a' },
        { op: 'subtract',     label: '−',    activeColor: '#dc2626' },
        { op: 'display_only', label: 'Info', activeColor: '#2563eb' },
    ];
    return (
        <div style={{ display: 'flex', borderRadius: '0.375rem', overflow: 'hidden', border: '1px solid #374151', flexShrink: 0 }}>
            {opts.map(o => (
                <button
                    key={o.op}
                    onClick={() => onChange(o.op)}
                    style={{
                        padding: '0.4rem 0.6rem',
                        background: value === o.op ? o.activeColor : '#1f2937',
                        color: 'white',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: value === o.op ? 700 : 400,
                        minWidth: '36px',
                    }}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

function MoveButtons({ idx, total, onMove }: { idx: number; total: number; onMove: (i: number, dir: 'up' | 'down') => void }) {
    const btn = (dir: 'up' | 'down', disabled: boolean) => (
        <button
            onClick={() => onMove(idx, dir)}
            disabled={disabled}
            style={{ background: disabled ? 'transparent' : '#1f2937', border: '1px solid ' + (disabled ? 'transparent' : '#374151'), color: disabled ? '#374151' : '#9ca3af', borderRadius: '0.25rem', width: '24px', height: '24px', cursor: disabled ? 'default' : 'pointer', fontSize: '0.65rem', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 }}
        >
            {dir === 'up' ? '▲' : '▼'}
        </button>
    );
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {btn('up', idx === 0)}
            {btn('down', idx === total - 1)}
        </div>
    );
}

function RemoveBtn({ idx, onRemove }: { idx: number; onRemove: (i: number) => void }) {
    return (
        <button
            onClick={() => onRemove(idx)}
            style={{ background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '0.375rem', width: '28px', height: '28px', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 }}
            title="Remove block"
        >
            ×
        </button>
    );
}

function BlockCard({
    block, idx, total, onMove, onRemove, onUpdate,
}: {
    block: TemplateBlock;
    idx: number;
    total: number;
    onMove: (i: number, dir: 'up' | 'down') => void;
    onRemove: (i: number) => void;
    onUpdate: (i: number, key: keyof TemplateBlock, val: string) => void;
}) {
    const isResult  = block.type === 'result';
    const isDivider = block.type === 'divider';

    if (isDivider) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', padding: '0.5rem 0.75rem', background: '#111827', border: '1px solid #1f2937', borderRadius: '0.75rem' }}>
                <MoveButtons idx={idx} total={total} onMove={onMove} />
                <div style={{ flex: 1, height: '1px', background: '#374151' }} />
                <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>Divider</span>
                <RemoveBtn idx={idx} onRemove={onRemove} />
            </div>
        );
    }

    return (
        <div style={{ background: '#111827', border: `1px solid #1f2937`, borderLeft: `4px solid ${block.color}`, borderRadius: '0.75rem', padding: '0.875rem 1rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <MoveButtons idx={idx} total={total} onMove={onMove} />
            <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>{block.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
                <input
                    value={block.label}
                    onChange={e => onUpdate(idx, 'label', e.target.value)}
                    style={{ ...cs.input, padding: '0.35rem 0.5rem', fontWeight: 600, fontSize: '0.95rem', background: 'transparent', border: '1px solid transparent', borderRadius: '0.25rem' }}
                    onFocus={e => (e.target.style.borderColor = '#374151')}
                    onBlur={e => (e.target.style.borderColor = 'transparent')}
                />
                <div style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '0.1rem', paddingLeft: '0.5rem' }}>{block.helpText}</div>
            </div>
            {!isResult && (
                <OpSelector value={block.operation} onChange={op => onUpdate(idx, 'operation', op)} />
            )}
            {isResult && <OpBadge op="display_only" />}
            <RemoveBtn idx={idx} onRemove={onRemove} />
        </div>
    );
}

// ─── Staff Preview ──────────────────────────────────────────────────────────────

function StaffPreview({ blocks, reportName }: { blocks: TemplateBlock[]; reportName: string }) {
    const [vals, setVals] = useState<Record<string, string>>({});
    const nv = (s: string) => parseFloat(s) || 0;
    const fmt = (v: number) => `$${v.toFixed(2)}`;

    const runningAt = (upTo: number): number => {
        let total = 0;
        for (let i = 0; i <= upTo; i++) {
            const b = blocks[i];
            if (b.type === 'payout' || b.type === 'result' || b.type === 'divider') continue;
            const v = nv(vals[b.id] || '0');
            if (b.operation === 'add') total += v;
            else if (b.operation === 'subtract') total -= v;
        }
        return total;
    };

    return (
        <div style={{ background: '#0a0f1a', borderRadius: '0.75rem', padding: '1.25rem', border: '1px solid #1f2937' }}>
            <div style={{ color: '#9ca3af', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
                {reportName} — Staff View Preview
            </div>
            {blocks.map((b, i) => {
                const running = runningAt(i);
                const isCalc = b.operation !== 'display_only';
                if (b.type === 'divider') {
                    return <div key={b.id} style={{ borderTop: '1px solid #1f2937', margin: '0.75rem 0' }} />;
                }
                if (b.type === 'result') {
                    return (
                        <div key={b.id} style={{ background: '#1c1a02', border: `2px solid ${b.color}44`, borderRadius: '0.75rem', padding: '1rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontSize: '1.25rem' }}>{b.icon}</span>
                                <span style={{ color: '#f9fafb', fontWeight: 700, fontSize: '0.95rem' }}>{b.label}</span>
                            </div>
                            <span style={{ color: running >= 0 ? '#fbbf24' : '#ef4444', fontWeight: 800, fontSize: '1.35rem' }}>{fmt(running)}</span>
                        </div>
                    );
                }
                return (
                    <div key={b.id} style={{ background: '#111827', borderLeft: `3px solid ${b.color}`, borderRadius: '0 0.5rem 0.5rem 0', padding: '0.75rem 1rem', marginBottom: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                            <span style={{ fontSize: '1rem' }}>{b.icon}</span>
                            <span style={{ color: '#f9fafb', fontSize: '0.9rem', fontWeight: 600 }}>{b.label}</span>
                            <OpBadge op={b.operation} />
                        </div>
                        {b.type === 'payout' ? (
                            <div style={{ color: '#6b7280', fontSize: '0.8rem', fontStyle: 'italic' }}>Multiple payout entries (cash paid out)</div>
                        ) : (
                            <>
                                <div style={{ position: 'relative', maxWidth: '200px' }}>
                                    <span style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }}>$</span>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={vals[b.id] || ''}
                                        onChange={e => setVals(prev => ({ ...prev, [b.id]: e.target.value }))}
                                        placeholder="0.00"
                                        style={{ ...cs.input, paddingLeft: '1.5rem', fontSize: '1rem' }}
                                    />
                                </div>
                                {isCalc && (nv(vals[b.id] || '0') > 0 || running !== 0) && (
                                    <div style={{ marginTop: '0.3rem', color: '#6b7280', fontSize: '0.75rem' }}>
                                        Running total: <span style={{ color: running >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>{fmt(running)}</span>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                );
            })}
            {blocks.length === 0 && (
                <div style={{ color: '#6b7280', textAlign: 'center', padding: '2rem', fontStyle: 'italic' }}>Add blocks to see the preview</div>
            )}
        </div>
    );
}

// ─── Main builder ──────────────────────────────────────────────────────────────

export default function ShiftCalculatorBuilder() {
    const router = useRouter();
    const [reports, setReports] = useState<ReportDef[]>([
        { id: 'a', name: 'Report 1', blocks: [] },
        { id: 'b', name: 'Report 2', blocks: [] },
    ]);
    const [activeReport, setActiveReport] = useState<'a' | 'b'>('a');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [activeTab, setActiveTab] = useState<'build' | 'preview'>('build');
    const [hasTemplate, setHasTemplate] = useState(false);

    useEffect(() => {
        fetch('/api/admin/shift-calculator')
            .then(r => r.json())
            .then(d => {
                if (d.template?.templates?.length) {
                    // New two-report format
                    const loaded = d.template.templates as ReportDef[];
                    setReports([
                        loaded.find(r => r.id === 'a') || { id: 'a', name: 'Report 1', blocks: [] },
                        loaded.find(r => r.id === 'b') || { id: 'b', name: 'Report 2', blocks: [] },
                    ]);
                    setHasTemplate(true);
                } else if (d.template?.blocks?.length) {
                    // Legacy single-template format — migrate
                    setReports(prev => [{ ...prev[0], blocks: d.template.blocks }, prev[1]]);
                    setHasTemplate(true);
                } else {
                    setReports(prev => [{ ...prev[0], blocks: DEFAULT_BLOCKS_A }, prev[1]]);
                }
            })
            .finally(() => setLoading(false));
    }, []);

    const activeBlocks = reports.find(r => r.id === activeReport)?.blocks || [];
    const usedTypes = activeBlocks.map(b => b.type);

    const setActiveBlocks = (updater: (prev: TemplateBlock[]) => TemplateBlock[]) => {
        setReports(prev => prev.map(r => r.id === activeReport ? { ...r, blocks: updater(r.blocks) } : r));
    };

    const addBlock = (type: string) => {
        const meta = BLOCK_META[type];
        if (!meta) return;
        const id = `b_${type}_${Date.now()}`;
        setActiveBlocks(prev => [...prev, { id, type, label: meta.label, operation: meta.defaultOp, color: meta.color, icon: meta.icon, helpText: meta.help }]);
    };

    const moveBlock = (idx: number, dir: 'up' | 'down') => {
        setActiveBlocks(prev => {
            const next = [...prev];
            const swap = dir === 'up' ? idx - 1 : idx + 1;
            [next[idx], next[swap]] = [next[swap], next[idx]];
            return next;
        });
    };

    const removeBlock = (idx: number) => {
        setActiveBlocks(prev => prev.filter((_, i) => i !== idx));
    };

    const updateBlock = (idx: number, key: keyof TemplateBlock, val: string) => {
        setActiveBlocks(prev => {
            const next = [...prev];
            next[idx] = { ...next[idx], [key]: val };
            return next;
        });
    };

    const updateReportName = (id: 'a' | 'b', name: string) => {
        setReports(prev => prev.map(r => r.id === id ? { ...r, name } : r));
    };

    const handleSave = async () => {
        setSaving(true);
        setSaved(false);
        try {
            await fetch('/api/admin/shift-calculator', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ template: { templates: reports, updatedAt: new Date().toISOString() } }),
            });
            setHasTemplate(true);
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } finally {
            setSaving(false);
        }
    };

    const handleReset = async () => {
        if (!confirm('Reset to default calculator layout? This cannot be undone.')) return;
        await fetch('/api/admin/shift-calculator', { method: 'DELETE' });
        setReports([
            { id: 'a', name: 'Report 1', blocks: DEFAULT_BLOCKS_A },
            { id: 'b', name: 'Report 2', blocks: [] },
        ]);
        setHasTemplate(false);
    };

    if (loading) {
        return (
            <div style={cs.page}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#6b7280' }}>Loading calculator…</div>
            </div>
        );
    }

    const tabBtn = (tab: typeof activeTab, label: string) => (
        <button
            onClick={() => setActiveTab(tab)}
            style={{ padding: '0.5rem 1.25rem', background: activeTab === tab ? '#1d4ed8' : 'transparent', color: activeTab === tab ? 'white' : '#9ca3af', border: `1px solid ${activeTab === tab ? '#1d4ed8' : '#374151'}`, borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: activeTab === tab ? 700 : 400 }}
        >
            {label}
        </button>
    );

    const reportTabBtn = (id: 'a' | 'b') => {
        const r = reports.find(r => r.id === id)!;
        const isActive = activeReport === id;
        return (
            <button
                key={id}
                onClick={() => setActiveReport(id)}
                style={{ padding: '0.4rem 1rem', background: isActive ? '#7c3aed' : 'transparent', color: isActive ? 'white' : '#9ca3af', border: `1px solid ${isActive ? '#7c3aed' : '#374151'}`, borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.825rem', fontWeight: isActive ? 700 : 400, display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
                {r.name}
                {r.blocks.length > 0 && <span style={{ background: isActive ? 'rgba(255,255,255,0.2)' : '#374151', color: isActive ? 'white' : '#9ca3af', borderRadius: '999px', padding: '0 0.4rem', fontSize: '0.7rem', fontWeight: 700 }}>{r.blocks.length}</span>}
            </button>
        );
    };

    return (
        <div style={cs.page}>
            {/* Header */}
            <div style={cs.header}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button
                        onClick={() => router.push('/admin/settings')}
                        style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '0.9rem' }}
                    >
                        ← Settings
                    </button>
                    <div>
                        <div style={{ color: 'white', fontWeight: 700, fontSize: '1.1rem' }}>Shift Close Calculator</div>
                        <div style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                            {hasTemplate ? 'Custom layout active — staff see your design' : 'Using default layout'}
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {hasTemplate && (
                        <button
                            onClick={handleReset}
                            style={{ padding: '0.5rem 1rem', background: 'transparent', color: '#6b7280', border: '1px solid #374151', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}
                        >
                            Reset Default
                        </button>
                    )}
                    {tabBtn('build', '✏️ Build')}
                    {tabBtn('preview', '👁 Preview')}
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        style={{ padding: '0.5rem 1.25rem', background: saved ? '#059669' : '#1d4ed8', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.9rem', minWidth: '80px', opacity: saving ? 0.7 : 1, transition: 'background 0.3s' }}
                    >
                        {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>

            {/* Preview tab */}
            {activeTab === 'preview' && (
                <div style={{ maxWidth: '640px', margin: '0 auto', padding: '1.5rem 1rem' }}>
                    {reports.filter(r => r.blocks.length > 0).map((r, ri) => (
                        <div key={r.id} style={{ marginBottom: '1.5rem' }}>
                            {ri > 0 && <div style={{ borderTop: '1px solid #1f2937', margin: '1.5rem 0' }} />}
                            <StaffPreview blocks={r.blocks} reportName={r.name} />
                        </div>
                    ))}
                    {reports.every(r => r.blocks.length === 0) && (
                        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '0.75rem', padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Add blocks in the Build tab to preview</div>
                    )}
                    <div style={{ marginTop: '1rem', background: '#111827', border: '1px solid #1f2937', borderRadius: '0.75rem', padding: '1rem', color: '#9ca3af', fontSize: '0.85rem' }}>
                        💡 This is a live preview — type values in the fields to see the running total update. Payouts section shows as a placeholder since it has dynamic rows.
                    </div>
                </div>
            )}

            {/* Build tab */}
            {activeTab === 'build' && (
                <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '1.5rem 1rem' }}>
                    {/* Report selector row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', background: '#111827', border: '1px solid #1f2937', borderRadius: '0.75rem', padding: '0.75rem 1rem' }}>
                        <span style={{ color: '#6b7280', fontSize: '0.8rem', flexShrink: 0 }}>Editing:</span>
                        {reportTabBtn('a')}
                        {reportTabBtn('b')}
                        <div style={{ flex: 1 }} />
                        <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>Staff will see both reports that have blocks</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '1.5rem', alignItems: 'start' }}>
                        {/* Left: Block palette */}
                        <div style={{ position: 'sticky', top: '72px' }}>
                            <div style={{ color: '#9ca3af', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>Add Field</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                {PALETTE_ORDER.map(type => {
                                    const meta = BLOCK_META[type];
                                    const disabled = meta.unique && usedTypes.includes(type);
                                    return (
                                        <button
                                            key={type}
                                            onClick={() => !disabled && addBlock(type)}
                                            disabled={disabled}
                                            title={disabled ? 'Already added' : meta.help}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.625rem',
                                                padding: '0.6rem 0.75rem',
                                                background: disabled ? '#0f172a' : `${meta.color}18`,
                                                border: `1px solid ${disabled ? '#1f2937' : meta.color + '44'}`,
                                                borderRadius: '0.5rem',
                                                color: disabled ? '#374151' : 'white',
                                                cursor: disabled ? 'not-allowed' : 'pointer',
                                                fontSize: '0.85rem',
                                                fontWeight: 500,
                                                textAlign: 'left',
                                                transition: 'background 0.15s',
                                            }}
                                        >
                                            <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{meta.icon}</span>
                                            <div style={{ minWidth: 0 }}>
                                                <div>{meta.label}</div>
                                                {disabled && <div style={{ fontSize: '0.7rem', color: '#4b5563' }}>Added ✓</div>}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            <div style={{ marginTop: '1.5rem', background: '#111827', border: '1px solid #1f2937', borderRadius: '0.75rem', padding: '0.875rem' }}>
                                <div style={{ color: '#f9fafb', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>How operations work</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                    {[
                                        { badge: '+ ADD', bg: '#14532d', col: '#86efac', border: '#16a34a', desc: 'Increases the running total' },
                                        { badge: '− SUB', bg: '#7f1d1d', col: '#fca5a5', border: '#dc2626', desc: 'Decreases the running total' },
                                        { badge: 'ℹ INFO', bg: '#1e3a5f', col: '#93c5fd', border: '#2563eb', desc: 'Displayed but not calculated' },
                                    ].map(item => (
                                        <div key={item.badge} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ background: item.bg, color: item.col, border: `1px solid ${item.border}`, borderRadius: '0.25rem', padding: '0.15rem 0.4rem', fontSize: '0.65rem', fontWeight: 700, flexShrink: 0 }}>{item.badge}</span>
                                            <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>{item.desc}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Right: Template blocks for active report */}
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', gap: '0.75rem' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ color: '#6b7280', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>Report name</div>
                                    <input
                                        value={reports.find(r => r.id === activeReport)?.name || ''}
                                        onChange={e => updateReportName(activeReport, e.target.value)}
                                        style={{ ...cs.input, fontWeight: 600, fontSize: '0.95rem' }}
                                        placeholder="Report name…"
                                    />
                                </div>
                                <div style={{ flexShrink: 0 }}>
                                    <div style={{ color: '#6b7280', fontSize: '0.7rem', marginBottom: '0.4rem' }}>{activeBlocks.length} block{activeBlocks.length !== 1 ? 's' : ''}</div>
                                    {activeBlocks.length > 0 && (
                                        <button
                                            onClick={() => { if (confirm('Clear all blocks?')) setActiveBlocks(() => []); }}
                                            style={{ padding: '0.35rem 0.75rem', background: 'transparent', color: '#6b7280', border: '1px solid #374151', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.8rem' }}
                                        >
                                            Clear
                                        </button>
                                    )}
                                </div>
                            </div>

                            {activeBlocks.length === 0 ? (
                                <div style={{ background: '#111827', border: '2px dashed #374151', borderRadius: '1rem', padding: '3rem 2rem', textAlign: 'center', color: '#6b7280' }}>
                                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🧩</div>
                                    <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>No blocks yet</div>
                                    <div style={{ fontSize: '0.85rem' }}>Click a field type on the left to start building</div>
                                </div>
                            ) : (
                                <>
                                    {activeBlocks.map((block, idx) => (
                                        <div key={block.id}>
                                            <BlockCard
                                                block={block}
                                                idx={idx}
                                                total={activeBlocks.length}
                                                onMove={moveBlock}
                                                onRemove={removeBlock}
                                                onUpdate={updateBlock}
                                            />
                                            {idx < activeBlocks.length - 1 && block.type !== 'divider' && activeBlocks[idx + 1].type !== 'divider' && (
                                                <div style={{ display: 'flex', justifyContent: 'center', margin: '-0.2rem 0', zIndex: 1, position: 'relative' }}>
                                                    <div style={{ width: '2px', height: '14px', background: '#374151' }} />
                                                </div>
                                            )}
                                        </div>
                                    ))}

                                    {/* Formula preview */}
                                    <div style={{ marginTop: '1.5rem', background: '#111827', border: '1px solid #1f2937', borderRadius: '0.75rem', padding: '1rem' }}>
                                        <div style={{ color: '#9ca3af', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>Formula Preview</div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                                            {activeBlocks.filter(b => b.type !== 'divider' && b.type !== 'result' && b.operation !== 'display_only').map((b, i) => (
                                                <span key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                    {i > 0 && (
                                                        <span style={{ color: b.operation === 'add' ? '#4ade80' : '#f87171', fontWeight: 700, fontSize: '1.1rem' }}>
                                                            {b.operation === 'add' ? '+' : '−'}
                                                        </span>
                                                    )}
                                                    <span style={{ background: b.color + '22', border: `1px solid ${b.color}44`, color: 'white', borderRadius: '0.375rem', padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}>
                                                        {b.icon} {b.label}
                                                    </span>
                                                </span>
                                            ))}
                                            {activeBlocks.some(b => b.type === 'result') && (
                                                <>
                                                    <span style={{ color: '#6b7280', fontSize: '1.1rem' }}>=</span>
                                                    {activeBlocks.filter(b => b.type === 'result').map(b => (
                                                        <span key={b.id} style={{ background: '#fbbf2422', border: '1px solid #fbbf2444', color: '#fbbf24', borderRadius: '0.375rem', padding: '0.2rem 0.5rem', fontSize: '0.8rem', fontWeight: 700 }}>
                                                            {b.icon} {b.label}
                                                        </span>
                                                    ))}
                                                </>
                                            )}
                                            {activeBlocks.every(b => b.operation === 'display_only' || b.type === 'divider' || b.type === 'result') && (
                                                <span style={{ color: '#6b7280', fontSize: '0.85rem', fontStyle: 'italic' }}>Add +/− blocks to see the formula</span>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
