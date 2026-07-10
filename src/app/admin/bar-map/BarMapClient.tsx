'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ObjType =
    | 'bar_counter' | 'back_bar' | 'service_area'
    | 'ice_well' | 'register' | 'sink'
    | 'bottle_row' | 'mixer_row'
    | 'liquor_room' | 'cooler'
    | 'office' | 'bathroom'
    | 'door' | 'window' | 'pillar' | 'table';

export interface Pt { x: number; y: number; }

export interface ShelfProduct {
    id: string;
    product_id: number | null;
    product_name: string | null;
    quantity?: number;
}

export interface Shelf {
    id: string;
    label: string;
    products: ShelfProduct[];
}

export interface MapObject {
    id: string;
    type: ObjType;
    name: string;
    x: number; y: number;
    width: number; height: number;
    rotation: number;
    shelves: Shelf[];
    doorDirection: 'n' | 's' | 'e' | 'w';
    notes: string;
    color?: string;
}

export interface MapData {
    name: string;
    width_ft: number;
    height_ft: number;
    grid_ft: number;
    outline: Pt[];
    objects: MapObject[];
}

type Tool = 'select' | 'draw';
type Mode = 'view' | 'edit' | 'audit';

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_PX = 40; // pixels per foot at zoom=1
const SNAP = 0.5;      // feet

const OBJ_META: Record<ObjType, { label: string; color: string; emoji: string; defaultW: number; defaultH: number; hasShelves: boolean }> = {
    bar_counter:  { label: 'Bar Counter',    color: '#78350f', emoji: '🍺', defaultW: 12, defaultH: 2.5, hasShelves: false },
    back_bar:     { label: 'Back Bar',       color: '#92400e', emoji: '🥃', defaultW: 10, defaultH: 1.5, hasShelves: false },
    service_area: { label: 'Service Area',   color: '#374151', emoji: '🎯', defaultW: 6,  defaultH: 3,   hasShelves: false },
    ice_well:     { label: 'Ice Well',       color: '#1e3a5f', emoji: '🧊', defaultW: 2,  defaultH: 1.5, hasShelves: false },
    register:     { label: 'Register / POS', color: '#4c1d95', emoji: '💰', defaultW: 3,  defaultH: 2,   hasShelves: false },
    sink:         { label: 'Sink',           color: '#1e3a5f', emoji: '🚰', defaultW: 2,  defaultH: 1.5, hasShelves: false },
    bottle_row:   { label: 'Bottle Row',     color: '#14532d', emoji: '🍾', defaultW: 8,  defaultH: 1.5, hasShelves: true  },
    mixer_row:    { label: 'Mixer Row',      color: '#7c2d12', emoji: '🧃', defaultW: 6,  defaultH: 1.5, hasShelves: true  },
    liquor_room:  { label: 'Liquor Room',    color: '#134e4a', emoji: '🔒', defaultW: 10, defaultH: 8,   hasShelves: true  },
    cooler:       { label: 'Walk-in Cooler', color: '#1e3a8a', emoji: '❄️', defaultW: 10, defaultH: 8,   hasShelves: true  },
    office:       { label: 'Office',         color: '#1f2937', emoji: '🖥️', defaultW: 8,  defaultH: 6,   hasShelves: false },
    bathroom:     { label: 'Bathroom',       color: '#1f2937', emoji: '🚻', defaultW: 6,  defaultH: 5,   hasShelves: false },
    door:         { label: 'Door',           color: '#f59e0b', emoji: '🚪', defaultW: 3,  defaultH: 0.5, hasShelves: false },
    window:       { label: 'Window',         color: '#7dd3fc', emoji: '🪟', defaultW: 4,  defaultH: 0.5, hasShelves: false },
    pillar:       { label: 'Column/Pillar',  color: '#6b7280', emoji: '🏛️', defaultW: 1,  defaultH: 1,   hasShelves: false },
    table:        { label: 'Table/Seating',  color: '#1e1b4b', emoji: '🪑', defaultW: 3,  defaultH: 2,   hasShelves: false },
};

const PALETTE_GROUPS = [
    { label: 'Bar Structure', types: ['bar_counter', 'back_bar', 'service_area'] as ObjType[] },
    { label: 'Equipment',     types: ['ice_well', 'register', 'sink'] as ObjType[] },
    { label: 'Storage',       types: ['bottle_row', 'mixer_row'] as ObjType[] },
    { label: 'Rooms',         types: ['liquor_room', 'cooler', 'office', 'bathroom'] as ObjType[] },
    { label: 'Architectural', types: ['door', 'window', 'pillar', 'table'] as ObjType[] },
];

const EMPTY_MAP: MapData = {
    name: 'My Bar',
    width_ft: 40,
    height_ft: 25,
    grid_ft: 1,
    outline: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 25 }, { x: 0, y: 25 }],
    objects: [],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function snap(v: number) { return Math.round(v / SNAP) * SNAP; }
function uid() { return 'obj_' + Math.random().toString(36).slice(2, 8); }
function shelfId() { return 's_' + Math.random().toString(36).slice(2, 8); }
function slotId() { return 'p_' + Math.random().toString(36).slice(2, 8); }

function defaultShelves(count = 3): Shelf[] {
    const labels = ['Top Shelf', 'Middle Shelf', 'Bottom Shelf', 'Floor Level'];
    return Array.from({ length: count }, (_, i) => ({
        id: shelfId(),
        label: labels[i] || `Shelf ${i + 1}`,
        products: Array.from({ length: 6 }, () => ({ id: slotId(), product_id: null, product_name: null })),
    }));
}

function makeObject(type: ObjType, x: number, y: number, existingCount: number): MapObject {
    const meta = OBJ_META[type];
    const label = `${meta.label} ${existingCount + 1}`;
    return {
        id: uid(), type, name: label, x, y,
        width: meta.defaultW, height: meta.defaultH,
        rotation: 0,
        shelves: meta.hasShelves ? defaultShelves(3) : [],
        doorDirection: 's', notes: '', color: undefined,
    };
}

// ─── SVG Object Renderer ─────────────────────────────────────────────────────

function ObjRenderer({ obj, selected, mode, onPointerDown, zoom }:
    { obj: MapObject; selected: boolean; mode: Mode; onPointerDown: (e: React.PointerEvent, id: string) => void; zoom: number }) {
    const meta = OBJ_META[obj.type];
    const col = obj.color || meta.color;
    const px = DEFAULT_PX;
    const x = obj.x * px, y = obj.y * px;
    const w = obj.width * px, h = obj.height * px;
    const cx = x + w / 2, cy = y + h / 2;
    const isDoor = obj.type === 'door';
    const isWindow = obj.type === 'window';
    const isPillar = obj.type === 'pillar';
    const isRoom = ['liquor_room', 'cooler', 'office', 'bathroom'].includes(obj.type);
    const fontSize = Math.max(8, Math.min(14, w / 8));

    return (
        <g
            transform={`rotate(${obj.rotation},${cx},${cy})`}
            onPointerDown={e => onPointerDown(e, obj.id)}
            style={{ cursor: mode === 'edit' ? 'move' : 'default' }}
        >
            {isDoor ? (
                <>
                    {/* Door: line on wall + arc showing swing */}
                    <line x1={x} y1={y + h / 2} x2={x + w} y2={y + h / 2} stroke={col} strokeWidth={3} strokeLinecap="round" />
                    <path d={`M ${x} ${y + h / 2} A ${w} ${w} 0 0 1 ${x + w} ${y + h / 2 + w}`} stroke={col} strokeWidth={1.5} fill="none" strokeDasharray="4 3" opacity={0.7} />
                </>
            ) : isWindow ? (
                <>
                    <rect x={x} y={y} width={w} height={Math.max(h * px, 6)} rx={1} fill={col} opacity={0.6} />
                    <line x1={x} y1={y + h / 2} x2={x + w} y2={y + h / 2} stroke="#bae6fd" strokeWidth={2} />
                </>
            ) : isPillar ? (
                <rect x={x} y={y} width={w} height={h} rx={2} fill={col} stroke="#9ca3af" strokeWidth={2} />
            ) : isRoom ? (
                <>
                    <rect x={x} y={y} width={w} height={h} rx={3} fill={col} fillOpacity={0.5} stroke={col} strokeWidth={2} strokeDasharray={selected ? '0' : '6 3'} />
                    {/* Shelf level indicators */}
                    {obj.shelves.map((shelf, i) => {
                        const sy = y + h * 0.15 + i * (h * 0.65 / Math.max(obj.shelves.length, 1));
                        return <line key={shelf.id} x1={x + 8} y1={sy} x2={x + w - 8} y2={sy} stroke="rgba(255,255,255,0.25)" strokeWidth={1.5} />;
                    })}
                    <text x={cx} y={cy - 4} textAnchor="middle" fill="white" fontSize={fontSize} fontWeight="600">{meta.emoji}</text>
                    <text x={cx} y={cy + fontSize} textAnchor="middle" fill="rgba(255,255,255,0.9)" fontSize={Math.max(7, fontSize - 2)}>{obj.name}</text>
                </>
            ) : obj.shelves.length > 0 ? (
                <>
                    <rect x={x} y={y} width={w} height={h} rx={2} fill={col} />
                    {/* Shelf dividers */}
                    {obj.shelves.map((shelf, i) => {
                        const sy = y + (h / obj.shelves.length) * i;
                        return <line key={shelf.id} x1={x} y1={sy} x2={x + w} y2={sy} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />;
                    })}
                    {/* Bottle dots if products assigned */}
                    {mode === 'audit' && obj.shelves.flatMap((shelf, si) =>
                        shelf.products.slice(0, 10).map((p, pi) => {
                            const dotX = x + 6 + pi * ((w - 12) / 10);
                            const dotY = y + (h / obj.shelves.length) * si + (h / obj.shelves.length) / 2;
                            const hasProduct = !!p.product_id;
                            const qty = p.quantity ?? null;
                            return (
                                <circle key={p.id}
                                    cx={dotX} cy={dotY} r={3}
                                    fill={!hasProduct ? 'rgba(255,255,255,0.1)' : qty === 0 ? '#ef4444' : qty !== null && qty <= 2 ? '#f59e0b' : '#22c55e'}
                                    stroke="rgba(255,255,255,0.3)" strokeWidth={0.5}
                                />
                            );
                        })
                    )}
                    <text x={cx} y={cy + fontSize / 2} textAnchor="middle" fill="rgba(255,255,255,0.9)" fontSize={Math.max(7, fontSize - 1)}>{obj.name}</text>
                </>
            ) : (
                <>
                    <rect x={x} y={y} width={w} height={h} rx={2} fill={col} />
                    <text x={cx} y={cy - 2} textAnchor="middle" fill="white" fontSize={fontSize + 2}>{meta.emoji}</text>
                    <text x={cx} y={cy + fontSize + 1} textAnchor="middle" fill="rgba(255,255,255,0.9)" fontSize={Math.max(7, fontSize - 1)}>{obj.name}</text>
                </>
            )}

            {/* Selection outline */}
            {selected && (
                <rect x={x - 2} y={y - 2} width={w + 4} height={h + 4} rx={3}
                    fill="none" stroke="#fbbf24" strokeWidth={2} strokeDasharray="6 3"
                    style={{ pointerEvents: 'none' }}
                />
            )}

            {/* Dimension label */}
            {selected && mode === 'edit' && (
                <text x={cx} y={y - 8} textAnchor="middle" fill="#fbbf24" fontSize={9}>
                    {obj.width.toFixed(1)}ft × {obj.height.toFixed(1)}ft
                </text>
            )}
        </g>
    );
}

// ─── Resize Handles ───────────────────────────────────────────────────────────

type HandlePos = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

function ResizeHandles({ obj, onHandleDown }: {
    obj: MapObject;
    onHandleDown: (e: React.PointerEvent, id: string, handle: HandlePos) => void;
}) {
    const px = DEFAULT_PX;
    const x = obj.x * px, y = obj.y * px, w = obj.width * px, h = obj.height * px;
    const handles: { pos: HandlePos; cx: number; cy: number }[] = [
        { pos: 'nw', cx: x,       cy: y       }, { pos: 'n',  cx: x + w / 2, cy: y       },
        { pos: 'ne', cx: x + w,   cy: y       }, { pos: 'e',  cx: x + w,     cy: y + h / 2 },
        { pos: 'se', cx: x + w,   cy: y + h   }, { pos: 's',  cx: x + w / 2, cy: y + h   },
        { pos: 'sw', cx: x,       cy: y + h   }, { pos: 'w',  cx: x,         cy: y + h / 2 },
    ];
    return (
        <g style={{ pointerEvents: 'all' }}>
            {handles.map(h => (
                <rect key={h.pos}
                    x={h.cx - 5} y={h.cy - 5} width={10} height={10}
                    rx={2} fill="white" stroke="#fbbf24" strokeWidth={1.5}
                    style={{ cursor: `${h.pos}-resize` }}
                    onPointerDown={e => { e.stopPropagation(); onHandleDown(e, obj.id, h.pos); }}
                />
            ))}
        </g>
    );
}

// ─── Properties Panel ─────────────────────────────────────────────────────────

function PropsPanel({ obj, products, onUpdate, onDelete, mode, onAuditChange }: {
    obj: MapObject;
    products: any[];
    onUpdate: (updated: MapObject) => void;
    onDelete: (id: string) => void;
    mode: Mode;
    onAuditChange?: (objId: string, shelfId: string, slotId: string, qty: number) => void;
}) {
    const meta = OBJ_META[obj.type];

    function field(label: string, value: string | number, key: keyof MapObject, type = 'text') {
        return (
            <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>{label}</div>
                <input
                    type={type}
                    value={value as string}
                    onChange={e => onUpdate({ ...obj, [key]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value })}
                    style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '5px 8px', color: 'white', fontSize: 13 }}
                />
            </div>
        );
    }

    function addShelf() {
        const newShelf: Shelf = { id: shelfId(), label: `Shelf ${obj.shelves.length + 1}`, products: Array.from({ length: 6 }, () => ({ id: slotId(), product_id: null, product_name: null })) };
        onUpdate({ ...obj, shelves: [...obj.shelves, newShelf] });
    }

    function removeShelf(shelfIdx: number) {
        const shelves = obj.shelves.filter((_, i) => i !== shelfIdx);
        onUpdate({ ...obj, shelves });
    }

    function addSlot(shelfIdx: number) {
        const shelves = obj.shelves.map((s, i) => i !== shelfIdx ? s : { ...s, products: [...s.products, { id: slotId(), product_id: null, product_name: null }] });
        onUpdate({ ...obj, shelves });
    }

    function removeSlot(shelfIdx: number, slotIdx: number) {
        const shelves = obj.shelves.map((s, i) => i !== shelfIdx ? s : { ...s, products: s.products.filter((_, j) => j !== slotIdx) });
        onUpdate({ ...obj, shelves });
    }

    function assignProduct(shelfIdx: number, slotIdx: number, productId: number | null, productName: string | null) {
        const shelves = obj.shelves.map((s, i) => i !== shelfIdx ? s : {
            ...s,
            products: s.products.map((p, j) => j !== slotIdx ? p : { ...p, product_id: productId, product_name: productName }),
        });
        onUpdate({ ...obj, shelves });
    }

    return (
        <div style={{ padding: 16, overflowY: 'auto', height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: '#fbbf24', fontWeight: 700 }}>{meta.emoji} {meta.label}</div>
                {mode === 'edit' && (
                    <button onClick={() => onDelete(obj.id)}
                        style={{ background: '#7f1d1d', border: 'none', borderRadius: 6, padding: '4px 10px', color: '#fca5a5', fontSize: 12, cursor: 'pointer' }}>
                        Remove
                    </button>
                )}
            </div>

            {mode === 'edit' && (
                <>
                    {field('Name', obj.name, 'name')}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                        <div>
                            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>X (ft)</div>
                            <input type="number" step={0.5} value={obj.x} onChange={e => onUpdate({ ...obj, x: parseFloat(e.target.value) || 0 })}
                                style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '5px 8px', color: 'white', fontSize: 13 }} />
                        </div>
                        <div>
                            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>Y (ft)</div>
                            <input type="number" step={0.5} value={obj.y} onChange={e => onUpdate({ ...obj, y: parseFloat(e.target.value) || 0 })}
                                style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '5px 8px', color: 'white', fontSize: 13 }} />
                        </div>
                        <div>
                            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>Width (ft)</div>
                            <input type="number" step={0.5} min={0.5} value={obj.width} onChange={e => onUpdate({ ...obj, width: Math.max(0.5, parseFloat(e.target.value) || 0.5) })}
                                style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '5px 8px', color: 'white', fontSize: 13 }} />
                        </div>
                        <div>
                            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>Depth (ft)</div>
                            <input type="number" step={0.5} min={0.5} value={obj.height} onChange={e => onUpdate({ ...obj, height: Math.max(0.5, parseFloat(e.target.value) || 0.5) })}
                                style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '5px 8px', color: 'white', fontSize: 13 }} />
                        </div>
                    </div>
                    <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>Rotation (°)</div>
                        <input type="range" min={0} max={360} step={45} value={obj.rotation} onChange={e => onUpdate({ ...obj, rotation: parseInt(e.target.value) })}
                            style={{ width: '100%' }} />
                        <div style={{ fontSize: 11, color: '#64748b', textAlign: 'right' }}>{obj.rotation}°</div>
                    </div>
                    {field('Notes', obj.notes, 'notes')}
                </>
            )}

            {/* Shelves section */}
            {(meta.hasShelves || obj.shelves.length > 0) && (
                <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600 }}>Shelf Levels ({obj.shelves.length})</div>
                        {mode === 'edit' && (
                            <button onClick={addShelf}
                                style={{ background: '#1e3a5f', border: '1px solid #1e40af', borderRadius: 6, padding: '3px 10px', color: '#93c5fd', fontSize: 12, cursor: 'pointer' }}>
                                + Add Level
                            </button>
                        )}
                    </div>

                    {obj.shelves.map((shelf, si) => (
                        <div key={shelf.id} style={{ background: '#1e293b', borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: '#0f172a' }}>
                                {mode === 'edit' ? (
                                    <input value={shelf.label} onChange={e => {
                                        const shelves = obj.shelves.map((s, i) => i !== si ? s : { ...s, label: e.target.value });
                                        onUpdate({ ...obj, shelves });
                                    }}
                                        style={{ background: 'transparent', border: 'none', color: '#cbd5e1', fontSize: 12, fontWeight: 600, flex: 1 }} />
                                ) : (
                                    <span style={{ color: '#cbd5e1', fontSize: 12, fontWeight: 600 }}>{shelf.label}</span>
                                )}
                                {mode === 'edit' && (
                                    <button onClick={() => removeShelf(si)}
                                        style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 14, cursor: 'pointer', padding: '0 4px' }}>×</button>
                                )}
                            </div>
                            <div style={{ padding: '8px 10px' }}>
                                {shelf.products.map((p, pi) => (
                                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                        {mode === 'edit' ? (
                                            <>
                                                <select
                                                    value={p.product_id ?? ''}
                                                    onChange={e => {
                                                        const prod = products.find(x => x.id === parseInt(e.target.value));
                                                        assignProduct(si, pi, prod ? prod.id : null, prod ? prod.name : null);
                                                    }}
                                                    style={{ flex: 1, background: '#0f172a', border: '1px solid #334155', borderRadius: 5, padding: '3px 6px', color: p.product_id ? 'white' : '#475569', fontSize: 11 }}
                                                >
                                                    <option value="">— empty slot —</option>
                                                    {products.map(pr => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
                                                </select>
                                                <button onClick={() => removeSlot(si, pi)}
                                                    style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 14, cursor: 'pointer', flexShrink: 0 }}>×</button>
                                            </>
                                        ) : mode === 'audit' ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                                                <span style={{ flex: 1, fontSize: 11, color: p.product_id ? '#e2e8f0' : '#475569' }}>{p.product_name || '— empty —'}</span>
                                                {p.product_id && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        <button onClick={() => onAuditChange?.(obj.id, shelf.id, p.id, Math.max(0, (p.quantity ?? 1) - 1))}
                                                            style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 4, width: 22, height: 22, color: 'white', cursor: 'pointer', fontSize: 14 }}>−</button>
                                                        <span style={{ minWidth: 20, textAlign: 'center', fontSize: 12, color: (p.quantity ?? 0) === 0 ? '#ef4444' : (p.quantity ?? 0) <= 2 ? '#f59e0b' : '#22c55e' }}>
                                                            {p.quantity ?? '?'}
                                                        </span>
                                                        <button onClick={() => onAuditChange?.(obj.id, shelf.id, p.id, (p.quantity ?? 0) + 1)}
                                                            style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 4, width: 22, height: 22, color: 'white', cursor: 'pointer', fontSize: 14 }}>+</button>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <span style={{ fontSize: 11, color: p.product_id ? '#e2e8f0' : '#475569' }}>{p.product_name || '— empty slot —'}</span>
                                        )}
                                    </div>
                                ))}
                                {mode === 'edit' && (
                                    <button onClick={() => addSlot(si)}
                                        style={{ background: 'none', border: '1px dashed #334155', borderRadius: 5, padding: '3px 8px', color: '#64748b', fontSize: 11, cursor: 'pointer', width: '100%', marginTop: 4 }}>
                                        + Add slot
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── History Panel ────────────────────────────────────────────────────────────

function HistoryPanel({ onClose, onRestore }: { onClose: () => void; onRestore: (data: MapData) => void }) {
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [restoring, setRestoring] = useState<number | null>(null);

    useEffect(() => {
        fetch('/api/admin/bar-map/history').then(r => r.json()).then(d => { setHistory(d.history || []); setLoading(false); });
    }, []);

    async function restore(id: number) {
        setRestoring(id);
        const res = await fetch('/api/admin/bar-map/history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ history_id: id }) });
        const data = await res.json();
        if (data.ok) { onRestore(data.map_data); onClose(); }
        setRestoring(null);
    }

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#1e293b', borderRadius: 12, width: 480, maxHeight: '70vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', border: '1px solid #334155' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700, color: 'white', fontSize: 16 }}>📜 Save History</span>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}>×</button>
                </div>
                <div style={{ overflowY: 'auto', padding: 12, flex: 1 }}>
                    {loading ? <div style={{ color: '#64748b', textAlign: 'center', padding: 20 }}>Loading…</div> :
                        history.length === 0 ? <div style={{ color: '#64748b', textAlign: 'center', padding: 20 }}>No saves yet</div> :
                        history.map(h => (
                            <div key={h.id} style={{ background: '#0f172a', borderRadius: 8, padding: '10px 14px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500 }}>{h.description || 'Manual save'}</div>
                                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                                        {new Date(h.created_at).toLocaleString()} · {h.saved_by_name}
                                    </div>
                                </div>
                                <button onClick={() => restore(h.id)} disabled={restoring === h.id}
                                    style={{ background: '#1e3a5f', border: '1px solid #1e40af', borderRadius: 6, padding: '5px 12px', color: '#93c5fd', fontSize: 12, cursor: 'pointer', opacity: restoring === h.id ? 0.5 : 1 }}>
                                    {restoring === h.id ? '…' : 'Restore'}
                                </button>
                            </div>
                        ))
                    }
                </div>
            </div>
        </div>
    );
}

// ─── Voice / AI Dialog ────────────────────────────────────────────────────────

function VoiceDialog({ onClose, onGenerate }: { onClose: () => void; onGenerate: (data: MapData) => void }) {
    const [transcript, setTranscript] = useState('');
    const [listening, setListening] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState('');
    const recognitionRef = useRef<any>(null);

    function startListening() {
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) { setError('Speech recognition not supported in this browser. Type your description below.'); return; }
        const rec = new SR();
        rec.lang = 'en-US';
        rec.continuous = true;
        rec.interimResults = true;
        rec.onresult = (e: any) => {
            const text = Array.from(e.results).map((r: any) => r[0].transcript).join(' ');
            setTranscript(text);
        };
        rec.onend = () => setListening(false);
        rec.onerror = () => setListening(false);
        rec.start();
        recognitionRef.current = rec;
        setListening(true);
    }

    function stopListening() {
        recognitionRef.current?.stop();
        setListening(false);
    }

    async function generate() {
        if (!transcript.trim()) return;
        setGenerating(true);
        try {
            const res = await fetch('/api/admin/bar-map/ai-generate', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transcript }),
            });
            const data = await res.json();
            if (data.ok && data.map_data) { onGenerate(data.map_data); onClose(); }
            else setError('Could not generate map. Try describing your bar in more detail.');
        } catch { setError('Network error.'); }
        setGenerating(false);
    }

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#1e293b', borderRadius: 16, width: 520, border: '1px solid #334155', padding: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                    <span style={{ fontWeight: 700, color: 'white', fontSize: 18 }}>🎤 AI Bar Map Generator</span>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 22, cursor: 'pointer' }}>×</button>
                </div>
                <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>
                    Describe your bar layout out loud or type it below. Include dimensions, objects (bar counter, bottle rows, ice wells), and any rooms (liquor room, office). The AI will generate the initial floor plan for you to refine.
                </p>
                <div style={{ background: '#0f172a', borderRadius: 10, padding: '12px 14px', marginBottom: 16, minHeight: 80, border: '1px solid #334155' }}>
                    <textarea value={transcript} onChange={e => setTranscript(e.target.value)} placeholder="Example: My bar is 40 by 25 feet. It has a bar counter that runs 20 feet along the south wall, two rows of bottle shelves behind it, two ice wells, a register on the right, a liquor room in the back-left corner, and an office next to it…"
                        style={{ background: 'transparent', border: 'none', color: 'white', fontSize: 13, width: '100%', resize: 'none', minHeight: 100, outline: 'none' }} />
                </div>
                {error && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 12 }}>{error}</div>}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
                    <button onClick={listening ? stopListening : startListening}
                        style={{ background: listening ? '#7f1d1d' : '#1e3a5f', border: `1px solid ${listening ? '#dc2626' : '#1e40af'}`, borderRadius: 8, padding: '10px 18px', color: listening ? '#fca5a5' : '#93c5fd', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                        {listening ? '⏹ Stop Recording' : '🎤 Start Recording'}
                        {listening && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1s infinite' }} />}
                    </button>
                    <button onClick={generate} disabled={!transcript.trim() || generating}
                        style={{ background: '#1e3a5f', border: '1px solid #1e40af', borderRadius: 8, padding: '10px 20px', color: generating ? '#64748b' : '#93c5fd', fontSize: 13, cursor: transcript.trim() && !generating ? 'pointer' : 'not-allowed' }}>
                        {generating ? '⏳ Generating…' : '✨ Generate Map'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Save Description Modal ───────────────────────────────────────────────────

function SaveModal({ onSave, onClose }: { onSave: (desc: string) => void; onClose: () => void }) {
    const [desc, setDesc] = useState('');
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#1e293b', borderRadius: 12, width: 380, padding: 24, border: '1px solid #334155' }}>
                <div style={{ fontWeight: 700, color: 'white', fontSize: 16, marginBottom: 12 }}>💾 Save Bar Map</div>
                <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional description (e.g. 'Added liquor room shelves')"
                    style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: 13, marginBottom: 16, boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button onClick={onClose} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '8px 16px', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={() => onSave(desc)}
                        style={{ background: '#166534', border: '1px solid #15803d', borderRadius: 8, padding: '8px 20px', color: '#86efac', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>Save</button>
                </div>
            </div>
        </div>
    );
}

// ─── Welcome / New Map Screen ─────────────────────────────────────────────────

function WelcomeScreen({ onBlank, onVoice, onPreset }: { onBlank: () => void; onVoice: () => void; onPreset: (size: string) => void }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 20, padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 56 }}>🗺️</div>
            <h2 style={{ color: 'white', fontSize: 24, fontWeight: 700, margin: 0 }}>Create Your Bar Map</h2>
            <p style={{ color: '#94a3b8', fontSize: 14, maxWidth: 480, margin: 0 }}>
                Design a visual floor plan of your bar to make auditing faster. Place bottle rows and assign products to each shelf position, then use the map during audits instead of scrolling through lists.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
                <button onClick={onVoice}
                    style={{ background: '#1e3a5f', border: '2px solid #1e40af', borderRadius: 12, padding: '14px 22px', color: '#93c5fd', fontSize: 14, cursor: 'pointer', fontWeight: 600 }}>
                    🎤 Describe by Voice / Text<br /><span style={{ fontSize: 11, fontWeight: 400, color: '#64748b' }}>AI generates the initial layout</span>
                </button>
                <button onClick={onBlank}
                    style={{ background: '#1e293b', border: '2px solid #334155', borderRadius: 12, padding: '14px 22px', color: '#e2e8f0', fontSize: 14, cursor: 'pointer', fontWeight: 600 }}>
                    ✏️ Start Blank Canvas<br /><span style={{ fontSize: 11, fontWeight: 400, color: '#64748b' }}>Draw your own layout</span>
                </button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                {[['Small Bar', 'sm'], ['Medium Bar', 'md'], ['Large Bar', 'lg']].map(([label, key]) => (
                    <button key={key} onClick={() => onPreset(key)}
                        style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '8px 14px', color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
                        {label}
                    </button>
                ))}
            </div>
            <p style={{ color: '#475569', fontSize: 11, marginTop: 4 }}>Quick start presets — you can customize everything after</p>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
    initialMap: MapData | null;
    products: { id: number; name: string; type: string }[];
}

export default function BarMapClient({ initialMap, products }: Props) {
    const [mapData, setMapData] = useState<MapData | null>(initialMap);
    const [mode, setMode] = useState<Mode>(initialMap ? 'view' : 'edit');
    const [tool, setTool] = useState<Tool>('select');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState<Pt>({ x: 40, y: 40 });
    const [pendingType, setPendingType] = useState<ObjType | null>(null);
    const [drawingOutline, setDrawingOutline] = useState<Pt[]>([]);
    const [mousePos, setMousePos] = useState<Pt>({ x: 0, y: 0 });
    const [showHistory, setShowHistory] = useState(false);
    const [showVoice, setShowVoice] = useState(false);
    const [showSave, setShowSave] = useState(false);
    const [saving, setSaving] = useState(false);
    const [savedToast, setSavedToast] = useState(false);

    // Drag state
    const dragRef = useRef<{ type: 'move' | 'resize'; id: string; handle?: HandlePos; startMouse: Pt; startObj: MapObject } | null>(null);

    const svgRef = useRef<SVGSVGElement>(null);

    const pxPerFt = DEFAULT_PX * zoom;

    // ── Coordinate helpers ───────────────────────────────────────────────────

    function svgPt(e: React.PointerEvent | MouseEvent): Pt {
        const rect = svgRef.current!.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left - pan.x) / pxPerFt,
            y: (e.clientY - rect.top - pan.y) / pxPerFt,
        };
    }

    // ── Pointer events on SVG ────────────────────────────────────────────────

    function handleSvgPointerDown(e: React.PointerEvent<SVGSVGElement>) {
        if (mode !== 'edit') return;
        const pt = svgPt(e);

        if (tool === 'draw') {
            // Outline drawing: add vertex
            const sx = snap(pt.x), sy = snap(pt.y);
            if (drawingOutline.length > 2) {
                const first = drawingOutline[0];
                if (Math.abs(sx - first.x) < 1 && Math.abs(sy - first.y) < 1) {
                    // Close polygon
                    if (mapData) {
                        setMapData({ ...mapData, outline: drawingOutline });
                    }
                    setDrawingOutline([]);
                    setTool('select');
                    return;
                }
            }
            setDrawingOutline(prev => [...prev, { x: sx, y: sy }]);
            return;
        }

        // Place pending object
        if (pendingType) {
            const sx = snap(pt.x - OBJ_META[pendingType].defaultW / 2);
            const sy = snap(pt.y - OBJ_META[pendingType].defaultH / 2);
            const count = (mapData?.objects || []).filter(o => o.type === pendingType).length;
            const obj = makeObject(pendingType, sx, sy, count);
            setMapData(prev => prev ? { ...prev, objects: [...prev.objects, obj] } : prev);
            setSelectedId(obj.id);
            setPendingType(null);
            return;
        }

        // Click on background → deselect
        setSelectedId(null);
    }

    function handleSvgMouseMove(e: React.MouseEvent<SVGSVGElement>) {
        const pt = svgPt(e as any);
        setMousePos({ x: snap(pt.x), y: snap(pt.y) });
    }

    // ── Object drag start ────────────────────────────────────────────────────

    function handleObjPointerDown(e: React.PointerEvent, id: string) {
        if (mode !== 'edit') {
            // In audit/view mode, just select
            setSelectedId(id);
            return;
        }
        e.stopPropagation();
        const obj = mapData!.objects.find(o => o.id === id)!;
        setSelectedId(id);
        dragRef.current = { type: 'move', id, startMouse: svgPt(e), startObj: { ...obj } };
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
    }

    function handleResizePointerDown(e: React.PointerEvent, id: string, handle: HandlePos) {
        if (mode !== 'edit') return;
        e.stopPropagation();
        const obj = mapData!.objects.find(o => o.id === id)!;
        dragRef.current = { type: 'resize', id, handle, startMouse: svgPt(e), startObj: { ...obj } };
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
    }

    // ── Global pointer move/up ───────────────────────────────────────────────

    useEffect(() => {
        function onMove(e: PointerEvent) {
            if (!dragRef.current || !svgRef.current) return;
            const { type, id, handle, startMouse, startObj } = dragRef.current;
            const rect = svgRef.current.getBoundingClientRect();
            const cx = (e.clientX - rect.left - pan.x) / pxPerFt;
            const cy = (e.clientY - rect.top - pan.y) / pxPerFt;
            const dx = cx - startMouse.x;
            const dy = cy - startMouse.y;

            setMapData(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    objects: prev.objects.map(obj => {
                        if (obj.id !== id) return obj;
                        if (type === 'move') {
                            return { ...obj, x: snap(startObj.x + dx), y: snap(startObj.y + dy) };
                        }
                        // Resize
                        let { x, y, width, height } = startObj;
                        const h = handle!;
                        if (h.includes('e')) { width = Math.max(SNAP, snap(startObj.width + dx)); }
                        if (h.includes('w')) { const nw = Math.max(SNAP, snap(startObj.width - dx)); x = snap(startObj.x + startObj.width - nw); width = nw; }
                        if (h.includes('s')) { height = Math.max(SNAP, snap(startObj.height + dy)); }
                        if (h.includes('n')) { const nh = Math.max(SNAP, snap(startObj.height - dy)); y = snap(startObj.y + startObj.height - nh); height = nh; }
                        return { ...obj, x, y, width, height };
                    }),
                };
            });
        }

        function onUp() { dragRef.current = null; }

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    }, [pan, pxPerFt]);

    // ── Zoom on scroll ───────────────────────────────────────────────────────

    function handleWheel(e: React.WheelEvent) {
        e.preventDefault();
        setZoom(z => Math.max(0.25, Math.min(3, z - e.deltaY * 0.001)));
    }

    // ── Actions ──────────────────────────────────────────────────────────────

    function updateObj(updated: MapObject) {
        setMapData(prev => prev ? { ...prev, objects: prev.objects.map(o => o.id === updated.id ? updated : o) } : prev);
    }

    function deleteObj(id: string) {
        setMapData(prev => prev ? { ...prev, objects: prev.objects.filter(o => o.id !== id) } : prev);
        setSelectedId(null);
    }

    function handleAuditChange(objId: string, shelfId: string, slotId: string, qty: number) {
        setMapData(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                objects: prev.objects.map(obj => {
                    if (obj.id !== objId) return obj;
                    return {
                        ...obj,
                        shelves: obj.shelves.map(s => {
                            if (s.id !== shelfId) return s;
                            return { ...s, products: s.products.map(p => p.id !== slotId ? p : { ...p, quantity: qty }) };
                        }),
                    };
                }),
            };
        });
    }

    async function doSave(desc: string) {
        if (!mapData) return;
        setSaving(true);
        await fetch('/api/admin/bar-map', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: mapData.name, map_data: mapData, width_ft: mapData.width_ft, height_ft: mapData.height_ft, description: desc || undefined }),
        });
        setSaving(false);
        setShowSave(false);
        setSavedToast(true);
        setTimeout(() => setSavedToast(false), 2500);
    }

    function applyPreset(size: string) {
        const presets: Record<string, MapData> = {
            sm: { name: 'Small Bar', width_ft: 25, height_ft: 15, grid_ft: 1, outline: [{ x: 0, y: 0 }, { x: 25, y: 0 }, { x: 25, y: 15 }, { x: 0, y: 15 }], objects: [] },
            md: { name: 'Medium Bar', width_ft: 40, height_ft: 25, grid_ft: 1, outline: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 25 }, { x: 0, y: 25 }], objects: [] },
            lg: { name: 'Large Bar', width_ft: 60, height_ft: 35, grid_ft: 1, outline: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 35 }, { x: 0, y: 35 }], objects: [] },
        };
        setMapData(presets[size] || presets.md);
        setMode('edit');
    }

    // ── Keyboard shortcuts ───────────────────────────────────────────────────

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') {
                setDrawingOutline([]);
                setPendingType(null);
                setSelectedId(null);
                if (tool === 'draw') setTool('select');
            }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (document.activeElement === document.body && selectedId && mode === 'edit') {
                    deleteObj(selectedId);
                }
                if (tool === 'draw' && drawingOutline.length > 0) {
                    setDrawingOutline(prev => prev.slice(0, -1));
                }
            }
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [selectedId, mode, tool, drawingOutline]);

    // ── Render ───────────────────────────────────────────────────────────────

    const selectedObj = selectedId ? mapData?.objects.find(o => o.id === selectedId) ?? null : null;

    // No map yet
    if (!mapData) {
        return (
            <div style={{ background: '#0f172a', borderRadius: 16, border: '1px solid #1e293b', height: 'calc(100vh - 180px)', overflow: 'hidden' }}>
                <WelcomeScreen
                    onBlank={() => { setMapData({ ...EMPTY_MAP }); setMode('edit'); }}
                    onVoice={() => setShowVoice(true)}
                    onPreset={applyPreset}
                />
                {showVoice && (
                    <VoiceDialog onClose={() => setShowVoice(false)} onGenerate={data => { setMapData(data); setMode('edit'); }} />
                )}
            </div>
        );
    }

    const outlinePoints = mapData.outline.map(p => `${p.x * pxPerFt},${p.y * pxPerFt}`).join(' ');
    const drawPoints = drawingOutline.map(p => `${p.x * pxPerFt},${p.y * pxPerFt}`).join(' ');
    const mapW = mapData.width_ft * pxPerFt;
    const mapH = mapData.height_ft * pxPerFt;

    const cursorStyle = tool === 'draw' ? 'crosshair' : pendingType ? 'copy' : mode === 'edit' ? 'default' : 'default';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', gap: 0, userSelect: 'none' }}>

            {/* ── Top Toolbar ── */}
            <div style={{ background: '#1e293b', borderRadius: '12px 12px 0 0', border: '1px solid #334155', borderBottom: 'none', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {/* Map name */}
                {mode === 'edit' ? (
                    <input value={mapData.name} onChange={e => setMapData(prev => prev ? { ...prev, name: e.target.value } : prev)}
                        style={{ background: 'transparent', border: 'none', borderBottom: '1px solid #334155', color: 'white', fontSize: 15, fontWeight: 700, width: 160, outline: 'none' }} />
                ) : (
                    <span style={{ fontWeight: 700, color: 'white', fontSize: 15 }}>🗺️ {mapData.name}</span>
                )}

                <div style={{ height: 20, width: 1, background: '#334155', margin: '0 4px' }} />

                {/* Mode toggles */}
                {(['view', 'edit', 'audit'] as Mode[]).map(m => (
                    <button key={m} onClick={() => { setMode(m); setTool('select'); setPendingType(null); setDrawingOutline([]); }}
                        style={{ background: mode === m ? '#1e3a5f' : 'transparent', border: `1px solid ${mode === m ? '#1e40af' : '#334155'}`, borderRadius: 7, padding: '5px 12px', color: mode === m ? '#93c5fd' : '#64748b', fontSize: 12, cursor: 'pointer', fontWeight: mode === m ? 600 : 400, textTransform: 'capitalize' }}>
                        {m === 'view' ? '👁 View' : m === 'edit' ? '✏️ Edit' : '📋 Audit'}
                    </button>
                ))}

                <div style={{ flex: 1 }} />

                {/* Edit tools */}
                {mode === 'edit' && (
                    <>
                        <button onClick={() => { setTool('select'); setDrawingOutline([]); setPendingType(null); }}
                            title="Select & Move objects (V)"
                            style={{ background: tool === 'select' ? '#1e3a5f' : 'transparent', border: `1px solid ${tool === 'select' ? '#1e40af' : '#334155'}`, borderRadius: 7, padding: '5px 10px', color: tool === 'select' ? '#93c5fd' : '#64748b', fontSize: 12, cursor: 'pointer' }}>
                            ↖ Select
                        </button>
                        <button onClick={() => { setTool('draw'); setPendingType(null); }}
                            title="Draw room outline (D) — click to place vertices, click start to close"
                            style={{ background: tool === 'draw' ? '#3b1d5f' : 'transparent', border: `1px solid ${tool === 'draw' ? '#7c3aed' : '#334155'}`, borderRadius: 7, padding: '5px 10px', color: tool === 'draw' ? '#c4b5fd' : '#64748b', fontSize: 12, cursor: 'pointer' }}>
                            ✏ Draw Outline
                        </button>
                        <button onClick={() => setShowVoice(true)}
                            title="Use voice / AI to regenerate layout"
                            style={{ background: 'transparent', border: '1px solid #334155', borderRadius: 7, padding: '5px 10px', color: '#64748b', fontSize: 12, cursor: 'pointer' }}>
                            🎤 AI
                        </button>

                        {/* Dimensions */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="number" min={5} max={200} step={1} value={mapData.width_ft}
                                onChange={e => setMapData(prev => prev ? { ...prev, width_ft: parseFloat(e.target.value) || 40 } : prev)}
                                title="Total width in feet"
                                style={{ width: 52, background: '#0f172a', border: '1px solid #334155', borderRadius: 6, padding: '4px 6px', color: 'white', fontSize: 12 }} />
                            <span style={{ color: '#475569', fontSize: 12 }}>×</span>
                            <input type="number" min={5} max={200} step={1} value={mapData.height_ft}
                                onChange={e => setMapData(prev => prev ? { ...prev, height_ft: parseFloat(e.target.value) || 25 } : prev)}
                                title="Total depth in feet"
                                style={{ width: 52, background: '#0f172a', border: '1px solid #334155', borderRadius: 6, padding: '4px 6px', color: 'white', fontSize: 12 }} />
                            <span style={{ color: '#475569', fontSize: 12 }}>ft</span>
                        </div>
                    </>
                )}

                {/* Zoom */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button onClick={() => setZoom(z => Math.max(0.25, z - 0.1))} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 5, width: 26, height: 26, color: 'white', cursor: 'pointer' }}>−</button>
                    <span style={{ color: '#94a3b8', fontSize: 12, minWidth: 40, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
                    <button onClick={() => setZoom(z => Math.min(3, z + 0.1))} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 5, width: 26, height: 26, color: 'white', cursor: 'pointer' }}>+</button>
                    <button onClick={() => { setZoom(1); setPan({ x: 40, y: 40 }); }} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 5, padding: '2px 8px', color: '#64748b', cursor: 'pointer', fontSize: 11 }}>Reset</button>
                </div>

                {/* History + Save */}
                <button onClick={() => setShowHistory(true)}
                    style={{ background: 'transparent', border: '1px solid #334155', borderRadius: 7, padding: '5px 10px', color: '#64748b', fontSize: 12, cursor: 'pointer' }}>
                    📜 History
                </button>
                <button onClick={() => setShowSave(true)} disabled={saving}
                    style={{ background: '#166534', border: '1px solid #15803d', borderRadius: 7, padding: '5px 14px', color: '#86efac', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                    {saving ? '⏳' : '💾 Save'}
                </button>
            </div>

            {/* ── Canvas + Sidebars ── */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden', border: '1px solid #334155', borderRadius: '0 0 12px 12px', borderTop: 'none' }}>

                {/* Left Palette (edit mode only) */}
                {mode === 'edit' && (
                    <div style={{ width: 170, background: '#0f172a', borderRight: '1px solid #1e293b', overflowY: 'auto', padding: 10, flexShrink: 0 }}>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Add Objects</div>
                        <div style={{ fontSize: 10, color: '#334155', marginBottom: 10 }}>Click an object then click on the canvas to place it</div>
                        {PALETTE_GROUPS.map(group => (
                            <div key={group.label} style={{ marginBottom: 12 }}>
                                <div style={{ fontSize: 10, color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>{group.label}</div>
                                {group.types.map(type => {
                                    const meta = OBJ_META[type];
                                    const active = pendingType === type;
                                    return (
                                        <button key={type} onClick={() => { setPendingType(active ? null : type); setTool('select'); setDrawingOutline([]); }}
                                            title={`${meta.label} (${meta.defaultW}ft × ${meta.defaultH}ft default)`}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 7, width: '100%', background: active ? meta.color : '#1e293b',
                                                border: `1px solid ${active ? 'rgba(255,255,255,0.3)' : '#334155'}`, borderRadius: 7, padding: '6px 8px',
                                                color: 'white', fontSize: 11, cursor: 'pointer', marginBottom: 3, textAlign: 'left',
                                            }}>
                                            <span style={{ fontSize: 14 }}>{meta.emoji}</span>
                                            <span style={{ flex: 1 }}>{meta.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        ))}

                        {/* Current tool tip */}
                        {(pendingType || tool === 'draw') && (
                            <div style={{ background: '#1e293b', borderRadius: 8, padding: '8px 10px', marginTop: 8, fontSize: 11, color: '#fbbf24', border: '1px solid #92400e' }}>
                                {tool === 'draw'
                                    ? `Click canvas to place outline vertices. Click near the start to close. Backspace to undo last point. Esc to cancel.`
                                    : `Click on the canvas to place a ${OBJ_META[pendingType!].label}. Esc to cancel.`
                                }
                            </div>
                        )}
                    </div>
                )}

                {/* SVG Canvas */}
                <div style={{ flex: 1, background: '#0a0f1a', overflow: 'hidden', position: 'relative' }}>
                    {/* Coords readout */}
                    <div style={{ position: 'absolute', bottom: 8, left: 8, background: 'rgba(0,0,0,0.6)', borderRadius: 6, padding: '3px 8px', fontSize: 11, color: '#475569', zIndex: 10, pointerEvents: 'none' }}>
                        {mousePos.x.toFixed(1)}ft, {mousePos.y.toFixed(1)}ft
                    </div>

                    {mode === 'audit' && (
                        <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(234,179,8,0.15)', border: '1px solid #854d0e', borderRadius: 8, padding: '5px 12px', fontSize: 12, color: '#fbbf24', zIndex: 10 }}>
                            📋 Audit Mode — click shelves in the panel to count bottles
                        </div>
                    )}

                    {/* Saved toast */}
                    {savedToast && (
                        <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', background: '#14532d', border: '1px solid #166534', borderRadius: 8, padding: '8px 20px', fontSize: 13, color: '#86efac', zIndex: 20 }}>
                            ✓ Map saved!
                        </div>
                    )}

                    <svg
                        ref={svgRef}
                        width="100%" height="100%"
                        style={{ cursor: cursorStyle, display: 'block' }}
                        onPointerDown={handleSvgPointerDown}
                        onMouseMove={handleSvgMouseMove}
                        onWheel={handleWheel}
                    >
                        <defs>
                            {/* Minor grid (0.5ft) */}
                            <pattern id="grid-minor" width={pxPerFt * SNAP} height={pxPerFt * SNAP} patternUnits="userSpaceOnUse" x={pan.x} y={pan.y}>
                                <path d={`M ${pxPerFt * SNAP} 0 L 0 0 0 ${pxPerFt * SNAP}`} fill="none" stroke="#111827" strokeWidth={0.5} />
                            </pattern>
                            {/* Major grid (1ft) */}
                            <pattern id="grid-major" width={pxPerFt} height={pxPerFt} patternUnits="userSpaceOnUse" x={pan.x} y={pan.y}>
                                <rect width={pxPerFt} height={pxPerFt} fill="url(#grid-minor)" />
                                <path d={`M ${pxPerFt} 0 L 0 0 0 ${pxPerFt}`} fill="none" stroke="#1e293b" strokeWidth={1} />
                            </pattern>
                        </defs>

                        {/* Grid background */}
                        <rect x={0} y={0} width="100%" height="100%" fill="url(#grid-major)" />

                        {/* Translated map group */}
                        <g transform={`translate(${pan.x},${pan.y})`}>

                            {/* Room shadow */}
                            <polygon points={outlinePoints} fill="#0f172a" opacity={0.95} />
                            {/* Room outline */}
                            <polygon points={outlinePoints} fill="rgba(30,58,138,0.12)" stroke="#1e40af" strokeWidth={2} strokeDasharray={mode === 'edit' ? '8 4' : '0'} />

                            {/* Dimension rulers on outline */}
                            {mapData.outline.length >= 2 && mapData.outline.map((pt, i) => {
                                const next = mapData.outline[(i + 1) % mapData.outline.length];
                                const mx = ((pt.x + next.x) / 2) * pxPerFt;
                                const my = ((pt.y + next.y) / 2) * pxPerFt;
                                const dist = Math.sqrt((next.x - pt.x) ** 2 + (next.y - pt.y) ** 2);
                                return dist > 1 ? (
                                    <text key={i} x={mx} y={my - 6} textAnchor="middle" fill="#334155" fontSize={10}>{dist.toFixed(1)}ft</text>
                                ) : null;
                            })}

                            {/* Foot markers along edges */}
                            {Array.from({ length: Math.ceil(mapData.width_ft) + 1 }, (_, i) => (
                                <text key={`fx${i}`} x={i * pxPerFt} y={-8} textAnchor="middle" fill="#1e3a5f" fontSize={9}>{i}</text>
                            ))}
                            {Array.from({ length: Math.ceil(mapData.height_ft) + 1 }, (_, i) => (
                                <text key={`fy${i}`} x={-12} y={i * pxPerFt + 4} textAnchor="middle" fill="#1e3a5f" fontSize={9}>{i}</text>
                            ))}

                            {/* Objects */}
                            {mapData.objects.map(obj => (
                                <ObjRenderer key={obj.id} obj={obj} selected={selectedId === obj.id} mode={mode} zoom={zoom}
                                    onPointerDown={handleObjPointerDown} />
                            ))}

                            {/* Resize handles for selected */}
                            {selectedId && mode === 'edit' && (() => {
                                const obj = mapData.objects.find(o => o.id === selectedId);
                                return obj ? <ResizeHandles obj={obj} onHandleDown={handleResizePointerDown} /> : null;
                            })()}

                            {/* Drawing outline preview */}
                            {tool === 'draw' && drawingOutline.length > 0 && (
                                <>
                                    <polyline points={[...drawingOutline, mousePos].map(p => `${p.x * pxPerFt},${p.y * pxPerFt}`).join(' ')}
                                        fill="none" stroke="#7c3aed" strokeWidth={2} strokeDasharray="6 3" />
                                    {drawingOutline.map((p, i) => (
                                        <circle key={i} cx={p.x * pxPerFt} cy={p.y * pxPerFt} r={i === 0 ? 7 : 4}
                                            fill={i === 0 ? '#7c3aed' : 'white'} stroke="#7c3aed" strokeWidth={2} />
                                    ))}
                                    {drawingOutline.length > 0 && (
                                        <text x={mousePos.x * pxPerFt + 10} y={mousePos.y * pxPerFt - 6} fill="#a78bfa" fontSize={10}>
                                            ({mousePos.x.toFixed(1)}, {mousePos.y.toFixed(1)})
                                        </text>
                                    )}
                                </>
                            )}

                            {/* Pending object ghost */}
                            {pendingType && (
                                <rect
                                    x={(mousePos.x - OBJ_META[pendingType].defaultW / 2) * pxPerFt}
                                    y={(mousePos.y - OBJ_META[pendingType].defaultH / 2) * pxPerFt}
                                    width={OBJ_META[pendingType].defaultW * pxPerFt}
                                    height={OBJ_META[pendingType].defaultH * pxPerFt}
                                    fill={OBJ_META[pendingType].color} opacity={0.5}
                                    stroke="white" strokeWidth={1.5} rx={3}
                                    style={{ pointerEvents: 'none' }}
                                />
                            )}
                        </g>
                    </svg>
                </div>

                {/* Right Properties Panel */}
                {selectedObj && (
                    <div style={{ width: 260, background: '#0f172a', borderLeft: '1px solid #1e293b', overflowY: 'auto', flexShrink: 0 }}>
                        <PropsPanel
                            obj={selectedObj}
                            products={products}
                            onUpdate={updateObj}
                            onDelete={deleteObj}
                            mode={mode}
                            onAuditChange={handleAuditChange}
                        />
                    </div>
                )}
            </div>

            {/* Modals */}
            {showHistory && <HistoryPanel onClose={() => setShowHistory(false)} onRestore={data => setMapData(data)} />}
            {showVoice && <VoiceDialog onClose={() => setShowVoice(false)} onGenerate={data => { setMapData(data); setMode('edit'); }} />}
            {showSave && <SaveModal onSave={doSave} onClose={() => setShowSave(false)} />}
        </div>
    );
}
