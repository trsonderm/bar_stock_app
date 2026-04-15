'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';

interface PayoutType {
    id: number;
    name: string;
}

interface PayoutRow {
    typeId: number;
    typeName: string;
    amount: string;
}

interface FormState {
    bankStart: string;
    bankEnd: string;
    cashSales: string;
    cashTips: string;
    ccSales: string;
    ccTips: string;
    notes: string;
    ccTipsCashPayout: boolean;
}

interface UserProp {
    firstName?: string;
    role?: string;
    permissions?: string[];
    organizationId?: number;
}

interface CloseShiftClientProps {
    user: UserProp;
}

const inputStyle: React.CSSProperties = {
    background: '#1f2937',
    color: 'white',
    border: '1px solid #374151',
    borderRadius: '0.375rem',
    padding: '0.6rem 0.75rem',
    fontSize: '1rem',
    width: '100%',
    outline: 'none',
    boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
    display: 'block',
    color: '#9ca3af',
    fontSize: '0.8rem',
    marginBottom: '0.25rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
};

const cardStyle: React.CSSProperties = {
    background: '#111827',
    border: '1px solid #1f2937',
    borderRadius: '0.75rem',
    padding: '1.25rem',
    marginBottom: '1.25rem',
};

const sectionTitleStyle: React.CSSProperties = {
    color: '#f9fafb',
    fontWeight: 700,
    fontSize: '1rem',
    marginBottom: '1rem',
    paddingBottom: '0.5rem',
    borderBottom: '1px solid #1f2937',
};

function CurrencyInput({
    label,
    value,
    onChange,
    placeholder = '0.00',
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
}) {
    return (
        <div>
            <label style={labelStyle}>{label}</label>
            <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: '#6b7280', pointerEvents: 'none' }}>$</span>
                <input
                    type="text"
                    inputMode="decimal"
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder={placeholder}
                    style={{ ...inputStyle, paddingLeft: '1.5rem' }}
                />
            </div>
        </div>
    );
}

function LiveClock() {
    const [time, setTime] = useState('');
    useEffect(() => {
        const update = () => setTime(new Date().toLocaleString());
        update();
        const t = setInterval(update, 1000);
        return () => clearInterval(t);
    }, []);
    return <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>{time}</span>;
}

function loadTesseract(): Promise<any> {
    if (typeof window !== 'undefined' && (window as any).Tesseract) {
        return Promise.resolve((window as any).Tesseract);
    }
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        script.onload = () => resolve((window as any).Tesseract);
        script.onerror = () => reject(new Error('Failed to load Tesseract.js'));
        document.head.appendChild(script);
    });
}

// OCR Modal Component
function OcrModal({
    open,
    receiptType,
    onClose,
    onFieldsExtracted,
}: {
    open: boolean;
    receiptType: 'register' | 'cc';
    onClose: () => void;
    onFieldsExtracted: (fields: Record<string, number | undefined>) => void;
}) {
    const [tab, setTab] = useState<'camera' | 'upload' | 'paste'>('camera');
    const [cameraActive, setCameraActive] = useState(false);
    const [capturedImage, setCapturedImage] = useState<string | null>(null);
    const [uploadPreview, setUploadPreview] = useState<string | null>(null);
    const [pasteText, setPasteText] = useState('');
    const [processing, setProcessing] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');
    const [extractedFields, setExtractedFields] = useState<Record<string, any> | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const stopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        setCameraActive(false);
    }, []);

    useEffect(() => {
        if (!open) {
            stopCamera();
            setCapturedImage(null);
            setUploadPreview(null);
            setPasteText('');
            setStatusMsg('');
            setExtractedFields(null);
            setTab('camera');
        }
    }, [open, stopCamera]);

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
            setCameraActive(true);
            setCapturedImage(null);
        } catch {
            setStatusMsg('Camera access denied or unavailable.');
        }
    };

    const captureFrame = () => {
        if (!videoRef.current || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        ctx.drawImage(videoRef.current, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setCapturedImage(dataUrl);
        stopCamera();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => setUploadPreview(ev.target?.result as string);
        reader.readAsDataURL(file);
        setCapturedImage(null);
    };

    const processImageOcr = async (imageData: string) => {
        setProcessing(true);
        setStatusMsg('Loading OCR engine...');
        try {
            const Tesseract = await loadTesseract();
            setStatusMsg('Recognizing text...');
            const result = await Tesseract.recognize(imageData, 'eng', { logger: () => {} });
            const text: string = result.data.text;
            setStatusMsg('Parsing receipt...');
            await parseAndApply(text);
        } catch (err: any) {
            setStatusMsg('OCR failed: ' + (err?.message || 'Unknown error'));
        } finally {
            setProcessing(false);
        }
    };

    const parseAndApply = async (text: string) => {
        try {
            const res = await fetch('/api/shift/ocr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, receiptType }),
            });
            const data = await res.json();
            setExtractedFields(data);

            const populated: string[] = [];
            if (receiptType === 'register') {
                if (data.cashSales !== undefined) populated.push(`Cash Sales: $${data.cashSales.toFixed(2)}`);
                if (data.cashTips !== undefined) populated.push(`Cash Tips: $${data.cashTips.toFixed(2)}`);
                if (data.ccSales !== undefined) populated.push(`CC Sales: $${data.ccSales.toFixed(2)}`);
                if (data.ccTips !== undefined) populated.push(`CC Tips: $${data.ccTips.toFixed(2)}`);
            } else {
                if (data.ccSales !== undefined) populated.push(`CC Sales: $${data.ccSales.toFixed(2)}`);
                if (data.ccTips !== undefined) populated.push(`CC Tips: $${data.ccTips.toFixed(2)}`);
                if (data.batchCount !== undefined) populated.push(`Batch Count: ${data.batchCount}`);
            }

            if (populated.length > 0) {
                setStatusMsg('Extracted: ' + populated.join(', '));
            } else {
                setStatusMsg('No fields detected. Check raw lines below and try Paste Text tab.');
            }

            onFieldsExtracted(data);
        } catch {
            setStatusMsg('Failed to parse receipt data.');
        }
    };

    if (!open) return null;

    const tabBtn = (t: typeof tab, label: string) => (
        <button
            onClick={() => { setTab(t); setCapturedImage(null); stopCamera(); }}
            style={{
                padding: '0.5rem 1.25rem',
                background: tab === t ? '#3b82f6' : '#1f2937',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontWeight: tab === t ? 700 : 400,
            }}
        >
            {label}
        </button>
    );

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
        }}>
            <div style={{
                background: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '1rem',
                width: '100%',
                maxWidth: '540px',
                maxHeight: '90vh',
                overflowY: 'auto',
                padding: '1.5rem',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h2 style={{ color: 'white', margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>
                        Scan {receiptType === 'register' ? 'Register' : 'CC Batch'} Receipt
                    </h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.5rem', lineHeight: 1 }}>×</button>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
                    {tabBtn('camera', '📷 Camera')}
                    {tabBtn('upload', '📁 Upload')}
                    {tabBtn('paste', '📋 Paste Text')}
                </div>

                {/* Camera Tab */}
                {tab === 'camera' && (
                    <div>
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            style={{
                                width: '100%',
                                borderRadius: '0.5rem',
                                background: '#000',
                                display: cameraActive && !capturedImage ? 'block' : 'none',
                                maxHeight: '280px',
                                objectFit: 'cover',
                            }}
                        />
                        <canvas ref={canvasRef} style={{ display: 'none' }} />

                        {capturedImage && (
                            <img src={capturedImage} alt="Captured" style={{ width: '100%', borderRadius: '0.5rem', marginBottom: '0.75rem' }} />
                        )}

                        {!cameraActive && !capturedImage && (
                            <div style={{
                                background: '#1f2937',
                                borderRadius: '0.5rem',
                                height: '200px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#6b7280',
                                marginBottom: '0.75rem',
                            }}>
                                Camera off
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                            {!cameraActive && !capturedImage && (
                                <button
                                    onClick={startCamera}
                                    style={{ padding: '0.6rem 1rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer' }}
                                >
                                    Start Camera
                                </button>
                            )}
                            {cameraActive && (
                                <>
                                    <button onClick={captureFrame} style={{ padding: '0.6rem 1rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer' }}>
                                        Capture
                                    </button>
                                    <button onClick={stopCamera} style={{ padding: '0.6rem 1rem', background: '#6b7280', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer' }}>
                                        Cancel
                                    </button>
                                </>
                            )}
                            {capturedImage && !processing && (
                                <>
                                    <button
                                        onClick={() => processImageOcr(capturedImage)}
                                        style={{ padding: '0.6rem 1rem', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer' }}
                                    >
                                        Process Receipt
                                    </button>
                                    <button onClick={() => { setCapturedImage(null); }} style={{ padding: '0.6rem 1rem', background: '#374151', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer' }}>
                                        Retake
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* Upload Tab */}
                {tab === 'upload' && (
                    <div>
                        <label style={{ ...labelStyle, marginBottom: '0.5rem' }}>Select or capture image</label>
                        <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handleFileChange}
                            style={{ color: '#d1d5db', marginBottom: '0.75rem', display: 'block' }}
                        />
                        {uploadPreview && (
                            <>
                                <img src={uploadPreview} alt="Preview" style={{ width: '100%', borderRadius: '0.5rem', marginBottom: '0.75rem' }} />
                                {!processing && (
                                    <button
                                        onClick={() => processImageOcr(uploadPreview)}
                                        style={{ padding: '0.6rem 1rem', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer' }}
                                    >
                                        Process Receipt
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* Paste Text Tab */}
                {tab === 'paste' && (
                    <div>
                        <label style={labelStyle}>Paste receipt text</label>
                        <textarea
                            value={pasteText}
                            onChange={e => setPasteText(e.target.value)}
                            placeholder="Paste receipt text here..."
                            rows={10}
                            style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '0.8rem', resize: 'vertical' }}
                        />
                        <button
                            onClick={() => parseAndApply(pasteText)}
                            disabled={!pasteText.trim() || processing}
                            style={{
                                marginTop: '0.75rem',
                                padding: '0.6rem 1rem',
                                background: pasteText.trim() ? '#8b5cf6' : '#374151',
                                color: 'white',
                                border: 'none',
                                borderRadius: '0.375rem',
                                cursor: pasteText.trim() ? 'pointer' : 'not-allowed',
                            }}
                        >
                            Parse Text
                        </button>
                    </div>
                )}

                {/* Status */}
                {processing && (
                    <div style={{ marginTop: '1rem', color: '#60a5fa', fontSize: '0.9rem' }}>
                        ⏳ {statusMsg || 'Processing...'}
                    </div>
                )}
                {!processing && statusMsg && (
                    <div style={{ marginTop: '1rem', color: '#10b981', fontSize: '0.875rem', background: '#052e16', borderRadius: '0.375rem', padding: '0.5rem 0.75rem' }}>
                        {statusMsg}
                    </div>
                )}

                {/* Raw lines debug */}
                {extractedFields?.rawLines && extractedFields.rawLines.length > 0 && (
                    <details style={{ marginTop: '1rem' }}>
                        <summary style={{ color: '#6b7280', cursor: 'pointer', fontSize: '0.8rem' }}>Raw OCR lines ({extractedFields.rawLines.length})</summary>
                        <pre style={{ color: '#9ca3af', fontSize: '0.7rem', maxHeight: '150px', overflow: 'auto', background: '#1f2937', padding: '0.5rem', borderRadius: '0.25rem', marginTop: '0.5rem' }}>
                            {extractedFields.rawLines.join('\n')}
                        </pre>
                    </details>
                )}

                <div style={{ marginTop: '1.25rem', textAlign: 'right' }}>
                    <button
                        onClick={onClose}
                        style={{ padding: '0.6rem 1.5rem', background: '#374151', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer' }}
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function CloseShiftClient({ user }: CloseShiftClientProps) {
    const [payoutTypes, setPayoutTypes] = useState<PayoutType[]>([]);
    const [form, setForm] = useState<FormState>({
        bankStart: '',
        bankEnd: '',
        cashSales: '',
        cashTips: '',
        ccSales: '',
        ccTips: '',
        notes: '',
        ccTipsCashPayout: false,
    });
    const [payouts, setPayouts] = useState<PayoutRow[]>([{ typeId: 0, typeName: '', amount: '' }]);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [submitResult, setSubmitResult] = useState<any>(null);
    const [ocrModalOpen, setOcrModalOpen] = useState(false);
    const [ocrType, setOcrType] = useState<'register' | 'cc'>('register');
    const [receiptMode, setReceiptMode] = useState<'combined' | 'separate'>('combined');
    const [locationId, setLocationId] = useState<number | null>(null);
    const [locations, setLocations] = useState<any[]>([]);

    const videoRef = useRef<HTMLVideoElement>(null);

    // Load payout types, settings, locations
    useEffect(() => {
        fetch('/api/admin/payout-types')
            .then(r => r.json())
            .then(d => {
                if (d.payoutTypes) setPayoutTypes(d.payoutTypes);
            })
            .catch(() => {});

        fetch('/api/admin/settings')
            .then(r => r.json())
            .then(d => {
                const rm = d.settings?.receipt_mode;
                if (rm === 'separate') setReceiptMode('separate');
            })
            .catch(() => {});

        fetch('/api/admin/locations')
            .then(r => r.json())
            .then(d => {
                const locs = d.locations || [];
                setLocations(locs);
                // Try cookie
                const cookieMatch = document.cookie.match(/current_location_id=(\d+)/);
                if (cookieMatch) {
                    setLocationId(parseInt(cookieMatch[1]));
                } else if (locs.length > 0) {
                    setLocationId(locs[0].id);
                }
            })
            .catch(() => {});
    }, []);

    const n = (s: string | number) => parseFloat(String(s)) || 0;

    const computed = useMemo(() => {
        const totalPayouts = payouts.reduce((sum, p) => sum + n(p.amount), 0);
        const ccTipsCashAmount = form.ccTipsCashPayout ? n(form.ccTips) : 0;
        const expectedCashInDrawer = n(form.bankStart) + n(form.cashSales) + n(form.cashTips) - totalPayouts - ccTipsCashAmount;
        const bagAmount = n(form.bankEnd) - n(form.bankStart) - totalPayouts - ccTipsCashAmount;
        const overShort = n(form.bankEnd) - expectedCashInDrawer;
        const totalCashIn = n(form.cashSales) + n(form.cashTips);
        const totalCCRevenue = n(form.ccSales) + n(form.ccTips);
        return { totalPayouts, ccTipsCashAmount, bagAmount, overShort, totalCashIn, totalCCRevenue };
    }, [form, payouts]);

    const setField = (key: keyof FormState, value: string | boolean) => {
        setForm(prev => ({ ...prev, [key]: value }));
    };

    const updatePayout = (idx: number, key: keyof PayoutRow, value: string | number) => {
        setPayouts(prev => {
            const next = [...prev];
            next[idx] = { ...next[idx], [key]: value };
            return next;
        });
    };

    const addPayout = () => {
        setPayouts(prev => [...prev, { typeId: 0, typeName: '', amount: '' }]);
    };

    const removePayout = (idx: number) => {
        setPayouts(prev => prev.filter((_, i) => i !== idx));
    };

    const handleOcrFields = (fields: Record<string, number | undefined>) => {
        if (ocrType === 'register') {
            setForm(prev => ({
                ...prev,
                ...(fields.cashSales !== undefined ? { cashSales: fields.cashSales.toFixed(2) } : {}),
                ...(fields.cashTips !== undefined ? { cashTips: fields.cashTips.toFixed(2) } : {}),
                ...(fields.ccSales !== undefined ? { ccSales: fields.ccSales.toFixed(2) } : {}),
                ...(fields.ccTips !== undefined ? { ccTips: fields.ccTips.toFixed(2) } : {}),
            }));
        } else {
            setForm(prev => ({
                ...prev,
                ...(fields.ccSales !== undefined ? { ccSales: fields.ccSales.toFixed(2) } : {}),
                ...(fields.ccTips !== undefined ? { ccTips: fields.ccTips.toFixed(2) } : {}),
            }));
        }
    };

    const handleSubmit = async () => {
        if (!form.bankEnd) return;
        setSubmitting(true);
        try {
            const res = await fetch('/api/shift/close', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    locationId: locationId || undefined,
                    bankStart: n(form.bankStart),
                    bankEnd: n(form.bankEnd),
                    cashSales: n(form.cashSales),
                    cashTips: n(form.cashTips),
                    ccSales: n(form.ccSales),
                    ccTips: n(form.ccTips),
                    payouts: payouts
                        .filter(p => p.amount && n(p.amount) > 0)
                        .map(p => ({ typeId: p.typeId, typeName: p.typeName, amount: n(p.amount) })),
                    ccTipsCashPayout: form.ccTipsCashPayout,
                    notes: form.notes || undefined,
                }),
            });
            const data = await res.json();
            if (res.ok) {
                // Stop any active camera stream
                if (videoRef.current?.srcObject) {
                    (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
                }
                setSubmitResult(data);
                setSubmitted(true);
            } else {
                alert(data.error || 'Failed to submit shift close.');
            }
        } catch {
            alert('Network error. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const fmt = (v: number) => `$${v.toFixed(2)}`;
    const colorNum = (v: number) => v >= 0 ? '#10b981' : '#ef4444';

    if (submitted && submitResult) {
        return (
            <div style={{ minHeight: '100vh', background: '#0a0f1a', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
                <div style={{ maxWidth: '560px', margin: '0 auto' }}>
                    <div style={{
                        background: '#052e16',
                        border: '1px solid #10b981',
                        borderRadius: '1rem',
                        padding: '2rem',
                        textAlign: 'center',
                        marginBottom: '1.5rem',
                    }}>
                        <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>✅</div>
                        <h1 style={{ color: '#10b981', fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>Shift Closed!</h1>
                        <p style={{ color: '#6ee7b7', margin: 0 }}>Your shift has been recorded successfully.</p>
                    </div>

                    <div style={{ ...cardStyle, marginBottom: '1rem' }}>
                        <div style={sectionTitleStyle}>Summary</div>
                        {[
                            ['Bank Start', fmt(n(form.bankStart))],
                            ['Bank End', fmt(n(form.bankEnd))],
                            ['Cash Sales', fmt(n(form.cashSales))],
                            ['Cash Tips', fmt(n(form.cashTips))],
                            ['CC Sales', fmt(n(form.ccSales))],
                            ['CC Tips', fmt(n(form.ccTips))],
                            ['Total Payouts', fmt(computed.totalPayouts)],
                        ].map(([label, val]) => (
                            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid #1f2937', color: '#d1d5db', fontSize: '0.9rem' }}>
                                <span style={{ color: '#9ca3af' }}>{label}</span>
                                <span>{val}</span>
                            </div>
                        ))}
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', marginTop: '0.25rem' }}>
                            <span style={{ color: '#9ca3af', fontWeight: 600 }}>Bag Amount</span>
                            <span style={{ color: colorNum(computed.bagAmount), fontWeight: 700, fontSize: '1.1rem' }}>{fmt(computed.bagAmount)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                            <span style={{ color: '#9ca3af', fontWeight: 600 }}>Over / Short</span>
                            <span style={{ color: colorNum(computed.overShort), fontWeight: 700 }}>{fmt(computed.overShort)}</span>
                        </div>
                    </div>

                    <Link href="/inventory" style={{ display: 'block', textAlign: 'center', padding: '0.75rem', background: '#1d4ed8', color: 'white', borderRadius: '0.5rem', textDecoration: 'none', fontWeight: 600 }}>
                        Back to Inventory
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', background: '#0a0f1a', fontFamily: 'system-ui, sans-serif' }}>
            {/* Header */}
            <div style={{
                background: '#111827',
                borderBottom: '1px solid #1f2937',
                padding: '0.875rem 1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                position: 'sticky',
                top: 0,
                zIndex: 100,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Link href="/inventory" style={{ color: '#6b7280', textDecoration: 'none', fontSize: '0.9rem' }}>
                        ← Back
                    </Link>
                    <h1 style={{ color: 'white', margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>Close Shift</h1>
                </div>
                <LiveClock />
            </div>

            <div style={{ maxWidth: '760px', margin: '0 auto', padding: '1.25rem 1rem 8rem' }}>

                {/* Location selector */}
                {locations.length > 1 && (
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={labelStyle}>Location</label>
                        <select
                            value={locationId || ''}
                            onChange={e => setLocationId(e.target.value ? parseInt(e.target.value) : null)}
                            style={{ ...inputStyle, width: 'auto', minWidth: '200px' }}
                        >
                            <option value="">— All Locations —</option>
                            {locations.map(l => (
                                <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Section 1: Cash Drawer */}
                <div style={cardStyle}>
                    <div style={sectionTitleStyle}>💵 Cash Drawer</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                        <CurrencyInput
                            label="Bank Start (Opening Float)"
                            value={form.bankStart}
                            onChange={v => setField('bankStart', v)}
                        />
                        <CurrencyInput
                            label="Bank End (Closing Count)"
                            value={form.bankEnd}
                            onChange={v => setField('bankEnd', v)}
                        />
                    </div>

                    {form.bankEnd && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div style={{
                                background: '#0f172a',
                                borderRadius: '0.5rem',
                                padding: '0.75rem 1rem',
                                border: `1px solid ${colorNum(computed.bagAmount)}44`,
                            }}>
                                <div style={{ color: '#9ca3af', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bag Amount</div>
                                <div style={{ color: colorNum(computed.bagAmount), fontSize: '1.5rem', fontWeight: 700 }}>{fmt(computed.bagAmount)}</div>
                                <div style={{ color: '#6b7280', fontSize: '0.75rem' }}>Amount going to safe</div>
                            </div>
                            <div style={{
                                background: '#0f172a',
                                borderRadius: '0.5rem',
                                padding: '0.75rem 1rem',
                                border: `1px solid ${colorNum(computed.overShort)}44`,
                            }}>
                                <div style={{ color: '#9ca3af', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Over / Short</div>
                                <div style={{ color: colorNum(computed.overShort), fontSize: '1.5rem', fontWeight: 700 }}>{fmt(computed.overShort)}</div>
                                <div style={{ color: '#6b7280', fontSize: '0.75rem' }}>{computed.overShort >= 0 ? 'You are over' : 'You are short'}</div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Section 2: Register Totals */}
                <div style={cardStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid #1f2937' }}>
                        <span style={{ color: '#f9fafb', fontWeight: 700, fontSize: '1rem' }}>🧾 Register Totals</span>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                onClick={() => { setOcrType('register'); setOcrModalOpen(true); }}
                                style={{ padding: '0.4rem 0.75rem', background: '#374151', color: '#d1d5db', border: '1px solid #4b5563', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.8rem' }}
                            >
                                📷 Scan Register Receipt
                            </button>
                            {receiptMode === 'separate' && (
                                <button
                                    onClick={() => { setOcrType('cc'); setOcrModalOpen(true); }}
                                    style={{ padding: '0.4rem 0.75rem', background: '#374151', color: '#d1d5db', border: '1px solid #4b5563', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.8rem' }}
                                >
                                    📷 Scan CC Batch
                                </button>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <CurrencyInput label="Cash Sales" value={form.cashSales} onChange={v => setField('cashSales', v)} />
                        <CurrencyInput label="Cash Tips" value={form.cashTips} onChange={v => setField('cashTips', v)} />
                        <CurrencyInput label="Credit Card Sales" value={form.ccSales} onChange={v => setField('ccSales', v)} />
                        <CurrencyInput label="CC Tips" value={form.ccTips} onChange={v => setField('ccTips', v)} />
                    </div>
                </div>

                {/* Section 3: Payouts */}
                <div style={cardStyle}>
                    <div style={sectionTitleStyle}>💸 Shift Payouts</div>
                    <p style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: '-0.5rem', marginBottom: '1rem' }}>
                        Cash paid out from drawer during the shift
                    </p>

                    {payouts.map((payout, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '0.75rem' }}>
                            <div style={{ flex: 2 }}>
                                {idx === 0 && <label style={labelStyle}>Type</label>}
                                <select
                                    value={payout.typeId}
                                    onChange={e => {
                                        const id = parseInt(e.target.value);
                                        const pt = payoutTypes.find(p => p.id === id);
                                        updatePayout(idx, 'typeId', id);
                                        updatePayout(idx, 'typeName', pt?.name || '');
                                    }}
                                    style={inputStyle}
                                >
                                    <option value={0}>— Select Type —</option>
                                    {payoutTypes.map(pt => (
                                        <option key={pt.id} value={pt.id}>{pt.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ flex: 1 }}>
                                {idx === 0 && <label style={labelStyle}>Amount</label>}
                                <div style={{ position: 'relative' }}>
                                    <span style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: '#6b7280', pointerEvents: 'none' }}>$</span>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={payout.amount}
                                        onChange={e => updatePayout(idx, 'amount', e.target.value)}
                                        placeholder="0.00"
                                        style={{ ...inputStyle, paddingLeft: '1.5rem' }}
                                    />
                                </div>
                            </div>
                            <button
                                onClick={() => removePayout(idx)}
                                style={{ padding: '0.6rem 0.7rem', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '1rem', flexShrink: 0 }}
                                title="Remove"
                            >
                                🗑
                            </button>
                        </div>
                    ))}

                    <button
                        onClick={addPayout}
                        style={{ padding: '0.5rem 1rem', background: '#1f2937', color: '#60a5fa', border: '1px solid #374151', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem', marginTop: '0.25rem' }}
                    >
                        + Add Payout
                    </button>

                    {computed.totalPayouts > 0 && (
                        <div style={{ marginTop: '0.75rem', color: '#9ca3af', fontSize: '0.9rem', textAlign: 'right' }}>
                            Total Payouts: <strong style={{ color: '#f9fafb' }}>{fmt(computed.totalPayouts)}</strong>
                        </div>
                    )}
                </div>

                {/* Section 4: Options */}
                <div style={cardStyle}>
                    <div style={sectionTitleStyle}>⚙️ Options</div>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={form.ccTipsCashPayout}
                            onChange={e => setField('ccTipsCashPayout', e.target.checked)}
                            style={{ width: '18px', height: '18px', marginTop: '2px', flexShrink: 0 }}
                        />
                        <div>
                            <span style={{ color: '#f9fafb', fontWeight: 500 }}>Employee taking CC tips as cash from bag</span>
                            {form.ccTipsCashPayout && (
                                <div style={{ color: '#fbbf24', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                                    CC Tips ({fmt(n(form.ccTips))}) will be deducted from bag amount
                                </div>
                            )}
                        </div>
                    </label>
                </div>

                {/* Section 6: Notes */}
                <div style={cardStyle}>
                    <div style={sectionTitleStyle}>📝 Notes</div>
                    <textarea
                        value={form.notes}
                        onChange={e => setField('notes', e.target.value)}
                        placeholder="Any notes about this shift..."
                        rows={3}
                        style={{ ...inputStyle, resize: 'vertical' }}
                    />
                </div>

                {/* Submit */}
                <button
                    onClick={handleSubmit}
                    disabled={submitting || !form.bankEnd}
                    style={{
                        width: '100%',
                        padding: '1rem',
                        background: form.bankEnd ? '#1d4ed8' : '#374151',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.625rem',
                        fontSize: '1rem',
                        fontWeight: 700,
                        cursor: form.bankEnd ? 'pointer' : 'not-allowed',
                        opacity: submitting ? 0.7 : 1,
                        marginBottom: '5rem',
                    }}
                >
                    {submitting ? 'Submitting...' : 'Submit Shift Close'}
                </button>
            </div>

            {/* Section 5: Sticky Summary Panel */}
            <div style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                background: '#111827',
                borderTop: '1px solid #1f2937',
                padding: '0.75rem 1.25rem',
                zIndex: 99,
            }}>
                <div style={{ maxWidth: '760px', margin: '0 auto' }}>
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                            <div>
                                <div style={{ color: '#6b7280', fontSize: '0.7rem', textTransform: 'uppercase' }}>Cash In</div>
                                <div style={{ color: '#d1d5db', fontSize: '0.95rem', fontWeight: 600 }}>{fmt(computed.totalCashIn)}</div>
                            </div>
                            {computed.totalPayouts > 0 && (
                                <div>
                                    <div style={{ color: '#6b7280', fontSize: '0.7rem', textTransform: 'uppercase' }}>Payouts</div>
                                    <div style={{ color: '#f87171', fontSize: '0.95rem', fontWeight: 600 }}>-{fmt(computed.totalPayouts)}</div>
                                </div>
                            )}
                            {form.ccTipsCashPayout && computed.ccTipsCashAmount > 0 && (
                                <div>
                                    <div style={{ color: '#6b7280', fontSize: '0.7rem', textTransform: 'uppercase' }}>CC Tips Cash</div>
                                    <div style={{ color: '#f87171', fontSize: '0.95rem', fontWeight: 600 }}>-{fmt(computed.ccTipsCashAmount)}</div>
                                </div>
                            )}
                            <div>
                                <div style={{ color: '#6b7280', fontSize: '0.7rem', textTransform: 'uppercase' }}>CC Revenue</div>
                                <div style={{ color: '#d1d5db', fontSize: '0.95rem', fontWeight: 600 }}>{fmt(computed.totalCCRevenue)}</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '1.5rem' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ color: '#6b7280', fontSize: '0.7rem', textTransform: 'uppercase' }}>Over/Short</div>
                                <div style={{ color: colorNum(computed.overShort), fontSize: '1rem', fontWeight: 700 }}>{fmt(computed.overShort)}</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ color: '#6b7280', fontSize: '0.7rem', textTransform: 'uppercase' }}>Bag Amount</div>
                                <div style={{ color: colorNum(computed.bagAmount), fontSize: '1.35rem', fontWeight: 800 }}>{fmt(computed.bagAmount)}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* OCR Modal */}
            <OcrModal
                open={ocrModalOpen}
                receiptType={ocrType}
                onClose={() => setOcrModalOpen(false)}
                onFieldsExtracted={handleOcrFields}
            />
        </div>
    );
}
