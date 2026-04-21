'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import FlashOnIcon from '@mui/icons-material/FlashOn';
import FlashOffIcon from '@mui/icons-material/FlashOff';

interface BarcodeScannerProps {
    open: boolean;
    onClose: () => void;
    onDetected: (barcode: string) => void;
    title?: string;
}

declare global {
    interface Window {
        Quagga: any;
    }
}

export default function BarcodeScanner({ open, onClose, onDetected, title = 'Scan Barcode' }: BarcodeScannerProps) {
    const videoRef = useRef<HTMLDivElement>(null);
    const [status, setStatus] = useState<'loading' | 'scanning' | 'error' | 'idle'>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [detectedCode, setDetectedCode] = useState('');
    const [manualEntry, setManualEntry] = useState('');
    const [showManual, setShowManual] = useState(false);
    const [torchOn, setTorchOn] = useState(false);
    const [torchSupported, setTorchSupported] = useState(false);
    const quaggaRunning = useRef(false);
    const detectedRef = useRef('');
    const streamTrackRef = useRef<MediaStreamTrack | null>(null);

    const stopQuagga = useCallback(() => {
        if (quaggaRunning.current && window.Quagga) {
            try {
                window.Quagga.stop();
            } catch { }
            quaggaRunning.current = false;
        }
        // Turn off torch and release track ref on stop
        if (streamTrackRef.current) {
            try { (streamTrackRef.current as any).applyConstraints({ advanced: [{ torch: false }] }); } catch { }
            streamTrackRef.current = null;
        }
        setTorchOn(false);
        setTorchSupported(false);
    }, []);

    const toggleTorch = useCallback(async () => {
        const track = streamTrackRef.current;
        if (!track) return;
        const next = !torchOn;
        try {
            await (track as any).applyConstraints({ advanced: [{ torch: next }] });
            setTorchOn(next);
        } catch { /* device doesn't support torch */ }
    }, [torchOn]);

    const startScanner = useCallback(async () => {
        setStatus('loading');
        setErrorMsg('');
        setDetectedCode('');
        detectedRef.current = '';

        // Load QuaggaJS from CDN if not loaded
        if (!window.Quagga) {
            await new Promise<void>((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/quagga@0.12.1/dist/quagga.min.js';
                script.onload = () => resolve();
                script.onerror = () => reject(new Error('Failed to load barcode library'));
                document.head.appendChild(script);
            }).catch(e => {
                setStatus('error');
                setErrorMsg(e.message);
                return;
            });
        }

        if (!window.Quagga || !videoRef.current) {
            setStatus('error');
            setErrorMsg('Camera component not ready');
            return;
        }

        try {
            window.Quagga.init({
                inputStream: {
                    type: 'LiveStream',
                    target: videoRef.current,
                    constraints: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        facingMode: 'environment',
                    },
                },
                locator: {
                    patchSize: 'medium',
                    halfSample: true,
                },
                numOfWorkers: 2,
                decoder: {
                    readers: [
                        'ean_reader',
                        'ean_8_reader',
                        'upc_reader',
                        'upc_e_reader',
                        'code_128_reader',
                        'code_39_reader',
                    ],
                },
                locate: true,
            }, (err: any) => {
                if (err) {
                    setStatus('error');
                    setErrorMsg(err.message || 'Camera error. Check permissions.');
                    return;
                }
                window.Quagga.start();
                quaggaRunning.current = true;
                setStatus('scanning');

                // Detect torch (flash) support from the live video stream
                setTimeout(() => {
                    const video = videoRef.current?.querySelector('video');
                    const stream = video?.srcObject as MediaStream | null;
                    const track = stream?.getVideoTracks?.()?.[0] ?? null;
                    if (track) {
                        streamTrackRef.current = track;
                        const caps = (track as any).getCapabilities?.() ?? {};
                        if (caps.torch) setTorchSupported(true);
                    }
                }, 500);
            });

            // Detection handler — debounce: require 3 consistent reads
            // Normalize UPC-A/EAN-13: QuaggaJS pads 12-digit UPC-A with a leading 0
            // producing a 13-digit EAN-13. Strip it so barcodes match consistently.
            const normalizeBarcode = (raw: string): string => {
                const trimmed = raw.trim();
                if (trimmed.length === 13 && trimmed.startsWith('0')) return trimmed.slice(1);
                return trimmed;
            };

            const counts: Record<string, number> = {};
            window.Quagga.onDetected((result: any) => {
                const raw = result?.codeResult?.code;
                if (!raw) return;
                const code = normalizeBarcode(raw);
                counts[code] = (counts[code] || 0) + 1;
                if (counts[code] >= 3 && detectedRef.current !== code) {
                    detectedRef.current = code;
                    setDetectedCode(code);
                }
            });
        } catch (e: any) {
            setStatus('error');
            setErrorMsg(e.message || 'Failed to start camera');
        }
    }, []);

    useEffect(() => {
        if (open) {
            const timer = setTimeout(() => startScanner(), 150); // wait for DOM mount
            return () => clearTimeout(timer);
        } else {
            stopQuagga();
            setStatus('idle');
            setDetectedCode('');
            detectedRef.current = '';
            setManualEntry('');
            setShowManual(false);
            setTorchOn(false);
            setTorchSupported(false);
        }
    }, [open]);

    // Auto-confirm when code detected
    useEffect(() => {
        if (detectedCode) {
            const timer = setTimeout(() => {
                stopQuagga();
                onDetected(detectedCode);
            }, 600);
            return () => clearTimeout(timer);
        }
    }, [detectedCode]);

    const handleCapture = () => {
        if (!window.Quagga || !quaggaRunning.current) return;
        // Force a single-frame decode attempt
        window.Quagga.onProcessed((result: any) => {
            const code = result?.codeResult?.code;
            if (code) {
                stopQuagga();
                onDetected(code);
            }
        });
    };

    const handleManualSubmit = () => {
        const code = manualEntry.trim();
        if (!code) return;
        stopQuagga();
        onDetected(code);
    };

    const handleClose = () => {
        stopQuagga();
        onClose();
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth
            PaperProps={{ style: { background: '#111827', color: 'white' } }}>
            <DialogTitle style={{ borderBottom: '1px solid #374151', paddingBottom: '0.75rem' }}>
                {title}
            </DialogTitle>
            <DialogContent style={{ padding: '1rem' }}>
                {status === 'loading' && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '2rem' }}>
                        <CircularProgress size={40} />
                        <p style={{ color: '#9ca3af', margin: 0 }}>Starting camera...</p>
                    </div>
                )}

                {status === 'error' && (
                    <div style={{ textAlign: 'center', padding: '1rem', color: '#ef4444' }}>
                        <p style={{ marginBottom: '0.5rem' }}>{errorMsg || 'Camera unavailable'}</p>
                        <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Make sure camera permissions are allowed, then try again.</p>
                    </div>
                )}

                {/* Camera viewport — always rendered so Quagga can mount to it */}
                <div
                    ref={videoRef}
                    style={{
                        display: status === 'scanning' ? 'block' : 'none',
                        width: '100%',
                        maxHeight: '320px',
                        overflow: 'hidden',
                        borderRadius: '8px',
                        position: 'relative',
                        background: '#000',
                    }}
                />

                {status === 'scanning' && (
                    <div style={{ marginTop: '0.75rem', textAlign: 'center' }}>
                        {detectedCode ? (
                            <div style={{ background: '#14532d', border: '1px solid #16a34a', borderRadius: '8px', padding: '0.75rem', color: '#86efac' }}>
                                Detected: <strong>{detectedCode}</strong> — confirming...
                            </div>
                        ) : (
                            <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: '0.25rem 0 0.75rem' }}>
                                Point camera at barcode. It will detect automatically.
                            </p>
                        )}
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center', marginTop: '0.25rem' }}>
                            <Button
                                variant="outlined"
                                onClick={handleCapture}
                                style={{ borderColor: '#4b5563', color: '#d1d5db' }}
                            >
                                Capture Now
                            </Button>
                            {torchSupported && (
                                <Tooltip title={torchOn ? 'Flash off' : 'Flash on'}>
                                    <IconButton
                                        onClick={toggleTorch}
                                        style={{
                                            background: torchOn ? '#fbbf24' : '#374151',
                                            color: torchOn ? '#111827' : '#d1d5db',
                                            borderRadius: '8px',
                                            padding: '6px 10px',
                                        }}
                                    >
                                        {torchOn ? <FlashOnIcon /> : <FlashOffIcon />}
                                    </IconButton>
                                </Tooltip>
                            )}
                        </div>
                    </div>
                )}

                {/* Manual entry fallback */}
                <div style={{ marginTop: '1.25rem', borderTop: '1px solid #374151', paddingTop: '1rem' }}>
                    {!showManual ? (
                        <button
                            onClick={() => setShowManual(true)}
                            style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '0.85rem', cursor: 'pointer', textDecoration: 'underline' }}
                        >
                            Enter barcode manually
                        </button>
                    ) : (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input
                                type="text"
                                autoFocus
                                value={manualEntry}
                                onChange={e => setManualEntry(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleManualSubmit()}
                                placeholder="Type or paste barcode..."
                                style={{
                                    flex: 1,
                                    background: '#1f2937',
                                    border: '1px solid #4b5563',
                                    borderRadius: '6px',
                                    color: 'white',
                                    padding: '0.5rem 0.75rem',
                                    fontSize: '1rem',
                                }}
                            />
                            <Button
                                variant="contained"
                                onClick={handleManualSubmit}
                                disabled={!manualEntry.trim()}
                                style={{ background: '#2563eb' }}
                            >
                                Use
                            </Button>
                        </div>
                    )}
                </div>
            </DialogContent>
            <DialogActions style={{ borderTop: '1px solid #374151', padding: '0.75rem 1rem' }}>
                <Button onClick={handleClose} style={{ color: '#9ca3af' }}>Cancel</Button>
                {(status === 'error' || status === 'idle') && (
                    <Button variant="contained" onClick={startScanner} style={{ background: '#2563eb' }}>
                        Retry Camera
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}
