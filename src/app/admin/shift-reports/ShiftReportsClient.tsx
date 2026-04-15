'use client';

import React, { useState, useEffect, useCallback } from 'react';
import ShiftReportCard, { ShiftClose } from '@/components/ShiftReportCard';

const SAMPLE_SHIFT: ShiftClose = {
    id: 0,
    closed_at: new Date().toISOString(),
    user_name: 'Alex Johnson',
    location_name: 'Main Bar',
    bank_start: 200,
    bank_end: 847.50,
    cash_sales: 523.00,
    cash_tips: 87.50,
    cc_sales: 1245.00,
    cc_tips: 156.75,
    payouts_json: [
        { typeId: 1, typeName: 'DJ', amount: 150 },
        { typeId: 2, typeName: 'Karaoke', amount: 75 },
    ],
    cc_tips_cash_payout: true,
    bag_amount: 270.00,
    over_short: 2.50,
    notes: 'Busy Friday night. Register 3 was slow all night, possible button issue.',
};

const fmt = (v: number | string) => {
    const num = parseFloat(String(v)) || 0;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
};

const inputStyle: React.CSSProperties = {
    background: '#1f2937',
    color: 'white',
    border: '1px solid #374151',
    borderRadius: '0.375rem',
    padding: '0.5rem 0.75rem',
    fontSize: '0.875rem',
    outline: 'none',
};

export default function ShiftReportsClient() {
    const [shiftCloses, setShiftCloses] = useState<ShiftClose[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [locationId, setLocationId] = useState<number | null>(null);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [offset, setOffset] = useState(0);
    const [selectedShift, setSelectedShift] = useState<ShiftClose | null>(null);
    const [showEmailModal, setShowEmailModal] = useState(false);
    const [emailTarget, setEmailTarget] = useState('');
    const [emailing, setEmailing] = useState(false);
    const [emailSuccess, setEmailSuccess] = useState('');
    const [emailError, setEmailError] = useState('');
    const [locations, setLocations] = useState<{ id: number; name: string }[]>([]);
    const [sampleMode, setSampleMode] = useState(false);

    const LIMIT = 20;

    const fetchReports = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (search) params.set('search', search);
            if (locationId) params.set('locationId', String(locationId));
            if (dateFrom) params.set('from', dateFrom);
            if (dateTo) params.set('to', dateTo);
            params.set('limit', String(LIMIT));
            params.set('offset', String(offset));
            const res = await fetch(`/api/shift/reports?${params}`);
            const data = await res.json();
            setShiftCloses(data.shiftCloses || []);
            setTotal(data.total || 0);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [search, locationId, dateFrom, dateTo, offset]);

    useEffect(() => {
        fetch('/api/user/locations')
            .then(r => r.json())
            .then(data => setLocations(data.locations || []));
    }, []);

    useEffect(() => {
        if (!sampleMode) fetchReports();
    }, [fetchReports, sampleMode]);

    const handleSearch = () => {
        setOffset(0);
        fetchReports();
    };

    const handleSendEmail = async (shift: ShiftClose) => {
        if (!emailTarget.trim()) {
            setEmailError('Enter at least one email address.');
            return;
        }
        setEmailing(true);
        setEmailError('');
        setEmailSuccess('');
        try {
            const emails = emailTarget.split(',').map(e => e.trim()).filter(Boolean);
            const res = await fetch(`/api/shift/reports/${shift.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emails }),
            });
            const data = await res.json();
            if (res.ok) {
                setEmailSuccess(`Sent to ${data.sentTo?.join(', ')}`);
                setTimeout(() => {
                    setShowEmailModal(false);
                    setEmailSuccess('');
                    setEmailTarget('');
                }, 2000);
            } else {
                setEmailError(data.error || 'Failed to send');
            }
        } catch {
            setEmailError('Network error');
        } finally {
            setEmailing(false);
        }
    };

    const overShortColor = (v: number | string) => {
        const n = parseFloat(String(v)) || 0;
        return n >= 0 ? '#10b981' : '#ef4444';
    };

    const dateStr = (iso: string) =>
        new Date(iso).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });

    const displayShifts = sampleMode ? [SAMPLE_SHIFT] : shiftCloses;
    const displaySelected = sampleMode ? SAMPLE_SHIFT : selectedShift;

    const totalPages = Math.ceil(total / LIMIT);
    const currentPage = Math.floor(offset / LIMIT) + 1;

    return (
        <>
            {/* Print CSS */}
            <style>{`
                @media print {
                    body * { visibility: hidden !important; }
                    #shift-print-area, #shift-print-area * { visibility: visible !important; }
                    #shift-print-area { position: fixed; left: 0; top: 0; width: 100%; z-index: 99999; }
                }
            `}</style>

            <div style={{ color: 'white', minHeight: '100vh' }}>
                {/* Page Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Shift Close Reports</h1>
                        <p style={{ margin: '0.25rem 0 0', color: '#9ca3af', fontSize: '0.875rem' }}>View, search, print, and email shift close reports</p>
                    </div>
                    <button
                        onClick={() => { setSampleMode(!sampleMode); setSelectedShift(null); }}
                        style={{
                            padding: '0.5rem 1rem',
                            border: '1px solid #3b82f6',
                            borderRadius: '0.375rem',
                            background: sampleMode ? '#3b82f6' : 'transparent',
                            color: sampleMode ? 'white' : '#3b82f6',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                        }}
                    >
                        {sampleMode ? 'Exit Preview' : 'Preview Sample'}
                    </button>
                </div>

                {/* Search + Filter Bar */}
                <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
                    <div style={{ flex: '1 1 200px' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.25rem' }}>Search</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type="text"
                                placeholder="Staff name, date..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                                style={{ ...inputStyle, width: '100%', paddingLeft: '2rem', boxSizing: 'border-box' }}
                            />
                            <span style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', color: '#6b7280', fontSize: '1rem' }}>🔍</span>
                        </div>
                    </div>

                    {locations.length > 1 && (
                        <div style={{ flex: '0 1 180px' }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.25rem' }}>Location</label>
                            <select
                                value={locationId || ''}
                                onChange={e => setLocationId(e.target.value ? parseInt(e.target.value) : null)}
                                style={{ ...inputStyle, width: '100%' }}
                            >
                                <option value="">All Locations</option>
                                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                        </div>
                    )}

                    <div style={{ flex: '0 1 150px' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.25rem' }}>From</label>
                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ ...inputStyle, width: '100%', colorScheme: 'dark' }} />
                    </div>

                    <div style={{ flex: '0 1 150px' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.25rem' }}>To</label>
                        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ ...inputStyle, width: '100%', colorScheme: 'dark' }} />
                    </div>

                    <button
                        onClick={handleSearch}
                        style={{ padding: '0.5rem 1.25rem', background: '#d97706', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', alignSelf: 'flex-end' }}
                    >
                        Search
                    </button>

                    {(search || locationId || dateFrom || dateTo) && (
                        <button
                            onClick={() => { setSearch(''); setLocationId(null); setDateFrom(''); setDateTo(''); setOffset(0); }}
                            style={{ padding: '0.5rem 0.75rem', background: '#374151', color: '#9ca3af', border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem', alignSelf: 'flex-end' }}
                        >
                            Clear
                        </button>
                    )}
                </div>

                {/* Main Content: Table + Preview Side by Side */}
                <div style={{ display: 'grid', gridTemplateColumns: displaySelected ? '1fr 1.1fr' : '1fr', gap: '1.5rem', alignItems: 'start' }}>
                    {/* Table */}
                    <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: '0.5rem', overflow: 'hidden' }}>
                        {loading && !sampleMode ? (
                            <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>
                        ) : displayShifts.length === 0 ? (
                            <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>
                                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
                                <div>No shift reports found</div>
                                {(search || locationId || dateFrom || dateTo) && (
                                    <div style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>Try adjusting your filters</div>
                                )}
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #374151' }}>
                                        {['Date/Time', 'Staff', ...(locations.length > 1 ? ['Location'] : []), 'Bag Amount', 'Over/Short', 'Actions'].map(h => (
                                            <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: '#9ca3af', letterSpacing: '0.05em' }}>
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {displayShifts.map((s, i) => (
                                        <tr
                                            key={s.id || i}
                                            style={{
                                                borderBottom: '1px solid #1f2937',
                                                background: selectedShift?.id === s.id ? 'rgba(217,119,6,0.08)' : 'transparent',
                                                cursor: 'pointer',
                                            }}
                                            onClick={() => setSelectedShift(selectedShift?.id === s.id ? null : s)}
                                        >
                                            <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#e5e7eb', whiteSpace: 'nowrap' }}>
                                                {dateStr(s.closed_at)}
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#e5e7eb' }}>
                                                {s.user_name || '—'}
                                            </td>
                                            {locations.length > 1 && (
                                                <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#9ca3af' }}>
                                                    {s.location_name || '—'}
                                                </td>
                                            )}
                                            <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', fontWeight: 600, color: overShortColor(s.bag_amount) }}>
                                                {fmt(s.bag_amount)}
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', fontWeight: 600, color: overShortColor(s.over_short) }}>
                                                {fmt(s.over_short)}
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem' }} onClick={e => e.stopPropagation()}>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button
                                                        onClick={() => setSelectedShift(selectedShift?.id === s.id ? null : s)}
                                                        style={{ padding: '0.3rem 0.6rem', background: '#374151', color: '#e5e7eb', border: 'none', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.75rem' }}
                                                    >
                                                        View
                                                    </button>
                                                    <button
                                                        onClick={() => { setSelectedShift(s); setShowEmailModal(true); setEmailTarget(''); setEmailError(''); setEmailSuccess(''); }}
                                                        style={{ padding: '0.3rem 0.6rem', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.75rem' }}
                                                    >
                                                        Email
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}

                        {/* Pagination */}
                        {!sampleMode && total > LIMIT && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderTop: '1px solid #374151' }}>
                                <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                                    Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
                                </span>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button
                                        onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                                        disabled={offset === 0}
                                        style={{ padding: '0.35rem 0.75rem', background: offset === 0 ? '#1f2937' : '#374151', color: offset === 0 ? '#4b5563' : 'white', border: 'none', borderRadius: '0.25rem', cursor: offset === 0 ? 'not-allowed' : 'pointer', fontSize: '0.8rem' }}
                                    >
                                        Previous
                                    </button>
                                    <span style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem', color: '#9ca3af' }}>
                                        {currentPage} / {totalPages}
                                    </span>
                                    <button
                                        onClick={() => setOffset(offset + LIMIT)}
                                        disabled={offset + LIMIT >= total}
                                        style={{ padding: '0.35rem 0.75rem', background: offset + LIMIT >= total ? '#1f2937' : '#374151', color: offset + LIMIT >= total ? '#4b5563' : 'white', border: 'none', borderRadius: '0.25rem', cursor: offset + LIMIT >= total ? 'not-allowed' : 'pointer', fontSize: '0.8rem' }}
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Print Preview Panel */}
                    {displaySelected && (
                        <div style={{ position: 'sticky', top: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.875rem', color: '#9ca3af', fontWeight: 600 }}>Report Preview</span>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button
                                        onClick={() => window.print()}
                                        style={{ padding: '0.4rem 0.9rem', background: '#374151', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                                    >
                                        🖨 Print
                                    </button>
                                    <button
                                        onClick={() => { setShowEmailModal(true); setEmailTarget(''); setEmailError(''); setEmailSuccess(''); }}
                                        style={{ padding: '0.4rem 0.9rem', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                                    >
                                        ✉ Email
                                    </button>
                                    <button
                                        onClick={() => setSelectedShift(null)}
                                        style={{ padding: '0.4rem 0.6rem', background: '#1f2937', color: '#9ca3af', border: '1px solid #374151', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.8rem' }}
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>

                            <div id="shift-print-area" style={{ borderRadius: '0.5rem', overflow: 'hidden' }}>
                                <ShiftReportCard shift={displaySelected} isPrint={false} />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Email Modal */}
            {showEmailModal && displaySelected && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
                }}>
                    <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: '0.75rem', padding: '1.5rem', width: '100%', maxWidth: '480px' }}>
                        <h3 style={{ margin: '0 0 1rem', color: 'white', fontSize: '1.1rem' }}>Email Shift Report</h3>
                        <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: '0 0 1rem' }}>
                            Sending report for <strong style={{ color: '#e5e7eb' }}>{displaySelected.user_name}</strong> on{' '}
                            <strong style={{ color: '#e5e7eb' }}>{new Date(displaySelected.closed_at).toLocaleDateString()}</strong>
                        </p>
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: '#9ca3af', marginBottom: '0.375rem' }}>
                                Recipients (comma-separated)
                            </label>
                            <input
                                type="text"
                                placeholder="manager@bar.com, owner@bar.com"
                                value={emailTarget}
                                onChange={e => setEmailTarget(e.target.value)}
                                style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
                                autoFocus
                            />
                            <p style={{ color: '#6b7280', fontSize: '0.75rem', margin: '0.375rem 0 0' }}>
                                Leave blank to use the configured shift report recipients.
                            </p>
                        </div>

                        {emailError && <div style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{emailError}</div>}
                        {emailSuccess && <div style={{ color: '#10b981', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{emailSuccess}</div>}

                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => { setShowEmailModal(false); setEmailError(''); setEmailSuccess(''); }}
                                style={{ padding: '0.5rem 1rem', background: '#374151', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleSendEmail(displaySelected)}
                                disabled={emailing}
                                style={{ padding: '0.5rem 1.25rem', background: emailing ? '#374151' : '#1d4ed8', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: emailing ? 'not-allowed' : 'pointer', fontSize: '0.875rem', fontWeight: 600 }}
                            >
                                {emailing ? 'Sending...' : 'Send Email'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
