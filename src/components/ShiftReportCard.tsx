'use client';

import React from 'react';

export interface ShiftClose {
    id: number;
    closed_at: string;
    user_name: string;
    location_name?: string;
    bank_start: number | string;
    bank_end: number | string;
    cash_sales: number | string;
    cash_tips: number | string;
    cc_sales: number | string;
    cc_tips: number | string;
    payouts_json: any;
    cc_tips_cash_payout: boolean;
    bag_amount: number | string;
    over_short: number | string;
    notes?: string;
    custom_data?: any;
}

interface ShiftReportCardProps {
    shift: ShiftClose;
    orgName?: string;
    isPrint?: boolean;
}

const fmt = (v: number | string) => {
    const n = parseFloat(String(v)) || 0;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
};

const n = (v: number | string) => parseFloat(String(v)) || 0;

const parsePayouts = (p: any): { typeId: number; typeName: string; amount: number }[] => {
    if (!p) return [];
    if (typeof p === 'string') {
        try { return JSON.parse(p); } catch { return []; }
    }
    if (Array.isArray(p)) return p;
    return [];
};

export default function ShiftReportCard({ shift, orgName = 'TopShelf', isPrint = false }: ShiftReportCardProps) {
    const payouts = parsePayouts(shift.payouts_json);
    const totalPayouts = payouts.reduce((sum, p) => sum + n(p.amount), 0);
    const ccTipsCashAmount = shift.cc_tips_cash_payout ? n(shift.cc_tips) : 0;
    const overShort = n(shift.over_short);
    const bagAmount = n(shift.bag_amount);
    const totalCash = n(shift.cash_sales) + n(shift.cash_tips);
    const totalCC = n(shift.cc_sales) + n(shift.cc_tips);

    const overShortStatus = overShort > 0.005 ? 'OVER' : overShort < -0.005 ? 'SHORT' : 'BALANCED';
    const overShortColor = overShort >= 0 ? '#10b981' : '#ef4444';
    const bagColor = bagAmount >= 0 ? '#10b981' : '#ef4444';

    const dateStr = new Date(shift.closed_at).toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });

    const cardStyle: React.CSSProperties = {
        background: 'white',
        color: '#111827',
        borderRadius: isPrint ? '0' : '0.75rem',
        border: isPrint ? 'none' : '1px solid #d1d5db',
        padding: '0',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        maxWidth: '800px',
        margin: '0 auto',
        overflow: 'hidden',
        position: 'relative',
    };

    const sectionTitle: React.CSSProperties = {
        fontSize: '0.7rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: '#6b7280',
        borderBottom: '1px solid #e5e7eb',
        paddingBottom: '0.4rem',
        marginBottom: '0.75rem',
        marginTop: '1.25rem',
    };

    const row: React.CSSProperties = {
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '0.875rem',
        padding: '0.2rem 0',
        color: '#374151',
    };

    const rowLabel: React.CSSProperties = { color: '#6b7280' };

    // Template-based rendering helpers
    const templateRunAt = (blocks: any[], values: Record<string, number>, upTo: number): number => {
        let total = 0;
        for (let i = 0; i <= upTo; i++) {
            const b = blocks[i];
            if (!b || b.type === 'result' || b.type === 'divider') continue;
            const v = parseFloat(String(values[b.id] ?? 0)) || 0;
            if (b.operation === 'add') total += v;
            else if (b.operation === 'subtract') total -= v;
        }
        return total;
    };

    const renderTemplateBlocks = (tmpl: { id: string; name: string; blocks: any[]; values: Record<string, number> }) => {
        const vals = tmpl.values || {};
        return tmpl.blocks.map((b: any, i: number) => {
            if (b.type === 'divider') {
                return <div key={b.id} style={{ borderTop: '1px solid #e5e7eb', margin: '0.5rem 0' }} />;
            }
            if (b.type === 'result') {
                const running = templateRunAt(tmpl.blocks, vals, i);
                return (
                    <div key={b.id} style={{ background: '#f9fafb', border: '2px solid #d1d5db', borderRadius: '0.5rem', padding: '0.75rem 1rem', margin: '0.75rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: '1rem', color: '#374151' }}>{b.icon} {b.label}</span>
                        <span style={{ fontWeight: 800, fontSize: '1.15rem', color: running >= 0 ? '#059669' : '#dc2626' }}>{fmt(running)}</span>
                    </div>
                );
            }
            if (b.type === 'payout') {
                return (
                    <div key={b.id}>
                        {payouts.length > 0 ? payouts.map((p, pi) => (
                            <div key={pi} style={row}>
                                <span style={{ ...rowLabel, paddingLeft: '0.5rem' }}>{p.typeName}</span>
                                <span style={{ color: '#ef4444' }}>-{fmt(p.amount)}</span>
                            </div>
                        )) : (
                            <div style={row}><span style={rowLabel}>{b.icon} {b.label}</span><span>$0.00</span></div>
                        )}
                        {payouts.length > 1 && (
                            <div style={{ ...row, borderTop: '1px solid #e5e7eb', paddingTop: '0.3rem', marginTop: '0.1rem', fontWeight: 600 }}>
                                <span style={rowLabel}>Total {b.label}</span>
                                <span style={{ color: '#ef4444' }}>-{fmt(totalPayouts)}</span>
                            </div>
                        )}
                    </div>
                );
            }
            const v = parseFloat(String(vals[b.id] ?? 0)) || 0;
            return (
                <div key={b.id} style={row}>
                    <span style={rowLabel}>{b.icon} {b.label}</span>
                    <span style={{ fontWeight: b.operation !== 'display_only' ? 600 : 400, color: b.operation === 'subtract' ? '#ef4444' : '#374151' }}>
                        {b.operation === 'subtract' ? `-${fmt(v)}` : fmt(v)}
                    </span>
                </div>
            );
        });
    };

    const hasTemplateData = Array.isArray(shift.custom_data?.templates) && shift.custom_data.templates.length > 0;

    return (
        <div style={cardStyle}>
            {/* Header */}
            <div style={{
                background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                padding: '1.5rem 2rem',
                position: 'relative',
            }}>
                {/* Status badge */}
                <div style={{
                    position: 'absolute',
                    top: '1rem',
                    right: '1.5rem',
                    background: overShortStatus === 'OVER' ? 'rgba(16,185,129,0.15)' : overShortStatus === 'SHORT' ? 'rgba(239,68,68,0.15)' : 'rgba(107,114,128,0.2)',
                    border: `2px solid ${overShortStatus === 'OVER' ? '#10b981' : overShortStatus === 'SHORT' ? '#ef4444' : '#9ca3af'}`,
                    color: overShortStatus === 'OVER' ? '#10b981' : overShortStatus === 'SHORT' ? '#ef4444' : '#9ca3af',
                    borderRadius: '0.5rem',
                    padding: '0.25rem 0.75rem',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    letterSpacing: '0.1em',
                }}>
                    {overShortStatus}
                </div>
                <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: '1rem', marginBottom: '0.25rem' }}>
                    {orgName}
                </div>
                <div style={{ color: 'white', fontWeight: 700, fontSize: '1.25rem', marginBottom: '0.5rem' }}>
                    Shift Close Report
                </div>
                <div style={{ color: '#94a3b8', fontSize: '0.8rem', display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                    <span>{dateStr}</span>
                    {shift.user_name && <span>Staff: {shift.user_name}</span>}
                    {shift.location_name && <span>Location: {shift.location_name}</span>}
                </div>
            </div>

            {/* Body — template-based or standard */}
            {hasTemplateData ? (
                <div style={{ padding: '1.5rem 2rem' }}>
                    {shift.custom_data.templates.map((tmpl: any, ti: number) => (
                        <div key={tmpl.id || ti}>
                            {ti > 0 && <div style={{ borderTop: '2px solid #e5e7eb', margin: '1.5rem 0' }} />}
                            {tmpl.name && (
                                <div style={{ ...sectionTitle, marginTop: ti > 0 ? 0 : undefined }}>{tmpl.name}</div>
                            )}
                            {renderTemplateBlocks(tmpl)}
                        </div>
                    ))}
                    {overShort !== 0 && (
                        <div style={{ marginTop: '1.25rem', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 700, color: '#374151' }}>OVER/SHORT</span>
                            <span style={{ fontWeight: 800, color: overShortColor }}>{fmt(overShort)}</span>
                        </div>
                    )}
                </div>
            ) : (
            <div style={{ padding: '1.5rem 2rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                {/* Left Column */}
                <div>
                    {/* Cash Drawer */}
                    <div style={sectionTitle}>Cash Drawer</div>
                    <div style={row}><span style={rowLabel}>Bank Start</span><span>{fmt(shift.bank_start)}</span></div>
                    <div style={row}><span style={rowLabel}>Bank End</span><span>{fmt(shift.bank_end)}</span></div>

                    {/* Register Totals */}
                    <div style={sectionTitle}>Register Totals</div>
                    <div style={row}><span style={rowLabel}>Cash Sales</span><span>{fmt(shift.cash_sales)}</span></div>
                    <div style={row}><span style={rowLabel}>Cash Tips</span><span>{fmt(shift.cash_tips)}</span></div>
                    <div style={row}><span style={rowLabel}>Credit Card Sales</span><span>{fmt(shift.cc_sales)}</span></div>
                    <div style={row}><span style={rowLabel}>CC Tips</span><span>{fmt(shift.cc_tips)}</span></div>

                    {/* Payouts */}
                    {payouts.length > 0 && (
                        <>
                            <div style={sectionTitle}>Payouts</div>
                            {payouts.map((p, i) => (
                                <div key={i} style={row}>
                                    <span style={rowLabel}>{p.typeName}</span>
                                    <span>{fmt(p.amount)}</span>
                                </div>
                            ))}
                            <div style={{ ...row, borderTop: '1px solid #e5e7eb', paddingTop: '0.4rem', marginTop: '0.2rem', fontWeight: 600 }}>
                                <span style={rowLabel}>Total Payouts</span>
                                <span>{fmt(totalPayouts)}</span>
                            </div>
                        </>
                    )}
                </div>

                {/* Right Column */}
                <div>
                    {/* Summary */}
                    <div style={sectionTitle}>Summary</div>
                    <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '1rem' }}>
                        <div style={row}><span style={rowLabel}>Cash In (Sales+Tips)</span><span>{fmt(totalCash)}</span></div>
                        {totalPayouts > 0 && (
                            <div style={row}><span style={rowLabel}>Less Payouts</span><span style={{ color: '#ef4444' }}>-{fmt(totalPayouts)}</span></div>
                        )}
                        {shift.cc_tips_cash_payout && (
                            <div style={row}><span style={rowLabel}>CC Tips Cash Payout</span><span style={{ color: '#ef4444' }}>-{fmt(ccTipsCashAmount)}</span></div>
                        )}

                        <div style={{ borderTop: '2px solid #d1d5db', margin: '0.75rem 0' }} />

                        <div style={{ ...row, fontWeight: 700, fontSize: '1rem' }}>
                            <span>{bagAmount < 0 ? 'NEGATIVE DEPOSIT' : 'BAG AMOUNT'}</span>
                            <span style={{ color: bagColor, fontWeight: 800 }}>{fmt(bagAmount)}</span>
                        </div>
                        {bagAmount < 0 && (
                            <div style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.15rem', paddingLeft: '0.1rem' }}>
                                {fmt(Math.abs(bagAmount))} owed — CC tips payout exceeded cash in drawer
                            </div>
                        )}
                        <div style={{ ...row, fontWeight: 700, fontSize: '1rem', marginTop: '0.5rem' }}>
                            <span>OVER/SHORT</span>
                            <span style={{ color: overShortColor, fontWeight: 800 }}>{fmt(overShort)}</span>
                        </div>
                    </div>

                    {/* Card Totals */}
                    <div style={sectionTitle}>Card Totals</div>
                    <div style={row}><span style={rowLabel}>CC Sales</span><span>{fmt(shift.cc_sales)}</span></div>
                    <div style={row}><span style={rowLabel}>CC Tips</span><span>{fmt(shift.cc_tips)}</span></div>
                    <div style={{ ...row, borderTop: '1px solid #e5e7eb', paddingTop: '0.4rem', marginTop: '0.2rem', fontWeight: 600 }}>
                        <span style={rowLabel}>Total CC</span>
                        <span>{fmt(totalCC)}</span>
                    </div>
                </div>
            </div>
            )}

            {/* Notes */}
            {shift.notes && (
                <div style={{ padding: '0 2rem 1.5rem' }}>
                    <div style={sectionTitle}>Notes</div>
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '0.5rem', padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#92400e', lineHeight: 1.5 }}>
                        {shift.notes}
                    </div>
                </div>
            )}

            {/* Footer */}
            {!isPrint && (
                <div style={{ background: '#f9fafb', borderTop: '1px solid #e5e7eb', padding: '0.75rem 2rem', textAlign: 'center', fontSize: '0.75rem', color: '#9ca3af' }}>
                    TopShelf Inventory &bull; Shift Close Report &bull; ID #{shift.id}
                </div>
            )}
        </div>
    );
}
