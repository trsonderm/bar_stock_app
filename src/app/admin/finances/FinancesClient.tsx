'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
    AreaChart, Area, BarChart, Bar, LineChart, Line,
    PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ResponsiveContainer, ReferenceLine,
} from 'recharts';

// ── Types ─────────────────────────────────────────────────────────────────────
interface ShiftRow {
    id: number;
    closed_at: string;
    user_id: number;
    user_name: string;
    location_name: string | null;
    cash_sales: number;
    cc_sales: number;
    cash_tips: number;
    cc_tips: number;
    payouts_json: any;
    bag_amount: number;
    over_short: number;
    bank_start: number;
    bank_end: number;
}

interface MovementRow {
    timestamp: string;
    qty: number;
    unit_cost: number;
    movement_value: number;
}

interface Employee { id: number; name: string; }
interface Location { id: number; name: string; }

// ── Constants ─────────────────────────────────────────────────────────────────
const CASH_COLOR = '#22c55e';
const CC_COLOR = '#3b82f6';
const TIP_CASH_COLOR = '#10b981';
const TIP_CC_COLOR = '#818cf8';
const PAYOUT_COLOR = '#f59e0b';
const OVER_COLOR = '#22c55e';
const SHORT_COLOR = '#ef4444';
const STOCK_COLOR = '#06b6d4';
const MUTED = '#6b7280';

const PERIOD_LABELS: Record<string, string> = {
    week: 'Last 7 Days',
    month: 'This Month',
    year: 'This Year',
};

const fmt = (v: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

const fmtFull = (v: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);

const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

function parsePayouts(raw: any): { typeName: string; amount: number }[] {
    if (!raw) return [];
    try {
        const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!Array.isArray(arr)) return [];
        return arr.map((p: any) => ({ typeName: String(p.typeName || p.name || 'Other'), amount: parseFloat(p.amount) || 0 }));
    } catch { return []; }
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, icon, trend }: {
    label: string; value: string; sub?: string; color: string; icon: string; trend?: number;
}) {
    return (
        <div style={{
            background: 'linear-gradient(135deg, #111827 0%, #1a2332 100%)',
            border: `1px solid ${color}30`,
            borderRadius: '0.75rem',
            padding: '1.25rem 1.5rem',
            position: 'relative',
            overflow: 'hidden',
        }}>
            <div style={{
                position: 'absolute', top: 0, right: 0, width: 80, height: 80,
                background: `radial-gradient(circle at top right, ${color}18, transparent 70%)`,
            }} />
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.4rem' }}>
                        {label}
                    </div>
                    <div style={{ fontSize: '1.7rem', fontWeight: 700, color: 'white', lineHeight: 1 }}>
                        {value}
                    </div>
                    {sub && <div style={{ fontSize: '0.75rem', color: MUTED, marginTop: '0.35rem' }}>{sub}</div>}
                    {trend !== undefined && (
                        <div style={{ fontSize: '0.75rem', color: trend >= 0 ? CASH_COLOR : SHORT_COLOR, marginTop: '0.35rem', fontWeight: 600 }}>
                            {fmtPct(trend)} vs prev period
                        </div>
                    )}
                </div>
                <div style={{ fontSize: '1.6rem', opacity: 0.7 }}>{icon}</div>
            </div>
        </div>
    );
}

// ── Section Card ─────────────────────────────────────────────────────────────
function ChartCard({ title, children, height = 240 }: { title: string; children: React.ReactNode; height?: number }) {
    return (
        <div style={{
            background: 'linear-gradient(135deg, #111827 0%, #0f1720 100%)',
            border: '1px solid #1f2937',
            borderRadius: '0.75rem',
            padding: '1.25rem',
        }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e5e7eb', marginBottom: '1rem', letterSpacing: '0.02em' }}>
                {title}
            </div>
            <div style={{ height }}>
                {children}
            </div>
        </div>
    );
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────
const DarkTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '0.5rem', padding: '0.75rem', fontSize: '0.8rem' }}>
            <div style={{ color: '#9ca3af', marginBottom: '0.5rem', fontWeight: 600 }}>{label}</div>
            {payload.map((p: any) => (
                <div key={p.dataKey} style={{ color: p.color, marginBottom: '0.2rem' }}>
                    {p.name}: {typeof p.value === 'number' ? fmtFull(p.value) : p.value}
                </div>
            ))}
        </div>
    );
};

// ── Main Component ────────────────────────────────────────────────────────────
export default function FinancesClient() {
    const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');
    const [selectedUserId, setSelectedUserId] = useState<string>('');
    const [selectedLocationId, setSelectedLocationId] = useState<string>('');
    const [rows, setRows] = useState<ShiftRow[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);
    const [stockValue, setStockValue] = useState<number>(0);
    const [movementRows, setMovementRows] = useState<MovementRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        setLoading(true);
        setError('');
        const params = new URLSearchParams({ period });
        if (selectedUserId) params.set('userId', selectedUserId);
        if (selectedLocationId) params.set('locationId', selectedLocationId);
        fetch(`/api/admin/finances?${params}`)
            .then(r => r.json())
            .then(data => {
                if (data.error) { setError(data.error); return; }
                setRows(data.rows || []);
                setEmployees(data.users || []);
                setLocations(data.locations || []);
                setStockValue(data.stockValue ?? 0);
                setMovementRows(data.movementRows || []);
            })
            .catch(() => setError('Failed to load data'))
            .finally(() => setLoading(false));
    }, [period, selectedUserId, selectedLocationId]);

    // ── Aggregations ──────────────────────────────────────────────────────────
    const kpis = useMemo(() => {
        let totalRevenue = 0, totalTips = 0, totalPayouts = 0, totalOverShort = 0;
        let shortCount = 0;
        rows.forEach(r => {
            totalRevenue += r.cash_sales + r.cc_sales;
            totalTips += r.cash_tips + r.cc_tips;
            totalPayouts += parsePayouts(r.payouts_json).reduce((s, p) => s + p.amount, 0);
            totalOverShort += r.over_short;
            if (r.over_short < 0) shortCount++;
        });
        const accuracy = rows.length > 0 ? ((rows.length - shortCount) / rows.length) * 100 : 100;
        return { totalRevenue, totalTips, totalPayouts, totalOverShort, shiftCount: rows.length, accuracy };
    }, [rows]);

    // Time-series: revenue + over/short per date bucket
    const timeSeries = useMemo(() => {
        const map: Record<string, { label: string; cash: number; cc: number; cashTips: number; ccTips: number; payouts: number; overShort: number; count: number }> = {};
        rows.forEach(r => {
            const d = new Date(r.closed_at);
            let key: string;
            if (period === 'year') {
                key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            } else {
                key = d.toISOString().split('T')[0];
            }
            if (!map[key]) {
                const label = period === 'year'
                    ? new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-US', { month: 'short' })
                    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                map[key] = { label, cash: 0, cc: 0, cashTips: 0, ccTips: 0, payouts: 0, overShort: 0, count: 0 };
            }
            map[key].cash += r.cash_sales;
            map[key].cc += r.cc_sales;
            map[key].cashTips += r.cash_tips;
            map[key].ccTips += r.cc_tips;
            map[key].payouts += parsePayouts(r.payouts_json).reduce((s, p) => s + p.amount, 0);
            map[key].overShort += r.over_short;
            map[key].count++;
        });
        return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
    }, [rows, period]);

    // Stock movement time series — value of stock subtracted, bucketed by period
    const movementSeries = useMemo(() => {
        const map: Record<string, { label: string; stockMoved: number; qty: number }> = {};
        movementRows.forEach(r => {
            const d = new Date(r.timestamp);
            let key: string;
            if (period === 'year') {
                key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            } else {
                key = d.toISOString().split('T')[0];
            }
            if (!map[key]) {
                const label = period === 'year'
                    ? new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-US', { month: 'short' })
                    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                map[key] = { label, stockMoved: 0, qty: 0 };
            }
            map[key].stockMoved += Number(r.movement_value) || 0;
            map[key].qty += Number(r.qty) || 0;
        });
        return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
    }, [movementRows, period]);

    const totalStockMoved = useMemo(() =>
        movementRows.reduce((s, r) => s + (Number(r.movement_value) || 0), 0),
        [movementRows]
    );

    // Sales mix for pie
    const salesMix = useMemo(() => {
        const cashTotal = rows.reduce((s, r) => s + r.cash_sales, 0);
        const ccTotal = rows.reduce((s, r) => s + r.cc_sales, 0);
        const total = cashTotal + ccTotal;
        if (total === 0) return [];
        return [
            { name: 'Cash Sales', value: cashTotal, pct: (cashTotal / total * 100).toFixed(1) },
            { name: 'Credit Card', value: ccTotal, pct: (ccTotal / total * 100).toFixed(1) },
        ];
    }, [rows]);

    // Payout type breakdown
    const payoutBreakdown = useMemo(() => {
        const map: Record<string, number> = {};
        rows.forEach(r => {
            parsePayouts(r.payouts_json).forEach(p => {
                map[p.typeName] = (map[p.typeName] || 0) + p.amount;
            });
        });
        return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    }, [rows]);

    // Employee table
    const employeeStats = useMemo(() => {
        const map: Record<number, { name: string; shifts: number; revenue: number; tips: number; payouts: number; totalOverShort: number; shortShifts: number }> = {};
        rows.forEach(r => {
            if (!map[r.user_id]) map[r.user_id] = { name: r.user_name || 'Unknown', shifts: 0, revenue: 0, tips: 0, payouts: 0, totalOverShort: 0, shortShifts: 0 };
            const e = map[r.user_id];
            e.shifts++;
            e.revenue += r.cash_sales + r.cc_sales;
            e.tips += r.cash_tips + r.cc_tips;
            e.payouts += parsePayouts(r.payouts_json).reduce((s, p) => s + p.amount, 0);
            e.totalOverShort += r.over_short;
            if (r.over_short < 0) e.shortShifts++;
        });
        return Object.values(map).sort((a, b) => b.revenue - a.revenue);
    }, [rows]);

    // Best day highlight
    const bestDay = useMemo(() => {
        if (!timeSeries.length) return null;
        return timeSeries.reduce((best, d) => (d.cash + d.cc > best.cash + best.cc ? d : best), timeSeries[0]);
    }, [timeSeries]);

    const selectedLocationName = locations.find(l => String(l.id) === selectedLocationId)?.name || '';
    const noData = !loading && rows.length === 0;

    return (
        <div style={{ color: 'white', minHeight: '100vh' }}>
            {/* ── Header ── */}
            <div style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
                borderRadius: '1rem',
                padding: '1.75rem 2rem',
                marginBottom: '1.5rem',
                border: '1px solid #1e3a5f',
                position: 'relative',
                overflow: 'hidden',
            }}>
                <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 80% 50%, rgba(99,102,241,0.12) 0%, transparent 60%)', pointerEvents: 'none' }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', position: 'relative' }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, background: 'linear-gradient(90deg, #fff 40%, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            💰 Financial Dashboard
                        </h1>
                        <p style={{ margin: '0.35rem 0 0', color: '#94a3b8', fontSize: '0.875rem' }}>
                            {PERIOD_LABELS[period]} · {kpis.shiftCount} shift{kpis.shiftCount !== 1 ? 's' : ''}
                            {selectedUserId && employees.find(e => String(e.id) === selectedUserId)
                                ? ` · ${employees.find(e => String(e.id) === selectedUserId)!.name}`
                                : ' · All Staff'}
                            {selectedLocationName ? ` · ${selectedLocationName}` : ' · All Locations'}
                        </p>
                    </div>

                    {/* Filters */}
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        {/* Period pills */}
                        <div style={{ display: 'flex', background: '#0f172a', borderRadius: '0.5rem', padding: '0.2rem', border: '1px solid #1e293b' }}>
                            {(['week', 'month', 'year'] as const).map(p => (
                                <button
                                    key={p}
                                    onClick={() => setPeriod(p)}
                                    style={{
                                        padding: '0.35rem 0.85rem',
                                        borderRadius: '0.375rem',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        background: period === p ? '#6366f1' : 'transparent',
                                        color: period === p ? 'white' : '#64748b',
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    {p === 'week' ? '7D' : p === 'month' ? '1M' : '1Y'}
                                </button>
                            ))}
                        </div>

                        {/* Location filter */}
                        {locations.length > 1 && (
                            <select
                                value={selectedLocationId}
                                onChange={e => setSelectedLocationId(e.target.value)}
                                style={{
                                    background: '#0f172a', color: 'white', border: '1px solid #1e293b',
                                    borderRadius: '0.5rem', padding: '0.4rem 0.75rem', fontSize: '0.8rem', cursor: 'pointer',
                                }}
                            >
                                <option value="">All Locations</option>
                                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                        )}

                        {/* Employee filter */}
                        {employees.length > 0 && (
                            <select
                                value={selectedUserId}
                                onChange={e => setSelectedUserId(e.target.value)}
                                style={{
                                    background: '#0f172a', color: 'white', border: '1px solid #1e293b',
                                    borderRadius: '0.5rem', padding: '0.4rem 0.75rem', fontSize: '0.8rem', cursor: 'pointer',
                                }}
                            >
                                <option value="">All Employees</option>
                                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                        )}
                    </div>
                </div>
            </div>

            {loading && (
                <div style={{ textAlign: 'center', padding: '4rem', color: '#6b7280' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>⏳</div>
                    Loading financial data...
                </div>
            )}

            {error && (
                <div style={{ background: '#1f0a0a', border: '1px solid #7f1d1d', borderRadius: '0.5rem', padding: '1rem', color: '#f87171', marginBottom: '1rem' }}>
                    {error}
                </div>
            )}

            {!loading && !error && (
                <>
                    {/* ── Stock Value + Movement KPIs — always visible ── */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                        <KpiCard
                            label={`Stock Value on Hand${selectedLocationName ? ` · ${selectedLocationName}` : ''}`}
                            value={fmt(stockValue)}
                            sub="current inventory × unit cost"
                            color={STOCK_COLOR}
                            icon="📦"
                        />
                        <KpiCard
                            label={`Stock Used · ${PERIOD_LABELS[period]}`}
                            value={fmt(totalStockMoved)}
                            sub={`${movementRows.reduce((s, r) => s + (Number(r.qty) || 0), 0).toFixed(0)} units subtracted`}
                            color="#a855f7"
                            icon="📉"
                        />
                        {rows.length > 0 && (
                            <>
                                <KpiCard label="Total Revenue" value={fmt(kpis.totalRevenue)} sub={`${kpis.shiftCount} shifts`} color="#6366f1" icon="💵" />
                                <KpiCard label="Total Tips" value={fmt(kpis.totalTips)} sub={`avg ${fmt(kpis.shiftCount ? kpis.totalTips / kpis.shiftCount : 0)}/shift`} color="#10b981" icon="🤑" />
                                <KpiCard label="Total Payouts" value={fmt(kpis.totalPayouts)} sub="DJ, events, etc." color="#f59e0b" icon="💸" />
                                <KpiCard
                                    label="Cash Accuracy"
                                    value={`${kpis.accuracy.toFixed(0)}%`}
                                    sub={`${fmtFull(kpis.totalOverShort)} net over/short`}
                                    color={kpis.accuracy >= 90 ? '#22c55e' : kpis.accuracy >= 70 ? '#f59e0b' : '#ef4444'}
                                    icon={kpis.accuracy >= 90 ? '✅' : kpis.accuracy >= 70 ? '⚠️' : '🚨'}
                                />
                                {bestDay && (
                                    <KpiCard
                                        label="Best Day"
                                        value={fmt(bestDay.cash + bestDay.cc)}
                                        sub={bestDay.label}
                                        color="#22c55e"
                                        icon="🏆"
                                    />
                                )}
                            </>
                        )}
                    </div>

                    {/* ── Stock Movement Chart ── */}
                    {movementSeries.length > 0 && (
                        <div style={{ marginBottom: '1rem' }}>
                            <ChartCard title={`📉 Stock Used (Cost Value) · ${PERIOD_LABELS[period]}`} height={240}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={movementSeries} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                                        <defs>
                                            <linearGradient id="gradStock" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={STOCK_COLOR} stopOpacity={0.35} />
                                                <stop offset="95%" stopColor={STOCK_COLOR} stopOpacity={0.02} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                                        <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} />
                                        <Tooltip content={<DarkTooltip />} />
                                        <Legend wrapperStyle={{ fontSize: '0.75rem', color: '#9ca3af' }} />
                                        <Area type="monotone" dataKey="stockMoved" name="Stock Cost Used" stroke={STOCK_COLOR} fill="url(#gradStock)" strokeWidth={2} dot={false} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </ChartCard>
                        </div>
                    )}

                    {noData && (
                        <div style={{ textAlign: 'center', padding: '4rem', color: '#6b7280', background: '#111827', borderRadius: '0.75rem', border: '1px solid #1f2937', marginBottom: '1rem' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</div>
                            <div style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: '#9ca3af' }}>No shift data for this period</div>
                            <div style={{ fontSize: '0.875rem' }}>Try selecting a different time range or employee</div>
                        </div>
                    )}

                    {rows.length > 0 && (
                        <>
                            {/* ── Charts Row 1 ── */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1rem', marginBottom: '1rem' }}>

                                {/* Revenue Over Time */}
                                <ChartCard title="📈 Revenue Over Time" height={260}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={timeSeries} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                                            <defs>
                                                <linearGradient id="gradCash" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor={CASH_COLOR} stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor={CASH_COLOR} stopOpacity={0.02} />
                                                </linearGradient>
                                                <linearGradient id="gradCC" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor={CC_COLOR} stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor={CC_COLOR} stopOpacity={0.02} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                                            <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                                            <YAxis tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} />
                                            <Tooltip content={<DarkTooltip />} />
                                            <Legend wrapperStyle={{ fontSize: '0.75rem', color: '#9ca3af' }} />
                                            <Area type="monotone" dataKey="cash" name="Cash Sales" stroke={CASH_COLOR} fill="url(#gradCash)" strokeWidth={2} dot={false} />
                                            <Area type="monotone" dataKey="cc" name="CC Sales" stroke={CC_COLOR} fill="url(#gradCC)" strokeWidth={2} dot={false} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </ChartCard>

                                {/* Sales Mix Pie */}
                                <ChartCard title="💳 Sales Mix" height={260}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={salesMix}
                                                cx="50%"
                                                cy="45%"
                                                innerRadius={55}
                                                outerRadius={85}
                                                paddingAngle={3}
                                                dataKey="value"
                                                label={({ cx, cy, midAngle = 0, innerRadius = 0, outerRadius = 0, index }) => {
                                                    const RADIAN = Math.PI / 180;
                                                    const radius = Number(innerRadius) + (Number(outerRadius) - Number(innerRadius)) * 0.5;
                                                    const x = Number(cx) + radius * Math.cos(-midAngle * RADIAN);
                                                    const y = Number(cy) + radius * Math.sin(-midAngle * RADIAN);
                                                    const total = salesMix.reduce((s, d) => s + d.value, 0);
                                                    const pct = total > 0 ? ((salesMix[index]?.value || 0) / total * 100).toFixed(0) : '0';
                                                    return <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>{pct}%</text>;
                                                }}
                                                labelLine={false}
                                            >
                                                <Cell fill={CASH_COLOR} />
                                                <Cell fill={CC_COLOR} />
                                            </Pie>
                                            <Tooltip
                                                content={({ active, payload }) => {
                                                    if (!active || !payload?.length) return null;
                                                    const d = payload[0].payload;
                                                    return (
                                                        <div style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '0.5rem', padding: '0.6rem 0.9rem', fontSize: '0.8rem' }}>
                                                            <div style={{ color: '#9ca3af' }}>{d.name}</div>
                                                            <div style={{ color: 'white', fontWeight: 700 }}>{fmtFull(d.value)}</div>
                                                            <div style={{ color: '#6b7280' }}>{d.pct}%</div>
                                                        </div>
                                                    );
                                                }}
                                            />
                                            <Legend
                                                wrapperStyle={{ fontSize: '0.75rem', color: '#9ca3af' }}
                                                formatter={(value, entry: any) => (
                                                    <span style={{ color: '#d1d5db' }}>{value}<br /><span style={{ color: '#6b7280' }}>{fmtFull(entry.payload?.value || 0)}</span></span>
                                                )}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </ChartCard>
                            </div>

                            {/* ── Charts Row 2 ── */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>

                                {/* Tips Breakdown */}
                                <ChartCard title="🤑 Tips Breakdown" height={220}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={timeSeries} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                                            <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 10 }} axisLine={false} tickLine={false} />
                                            <YAxis tick={{ fill: MUTED, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                                            <Tooltip content={<DarkTooltip />} />
                                            <Legend wrapperStyle={{ fontSize: '0.75rem', color: '#9ca3af' }} />
                                            <Bar dataKey="cashTips" name="Cash Tips" fill={TIP_CASH_COLOR} radius={[3, 3, 0, 0]} stackId="a" />
                                            <Bar dataKey="ccTips" name="CC Tips" fill={TIP_CC_COLOR} radius={[3, 3, 0, 0]} stackId="a" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </ChartCard>

                                {/* Payouts by Type */}
                                {payoutBreakdown.length > 0 ? (
                                    <ChartCard title="💸 Payouts by Type" height={220}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={payoutBreakdown} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                                                <XAxis type="number" tick={{ fill: MUTED, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                                                <YAxis type="category" dataKey="name" tick={{ fill: '#d1d5db', fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
                                                <Tooltip content={<DarkTooltip />} />
                                                <Bar dataKey="value" name="Amount" fill={PAYOUT_COLOR} radius={[0, 4, 4, 0]}>
                                                    {payoutBreakdown.map((_, i) => {
                                                        const colors = [PAYOUT_COLOR, '#fb923c', '#facc15', '#a78bfa'];
                                                        return <Cell key={i} fill={colors[i % colors.length]} />;
                                                    })}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </ChartCard>
                                ) : (
                                    <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '0.75rem', padding: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4b5563', fontSize: '0.875rem' }}>
                                        No payouts recorded this period
                                    </div>
                                )}
                            </div>

                            {/* ── Over/Short Chart ── */}
                            <ChartCard title="⚖️ Cash Over / Short by Day" height={200}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={timeSeries} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                                        <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                                        <Tooltip content={<DarkTooltip />} />
                                        <ReferenceLine y={0} stroke="#374151" strokeDasharray="4 2" />
                                        <Bar dataKey="overShort" name="Over/Short" radius={[3, 3, 0, 0]}>
                                            {timeSeries.map((d, i) => (
                                                <Cell key={i} fill={d.overShort >= 0 ? OVER_COLOR : SHORT_COLOR} fillOpacity={Math.abs(d.overShort) < 1 ? 0.3 : 0.85} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </ChartCard>

                            {/* ── Employee Breakdown Table ── */}
                            {employeeStats.length > 0 && (
                                <div style={{
                                    background: 'linear-gradient(135deg, #111827 0%, #0f1720 100%)',
                                    border: '1px solid #1f2937',
                                    borderRadius: '0.75rem',
                                    overflow: 'hidden',
                                    marginTop: '1rem',
                                }}>
                                    <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #1f2937', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e5e7eb' }}>👤 Employee Performance</div>
                                        <div style={{ fontSize: '0.75rem', color: MUTED }}>{employeeStats.length} staff member{employeeStats.length !== 1 ? 's' : ''}</div>
                                    </div>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid #1f2937' }}>
                                                    {['Staff', 'Shifts', 'Total Revenue', 'Total Tips', 'Avg Revenue/Shift', 'Payouts', 'Over/Short', 'Cash Accuracy'].map(h => (
                                                        <th key={h} style={{ padding: '0.65rem 1rem', textAlign: 'left', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', color: MUTED, letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                                                            {h}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {employeeStats.map((e, i) => {
                                                    const accuracy = e.shifts > 0 ? ((e.shifts - e.shortShifts) / e.shifts) * 100 : 100;
                                                    const isTopEarner = i === 0 && employeeStats.length > 1;
                                                    return (
                                                        <tr key={i} style={{ borderBottom: '1px solid #111827', background: isTopEarner ? 'rgba(34,197,94,0.04)' : 'transparent' }}>
                                                            <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: 'white', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                                                {isTopEarner && <span style={{ marginRight: '0.4rem' }}>🏆</span>}
                                                                {e.name}
                                                            </td>
                                                            <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#d1d5db', textAlign: 'center' }}>{e.shifts}</td>
                                                            <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: CASH_COLOR, fontWeight: 600 }}>{fmtFull(e.revenue)}</td>
                                                            <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: TIP_CASH_COLOR }}>{fmtFull(e.tips)}</td>
                                                            <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#d1d5db' }}>{fmtFull(e.shifts ? e.revenue / e.shifts : 0)}</td>
                                                            <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: PAYOUT_COLOR }}>{fmtFull(e.payouts)}</td>
                                                            <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: e.totalOverShort >= 0 ? OVER_COLOR : SHORT_COLOR, fontWeight: 600 }}>
                                                                {fmtFull(e.totalOverShort)}
                                                            </td>
                                                            <td style={{ padding: '0.75rem 1rem' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                    <div style={{ flex: 1, height: 6, background: '#1f2937', borderRadius: 3, overflow: 'hidden', minWidth: 60 }}>
                                                                        <div style={{ width: `${accuracy}%`, height: '100%', background: accuracy >= 90 ? CASH_COLOR : accuracy >= 70 ? PAYOUT_COLOR : SHORT_COLOR, borderRadius: 3, transition: 'width 0.5s ease' }} />
                                                                    </div>
                                                                    <span style={{ fontSize: '0.75rem', color: accuracy >= 90 ? CASH_COLOR : accuracy >= 70 ? PAYOUT_COLOR : SHORT_COLOR, fontWeight: 600, minWidth: 36 }}>
                                                                        {accuracy.toFixed(0)}%
                                                                    </span>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                            {/* Totals row */}
                                            <tfoot>
                                                <tr style={{ borderTop: '1px solid #374151', background: '#0f1720' }}>
                                                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: '#9ca3af' }}>Totals</td>
                                                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#9ca3af', textAlign: 'center' }}>{kpis.shiftCount}</td>
                                                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', fontWeight: 700, color: CASH_COLOR }}>{fmtFull(kpis.totalRevenue)}</td>
                                                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', fontWeight: 700, color: TIP_CASH_COLOR }}>{fmtFull(kpis.totalTips)}</td>
                                                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#9ca3af' }}>{fmtFull(kpis.shiftCount ? kpis.totalRevenue / kpis.shiftCount : 0)}</td>
                                                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', fontWeight: 700, color: PAYOUT_COLOR }}>{fmtFull(kpis.totalPayouts)}</td>
                                                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', fontWeight: 700, color: kpis.totalOverShort >= 0 ? OVER_COLOR : SHORT_COLOR }}>{fmtFull(kpis.totalOverShort)}</td>
                                                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', fontWeight: 700, color: kpis.accuracy >= 90 ? CASH_COLOR : kpis.accuracy >= 70 ? PAYOUT_COLOR : SHORT_COLOR }}>{kpis.accuracy.toFixed(0)}%</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    );
}
