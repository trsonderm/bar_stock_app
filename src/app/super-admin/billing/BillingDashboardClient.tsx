'use client';

import { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BillingStats {
    mrr: number; arr: number; revenue: number;
    pending: number; collectedThisMonth: number;
    activeSubs: number; totalOrgs: number; activeOrgs: number;
    pastDueOrgs: number; canceledOrgs: number; trialOrgs: number;
}

interface Invoice {
    id: number; organization_id: number; org_name: string;
    amount: string; status: string; due_date: string | null;
    paid_at: string | null; stripe_hosted_url: string | null;
    stripe_pdf_url: string | null; notes: string | null;
    created_at: string;
}

interface BillingConfig {
    billing_provider: string; stripe_mode: string;
    stripe_secret_key: string; stripe_publishable_key: string;
    stripe_webhook_secret: string;
    stripe_basic_monthly_price_id: string;      stripe_basic_yearly_price_id: string;
    stripe_pro_monthly_price_id: string;        stripe_pro_yearly_price_id: string;
    stripe_enterprise_monthly_price_id: string; stripe_enterprise_yearly_price_id: string;
    basic_monthly_price: string;    basic_yearly_price: string;
    pro_monthly_price: string;      pro_yearly_price: string;
    enterprise_monthly_price: string; enterprise_yearly_price: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

function StatCard({ label, value, sub, color = '#3b82f6' }: { label: string; value: string; sub?: string; color?: string }) {
    return (
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: '1.25rem 1.5rem' }}>
            <div style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
            <div style={{ color, fontSize: '1.75rem', fontWeight: 800, lineHeight: 1 }}>{value}</div>
            {sub && <div style={{ color: '#475569', fontSize: '0.75rem', marginTop: 4 }}>{sub}</div>}
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const map: Record<string, { bg: string; text: string }> = {
        PAID:     { bg: '#064e3b', text: '#6ee7b7' },
        PENDING:  { bg: '#78350f', text: '#fcd34d' },
        FAILED:   { bg: '#7f1d1d', text: '#fca5a5' },
        VOIDED:   { bg: '#1e293b', text: '#64748b' },
        REFUNDED: { bg: '#1e1b4b', text: '#a5b4fc' },
    };
    const c = map[status] || map.VOIDED;
    return (
        <span style={{ background: c.bg, color: c.text, borderRadius: 10, padding: '2px 8px', fontSize: '0.7rem', fontWeight: 700 }}>
            {status}
        </span>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BillingDashboardClient() {
    const [tab, setTab] = useState<'overview' | 'invoices' | 'settings' | 'orgs' | 'disabled' | 'stripe'>('overview');
    const [stats, setStats] = useState<BillingStats | null>(null);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [invoiceTotal, setInvoiceTotal] = useState(0);
    const [invoicePage, setInvoicePage] = useState(1);
    const [filterStatus, setFilterStatus] = useState('');
    const [revenueHistory, setRevenueHistory] = useState<any[]>([]);
    const [trialOrgs, setTrialOrgs] = useState<any[]>([]);
    const [orgs, setOrgs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [stripeConfigured, setStripeConfigured] = useState(false);
    const [stripeMode, setStripeMode] = useState('test');
    const [billingProvider, setBillingProvider] = useState('manual');

    // Disabled org queue
    const [disabledOrgs, setDisabledOrgs] = useState<any[]>([]);
    const [disableReason, setDisableReason] = useState('');
    const [disablingId, setDisablingId] = useState<number | null>(null);

    // Auto-disable settings
    const [autoDisableEnabled, setAutoDisableEnabled] = useState(false);
    const [autoDisableGraceDays, setAutoDisableGraceDays] = useState(7);
    const [autoDisableSaving, setAutoDisableSaving] = useState(false);
    const [autoDisableRunResult, setAutoDisableRunResult] = useState<string | null>(null);

    // Stripe report
    const [stripeReport, setStripeReport] = useState<any[]>([]);
    const [stripeSummary, setStripeSummary] = useState<any>(null);
    const [stripeReportLoading, setStripeReportLoading] = useState(false);
    const [stripeReportError, setStripeReportError] = useState<string | null>(null);
    const [stripeFilter, setStripeFilter] = useState<'all' | 'problems'>('all');

    // Settings state
    const [cfg, setCfg] = useState<BillingConfig>({
        billing_provider: 'stripe', stripe_mode: 'test',
        stripe_secret_key: '', stripe_publishable_key: '', stripe_webhook_secret: '',
        stripe_basic_monthly_price_id: '',      stripe_basic_yearly_price_id: '',
        stripe_pro_monthly_price_id: '',        stripe_pro_yearly_price_id: '',
        stripe_enterprise_monthly_price_id: '', stripe_enterprise_yearly_price_id: '',
        basic_monthly_price: '19',    basic_yearly_price: '190',
        pro_monthly_price: '49',      pro_yearly_price: '490',
        enterprise_monthly_price: '',  enterprise_yearly_price: '',
    });
    const [cfgLoading, setCfgLoading] = useState(false);
    const [cfgSaving, setCfgSaving] = useState(false);
    const [cfgTestResult, setCfgTestResult] = useState<string | null>(null);

    // New invoice form
    const [newInv, setNewInv] = useState({ organization_id: '', amount: '', due_date: '', notes: '' });
    const [invSaving, setInvSaving] = useState(false);

    const loadStats = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch('/api/super-admin/billing/stats');
            const d = await r.json();
            if (d.stats) setStats(d.stats);
            if (d.invoices) setInvoices(d.invoices.slice(0, 10));
            if (d.revenueHistory) setRevenueHistory(d.revenueHistory);
            if (d.trialOrgs) setTrialOrgs(d.trialOrgs);
            setStripeConfigured(d.stripeConfigured || false);
            setStripeMode(d.stripeMode || 'test');
            setBillingProvider(d.billingProvider || 'manual');
        } catch (e) { console.error(e); } finally { setLoading(false); }
    }, []);

    const loadInvoices = useCallback(async () => {
        const p = new URLSearchParams({ page: String(invoicePage) });
        if (filterStatus) p.set('status', filterStatus);
        const r = await fetch(`/api/super-admin/billing/invoices?${p}`);
        const d = await r.json();
        if (d.invoices) { setInvoices(d.invoices); setInvoiceTotal(d.total || 0); }
    }, [invoicePage, filterStatus]);

    const loadConfig = useCallback(async () => {
        setCfgLoading(true);
        try {
            const r = await fetch('/api/super-admin/billing/provider');
            const d = await r.json();
            if (d.config) setCfg(prev => ({ ...prev, ...d.config }));
        } catch (e) { } finally { setCfgLoading(false); }
    }, []);

    const loadOrgs = useCallback(async () => {
        const r = await fetch('/api/super-admin/organizations?limit=100');
        const d = await r.json();
        if (d.organizations) setOrgs(d.organizations);
    }, []);

    const loadDisabledOrgs = useCallback(async () => {
        const r = await fetch('/api/super-admin/organizations/disable');
        const d = await r.json();
        if (d.disabled) setDisabledOrgs(d.disabled);
    }, []);

    const loadAutoDisableSettings = useCallback(async () => {
        const r = await fetch('/api/super-admin/billing/auto-disable');
        const d = await r.json();
        setAutoDisableEnabled(d.enabled || false);
        setAutoDisableGraceDays(d.graceDays || 7);
    }, []);

    const loadStripeReport = useCallback(async () => {
        setStripeReportLoading(true);
        setStripeReportError(null);
        try {
            const r = await fetch('/api/super-admin/billing/stripe-report');
            const d = await r.json();
            if (d.error && !d.stripeConfigured) {
                setStripeReportError('Stripe is not configured. Add your Stripe keys in Settings.');
            } else if (d.error) {
                setStripeReportError(d.error);
            } else {
                setStripeReport(d.invoices || []);
                setStripeSummary(d.summary || null);
            }
        } catch (e) { setStripeReportError('Failed to load Stripe data'); } finally { setStripeReportLoading(false); }
    }, []);

    useEffect(() => { loadStats(); }, [loadStats]);
    useEffect(() => { if (tab === 'invoices') loadInvoices(); }, [tab, loadInvoices]);
    useEffect(() => { if (tab === 'settings') { loadConfig(); loadAutoDisableSettings(); } }, [tab, loadConfig, loadAutoDisableSettings]);
    useEffect(() => { if (tab === 'orgs' || tab === 'invoices') loadOrgs(); }, [tab, loadOrgs]);
    useEffect(() => { if (tab === 'disabled') { loadDisabledOrgs(); loadOrgs(); } }, [tab, loadDisabledOrgs, loadOrgs]);
    useEffect(() => { if (tab === 'stripe') loadStripeReport(); }, [tab, loadStripeReport]);

    const saveConfig = async () => {
        setCfgSaving(true); setCfgTestResult(null);
        try {
            const r = await fetch('/api/super-admin/billing/provider', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cfg),
            });
            const d = await r.json();
            if (d.stripeTest === 'connected') setCfgTestResult('✓ Stripe connected successfully');
            else if (d.stripeTest === 'failed') setCfgTestResult('✗ Stripe key invalid: ' + d.stripeError);
            else setCfgTestResult('✓ Settings saved');
            loadStats();
        } catch (e) { setCfgTestResult('Error saving'); } finally { setCfgSaving(false); }
    };

    const updateInvoiceStatus = async (id: number, status: string) => {
        await fetch(`/api/super-admin/billing/invoices/${id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
        });
        if (tab === 'invoices') loadInvoices(); else loadStats();
    };

    const createInvoice = async () => {
        if (!newInv.organization_id || !newInv.amount) return alert('Org and amount required');
        setInvSaving(true);
        try {
            const r = await fetch('/api/super-admin/billing/invoices', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newInv),
            });
            if (r.ok) {
                setNewInv({ organization_id: '', amount: '', due_date: '', notes: '' });
                loadInvoices();
                loadStats();
            }
        } finally { setInvSaving(false); }
    };

    const updateOrgPlan = async (orgId: number, plan: string, status: string) => {
        await fetch('/api/super-admin/organizations', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: orgId, subscription_plan: plan, billing_status: status }),
        });
        loadOrgs();
        loadStats();
    };

    const disableOrg = async (orgId: number, reason: string) => {
        setDisablingId(orgId);
        try {
            await fetch('/api/super-admin/organizations/disable', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orgId, action: 'disable', reason }),
            });
            loadOrgs(); loadDisabledOrgs(); loadStats();
        } finally { setDisablingId(null); setDisableReason(''); }
    };

    const enableOrg = async (orgId: number) => {
        setDisablingId(orgId);
        try {
            await fetch('/api/super-admin/organizations/disable', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orgId, action: 'enable' }),
            });
            loadOrgs(); loadDisabledOrgs(); loadStats();
        } finally { setDisablingId(null); }
    };

    const saveAutoDisable = async (runNow?: boolean) => {
        setAutoDisableSaving(true);
        setAutoDisableRunResult(null);
        try {
            const r = await fetch('/api/super-admin/billing/auto-disable', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: autoDisableEnabled, graceDays: autoDisableGraceDays, runNow: runNow || false }),
            });
            const d = await r.json();
            if (runNow && d.disabled !== undefined) {
                setAutoDisableRunResult(d.disabled === 0 ? 'No orgs met the auto-disable criteria.' : `Disabled ${d.disabled} org(s): ${d.orgs?.join(', ')}`);
                loadDisabledOrgs(); loadStats();
            }
        } finally { setAutoDisableSaving(false); }
    };

    const tabStyle = (t: string) => ({
        padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
        fontWeight: 600, fontSize: '0.875rem',
        background: tab === t ? '#2563eb' : 'transparent',
        color: tab === t ? 'white' : '#64748b',
    } as React.CSSProperties);

    const inputStyle: React.CSSProperties = {
        background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155',
        borderRadius: 8, padding: '8px 12px', fontSize: '0.875rem', width: '100%',
    };

    const appUrl = typeof window !== 'undefined' ? window.location.origin : '';

    if (loading && !stats) return (
        <div style={{ padding: '2rem', color: '#94a3b8' }}>Loading billing dashboard…</div>
    );

    return (
        <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 style={{ color: 'white', fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Billing & Revenue</h1>
                    <p style={{ color: '#64748b', marginTop: 4, fontSize: '0.875rem' }}>
                        {billingProvider === 'stripe' ? (
                            <span>
                                Provider: <span style={{ color: '#818cf8', fontWeight: 600 }}>Stripe</span>
                                {' · '}
                                <span style={{ color: stripeConfigured ? (stripeMode === 'test' ? '#fbbf24' : '#4ade80') : '#ef4444', fontWeight: 600 }}>
                                    {stripeConfigured ? (stripeMode === 'test' ? '⚡ Test Mode' : '✓ Live') : '⚠ Not Configured'}
                                </span>
                            </span>
                        ) : (
                            <span>Provider: <span style={{ color: '#94a3b8', fontWeight: 600 }}>Manual</span></span>
                        )}
                    </p>
                </div>
                <button onClick={loadStats} style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: '0.82rem' }}>
                    ↻ Refresh
                </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: '1.5rem', background: '#0f172a', borderRadius: 10, padding: 4, flexWrap: 'wrap' }}>
                {[
                    ['overview', '📊 Overview'],
                    ['invoices', '🧾 Invoices'],
                    ['orgs', '🏢 Subscriptions'],
                    ['disabled', `🚫 Disabled${disabledOrgs.length > 0 ? ` (${disabledOrgs.length})` : ''}`],
                    ['stripe', '💳 Stripe Report'],
                    ['settings', '⚙️ Settings'],
                ].map(([t, label]) => (
                    <button key={t} style={{
                        ...tabStyle(t),
                        ...(t === 'disabled' && disabledOrgs.length > 0 && tab !== 'disabled'
                            ? { color: '#fca5a5', background: '#3f0b0b' } : {}),
                    }} onClick={() => setTab(t as any)}>{label}</button>
                ))}
            </div>

            {/* ── OVERVIEW ── */}
            {tab === 'overview' && stats && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* Stats grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem' }}>
                        <StatCard label="MRR" value={fmt(stats.mrr)} sub="Monthly recurring" color="#34d399" />
                        <StatCard label="ARR" value={fmt(stats.arr)} sub="Annual recurring" color="#60a5fa" />
                        <StatCard label="Collected This Month" value={fmt(stats.collectedThisMonth)} color="#a78bfa" />
                        <StatCard label="Pending" value={fmt(stats.pending)} color="#fbbf24" />
                        <StatCard label="Active Subscriptions" value={String(stats.activeSubs)} color="#34d399" />
                        <StatCard label="Trial Orgs" value={String(stats.trialOrgs)} color="#f472b6" />
                        <StatCard label="Past Due" value={String(stats.pastDueOrgs)} color="#ef4444" />
                        <StatCard label="Total Orgs" value={String(stats.totalOrgs)} color="#94a3b8" />
                    </div>

                    {/* Revenue chart */}
                    {revenueHistory.length > 0 && (
                        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: '1.5rem' }}>
                            <div style={{ color: 'white', fontWeight: 700, marginBottom: '1rem' }}>Revenue (Last 6 Months)</div>
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={revenueHistory}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                    <XAxis dataKey="month" stroke="#475569" fontSize={12} tickLine={false} />
                                    <YAxis stroke="#475569" fontSize={12} tickLine={false} tickFormatter={v => `$${v}`} />
                                    <Tooltip formatter={(v: any) => fmt(v)} contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: 'white' }} />
                                    <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {/* Recent invoices */}
                    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden' }}>
                        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: 'white', fontWeight: 700 }}>Recent Invoices</span>
                            <button onClick={() => setTab('invoices')} style={{ color: '#60a5fa', fontSize: '0.8rem', background: 'none', border: 'none', cursor: 'pointer' }}>View all →</button>
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                                <tr style={{ background: '#020617', color: '#64748b', textAlign: 'left' }}>
                                    {['Org', 'Amount', 'Status', 'Date', 'Actions'].map(h => (
                                        <th key={h} style={{ padding: '10px 16px', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {invoices.slice(0, 8).map(inv => (
                                    <tr key={inv.id} style={{ borderTop: '1px solid #1e293b' }}>
                                        <td style={{ padding: '10px 16px', color: '#e2e8f0', fontWeight: 500 }}>{inv.org_name}</td>
                                        <td style={{ padding: '10px 16px', color: '#34d399', fontWeight: 700 }}>{fmt(parseFloat(inv.amount))}</td>
                                        <td style={{ padding: '10px 16px' }}><StatusBadge status={inv.status} /></td>
                                        <td style={{ padding: '10px 16px', color: '#64748b', fontSize: '0.8rem' }}>{new Date(inv.created_at).toLocaleDateString()}</td>
                                        <td style={{ padding: '10px 16px' }}>
                                            {inv.status === 'PENDING' && (
                                                <button onClick={() => updateInvoiceStatus(inv.id, 'PAID')}
                                                    style={{ background: '#064e3b', color: '#6ee7b7', border: 'none', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontSize: '0.75rem' }}>
                                                    Mark Paid
                                                </button>
                                            )}
                                            {inv.stripe_hosted_url && (
                                                <a href={inv.stripe_hosted_url} target="_blank" rel="noreferrer"
                                                    style={{ marginLeft: 6, color: '#818cf8', fontSize: '0.75rem' }}>Stripe ↗</a>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {invoices.length === 0 && (
                                    <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#475569' }}>No invoices yet.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Expiring trials */}
                    {trialOrgs.length > 0 && (
                        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: '1.25rem 1.5rem' }}>
                            <div style={{ color: '#fbbf24', fontWeight: 700, marginBottom: '0.75rem' }}>⏳ Expiring Trials</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {trialOrgs.slice(0, 6).map((t: any) => {
                                    const daysLeft = Math.ceil((new Date(t.trial_ends_at).getTime() - Date.now()) / 86400000);
                                    return (
                                        <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#1e293b', borderRadius: 8 }}>
                                            <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{t.name}</span>
                                            <span style={{ color: daysLeft <= 3 ? '#ef4444' : daysLeft <= 7 ? '#fbbf24' : '#94a3b8', fontSize: '0.82rem', fontWeight: 600 }}>
                                                {daysLeft <= 0 ? 'Expired' : `${daysLeft}d left`}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── INVOICES ── */}
            {tab === 'invoices' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {/* Create invoice form */}
                    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: '1.25rem 1.5rem' }}>
                        <div style={{ color: 'white', fontWeight: 700, marginBottom: '1rem' }}>Create Invoice</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                            <select value={newInv.organization_id} onChange={e => setNewInv(p => ({ ...p, organization_id: e.target.value }))} style={inputStyle}>
                                <option value="">Select Organization…</option>
                                {orgs.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
                            </select>
                            <input type="number" step="0.01" placeholder="Amount ($)" value={newInv.amount}
                                onChange={e => setNewInv(p => ({ ...p, amount: e.target.value }))} style={inputStyle} />
                            <input type="date" placeholder="Due date" value={newInv.due_date}
                                onChange={e => setNewInv(p => ({ ...p, due_date: e.target.value }))} style={inputStyle} />
                            <input placeholder="Notes (optional)" value={newInv.notes}
                                onChange={e => setNewInv(p => ({ ...p, notes: e.target.value }))} style={inputStyle} />
                        </div>
                        <button onClick={createInvoice} disabled={invSaving}
                            style={{ marginTop: '0.75rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' }}>
                            {invSaving ? 'Creating…' : '+ Create Invoice'}
                        </button>
                    </div>

                    {/* Filters */}
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setInvoicePage(1); }}
                            style={{ ...inputStyle, width: 'auto' }}>
                            <option value="">All Statuses</option>
                            {['PENDING','PAID','FAILED','VOIDED','REFUNDED'].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <span style={{ color: '#64748b', fontSize: '0.82rem' }}>{invoiceTotal} total</span>
                    </div>

                    {/* Invoice table */}
                    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                                <tr style={{ background: '#020617', color: '#64748b', textAlign: 'left' }}>
                                    {['#', 'Org', 'Amount', 'Status', 'Due', 'Created', 'Actions'].map(h => (
                                        <th key={h} style={{ padding: '10px 14px', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {invoices.map(inv => (
                                    <tr key={inv.id} style={{ borderTop: '1px solid #1e293b' }}>
                                        <td style={{ padding: '10px 14px', color: '#475569', fontSize: '0.78rem' }}>#{inv.id}</td>
                                        <td style={{ padding: '10px 14px', color: '#e2e8f0', fontWeight: 500 }}>{inv.org_name}</td>
                                        <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{fmt(parseFloat(inv.amount))}</td>
                                        <td style={{ padding: '10px 14px' }}><StatusBadge status={inv.status} /></td>
                                        <td style={{ padding: '10px 14px', color: '#64748b', fontSize: '0.8rem' }}>
                                            {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '—'}
                                        </td>
                                        <td style={{ padding: '10px 14px', color: '#64748b', fontSize: '0.78rem' }}>
                                            {new Date(inv.created_at).toLocaleDateString()}
                                        </td>
                                        <td style={{ padding: '10px 14px' }}>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                {inv.status === 'PENDING' && (
                                                    <button onClick={() => updateInvoiceStatus(inv.id, 'PAID')}
                                                        style={{ background: '#064e3b', color: '#6ee7b7', border: 'none', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontSize: '0.72rem' }}>
                                                        Mark Paid
                                                    </button>
                                                )}
                                                {inv.status !== 'VOIDED' && (
                                                    <button onClick={() => updateInvoiceStatus(inv.id, 'VOIDED')}
                                                        style={{ background: '#1e293b', color: '#94a3b8', border: 'none', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontSize: '0.72rem' }}>
                                                        Void
                                                    </button>
                                                )}
                                                {inv.stripe_hosted_url && (
                                                    <a href={inv.stripe_hosted_url} target="_blank" rel="noreferrer"
                                                        style={{ color: '#818cf8', fontSize: '0.72rem' }}>Stripe ↗</a>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {invoices.length === 0 && (
                                    <tr><td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#475569' }}>No invoices found.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {invoiceTotal > 50 && (
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                            <button disabled={invoicePage <= 1} onClick={() => setInvoicePage(p => p - 1)}
                                style={{ background: '#1e293b', color: invoicePage <= 1 ? '#334155' : '#e2e8f0', border: '1px solid #334155', borderRadius: 6, padding: '4px 12px', cursor: invoicePage <= 1 ? 'default' : 'pointer' }}>← Prev</button>
                            <span style={{ color: '#64748b', alignSelf: 'center', fontSize: '0.85rem' }}>Page {invoicePage}</span>
                            <button disabled={invoicePage * 50 >= invoiceTotal} onClick={() => setInvoicePage(p => p + 1)}
                                style={{ background: '#1e293b', color: invoicePage * 50 >= invoiceTotal ? '#334155' : '#e2e8f0', border: '1px solid #334155', borderRadius: 6, padding: '4px 12px', cursor: invoicePage * 50 >= invoiceTotal ? 'default' : 'pointer' }}>Next →</button>
                        </div>
                    )}
                </div>
            )}

            {/* ── ORG SUBSCRIPTIONS ── */}
            {tab === 'orgs' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                                <tr style={{ background: '#020617', color: '#64748b', textAlign: 'left' }}>
                                    {['Organization', 'Plan', 'Billing Status', 'Trial Ends', 'Actions'].map(h => (
                                        <th key={h} style={{ padding: '10px 16px', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {orgs.filter((o: any) => o.billing_status !== 'disabled').map((o: any) => {
                                    const isPastDue = o.billing_status === 'past_due';
                                    return (
                                        <tr key={o.id} style={{ borderTop: '1px solid #1e293b', background: isPastDue ? '#2d1a0a' : undefined }}>
                                            <td style={{ padding: '10px 16px', fontWeight: 600 }}>
                                                <span style={{ color: isPastDue ? '#fca5a5' : '#e2e8f0' }}>{o.name}</span>
                                                {isPastDue && <span style={{ marginLeft: 6, fontSize: '0.7rem', color: '#ef4444', background: '#3f0b0b', padding: '1px 6px', borderRadius: 6 }}>PAST DUE</span>}
                                            </td>
                                            <td style={{ padding: '10px 16px' }}>
                                                <select defaultValue={o.subscription_plan}
                                                    onChange={e => updateOrgPlan(o.id, e.target.value, o.billing_status)}
                                                    style={{ background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 6, padding: '3px 8px', fontSize: '0.8rem', cursor: 'pointer' }}>
                                                    {['free_trial','basic','pro','enterprise'].map(p => <option key={p} value={p}>{p}</option>)}
                                                </select>
                                            </td>
                                            <td style={{ padding: '10px 16px' }}>
                                                <select defaultValue={o.billing_status}
                                                    onChange={e => updateOrgPlan(o.id, o.subscription_plan, e.target.value)}
                                                    style={{ background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 6, padding: '3px 8px', fontSize: '0.8rem', cursor: 'pointer' }}>
                                                    {['active','past_due','canceled','free'].map(s => <option key={s} value={s}>{s}</option>)}
                                                </select>
                                            </td>
                                            <td style={{ padding: '10px 16px', color: '#64748b', fontSize: '0.8rem' }}>
                                                {o.trial_ends_at ? new Date(o.trial_ends_at).toLocaleDateString() : '—'}
                                            </td>
                                            <td style={{ padding: '10px 16px' }}>
                                                <div style={{ display: 'flex', gap: 6 }}>
                                                    <button onClick={() => {
                                                        setNewInv(p => ({ ...p, organization_id: String(o.id), amount: '49' }));
                                                        setTab('invoices');
                                                    }} style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: '0.75rem' }}>
                                                        + Invoice
                                                    </button>
                                                    <button
                                                        disabled={disablingId === o.id}
                                                        onClick={() => {
                                                            const reason = prompt(`Reason for disabling "${o.name}"?\n(Leave blank for default)`) ?? '';
                                                            if (reason !== null) disableOrg(o.id, reason);
                                                        }}
                                                        style={{ background: '#3f0b0b', color: '#fca5a5', border: '1px solid #7f1d1d', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: '0.75rem' }}>
                                                        🚫 Disable
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── DISABLED ORG QUEUE ── */}
            {tab === 'disabled' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div style={{ background: '#0f172a', border: '1px solid #7f1d1d', borderRadius: 12, overflow: 'hidden' }}>
                        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #7f1d1d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <span style={{ color: '#fca5a5', fontWeight: 700 }}>🚫 Disabled Organizations</span>
                                <span style={{ marginLeft: 8, color: '#64748b', fontSize: '0.82rem' }}>Orgs are locked out — users cannot log in</span>
                            </div>
                            <button onClick={loadDisabledOrgs} style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: '0.8rem' }}>↻ Refresh</button>
                        </div>
                        {disabledOrgs.length === 0 ? (
                            <div style={{ padding: '2.5rem', textAlign: 'center', color: '#475569' }}>No disabled organizations. 🎉</div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: '#020617', color: '#64748b', textAlign: 'left' }}>
                                        {['Organization', 'Previous Status', 'Disabled At', 'Reason', 'Action'].map(h => (
                                            <th key={h} style={{ padding: '10px 16px', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {disabledOrgs.map((o: any) => (
                                        <tr key={o.id} style={{ borderTop: '1px solid #3f0b0b', background: '#1a0505' }}>
                                            <td style={{ padding: '10px 16px', color: '#fca5a5', fontWeight: 700 }}>{o.name}</td>
                                            <td style={{ padding: '10px 16px', color: '#94a3b8', fontSize: '0.8rem' }}>{o.pre_disable_billing_status || '—'}</td>
                                            <td style={{ padding: '10px 16px', color: '#64748b', fontSize: '0.8rem' }}>
                                                {o.disabled_at ? new Date(o.disabled_at).toLocaleString() : '—'}
                                            </td>
                                            <td style={{ padding: '10px 16px', color: '#94a3b8', fontSize: '0.8rem', maxWidth: 280 }}>{o.disable_reason || '—'}</td>
                                            <td style={{ padding: '10px 16px' }}>
                                                <button
                                                    disabled={disablingId === o.id}
                                                    onClick={() => enableOrg(o.id)}
                                                    style={{ background: '#052e16', color: '#4ade80', border: '1px solid #15803d', borderRadius: 6, padding: '4px 14px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}>
                                                    ✓ Re-enable
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Manually disable an org */}
                    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: '1.25rem 1.5rem' }}>
                        <div style={{ color: '#e2e8f0', fontWeight: 700, marginBottom: '0.75rem' }}>Manually Disable an Organization</div>
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <select
                                value={disableReason}
                                onChange={e => setDisableReason(e.target.value)}
                                style={{ ...inputStyle, flex: '0 0 220px' }}
                            >
                                <option value="">Select organization…</option>
                                {orgs.filter((o: any) => o.billing_status !== 'disabled').map((o: any) => (
                                    <option key={o.id} value={String(o.id)}>#{o.id} {o.name} ({o.billing_status})</option>
                                ))}
                            </select>
                            <input
                                placeholder="Reason (optional)"
                                style={{ ...inputStyle, flex: 1 }}
                                id="disable-reason-input"
                            />
                            <button
                                onClick={() => {
                                    const orgId = parseInt(disableReason);
                                    const reason = (document.getElementById('disable-reason-input') as HTMLInputElement)?.value || '';
                                    if (!orgId) return alert('Select an org first');
                                    if (!confirm(`Disable org #${orgId}? Users will not be able to log in.`)) return;
                                    disableOrg(orgId, reason);
                                    setDisableReason('');
                                }}
                                style={{ background: '#3f0b0b', color: '#fca5a5', border: '1px solid #7f1d1d', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontWeight: 700 }}>
                                Disable Org
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── STRIPE REPORT ── */}
            {tab === 'stripe' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {stripeReportLoading && <div style={{ color: '#94a3b8', padding: '2rem' }}>Loading Stripe data…</div>}
                    {stripeReportError && (
                        <div style={{ background: '#1a0a00', border: '1px solid #78350f', borderRadius: 10, padding: '1rem 1.5rem', color: '#fbbf24' }}>
                            ⚠ {stripeReportError}
                        </div>
                    )}
                    {stripeSummary && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
                            <StatCard label="Collected (Stripe)" value={fmt(stripeSummary.totalCollected)} color="#34d399" />
                            <StatCard label="Outstanding" value={fmt(stripeSummary.totalOutstanding)} color="#fbbf24" />
                            <StatCard label="Problem Payments" value={String(stripeSummary.pastDueCount)} color="#ef4444" sub="past due or failed" />
                            <StatCard label="Problem Orgs" value={String(stripeSummary.problemOrgs)} color="#f87171" />
                        </div>
                    )}
                    {!stripeReportLoading && !stripeReportError && stripeReport.length > 0 && (
                        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden' }}>
                            <div style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ color: 'white', fontWeight: 700 }}>Stripe Payments</span>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <button onClick={() => setStripeFilter('all')}
                                        style={{ padding: '4px 12px', borderRadius: 6, border: `1px solid ${stripeFilter === 'all' ? '#3b82f6' : '#334155'}`, background: stripeFilter === 'all' ? '#1d3461' : 'transparent', color: stripeFilter === 'all' ? '#93c5fd' : '#64748b', cursor: 'pointer', fontSize: '0.78rem' }}>
                                        All ({stripeReport.length})
                                    </button>
                                    <button onClick={() => setStripeFilter('problems')}
                                        style={{ padding: '4px 12px', borderRadius: 6, border: `1px solid ${stripeFilter === 'problems' ? '#ef4444' : '#334155'}`, background: stripeFilter === 'problems' ? '#3f0b0b' : 'transparent', color: stripeFilter === 'problems' ? '#fca5a5' : '#64748b', cursor: 'pointer', fontSize: '0.78rem' }}>
                                        Problems only
                                    </button>
                                    <button onClick={loadStripeReport}
                                        style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '0.78rem' }}>↻</button>
                                </div>
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                                <thead>
                                    <tr style={{ background: '#020617', color: '#64748b', textAlign: 'left' }}>
                                        {['Organization', 'Amount', 'Status', 'Due Date', 'Created', 'Payment Method', 'Link'].map(h => (
                                            <th key={h} style={{ padding: '9px 14px', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {stripeReport
                                        .filter(r => stripeFilter === 'all' || r.is_past_due || r.is_failed)
                                        .map((r: any, i: number) => {
                                            const isProblem = r.is_past_due || r.is_failed;
                                            const statusColors: Record<string, { bg: string; text: string }> = {
                                                paid:             { bg: '#064e3b', text: '#6ee7b7' },
                                                open:             { bg: '#78350f', text: '#fcd34d' },
                                                uncollectible:    { bg: '#7f1d1d', text: '#fca5a5' },
                                                draft:            { bg: '#1e293b', text: '#64748b' },
                                                requires_payment_method: { bg: '#7f1d1d', text: '#fca5a5' },
                                                canceled:         { bg: '#1e293b', text: '#64748b' },
                                            };
                                            const sc = statusColors[r.status] || { bg: '#1e293b', text: '#94a3b8' };
                                            return (
                                                <tr key={i} style={{ borderTop: '1px solid #1e293b', background: isProblem ? '#1a0505' : undefined }}>
                                                    <td style={{ padding: '9px 14px' }}>
                                                        <div style={{ color: isProblem ? '#fca5a5' : '#e2e8f0', fontWeight: 600 }}>{r.org_name}</div>
                                                        {r.customer_email && <div style={{ color: '#475569', fontSize: '0.75rem' }}>{r.customer_email}</div>}
                                                        {isProblem && r.billing_status === 'active' && (
                                                            <span style={{ fontSize: '0.68rem', background: '#7f1d1d', color: '#fca5a5', borderRadius: 4, padding: '1px 5px', marginTop: 2, display: 'inline-block' }}>⚠ Org still active</span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '9px 14px', color: isProblem ? '#fca5a5' : '#34d399', fontWeight: 700 }}>
                                                        {fmt(r.amount_due)}
                                                        {r.amount_paid > 0 && r.amount_paid < r.amount_due && (
                                                            <div style={{ color: '#64748b', fontSize: '0.73rem' }}>paid: {fmt(r.amount_paid)}</div>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '9px 14px' }}>
                                                        <span style={{ background: sc.bg, color: sc.text, borderRadius: 8, padding: '2px 8px', fontSize: '0.68rem', fontWeight: 700 }}>
                                                            {r.status?.toUpperCase()}
                                                        </span>
                                                        {r.is_past_due && <div style={{ color: '#ef4444', fontSize: '0.68rem', marginTop: 2 }}>PAST DUE</div>}
                                                    </td>
                                                    <td style={{ padding: '9px 14px', color: r.due_date && new Date(r.due_date) < new Date() ? '#ef4444' : '#64748b', fontSize: '0.8rem' }}>
                                                        {r.due_date ? new Date(r.due_date).toLocaleDateString() : '—'}
                                                    </td>
                                                    <td style={{ padding: '9px 14px', color: '#64748b', fontSize: '0.78rem' }}>{new Date(r.created).toLocaleDateString()}</td>
                                                    <td style={{ padding: '9px 14px', color: '#64748b', fontSize: '0.78rem' }}>{r.payment_method || '—'}</td>
                                                    <td style={{ padding: '9px 14px' }}>
                                                        {r.hosted_url && (
                                                            <a href={r.hosted_url} target="_blank" rel="noreferrer"
                                                                style={{ color: '#818cf8', fontSize: '0.75rem' }}>Invoice ↗</a>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {!stripeReportLoading && !stripeReportError && stripeReport.length === 0 && (
                        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: '3rem', textAlign: 'center', color: '#475569' }}>
                            No Stripe payment data found.
                        </div>
                    )}
                </div>
            )}

            {/* ── SETTINGS ── */}
            {tab === 'settings' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 680 }}>
                    {cfgLoading && <p style={{ color: '#64748b' }}>Loading…</p>}

                    {/* Provider */}
                    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: '1.5rem' }}>
                        <div style={{ color: 'white', fontWeight: 700, marginBottom: '1rem' }}>Billing Provider</div>
                        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
                            {[['stripe', 'Stripe (Recommended)'], ['manual', 'Manual / No Payment Processor']].map(([val, label]) => (
                                <button key={val} onClick={() => setCfg(p => ({ ...p, billing_provider: val }))}
                                    style={{ flex: 1, padding: '10px', borderRadius: 8, border: `2px solid ${cfg.billing_provider === val ? '#3b82f6' : '#334155'}`,
                                        background: cfg.billing_provider === val ? '#1d3461' : '#1e293b', color: cfg.billing_provider === val ? '#93c5fd' : '#94a3b8',
                                        cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' }}>
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Pricing */}
                    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: '1.5rem' }}>
                        <div style={{ color: 'white', fontWeight: 700, marginBottom: '1rem' }}>Plan Pricing</div>
                        {[
                            { tier: 'Basic',      mKey: 'basic_monthly_price',      yKey: 'basic_yearly_price',      color: '#60a5fa' },
                            { tier: 'Pro',        mKey: 'pro_monthly_price',        yKey: 'pro_yearly_price',        color: '#a78bfa' },
                            { tier: 'Enterprise', mKey: 'enterprise_monthly_price', yKey: 'enterprise_yearly_price', color: '#34d399' },
                        ].map(({ tier, mKey, yKey, color }) => (
                            <div key={tier} style={{ marginBottom: '1rem' }}>
                                <div style={{ color, fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{tier}</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                    <div>
                                        <label style={{ color: '#64748b', fontSize: '0.75rem', display: 'block', marginBottom: 3 }}>Monthly Price ($)</label>
                                        <input type="number" value={(cfg as any)[mKey]} placeholder={tier === 'Enterprise' ? 'Custom' : ''}
                                            onChange={e => setCfg(p => ({ ...p, [mKey]: e.target.value }))} style={inputStyle} />
                                    </div>
                                    <div>
                                        <label style={{ color: '#64748b', fontSize: '0.75rem', display: 'block', marginBottom: 3 }}>Yearly Price ($)</label>
                                        <input type="number" value={(cfg as any)[yKey]} placeholder={tier === 'Enterprise' ? 'Custom' : ''}
                                            onChange={e => setCfg(p => ({ ...p, [yKey]: e.target.value }))} style={inputStyle} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Stripe Config */}
                    {cfg.billing_provider === 'stripe' && (
                        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: '1.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <div style={{ color: 'white', fontWeight: 700 }}>Stripe Configuration</div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    {['test', 'live'].map(m => (
                                        <button key={m} onClick={() => setCfg(p => ({ ...p, stripe_mode: m }))}
                                            style={{ padding: '4px 12px', borderRadius: 6, border: `1px solid ${cfg.stripe_mode === m ? (m === 'test' ? '#b45309' : '#15803d') : '#334155'}`,
                                                background: cfg.stripe_mode === m ? (m === 'test' ? '#451a03' : '#052e16') : 'transparent',
                                                color: cfg.stripe_mode === m ? (m === 'test' ? '#fbbf24' : '#4ade80') : '#64748b',
                                                cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase' }}>
                                            {m}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <p style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: '1rem' }}>
                                {cfg.stripe_mode === 'test'
                                    ? 'Using test keys — safe for sandbox testing. No real charges.'
                                    : '⚠ Live mode — real charges will be processed.'}
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {[
                                    ['stripe_secret_key',      cfg.stripe_mode === 'test' ? 'Secret Key (sk_test_…)' : 'Secret Key (sk_live_…)', 'password'],
                                    ['stripe_publishable_key', cfg.stripe_mode === 'test' ? 'Publishable Key (pk_test_…)' : 'Publishable Key (pk_live_…)', 'text'],
                                    ['stripe_webhook_secret',  'Webhook Signing Secret (whsec_…)', 'password'],
                                ].map(([key, label, type]) => (
                                    <div key={key}>
                                        <label style={{ color: '#64748b', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>{label}</label>
                                        <input type={type} value={(cfg as any)[key]}
                                            onChange={e => setCfg(p => ({ ...p, [key]: e.target.value }))}
                                            style={inputStyle} placeholder={type === 'password' ? '••••••••••••••••' : ''} />
                                    </div>
                                ))}
                                <div style={{ color: '#475569', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>Stripe Price IDs</div>
                                {[
                                    ['stripe_basic_monthly_price_id',      'Basic — Monthly Price ID (price_…)'],
                                    ['stripe_basic_yearly_price_id',       'Basic — Yearly Price ID (price_…)'],
                                    ['stripe_pro_monthly_price_id',        'Pro — Monthly Price ID (price_…)'],
                                    ['stripe_pro_yearly_price_id',         'Pro — Yearly Price ID (price_…)'],
                                    ['stripe_enterprise_monthly_price_id', 'Enterprise — Monthly Price ID (price_…)'],
                                    ['stripe_enterprise_yearly_price_id',  'Enterprise — Yearly Price ID (price_…)'],
                                ].map(([key, label]) => (
                                    <div key={key}>
                                        <label style={{ color: '#64748b', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>{label}</label>
                                        <input value={(cfg as any)[key]} onChange={e => setCfg(p => ({ ...p, [key]: e.target.value }))}
                                            style={inputStyle} placeholder="price_…" />
                                    </div>
                                ))}
                            </div>

                            <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: '#0a0f1e', borderRadius: 8, border: '1px solid #1e293b' }}>
                                <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Webhook Endpoint URL</div>
                                <code style={{ color: '#93c5fd', fontSize: '0.82rem', wordBreak: 'break-all' }}>{appUrl}/api/webhooks/stripe</code>
                                <p style={{ color: '#475569', fontSize: '0.75rem', marginTop: 4 }}>Configure this URL in your Stripe Dashboard → Webhooks. Required events: checkout.session.completed, customer.subscription.*, invoice.payment_succeeded, invoice.payment_failed</p>
                            </div>
                        </div>
                    )}

                    {/* Save */}
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <button onClick={saveConfig} disabled={cfgSaving}
                            style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, padding: '10px 24px', cursor: cfgSaving ? 'default' : 'pointer', fontWeight: 700, fontSize: '0.9rem' }}>
                            {cfgSaving ? 'Saving…' : 'Save & Test Connection'}
                        </button>
                        {cfgTestResult && (
                            <span style={{ color: cfgTestResult.startsWith('✓') ? '#4ade80' : '#ef4444', fontWeight: 600, fontSize: '0.85rem' }}>{cfgTestResult}</span>
                        )}
                    </div>

                    {/* Auto-Disable Settings */}
                    <div style={{ background: '#0f172a', border: '1px solid #7f1d1d', borderRadius: 12, padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <div>
                                <div style={{ color: '#fca5a5', fontWeight: 700, fontSize: '0.95rem' }}>🚫 Auto-Disable on Billing Failure</div>
                                <div style={{ color: '#64748b', fontSize: '0.8rem', marginTop: 2 }}>Automatically disable orgs with past-due invoices after a grace period</div>
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                <div
                                    onClick={() => setAutoDisableEnabled(v => !v)}
                                    style={{
                                        width: 44, height: 24, borderRadius: 12, position: 'relative', cursor: 'pointer',
                                        background: autoDisableEnabled ? '#dc2626' : '#1e293b',
                                        border: `2px solid ${autoDisableEnabled ? '#ef4444' : '#334155'}`,
                                        transition: 'background 0.2s',
                                    }}
                                >
                                    <div style={{
                                        position: 'absolute', top: 2, left: autoDisableEnabled ? 20 : 2,
                                        width: 16, height: 16, borderRadius: 8, background: 'white',
                                        transition: 'left 0.2s',
                                    }} />
                                </div>
                                <span style={{ color: autoDisableEnabled ? '#fca5a5' : '#64748b', fontSize: '0.82rem', fontWeight: 600 }}>
                                    {autoDisableEnabled ? 'ENABLED' : 'DISABLED'}
                                </span>
                            </label>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                            <label style={{ color: '#94a3b8', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>Grace period (days before disabling):</label>
                            <input
                                type="number"
                                min={1}
                                max={90}
                                value={autoDisableGraceDays}
                                onChange={e => setAutoDisableGraceDays(parseInt(e.target.value) || 7)}
                                style={{ ...inputStyle, width: 80 }}
                            />
                        </div>

                        {autoDisableEnabled && (
                            <div style={{ background: '#1a0505', border: '1px solid #3f0b0b', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.82rem', color: '#fca5a5' }}>
                                ⚠ When enabled, orgs with <strong>past_due</strong> billing status whose most recent invoice has been unpaid for more than <strong>{autoDisableGraceDays} day{autoDisableGraceDays !== 1 ? 's' : ''}</strong> will be automatically disabled each night at 6 AM. Their users will not be able to log in until re-enabled.
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <button onClick={() => saveAutoDisable(false)} disabled={autoDisableSaving}
                                style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
                                Save Settings
                            </button>
                            <button onClick={() => saveAutoDisable(true)} disabled={autoDisableSaving}
                                style={{ background: '#3f0b0b', color: '#fca5a5', border: '1px solid #7f1d1d', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
                                {autoDisableSaving ? 'Running…' : 'Run Now'}
                            </button>
                            {autoDisableRunResult && (
                                <span style={{ color: autoDisableRunResult.includes('No orgs') ? '#4ade80' : '#fbbf24', fontSize: '0.82rem' }}>{autoDisableRunResult}</span>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
