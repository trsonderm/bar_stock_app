'use client';

import { useState, useRef, useEffect } from 'react';
import { Trash2, CheckCircle, Upload, PenTool } from 'lucide-react';

export default function SignatureManager() {
    const [signatures, setSignatures] = useState<any[]>([]);
    const [mode, setMode] = useState<'LIST' | 'DRAW' | 'UPLOAD'>('LIST');
    const [label, setLabel] = useState('');
    const [isShared, setIsShared] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);

    // Fetch Signatures
    const fetchSignatures = async () => {
        try {
            const res = await fetch('/api/settings/signatures');
            const data = await res.json();
            if (data.signatures) setSignatures(data.signatures);
        } catch (e) {
            console.error('Error fetching signatures', e);
        }
    };

    useEffect(() => {
        fetchSignatures();
    }, []);

    // Canvas Logic
    const startDrawing = (e: any) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX || e.touches[0].clientX) - rect.left;
        const y = (e.clientY || e.touches[0].clientY) - rect.top;

        ctx.beginPath();
        ctx.moveTo(x, y);
        setIsDrawing(true);
    };

    const draw = (e: any) => {
        if (!isDrawing) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX || e.touches[0].clientX) - rect.left;
        const y = (e.clientY || e.touches[0].clientY) - rect.top;

        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#000';
        ctx.lineTo(x, y);
        ctx.stroke();
    };

    const stopDrawing = () => {
        setIsDrawing(false);
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx?.closePath();
        }
    };

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
        }
    };

    const saveCanvas = async () => {
        if (!label) return alert('Please enter a name');
        const canvas = canvasRef.current;
        if (!canvas) return;

        const dataUrl = canvas.toDataURL('image/png');
        await saveSignature(dataUrl);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!label) return alert('Please enter a name first');

        const reader = new FileReader();
        reader.onloadend = async () => {
            await saveSignature(reader.result as string);
        };
        reader.readAsDataURL(file);
    };

    const saveSignature = async (dataUrl: string) => {
        try {
            const res = await fetch('/api/settings/signatures', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label, data_url: dataUrl, is_shared: isShared })
            });
            if (res.ok) {
                setLabel('');
                setIsShared(false);
                setMode('LIST');
                fetchSignatures();
            } else {
                alert('Failed to save');
            }
        } catch (e) {
            console.error(e);
        }
    };

    const setActive = async (id: number) => {
        try {
            const res = await fetch('/api/settings/signatures', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            if (res.ok) fetchSignatures();
        } catch (e) { console.error(e); }
    };



    return (
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">Digital Signatures</h3>
                {mode === 'LIST' && (
                    <button
                        onClick={() => { setMode('DRAW'); setLabel(''); setIsShared(false); }}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-sm font-bold flex items-center gap-2"
                    >
                        + Add Signature
                    </button>
                )}
                {mode !== 'LIST' && (
                    <button
                        onClick={() => setMode('LIST')}
                        className="text-gray-400 hover:text-white text-sm"
                    >
                        Cancel
                    </button>
                )}
            </div>

            {mode === 'LIST' && (
                <div className="space-y-3">
                    {signatures.length === 0 && (
                        <p className="text-gray-500 text-sm italic">No signatures saved. Create one to use on Purchase Orders.</p>
                    )}
                    {signatures.map(sig => (
                        <div key={sig.id} className={`flex items-center justify-between p-3 rounded border ${sig.is_active ? 'border-green-500 bg-green-900/20' : 'border-gray-700 bg-gray-900'}`}>
                            <div className="flex items-center gap-4">
                                <div className="bg-white p-1 rounded">
                                    <img src={sig.data} alt={sig.label} className="h-8 w-auto mix-blend-multiply" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className="text-white font-bold text-sm">{sig.label}</p>
                                        {sig.is_shared && <span className="text-[10px] bg-blue-900 text-blue-300 px-1.5 py-0.5 rounded uppercase font-bold">Shared</span>}
                                        {!sig.is_shared && <span className="text-[10px] bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded uppercase font-bold">Private</span>}
                                    </div>
                                    {sig.is_active && <p className="text-green-400 text-xs">Active Default</p>}
                                </div>
                            </div>
                            {!sig.is_active && (
                                <button
                                    onClick={() => setActive(sig.id)}
                                    className="text-gray-400 hover:text-green-400"
                                    title="Set Active"
                                >
                                    <CheckCircle size={20} />
                                </button>
                            )}
                            {sig.is_active && <CheckCircle size={20} className="text-green-500" />}
                        </div>
                    ))}
                </div>
            )}

            {mode === 'DRAW' && (
                <div>
                    <div className="mb-4">
                        <label className="text-gray-400 text-xs block mb-1">Signature Name (e.g. John Doe)</label>
                        <input
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white"
                            placeholder="Enter name..."
                        />
                    </div>

                    <div className="mb-4 flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="shareSig"
                            checked={isShared}
                            onChange={(e) => setIsShared(e.target.checked)}
                            className="w-4 h-4 rounded bg-gray-700 border-gray-600"
                        />
                        <label htmlFor="shareSig" className="text-gray-300 text-sm cursor-pointer select-none">
                            Share with organization <span className="text-gray-500 text-xs block">(Visible to all users)</span>
                        </label>
                    </div>

                    <div className="bg-white rounded p-1 mb-4 relative">
                        <canvas
                            ref={canvasRef}
                            width={400}
                            height={150}
                            className="w-full h-[150px] cursor-crosshair touch-none"
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onMouseLeave={stopDrawing}
                            onTouchStart={startDrawing}
                            onTouchMove={draw}
                            onTouchEnd={stopDrawing}
                        />
                    </div>

                    <div className="flex justify-between">
                        <div className="flex gap-2">
                            <button onClick={clearCanvas} className="text-white text-xs px-3 py-1 bg-gray-600 rounded">Clear</button>
                            <label className="text-white text-xs px-3 py-1 bg-gray-600 rounded cursor-pointer flex items-center gap-1">
                                <Upload size={12} /> Upload Image
                                <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                            </label>
                        </div>
                        <button
                            onClick={saveCanvas}
                            className="bg-green-600 text-white px-4 py-1 rounded font-bold text-sm"
                        >
                            Save Signature
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
