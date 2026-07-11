'use client';
import React, { useState, useEffect, useRef, useMemo } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ObjType =
    | 'bar_counter' | 'back_bar' | 'service_area'
    | 'ice_well' | 'register' | 'sink' | 'counter_cooler'
    | 'bottle_row' | 'mixer_row' | 'shelf_unit'
    | 'liquor_room' | 'cooler'
    | 'office' | 'bathroom'
    | 'door' | 'window' | 'pillar' | 'table'
    | 'pool_table' | 'jukebox' | 'atm';

export interface Pt { x: number; y: number; }

export interface ShelfProduct {
    id: string;
    product_id: number | null;
    product_name: string | null;
    product_type?: string | null;
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
    parentId?: string;
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
type HandlePos = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

type DragState =
    | { type: 'move'; ids: string[]; startMouse: Pt; startPositions: Record<string, Pt> }
    | { type: 'resize'; id: string; handle: HandlePos; startMouse: Pt; startObj: MapObject }
    | { type: 'rotate'; id: string; centerPx: Pt; startAngle: number; startRotation: number }
    | { type: 'pan'; startMouse: Pt; startPan: Pt }
    | { type: 'rubber'; startFt: Pt };

// ─── Constants ────────────────────────────────────────────────────────────────

const PX = 40;   // pixels per foot at zoom=1
const SNAP = 0.5;
const EDGE_SNAP_FT = 0.75;

const META: Record<ObjType, { label: string; color: string; emoji: string; w: number; h: number; shelves: boolean }> = {
    bar_counter:   { label: 'Bar Counter',     color: '#78350f', emoji: '🍺', w: 12,  h: 2.5, shelves: false },
    back_bar:      { label: 'Back Bar',        color: '#92400e', emoji: '🥃', w: 10,  h: 1.5, shelves: false },
    service_area:  { label: 'Service Area',    color: '#374151', emoji: '🎯', w: 6,   h: 3,   shelves: false },
    ice_well:      { label: 'Ice Well',        color: '#1e3a5f', emoji: '🧊', w: 2,   h: 1.5, shelves: false },
    register:      { label: 'Register / POS',  color: '#312e81', emoji: '💳', w: 2.5, h: 2,   shelves: false },
    sink:          { label: 'Sink',            color: '#1e3a5f', emoji: '🚰', w: 2,   h: 1.5, shelves: false },
    counter_cooler:{ label: 'Counter Cooler',  color: '#1e3a8a', emoji: '🥤', w: 3,   h: 2,   shelves: true  },
    bottle_row:    { label: 'Bottle Row',      color: '#14532d', emoji: '🍾', w: 8,   h: 1.5, shelves: true  },
    mixer_row:     { label: 'Mixer Row',       color: '#7c2d12', emoji: '🧃', w: 6,   h: 1.5, shelves: true  },
    shelf_unit:    { label: 'Shelf Unit',      color: '#1c1917', emoji: '📦', w: 6,   h: 1.5, shelves: true  },
    liquor_room:   { label: 'Liquor Room',     color: '#134e4a', emoji: '🔒', w: 10,  h: 8,   shelves: true  },
    cooler:        { label: 'Walk-in Cooler',  color: '#1e3a8a', emoji: '❄️', w: 10,  h: 8,   shelves: true  },
    office:        { label: 'Office',          color: '#1f2937', emoji: '🖥️', w: 8,   h: 6,   shelves: false },
    bathroom:      { label: 'Bathroom',        color: '#1f2937', emoji: '🚻', w: 6,   h: 5,   shelves: false },
    door:          { label: 'Door',            color: '#f59e0b', emoji: '🚪', w: 3,   h: 0.5, shelves: false },
    window:        { label: 'Window',          color: '#7dd3fc', emoji: '🪟', w: 4,   h: 0.5, shelves: false },
    pillar:        { label: 'Column/Pillar',   color: '#6b7280', emoji: '🏛️', w: 1,   h: 1,   shelves: false },
    table:         { label: 'Table/Seating',   color: '#1e1b4b', emoji: '🪑', w: 3,   h: 2,   shelves: false },
    pool_table:    { label: 'Pool Table',      color: '#14532d', emoji: '🎱', w: 9,   h: 4.5, shelves: false },
    jukebox:       { label: 'Jukebox',         color: '#4c1d95', emoji: '🎵', w: 2,   h: 2.5, shelves: false },
    atm:           { label: 'ATM',             color: '#374151', emoji: '💵', w: 1.5, h: 2,   shelves: false },
};

const PALETTE = [
    { label: 'Bar Structure',  types: ['bar_counter','back_bar','service_area'] as ObjType[] },
    { label: 'Equipment',      types: ['ice_well','register','sink','counter_cooler'] as ObjType[] },
    { label: 'Storage',        types: ['bottle_row','mixer_row','shelf_unit'] as ObjType[] },
    { label: 'Rooms',          types: ['liquor_room','cooler','office','bathroom'] as ObjType[] },
    { label: 'Architectural',  types: ['door','window','pillar','table'] as ObjType[] },
    { label: 'Entertainment',  types: ['pool_table','jukebox','atm'] as ObjType[] },
];

const PRODUCT_COLORS = ['#b45309','#1d4ed8','#15803d','#b91c1c','#7c3aed','#0e7490','#c2410c','#4338ca'];
function productColor(name: string) {
    let h = 5381;
    for (let i = 0; i < name.length; i++) h = ((h << 5) + h + name.charCodeAt(i)) & 0x7fffffff;
    return PRODUCT_COLORS[h % PRODUCT_COLORS.length];
}

const EMPTY_MAP: MapData = {
    name: 'My Bar', width_ft: 40, height_ft: 25, grid_ft: 1,
    outline: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 25 }, { x: 0, y: 25 }],
    objects: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const s = (v: number) => Math.round(v / SNAP) * SNAP;
const uid = () => 'o_' + Math.random().toString(36).slice(2, 8);
const sid = () => 's_' + Math.random().toString(36).slice(2, 8);
const pid = () => 'p_' + Math.random().toString(36).slice(2, 8);

function makeShelves(n = 3): Shelf[] {
    const labels = ['Top Shelf', 'Middle Shelf', 'Bottom Shelf', 'Floor Level', 'Shelf 5'];
    return Array.from({ length: n }, (_, i) => ({
        id: sid(), label: labels[i] || `Shelf ${i + 1}`,
        products: Array.from({ length: 8 }, () => ({ id: pid(), product_id: null, product_name: null })),
    }));
}

function makeObj(type: ObjType, x: number, y: number, count: number): MapObject {
    const m = META[type];
    return {
        id: uid(), type, name: `${m.label} ${count + 1}`,
        x, y, width: m.w, height: m.h,
        rotation: 0, shelves: m.shelves ? makeShelves(3) : [],
        doorDirection: 's', notes: '', color: undefined,
    };
}

function snapToEdges(obj: MapObject, others: MapObject[], excludeIds: Set<string>) {
    const T = EDGE_SNAP_FT;
    let bx = T + 1, by = T + 1, ax = obj.x, ay = obj.y;
    const ox2 = obj.x + obj.width, oy2 = obj.y + obj.height;

    for (const o of others) {
        if (excludeIds.has(o.id)) continue;
        const ox = o.x, oy = o.y, ow2 = o.x + o.width, oh2 = o.y + o.height;
        // x candidates: left-left, left-right, right-left, right-right
        for (const [dx, snap] of [[ox - obj.x, ox], [ow2 - obj.x, ow2], [ox - ox2, ox - obj.width], [ow2 - ox2, ow2 - obj.width]] as [number,number][]) {
            if (Math.abs(dx) < Math.abs(bx)) { bx = dx; ax = snap; }
        }
        // y candidates
        for (const [dy, snap] of [[oy - obj.y, oy], [oh2 - obj.y, oh2], [oy - oy2, oy - obj.height], [oh2 - oy2, oh2 - obj.height]] as [number,number][]) {
            if (Math.abs(dy) < Math.abs(by)) { by = dy; ay = snap; }
        }
    }
    return { x: Math.abs(bx) <= T ? ax : obj.x, y: Math.abs(by) <= T ? ay : obj.y };
}

// ─── Bottle Icon (top-down) ───────────────────────────────────────────────────

function BottleIcon({ cx, cy, r, color }: { cx: number; cy: number; r: number; color: string }) {
    return (
        <g style={{ pointerEvents: 'none' }}>
            <circle cx={cx} cy={cy} r={r} fill={color} opacity={0.9} />
            <circle cx={cx} cy={cy} r={r * 0.42} fill="rgba(0,0,0,0.35)" />
            <ellipse cx={cx - r * 0.22} cy={cy - r * 0.22}
                rx={r * 0.22} ry={r * 0.13}
                fill="rgba(255,255,255,0.38)"
                transform={`rotate(-30,${cx - r * 0.22},${cy - r * 0.22})`}
            />
        </g>
    );
}

// ─── Specialised Object Graphics ──────────────────────────────────────────────

function PoolTableGraphic({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
    const rail = Math.min(w, h) * 0.09;
    const pr = Math.min(w, h) * 0.055;
    const pockets = [
        [x, y], [x + w / 2, y], [x + w, y],
        [x + w, y + h], [x + w / 2, y + h], [x, y + h],
    ];
    return (
        <g style={{ pointerEvents: 'none' }}>
            <rect x={x} y={y} width={w} height={h} fill="#78350f" rx={4} />
            <rect x={x + rail} y={y + rail} width={w - rail * 2} height={h - rail * 2} fill="#15803d" rx={2} />
            {/* Diamond rail markers */}
            {[0.25, 0.5, 0.75].map(t => (
                <React.Fragment key={t}>
                    <circle cx={x + rail / 2} cy={y + rail + (h - rail * 2) * t} r={2} fill="rgba(255,255,255,0.5)" />
                    <circle cx={x + w - rail / 2} cy={y + rail + (h - rail * 2) * t} r={2} fill="rgba(255,255,255,0.5)" />
                    <circle cx={x + rail + (w - rail * 2) * t} cy={y + rail / 2} r={2} fill="rgba(255,255,255,0.5)" />
                    <circle cx={x + rail + (w - rail * 2) * t} cy={y + h - rail / 2} r={2} fill="rgba(255,255,255,0.5)" />
                </React.Fragment>
            ))}
            {/* Felt spots */}
            <circle cx={x + w / 2} cy={y + h / 2} r={3} fill="rgba(255,255,255,0.2)" />
            <circle cx={x + w / 4} cy={y + h / 2} r={2} fill="rgba(255,255,255,0.15)" />
            <circle cx={x + w * 0.75} cy={y + h / 2} r={2} fill="rgba(255,255,255,0.15)" />
            {/* Pockets */}
            {pockets.map(([px, py], i) => <circle key={i} cx={px} cy={py} r={pr} fill="#0a0f1a" />)}
        </g>
    );
}

function RegisterGraphic({ x, y, w, h, selected }: { x: number; y: number; w: number; h: number; selected: boolean }) {
    const pad = Math.min(w, h) * 0.1;
    const sw = w - pad * 2, sh = h * 0.44;
    const kx = x + pad, ky = y + h * 0.54;
    const kw = w - pad * 2, kh = h * 0.35;
    return (
        <g style={{ pointerEvents: 'none' }}>
            <rect x={x} y={y} width={w} height={h} fill="#1e1b4b" rx={3} />
            {/* Screen */}
            <rect x={x + pad} y={y + pad} width={sw} height={sh} fill="#312e81" rx={2} />
            <rect x={x + pad + 2} y={y + pad + 2} width={sw * 0.35} height={sh * 0.3} fill="rgba(255,255,255,0.12)" rx={1} />
            <text x={x + w / 2} y={y + pad + sh * 0.65} textAnchor="middle" fill="#a78bfa" fontSize={Math.max(6, Math.min(10, w / 4))}>POS</text>
            {/* Keypad */}
            <rect x={kx} y={ky} width={kw} height={kh} fill="#2e1065" rx={2} />
            {Array.from({ length: 12 }, (_, i) => {
                const col = i % 3, row = Math.floor(i / 3);
                return (
                    <circle key={i}
                        cx={kx + kw * (0.2 + col * 0.3)} cy={ky + kh * (0.15 + row * 0.25)}
                        r={Math.max(1.5, Math.min(3, w / 12))} fill="#4c1d95" />
                );
            })}
        </g>
    );
}

function JukeboxGraphic({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
    const cw = w * 0.8, cx = x + w * 0.1;
    return (
        <g style={{ pointerEvents: 'none' }}>
            <rect x={x} y={y + h * 0.15} width={w} height={h * 0.85} fill="#4c1d95" rx={3} />
            {/* Arched top */}
            <path d={`M ${x} ${y + h * 0.15} Q ${x + w / 2} ${y - h * 0.05} ${x + w} ${y + h * 0.15}`} fill="#6d28d9" />
            {/* Display */}
            <rect x={cx} y={y + h * 0.18} width={cw} height={h * 0.32} fill="#7c3aed" rx={2} />
            <rect x={cx + 2} y={y + h * 0.2} width={cw * 0.3} height={h * 0.12} fill="rgba(255,255,255,0.2)" rx={1} />
            {/* Speaker grille dots */}
            {Array.from({ length: 12 }, (_, i) => {
                const col = i % 4, row = Math.floor(i / 4);
                return (
                    <circle key={i}
                        cx={x + w * (0.15 + col * 0.22)} cy={y + h * (0.6 + row * 0.1)}
                        r={Math.max(1, w / 18)} fill="rgba(255,255,255,0.2)" />
                );
            })}
        </g>
    );
}

function AtmGraphic({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
    const pad = Math.min(w, h) * 0.1;
    const sw = w - pad * 2, sh = h * 0.42;
    return (
        <g style={{ pointerEvents: 'none' }}>
            <rect x={x} y={y} width={w} height={h} fill="#374151" rx={3} />
            {/* Screen */}
            <rect x={x + pad} y={y + pad} width={sw} height={sh} fill="#0f172a" rx={2} />
            <rect x={x + pad + 2} y={y + pad + 2} width={sw * 0.4} height={sh * 0.3} fill="rgba(59,130,246,0.3)" rx={1} />
            <text x={x + w / 2} y={y + pad + sh * 0.65} textAnchor="middle" fill="#3b82f6" fontSize={Math.max(5, Math.min(9, w / 3))}>ATM</text>
            {/* Keypad */}
            {Array.from({ length: 12 }, (_, i) => {
                const col = i % 3, row = Math.floor(i / 3);
                return (
                    <rect key={i}
                        x={x + pad + col * (sw / 3.5)} y={y + h * 0.58 + row * (h * 0.09)}
                        width={sw / 4.5} height={h * 0.07} fill="#1f2937" rx={1} />
                );
            })}
            {/* Card slot */}
            <rect x={x + w * 0.25} y={y + h * 0.88} width={w * 0.5} height={h * 0.04} fill="#1f2937" rx={1} />
        </g>
    );
}

function CounterCoolerGraphic({ x, y, w, h, shelves, mode, onAudit }:
    { x: number; y: number; w: number; h: number; shelves: Shelf[]; mode: Mode; onAudit?: (s: string, p: string, q: number) => void }) {
    const rail = 4;
    return (
        <g style={{ pointerEvents: 'none' }}>
            <rect x={x} y={y} width={w} height={h} fill="#1e3a8a" rx={2} />
            <rect x={x + rail} y={y + rail} width={w - rail * 2} height={h - rail * 2} fill="#172554" rx={1} />
            {/* Handle */}
            <rect x={x + w * 0.35} y={y + rail + 3} width={w * 0.3} height={3} fill="rgba(255,255,255,0.4)" rx={1.5} />
            {/* Shelf lines + bottle dots */}
            {shelves.map((shelf, si) => {
                const rowH = (h - rail * 2) / shelves.length;
                const ry = y + rail + si * rowH + rowH * 0.15;
                const rh = rowH * 0.7;
                const slots = shelf.products.filter(p => p.product_id);
                const dotR = Math.min(w / (slots.length * 2.5 + 2), rh * 0.38);
                return (
                    <g key={shelf.id}>
                        {si > 0 && <line x1={x + rail} y1={y + rail + si * rowH} x2={x + w - rail} y2={y + rail + si * rowH} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />}
                        {slots.map((p, pi) => {
                            const dcx = x + rail + 6 + pi * (w - rail * 2 - 12) / Math.max(slots.length, 1);
                            const dcy = ry + rh / 2;
                            return <BottleIcon key={p.id} cx={dcx} cy={dcy} r={Math.max(3, dotR)} color={productColor(p.product_name || '')} />;
                        })}
                    </g>
                );
            })}
        </g>
    );
}

// ─── Shelf Products Renderer ───────────────────────────────────────────────────

function ShelfProducts({ obj, px: pxPerFt, mode }: { obj: MapObject; px: number; mode: Mode }) {
    const x = obj.x * pxPerFt, y = obj.y * pxPerFt;
    const w = obj.width * pxPerFt, h = obj.height * pxPerFt;
    if (!obj.shelves.length) return null;

    const rowH = h / obj.shelves.length;

    return (
        <g style={{ pointerEvents: 'none' }}>
            {obj.shelves.map((shelf, si) => {
                const filled = shelf.products.filter(p => p.product_id);
                if (!filled.length) return null;
                const available = w - 8;
                const slotW = available / filled.length;
                const r = Math.max(2.5, Math.min(slotW * 0.42, rowH * 0.38));
                const rowY = y + si * rowH + rowH / 2;

                return filled.map((p, pi) => {
                    const cx = x + 4 + slotW * pi + slotW / 2;
                    const col = productColor(p.product_name || '');
                    return (
                        <g key={p.id}>
                            <BottleIcon cx={cx} cy={rowY} r={r} color={col} />
                            {mode === 'audit' && p.quantity !== undefined && (
                                <text x={cx} y={rowY + r + 8} textAnchor="middle" fill={p.quantity === 0 ? '#ef4444' : p.quantity <= 2 ? '#f59e0b' : '#22c55e'} fontSize={7} fontWeight="600">
                                    {p.quantity}
                                </text>
                            )}
                        </g>
                    );
                });
            })}
        </g>
    );
}

// ─── Object Renderer ──────────────────────────────────────────────────────────

function ObjRenderer({ obj, selected, multiSelected, mode, pxPerFt, onPointerDown, onContextMenu }:
    { obj: MapObject; selected: boolean; multiSelected: boolean; mode: Mode; pxPerFt: number; onPointerDown: (e: React.PointerEvent, id: string) => void; onContextMenu: (e: React.MouseEvent, id: string) => void }) {
    const m = META[obj.type];
    const col = obj.color || m.color;
    const x = obj.x * pxPerFt, y = obj.y * pxPerFt;
    const w = obj.width * pxPerFt, h = obj.height * pxPerFt;
    const cx = x + w / 2, cy = y + h / 2;
    const fs = Math.max(7, Math.min(13, w / 8));
    const isDoor = obj.type === 'door';
    const isWindow = obj.type === 'window';
    const hasShelves = obj.shelves.length > 0;
    const isRoom = ['liquor_room', 'cooler', 'office', 'bathroom'].includes(obj.type);
    const highlight = selected || multiSelected;
    const cursor = mode === 'edit' ? 'move' : 'default';

    return (
        <g transform={`rotate(${obj.rotation},${cx},${cy})`}
            onPointerDown={e => onPointerDown(e, obj.id)}
            onContextMenu={e => onContextMenu(e, obj.id)}
            style={{ cursor }}>

            {isDoor ? (
                <>
                    <line x1={x} y1={cy} x2={x + w} y2={cy} stroke={col} strokeWidth={4} strokeLinecap="round" />
                    <path d={`M ${x} ${cy} A ${w} ${w} 0 0 1 ${x + w} ${cy + w}`} stroke={col} strokeWidth={1.5} fill="none" strokeDasharray="5 3" opacity={0.7} />
                </>
            ) : isWindow ? (
                <>
                    <rect x={x} y={y} width={w} height={Math.max(h, 5)} fill={col} opacity={0.6} />
                    <line x1={x} y1={cy} x2={x + w} y2={cy} stroke="#bae6fd" strokeWidth={2} />
                </>
            ) : obj.type === 'pillar' ? (
                <>
                    <rect x={x} y={y} width={w} height={h} fill={col} rx={w / 6} stroke="#9ca3af" strokeWidth={2} />
                    <ellipse cx={cx} cy={cy} rx={w * 0.28} ry={h * 0.28} fill="rgba(0,0,0,0.3)" />
                </>
            ) : obj.type === 'pool_table' ? (
                <PoolTableGraphic x={x} y={y} w={w} h={h} />
            ) : obj.type === 'jukebox' ? (
                <JukeboxGraphic x={x} y={y} w={w} h={h} />
            ) : obj.type === 'atm' ? (
                <AtmGraphic x={x} y={y} w={w} h={h} />
            ) : obj.type === 'register' ? (
                <RegisterGraphic x={x} y={y} w={w} h={h} selected={selected} />
            ) : obj.type === 'counter_cooler' ? (
                <CounterCoolerGraphic x={x} y={y} w={w} h={h} shelves={obj.shelves} mode={mode} />
            ) : isRoom ? (
                <>
                    <rect x={x} y={y} width={w} height={h} fill={col} fillOpacity={0.45} rx={3} stroke={col} strokeWidth={2} strokeDasharray={selected ? '0' : '7 3'} />
                    {obj.shelves.map((shelf, i) => {
                        const sy = y + h * 0.12 + i * (h * 0.7 / Math.max(obj.shelves.length, 1));
                        return <line key={shelf.id} x1={x + 10} y1={sy} x2={x + w - 10} y2={sy} stroke="rgba(255,255,255,0.18)" strokeWidth={1.5} />;
                    })}
                    <text x={cx} y={cy - 4} textAnchor="middle" fill="white" fontSize={fs + 2}>{m.emoji}</text>
                    <text x={cx} y={cy + fs + 2} textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize={fs - 1}>{obj.name}</text>
                    <ShelfProducts obj={obj} px={pxPerFt} mode={mode} />
                </>
            ) : hasShelves ? (
                <>
                    <rect x={x} y={y} width={w} height={h} fill={col} rx={2} />
                    {obj.shelves.map((shelf, i) => {
                        const sy = y + (h / obj.shelves.length) * i;
                        return <line key={shelf.id} x1={x} y1={sy} x2={x + w} y2={sy} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />;
                    })}
                    <ShelfProducts obj={obj} px={pxPerFt} mode={mode} />
                    <text x={cx} y={cy + fs / 2} textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize={fs - 1}>{obj.name}</text>
                </>
            ) : obj.type === 'table' ? (
                <>
                    <rect x={x} y={y} width={w} height={h} fill={col} rx={Math.min(w, h) * 0.25} />
                    {/* Chair marks */}
                    {[0.2, 0.5, 0.8].map(t => (
                        <React.Fragment key={t}>
                            <rect x={x + w * t - 3} y={y - 5} width={6} height={4} fill="rgba(255,255,255,0.2)" rx={1} />
                            <rect x={x + w * t - 3} y={y + h + 1} width={6} height={4} fill="rgba(255,255,255,0.2)" rx={1} />
                        </React.Fragment>
                    ))}
                    <text x={cx} y={cy + fs / 3} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize={fs - 2}>{obj.name}</text>
                </>
            ) : obj.type === 'ice_well' ? (
                <>
                    <rect x={x} y={y} width={w} height={h} fill={col} rx={2} />
                    <rect x={x + 3} y={y + 3} width={w - 6} height={h - 6} fill="rgba(147,210,255,0.15)" rx={1} />
                    <text x={cx} y={cy - 2} textAnchor="middle" fill="#bae6fd" fontSize={fs + 1}>❄</text>
                    <text x={cx} y={cy + fs + 1} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize={fs - 2}>{obj.name}</text>
                </>
            ) : obj.type === 'sink' ? (
                <>
                    <rect x={x} y={y} width={w} height={h} fill={col} rx={2} />
                    <ellipse cx={cx} cy={cy} rx={Math.min(w * 0.38, h * 0.38)} ry={Math.min(w * 0.3, h * 0.3)} fill="rgba(147,210,255,0.2)" stroke="rgba(147,210,255,0.4)" strokeWidth={1} />
                    <circle cx={cx} cy={cy} r={2} fill="rgba(147,210,255,0.6)" />
                </>
            ) : (
                <>
                    <rect x={x} y={y} width={w} height={h} fill={col} rx={2} />
                    <text x={cx} y={cy - 2} textAnchor="middle" fill="white" fontSize={fs + 2}>{m.emoji}</text>
                    <text x={cx} y={cy + fs + 1} textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize={fs - 1}>{obj.name}</text>
                </>
            )}

            {/* Selection ring */}
            {highlight && (
                <rect x={x - 2} y={y - 2} width={w + 4} height={h + 4} rx={3}
                    fill="none" stroke={selected ? '#fbbf24' : '#60a5fa'} strokeWidth={selected ? 2 : 1.5}
                    strokeDasharray={selected ? '0' : '5 3'}
                    style={{ pointerEvents: 'none' }} />
            )}

            {/* Dimension tag */}
            {selected && mode === 'edit' && (
                <text x={cx} y={y - 9} textAnchor="middle" fill="#fbbf24" fontSize={9} style={{ pointerEvents: 'none' }}>
                    {obj.width.toFixed(1)}′ × {obj.height.toFixed(1)}′
                </text>
            )}
        </g>
    );
}

// ─── Resize + Rotate Handles ──────────────────────────────────────────────────

// Curved arrow path for rotate handle (clockwise arc)
function RotateArrow({ cx, cy, r = 7 }: { cx: number; cy: number; r?: number }) {
    const a = r * 0.7;
    // Arc from top-left to top-right of a small circle, with an arrowhead
    return (
        <g style={{ cursor: 'grab', pointerEvents: 'all' }}>
            <circle cx={cx} cy={cy} r={r + 3} fill="rgba(0,0,0,0)" />
            <path
                d={`M ${cx - a} ${cy - a * 0.3} A ${r} ${r} 0 1 1 ${cx + a * 0.3} ${cy - a}`}
                fill="none" stroke="#818cf8" strokeWidth={2} strokeLinecap="round"
            />
            {/* Arrowhead */}
            <path d={`M ${cx + a * 0.3 - 4} ${cy - a - 4} L ${cx + a * 0.3} ${cy - a} L ${cx + a * 0.3 + 4} ${cy - a - 2}`}
                fill="none" stroke="#818cf8" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </g>
    );
}

function ResizeHandles({ obj, pxPerFt, onHandleDown, onRotateDown }: {
    obj: MapObject; pxPerFt: number;
    onHandleDown: (e: React.PointerEvent, id: string, h: HandlePos) => void;
    onRotateDown: (e: React.PointerEvent, id: string) => void;
}) {
    const x = obj.x * pxPerFt, y = obj.y * pxPerFt;
    const w = obj.width * pxPerFt, h = obj.height * pxPerFt;
    const cx = x + w / 2, cy = y + h / 2;
    const resizeHandles: { pos: HandlePos; hx: number; hy: number }[] = [
        { pos: 'nw', hx: x, hy: y }, { pos: 'n', hx: x + w / 2, hy: y }, { pos: 'ne', hx: x + w, hy: y },
        { pos: 'e', hx: x + w, hy: y + h / 2 }, { pos: 'se', hx: x + w, hy: y + h },
        { pos: 's', hx: x + w / 2, hy: y + h }, { pos: 'sw', hx: x, hy: y + h }, { pos: 'w', hx: x, hy: y + h / 2 },
    ];
    // Rotate handles offset outward 18px from each corner
    const OFF = 18;
    const rotateHandles = [
        { rx: x - OFF, ry: y - OFF },
        { rx: x + w + OFF, ry: y - OFF },
        { rx: x + w + OFF, ry: y + h + OFF },
        { rx: x - OFF, ry: y + h + OFF },
    ];

    return (
        <g transform={`rotate(${obj.rotation},${cx},${cy})`}>
            {/* Resize handles */}
            {resizeHandles.map(hh => (
                <rect key={hh.pos} x={hh.hx - 5} y={hh.hy - 5} width={10} height={10} rx={2}
                    fill="white" stroke="#fbbf24" strokeWidth={1.5}
                    style={{ cursor: `${hh.pos}-resize` }}
                    onPointerDown={e => { e.stopPropagation(); onHandleDown(e, obj.id, hh.pos); }}
                />
            ))}
            {/* Rotate handles at corners */}
            {rotateHandles.map((rh, i) => (
                <g key={i} onPointerDown={e => { e.stopPropagation(); onRotateDown(e, obj.id); }}>
                    <RotateArrow cx={rh.rx} cy={rh.ry} />
                </g>
            ))}
        </g>
    );
}

// ─── Properties Panel ─────────────────────────────────────────────────────────

function PropsPanel({ obj, products, mode, allObjects, onUpdate, onDelete, onAuditChange, onAttach, onDetach }: {
    obj: MapObject; products: any[]; mode: Mode; allObjects: MapObject[];
    onUpdate: (o: MapObject) => void; onDelete: (id: string) => void;
    onAuditChange?: (objId: string, shelfId: string, slotId: string, qty: number) => void;
    onAttach: (objId: string, parentId: string) => void;
    onDetach: (objId: string) => void;
}) {
    const m = META[obj.type];
    const parentObj = obj.parentId ? allObjects.find(o => o.id === obj.parentId) : null;
    const nearbyAttachable = allObjects.filter(o => {
        if (o.id === obj.id || o.parentId) return false;
        const dx = Math.min(Math.abs(o.x - obj.x - obj.width), Math.abs(o.x + o.width - obj.x));
        const dy = Math.min(Math.abs(o.y - obj.y - obj.height), Math.abs(o.y + o.height - obj.y));
        return Math.min(dx, dy) < 2;
    });

    function addShelf() {
        const n: Shelf = { id: sid(), label: `Shelf ${obj.shelves.length + 1}`, products: Array.from({ length: 8 }, () => ({ id: pid(), product_id: null, product_name: null })) };
        onUpdate({ ...obj, shelves: [...obj.shelves, n] });
    }
    function removeShelf(i: number) { onUpdate({ ...obj, shelves: obj.shelves.filter((_, j) => j !== i) }); }
    function updateShelfLabel(i: number, label: string) { onUpdate({ ...obj, shelves: obj.shelves.map((s, j) => j !== i ? s : { ...s, label }) }); }
    function addSlot(si: number) { onUpdate({ ...obj, shelves: obj.shelves.map((s, i) => i !== si ? s : { ...s, products: [...s.products, { id: pid(), product_id: null, product_name: null }] }) }); }
    function removeSlot(si: number, pi: number) { onUpdate({ ...obj, shelves: obj.shelves.map((s, i) => i !== si ? s : { ...s, products: s.products.filter((_, j) => j !== pi) }) }); }
    function assignProd(si: number, pi: number, productId: number | null, productName: string | null) {
        onUpdate({ ...obj, shelves: obj.shelves.map((s, i) => i !== si ? s : { ...s, products: s.products.map((p, j) => j !== pi ? p : { ...p, product_id: productId, product_name: productName }) }) });
    }

    const inp = { background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '5px 8px', color: 'white', fontSize: 12, width: '100%', boxSizing: 'border-box' as const };

    return (
        <div style={{ padding: 14, overflowY: 'auto', height: '100%', fontSize: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ color: '#fbbf24', fontWeight: 700, fontSize: 13 }}>{m.emoji} {m.label}</span>
                {mode === 'edit' && <button type="button" onClick={() => onDelete(obj.id)}
                    style={{ background: '#7f1d1d', border: 'none', borderRadius: 5, padding: '3px 8px', color: '#fca5a5', cursor: 'pointer', fontSize: 11 }}>Remove</button>}
            </div>

            {mode === 'edit' && (
                <>
                    <label style={{ color: '#94a3b8', display: 'block', marginBottom: 2 }}>Name</label>
                    <input value={obj.name} onChange={e => onUpdate({ ...obj, name: e.target.value })} style={{ ...inp, marginBottom: 10 }} />

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                        {([['X (ft)', 'x'], ['Y (ft)', 'y'], ['Width (ft)', 'width'], ['Depth (ft)', 'height']] as [string, keyof MapObject][]).map(([label, key]) => (
                            <div key={key}>
                                <label style={{ color: '#94a3b8', display: 'block', marginBottom: 2 }}>{label}</label>
                                <input type="number" step={0.5} value={obj[key] as number}
                                    onChange={e => onUpdate({ ...obj, [key]: Math.max(key === 'width' || key === 'height' ? 0.5 : -999, parseFloat(e.target.value) || 0) })}
                                    style={inp} />
                            </div>
                        ))}
                    </div>

                    <label style={{ color: '#94a3b8', display: 'block', marginBottom: 2 }}>Rotation</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <input type="range" min={0} max={360} step={15} value={obj.rotation} onChange={e => onUpdate({ ...obj, rotation: +e.target.value })} style={{ flex: 1 }} />
                        <span style={{ color: '#64748b', minWidth: 32, textAlign: 'right' }}>{obj.rotation}°</span>
                    </div>

                    <label style={{ color: '#94a3b8', display: 'block', marginBottom: 2 }}>Custom Color</label>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
                        <input type="color" value={obj.color || m.color} onChange={e => onUpdate({ ...obj, color: e.target.value })}
                            style={{ width: 36, height: 28, border: 'none', borderRadius: 4, cursor: 'pointer', background: 'none' }} />
                        <button type="button" onClick={() => onUpdate({ ...obj, color: undefined })}
                            style={{ background: 'transparent', border: '1px solid #334155', borderRadius: 5, padding: '3px 8px', color: '#64748b', cursor: 'pointer', fontSize: 11 }}>Reset</button>
                    </div>

                    {/* Attachment */}
                    <div style={{ background: '#0f172a', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
                        <div style={{ color: '#94a3b8', marginBottom: 5, fontWeight: 600 }}>Attachment</div>
                        {parentObj ? (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ color: '#60a5fa', fontSize: 11 }}>📎 {parentObj.name}</span>
                                <button type="button" onClick={() => onDetach(obj.id)}
                                    style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 5, padding: '2px 8px', color: '#94a3b8', cursor: 'pointer', fontSize: 11 }}>Detach</button>
                            </div>
                        ) : nearbyAttachable.length > 0 ? (
                            <div>
                                <div style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Attach to nearby:</div>
                                {nearbyAttachable.map(o => (
                                    <button type="button" key={o.id} onClick={() => onAttach(obj.id, o.id)}
                                        style={{ display: 'block', width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 5, padding: '3px 8px', color: '#60a5fa', cursor: 'pointer', fontSize: 11, marginBottom: 3, textAlign: 'left' }}>
                                        🔗 {o.name}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <span style={{ color: '#334155', fontSize: 11 }}>Move near another object to attach</span>
                        )}
                    </div>
                </>
            )}

            {/* Shelves */}
            {(m.shelves || obj.shelves.length > 0) && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ color: '#e2e8f0', fontWeight: 600 }}>Shelf Levels ({obj.shelves.length})</span>
                        {mode === 'edit' && <button type="button" onClick={addShelf}
                            style={{ background: '#1e3a5f', border: '1px solid #1e40af', borderRadius: 5, padding: '2px 8px', color: '#93c5fd', cursor: 'pointer', fontSize: 11 }}>+ Level</button>}
                    </div>

                    {obj.shelves.map((shelf, si) => (
                        <div key={shelf.id} style={{ background: '#1e293b', borderRadius: 7, marginBottom: 6, overflow: 'hidden' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', background: '#0f172a' }}>
                                {mode === 'edit'
                                    ? <input value={shelf.label} onChange={e => updateShelfLabel(si, e.target.value)} style={{ background: 'transparent', border: 'none', color: '#cbd5e1', fontSize: 11, fontWeight: 600, flex: 1, outline: 'none' }} />
                                    : <span style={{ color: '#cbd5e1', fontWeight: 600 }}>{shelf.label}</span>}
                                {mode === 'edit' && <button type="button" onClick={() => removeShelf(si)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 15, padding: '0 4px' }}>×</button>}
                            </div>
                            <div style={{ padding: '6px 8px' }}>
                                {shelf.products.map((p, pi) => (
                                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                                        {p.product_id && <span style={{ width: 10, height: 10, borderRadius: '50%', background: productColor(p.product_name || ''), flexShrink: 0, display: 'inline-block' }} />}
                                        {mode === 'edit' ? (
                                            <>
                                                <select value={p.product_id ?? ''} onChange={e => {
                                                    const pr = products.find(x => x.id === parseInt(e.target.value));
                                                    assignProd(si, pi, pr?.id ?? null, pr?.name ?? null);
                                                }} style={{ flex: 1, background: '#0f172a', border: '1px solid #334155', borderRadius: 4, padding: '2px 5px', color: p.product_id ? 'white' : '#475569', fontSize: 11 }}>
                                                    <option value="">— empty —</option>
                                                    {products.map(pr => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
                                                </select>
                                                <button type="button" onClick={() => removeSlot(si, pi)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 14, padding: 0 }}>×</button>
                                            </>
                                        ) : mode === 'audit' ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                                                <span style={{ flex: 1, color: p.product_id ? '#e2e8f0' : '#475569', fontSize: 11 }}>{p.product_name || '— empty —'}</span>
                                                {p.product_id && (
                                                    <>
                                                        <button type="button" onClick={() => onAuditChange?.(obj.id, shelf.id, p.id, Math.max(0, (p.quantity ?? 1) - 1))} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 3, width: 20, height: 20, color: 'white', cursor: 'pointer' }}>−</button>
                                                        <span style={{ minWidth: 18, textAlign: 'center', color: (p.quantity ?? 0) === 0 ? '#ef4444' : (p.quantity ?? 0) <= 2 ? '#f59e0b' : '#22c55e' }}>{p.quantity ?? '?'}</span>
                                                        <button type="button" onClick={() => onAuditChange?.(obj.id, shelf.id, p.id, (p.quantity ?? 0) + 1)} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 3, width: 20, height: 20, color: 'white', cursor: 'pointer' }}>+</button>
                                                    </>
                                                )}
                                            </div>
                                        ) : (
                                            <span style={{ fontSize: 11, color: p.product_id ? '#e2e8f0' : '#475569' }}>{p.product_name || '— empty —'}</span>
                                        )}
                                    </div>
                                ))}
                                {mode === 'edit' && (
                                    <button type="button" onClick={() => addSlot(si)} style={{ width: '100%', background: 'none', border: '1px dashed #334155', borderRadius: 4, padding: '2px', color: '#475569', cursor: 'pointer', fontSize: 11, marginTop: 3 }}>+ slot</button>
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

function HistoryPanel({ onClose, onRestore }: { onClose: () => void; onRestore: (d: MapData) => void }) {
    const [list, setList] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [restoring, setRestoring] = useState<number | null>(null);
    useEffect(() => { fetch('/api/admin/bar-map/history').then(r => r.json()).then(d => { setList(d.history || []); setLoading(false); }); }, []);
    async function restore(id: number) {
        setRestoring(id);
        const res = await fetch('/api/admin/bar-map/history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ history_id: id }) });
        const d = await res.json();
        if (d.ok) { onRestore(d.map_data); onClose(); }
        setRestoring(null);
    }
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#1e293b', borderRadius: 12, width: 480, maxHeight: '70vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', border: '1px solid #334155' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700, color: 'white', fontSize: 15 }}>📜 Save History</span>
                    <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}>×</button>
                </div>
                <div style={{ overflowY: 'auto', padding: 10, flex: 1 }}>
                    {loading ? <div style={{ color: '#64748b', textAlign: 'center', padding: 20 }}>Loading…</div> :
                        list.length === 0 ? <div style={{ color: '#64748b', textAlign: 'center', padding: 20 }}>No saves yet</div> :
                        list.map(h => (
                            <div key={h.id} style={{ background: '#0f172a', borderRadius: 8, padding: '10px 12px', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500 }}>{h.description || 'Manual save'}</div>
                                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{new Date(h.created_at).toLocaleString()} · {h.saved_by_name}</div>
                                </div>
                                <button type="button" onClick={() => restore(h.id)} disabled={restoring === h.id}
                                    style={{ background: '#1e3a5f', border: '1px solid #1e40af', borderRadius: 6, padding: '4px 10px', color: '#93c5fd', fontSize: 12, cursor: 'pointer', opacity: restoring === h.id ? 0.5 : 1 }}>
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

// ─── Voice Dialog ─────────────────────────────────────────────────────────────

function VoiceDialog({ onClose, onGenerate }: { onClose: () => void; onGenerate: (d: MapData) => void }) {
    const [transcript, setTranscript] = useState('');
    const [listening, setListening] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState('');
    const recRef = useRef<any>(null);

    function startListen() {
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) { setError('Not supported in this browser — type below instead.'); return; }
        const rec = new SR(); rec.lang = 'en-US'; rec.continuous = true; rec.interimResults = true;
        rec.onresult = (e: any) => setTranscript(Array.from(e.results).map((r: any) => r[0].transcript).join(' '));
        rec.onend = () => setListening(false);
        rec.start(); recRef.current = rec; setListening(true);
    }
    function stopListen() { recRef.current?.stop(); setListening(false); }

    async function generate() {
        setGenerating(true);
        const res = await fetch('/api/admin/bar-map/ai-generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript }) }).catch(() => null);
        if (res) { const d = await res.json(); if (d.ok) { onGenerate(d.map_data); onClose(); return; } }
        setError('Could not generate map — try more detail.'); setGenerating(false);
    }

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#1e293b', borderRadius: 14, width: 500, border: '1px solid #334155', padding: 22 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                    <span style={{ fontWeight: 700, color: 'white', fontSize: 16 }}>🎤 AI Bar Map Generator</span>
                    <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 22, cursor: 'pointer' }}>×</button>
                </div>
                <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 14 }}>Describe your bar layout — dimensions, counters, shelves, rooms, pool tables, ATMs, etc. The AI will generate an initial layout.</p>
                <textarea value={transcript} onChange={e => setTranscript(e.target.value)} placeholder="e.g. My bar is 40 by 25 feet. Bar counter along the south wall 20 feet long, two bottle rows behind it, two ice wells, a register, liquor room in the back-left corner, two pool tables on the right…"
                    style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '10px 12px', color: 'white', fontSize: 13, resize: 'none', minHeight: 100, boxSizing: 'border-box', marginBottom: 14, outline: 'none' }} />
                {error && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 10 }}>{error}</div>}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
                    <button type="button" onClick={listening ? stopListen : startListen}
                        style={{ background: listening ? '#7f1d1d' : '#1e3a5f', border: `1px solid ${listening ? '#dc2626' : '#1e40af'}`, borderRadius: 8, padding: '9px 16px', color: listening ? '#fca5a5' : '#93c5fd', fontSize: 13, cursor: 'pointer' }}>
                        {listening ? '⏹ Stop' : '🎤 Record'}
                    </button>
                    <button type="button" onClick={generate} disabled={!transcript.trim() || generating}
                        style={{ background: '#1e3a5f', border: '1px solid #1e40af', borderRadius: 8, padding: '9px 18px', color: generating ? '#64748b' : '#93c5fd', fontSize: 13, cursor: transcript.trim() && !generating ? 'pointer' : 'not-allowed' }}>
                        {generating ? '⏳ Generating…' : '✨ Generate Map'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Save Modal ───────────────────────────────────────────────────────────────

function SaveModal({ onSave, onClose }: { onSave: (desc: string) => void; onClose: () => void }) {
    const [desc, setDesc] = useState('');
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#1e293b', borderRadius: 12, width: 360, padding: 22, border: '1px solid #334155' }}>
                <div style={{ fontWeight: 700, color: 'white', fontSize: 15, marginBottom: 12 }}>💾 Save Bar Map</div>
                <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional description…"
                    style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 7, padding: '7px 10px', color: 'white', fontSize: 13, marginBottom: 14, boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button type="button" onClick={onClose} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 7, padding: '7px 14px', color: '#94a3b8', cursor: 'pointer' }}>Cancel</button>
                    <button type="button" onClick={() => onSave(desc)} style={{ background: '#166534', border: '1px solid #15803d', borderRadius: 7, padding: '7px 18px', color: '#86efac', cursor: 'pointer', fontWeight: 600 }}>Save</button>
                </div>
            </div>
        </div>
    );
}

// ─── Welcome Screen ───────────────────────────────────────────────────────────

function WelcomeScreen({ onBlank, onVoice, onPreset }: { onBlank: () => void; onVoice: () => void; onPreset: (k: string) => void }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 18, padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 52 }}>🗺️</div>
            <h2 style={{ color: 'white', fontSize: 22, margin: 0, fontWeight: 700 }}>Create Your Bar Map</h2>
            <p style={{ color: '#94a3b8', fontSize: 14, maxWidth: 460, margin: 0 }}>Design a visual floor plan with shelves, equipment, rooms, and entertainment. Assign products to shelves for faster auditing.</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                <button type="button" onClick={onVoice} style={{ background: '#1e3a5f', border: '2px solid #1e40af', borderRadius: 12, padding: '13px 20px', color: '#93c5fd', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
                    🎤 Describe by Voice / AI<br /><span style={{ fontSize: 11, fontWeight: 400, color: '#64748b' }}>AI generates the initial layout</span>
                </button>
                <button type="button" onClick={onBlank} style={{ background: '#1e293b', border: '2px solid #334155', borderRadius: 12, padding: '13px 20px', color: '#e2e8f0', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
                    ✏️ Blank Canvas<br /><span style={{ fontSize: 11, fontWeight: 400, color: '#64748b' }}>Draw your own layout</span>
                </button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
                {[['Small (25×15)', 'sm'], ['Medium (40×25)', 'md'], ['Large (60×35)', 'lg']].map(([label, key]) => (
                    <button type="button" key={key} onClick={() => onPreset(key)}
                        style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 7, padding: '7px 12px', color: '#94a3b8', cursor: 'pointer', fontSize: 12 }}>{label}</button>
                ))}
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BarMapClient({ initialMap, products }: { initialMap: MapData | null; products: { id: number; name: string; type: string }[] }) {
    const [mapData, setMapData] = useState<MapData | null>(initialMap);
    const [mode, setMode] = useState<Mode>(initialMap ? 'view' : 'edit');
    const [tool, setTool] = useState<Tool>('select');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);  // multi-select
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState<Pt>({ x: 40, y: 40 });
    const [pendingType, setPendingType] = useState<ObjType | null>(null);
    const [drawingPts, setDrawingPts] = useState<Pt[]>([]);
    const [mouseFt, setMouseFt] = useState<Pt>({ x: 0, y: 0 });
    const [rubberBand, setRubberBand] = useState<{ start: Pt; end: Pt } | null>(null);
    const [showHistory, setShowHistory] = useState(false);
    const [showVoice, setShowVoice] = useState(false);
    const [showSave, setShowSave] = useState(false);
    const [saving, setSaving] = useState(false);
    const [savedToast, setSavedToast] = useState(false);

    const svgRef = useRef<SVGSVGElement>(null);
    const dragRef = useRef<DragState | null>(null);
    const spaceRef = useRef(false);

    const pxPerFt = PX * zoom;

    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

    // ── Coordinate helpers ───────────────────────────────────────────────────

    function toFt(e: { clientX: number; clientY: number }): Pt {
        const rect = svgRef.current!.getBoundingClientRect();
        return { x: (e.clientX - rect.left - pan.x) / pxPerFt, y: (e.clientY - rect.top - pan.y) / pxPerFt };
    }

    // ── Keyboard ─────────────────────────────────────────────────────────────

    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
                e.preventDefault(); spaceRef.current = true;
            }
            if (e.key === 'Escape') { setDrawingPts([]); setPendingType(null); setSelectedId(null); setSelectedIds([]); if (tool === 'draw') setTool('select'); }
            if ((e.key === 'Delete' || e.key === 'Backspace') && document.activeElement === document.body) {
                if (selectedIds.length) { setMapData(prev => prev ? { ...prev, objects: prev.objects.filter(o => !selectedSet.has(o.id)) } : prev); setSelectedIds([]); setSelectedId(null); }
                else if (selectedId) { setMapData(prev => prev ? { ...prev, objects: prev.objects.filter(o => o.id !== selectedId) } : prev); setSelectedId(null); }
                if (tool === 'draw') setDrawingPts(prev => prev.slice(0, -1));
            }
            if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                if (mapData) setSelectedIds(mapData.objects.map(o => o.id));
            }
        };
        const up = (e: KeyboardEvent) => { if (e.code === 'Space') spaceRef.current = false; };
        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
    }, [selectedId, selectedIds, selectedSet, tool, mapData]);

    // ── Pointer events ───────────────────────────────────────────────────────

    function handleSvgPointerDown(e: React.PointerEvent<SVGSVGElement>) {
        if (!svgRef.current) return;
        const pt = toFt(e);

        // Pan (space+drag or middle mouse)
        if (spaceRef.current || e.button === 1) {
            dragRef.current = { type: 'pan', startMouse: { x: e.clientX, y: e.clientY }, startPan: { ...pan } };
            svgRef.current.setPointerCapture(e.pointerId);
            return;
        }

        if (mode !== 'edit') { setSelectedId(null); setSelectedIds([]); return; }

        // Draw outline mode
        if (tool === 'draw') {
            const sx = s(pt.x), sy = s(pt.y);
            if (drawingPts.length > 2) {
                const first = drawingPts[0];
                if (Math.hypot(sx - first.x, sy - first.y) < 1) {
                    setMapData(prev => prev ? { ...prev, outline: drawingPts } : prev);
                    setDrawingPts([]); setTool('select'); return;
                }
            }
            setDrawingPts(prev => [...prev, { x: sx, y: sy }]);
            return;
        }

        // Place pending object
        if (pendingType) {
            const m = META[pendingType];
            const sx = s(pt.x - m.w / 2), sy = s(pt.y - m.h / 2);
            const count = (mapData?.objects || []).filter(o => o.type === pendingType).length;
            const obj = makeObj(pendingType, sx, sy, count);
            setMapData(prev => prev ? { ...prev, objects: [...prev.objects, obj] } : prev);
            setSelectedId(obj.id); setSelectedIds([]);
            setPendingType(null); return;
        }

        // Rubber band start (clicked on empty canvas)
        dragRef.current = { type: 'rubber', startFt: pt };
        setRubberBand({ start: pt, end: pt });
        svgRef.current.setPointerCapture(e.pointerId);
        setSelectedId(null); setSelectedIds([]);
    }

    function handleObjPointerDown(e: React.PointerEvent, id: string) {
        e.stopPropagation();
        if (!mapData) return;
        const pt = toFt(e);

        if (mode !== 'edit') { setSelectedId(id); return; }

        // Shift-click: add/remove from multi-select
        if (e.shiftKey) {
            setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
            setSelectedId(null);
            return;
        }

        // If clicking on an already-selected object in multi-select, move all
        const idsToMove = selectedIds.includes(id) ? selectedIds : [id];
        if (!selectedIds.includes(id)) { setSelectedId(id); setSelectedIds([]); }

        const startPositions: Record<string, Pt> = {};
        for (const oid of idsToMove) {
            const o = mapData.objects.find(x => x.id === oid);
            if (o) startPositions[oid] = { x: o.x, y: o.y };
        }
        dragRef.current = { type: 'move', ids: idsToMove, startMouse: pt, startPositions };
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
    }

    function handleResizePointerDown(e: React.PointerEvent, id: string, handle: HandlePos) {
        if (mode !== 'edit') return;
        e.stopPropagation();
        const obj = mapData!.objects.find(o => o.id === id)!;
        dragRef.current = { type: 'resize', id, handle, startMouse: toFt(e), startObj: { ...obj } };
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
    }

    function handleRotatePointerDown(e: React.PointerEvent, id: string) {
        if (mode !== 'edit') return;
        e.stopPropagation();
        const obj = mapData!.objects.find(o => o.id === id)!;
        const rect = svgRef.current!.getBoundingClientRect();
        // Center of the object in screen pixels
        const centerPx = {
            x: rect.left + pan.x + (obj.x + obj.width / 2) * pxPerFt,
            y: rect.top + pan.y + (obj.y + obj.height / 2) * pxPerFt,
        };
        const startAngle = Math.atan2(e.clientY - centerPx.y, e.clientX - centerPx.x) * (180 / Math.PI);
        dragRef.current = { type: 'rotate', id, centerPx, startAngle, startRotation: obj.rotation };
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
    }

    function handleContextMenu(e: React.MouseEvent, id: string) {
        e.preventDefault();
        if (!mapData) return;
        // Cycle selection through overlapping objects at this point
        const pt = toFt(e);
        const at = mapData.objects.filter(o => pt.x >= o.x && pt.x <= o.x + o.width && pt.y >= o.y && pt.y <= o.y + o.height);
        if (at.length <= 1) return;
        const cur = at.findIndex(o => o.id === selectedId);
        const next = at[(cur + 1) % at.length];
        setSelectedId(next.id); setSelectedIds([]);
    }

    // ── Global pointer move / up ──────────────────────────────────────────────

    useEffect(() => {
        function onMove(e: PointerEvent) {
            if (!svgRef.current) return;
            const rect = svgRef.current.getBoundingClientRect();
            const ftX = (e.clientX - rect.left - pan.x) / pxPerFt;
            const ftY = (e.clientY - rect.top - pan.y) / pxPerFt;
            setMouseFt({ x: s(ftX), y: s(ftY) });

            const drag = dragRef.current;
            if (!drag) return;

            if (drag.type === 'pan') {
                setPan({ x: drag.startPan.x + e.clientX - drag.startMouse.x, y: drag.startPan.y + e.clientY - drag.startMouse.y });
                return;
            }

            if (drag.type === 'rubber') {
                setRubberBand({ start: drag.startFt, end: { x: ftX, y: ftY } });
                return;
            }

            if (drag.type === 'move') {
                const dx = ftX - drag.startMouse.x, dy = ftY - drag.startMouse.y;
                setMapData(prev => {
                    if (!prev) return prev;
                    const movedIds = new Set(drag.ids);
                    // Collect children of moved objects too
                    const childrenToMove = prev.objects.filter(o => o.parentId && movedIds.has(o.parentId));
                    for (const c of childrenToMove) movedIds.add(c.id);

                    return {
                        ...prev,
                        objects: prev.objects.map(obj => {
                            if (!movedIds.has(obj.id)) return obj;
                            const start = drag.startPositions[obj.id];
                            if (!start) {
                                // It's a child — find its parent's delta
                                const parent = prev.objects.find(o => o.id === obj.parentId);
                                const ps = parent ? drag.startPositions[parent.id] : null;
                                if (!ps) return obj;
                                return { ...obj, x: s(ps.x + dx + (obj.x - (parent?.x ?? obj.x))), y: s(ps.y + dy + (obj.y - (parent?.y ?? obj.y))) };
                            }
                            // Primary moved object — edge snap only when single
                            let nx = s(start.x + dx), ny = s(start.y + dy);
                            if (drag.ids.length === 1) {
                                const candidate = { ...obj, x: nx, y: ny };
                                const snapped = snapToEdges(candidate, prev.objects, new Set(drag.ids));
                                nx = snapped.x; ny = snapped.y;
                            }
                            return { ...obj, x: nx, y: ny };
                        }),
                    };
                });
            }

            if (drag.type === 'rotate') {
                const angle = Math.atan2(e.clientY - drag.centerPx.y, e.clientX - drag.centerPx.x) * (180 / Math.PI);
                const delta = angle - drag.startAngle;
                // Snap to 15° increments when within 3° of a multiple
                let newRot = (drag.startRotation + delta + 360) % 360;
                const snap15 = Math.round(newRot / 15) * 15;
                if (Math.abs(newRot - snap15) < 3) newRot = snap15 % 360;
                setMapData(prev => prev ? { ...prev, objects: prev.objects.map(o => o.id === drag.id ? { ...o, rotation: Math.round(newRot) } : o) } : prev);
                return;
            }

            if (drag.type === 'resize') {
                const dx = ftX - drag.startMouse.x, dy = ftY - drag.startMouse.y;
                const { startObj, handle } = drag;
                let { x, y, width, height } = startObj;
                if (handle.includes('e')) width = Math.max(SNAP, s(startObj.width + dx));
                if (handle.includes('w')) { const nw = Math.max(SNAP, s(startObj.width - dx)); x = s(startObj.x + startObj.width - nw); width = nw; }
                if (handle.includes('s')) height = Math.max(SNAP, s(startObj.height + dy));
                if (handle.includes('n')) { const nh = Math.max(SNAP, s(startObj.height - dy)); y = s(startObj.y + startObj.height - nh); height = nh; }
                setMapData(prev => prev ? { ...prev, objects: prev.objects.map(o => o.id === drag.id ? { ...o, x, y, width, height } : o) } : prev);
            }
        }

        function onUp(e: PointerEvent) {
            const drag = dragRef.current;
            dragRef.current = null;

            if (drag?.type === 'rubber' && mapData) {
                const { startFt, } = drag;
                const rect = svgRef.current!.getBoundingClientRect();
                const endFtX = (e.clientX - rect.left - pan.x) / pxPerFt;
                const endFtY = (e.clientY - rect.top - pan.y) / pxPerFt;
                const x1 = Math.min(startFt.x, endFtX), y1 = Math.min(startFt.y, endFtY);
                const x2 = Math.max(startFt.x, endFtX), y2 = Math.max(startFt.y, endFtY);
                if (x2 - x1 > 0.3 || y2 - y1 > 0.3) {
                    const inside = mapData.objects.filter(o => o.x < x2 && o.x + o.width > x1 && o.y < y2 && o.y + o.height > y1).map(o => o.id);
                    if (inside.length) { setSelectedIds(inside); setSelectedId(null); }
                }
                setRubberBand(null);
            }
        }

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    }, [pan, pxPerFt, mapData]);

    // ── Wheel zoom ───────────────────────────────────────────────────────────

    function handleWheel(e: React.WheelEvent) {
        e.preventDefault();
        const factor = e.ctrlKey ? 0.003 : 0.001;
        setZoom(z => Math.max(0.2, Math.min(4, z - e.deltaY * factor)));
    }

    // ── Map updates ──────────────────────────────────────────────────────────

    function updateObj(updated: MapObject) {
        setMapData(prev => prev ? { ...prev, objects: prev.objects.map(o => o.id === updated.id ? updated : o) } : prev);
    }
    function deleteObj(id: string) {
        setMapData(prev => prev ? { ...prev, objects: prev.objects.filter(o => o.id !== id && o.parentId !== id) } : prev);
        setSelectedId(null); setSelectedIds([]);
    }
    function attachObj(objId: string, parentId: string) {
        setMapData(prev => {
            if (!prev) return prev;
            const obj = prev.objects.find(o => o.id === objId)!;
            const parent = prev.objects.find(o => o.id === parentId)!;
            return { ...prev, objects: prev.objects.map(o => o.id !== objId ? o : { ...o, parentId, attachOffset: { x: obj.x - parent.x, y: obj.y - parent.y } }) };
        });
    }
    function detachObj(objId: string) {
        setMapData(prev => prev ? { ...prev, objects: prev.objects.map(o => o.id !== objId ? o : { ...o, parentId: undefined }) } : prev);
    }
    function handleAuditChange(objId: string, shelfId: string, slotId: string, qty: number) {
        setMapData(prev => prev ? {
            ...prev,
            objects: prev.objects.map(obj => obj.id !== objId ? obj : {
                ...obj,
                shelves: obj.shelves.map(sh => sh.id !== shelfId ? sh : {
                    ...sh,
                    products: sh.products.map(p => p.id !== slotId ? p : { ...p, quantity: qty }),
                }),
            }),
        } : prev);
    }

    async function doSave(desc: string) {
        if (!mapData) return;
        setSaving(true);
        await fetch('/api/admin/bar-map', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: mapData.name, map_data: mapData, width_ft: mapData.width_ft, height_ft: mapData.height_ft, description: desc || undefined }) });
        setSaving(false); setShowSave(false); setSavedToast(true); setTimeout(() => setSavedToast(false), 2500);
    }

    function applyPreset(k: string) {
        const p = { sm: [25, 15], md: [40, 25], lg: [60, 35] }[k] || [40, 25];
        const [w, h] = p;
        setMapData({ name: 'My Bar', width_ft: w, height_ft: h, grid_ft: 1, outline: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }], objects: [] });
        setMode('edit');
    }

    // ── Derived ──────────────────────────────────────────────────────────────

    const selObj = selectedId ? mapData?.objects.find(o => o.id === selectedId) ?? null : null;
    const cursorStyle = spaceRef.current ? (dragRef.current?.type === 'pan' ? 'grabbing' : 'grab') : tool === 'draw' ? 'crosshair' : pendingType ? 'copy' : 'default';

    if (!mapData) {
        return (
            <div style={{ background: '#0f172a', borderRadius: 14, border: '1px solid #1e293b', height: 'calc(100vh - 180px)' }}>
                <WelcomeScreen onBlank={() => { setMapData({ ...EMPTY_MAP }); setMode('edit'); }} onVoice={() => setShowVoice(true)} onPreset={applyPreset} />
                {showVoice && <VoiceDialog onClose={() => setShowVoice(false)} onGenerate={d => { setMapData(d); setMode('edit'); }} />}
            </div>
        );
    }

    const outlinePts = mapData.outline.map(p => `${p.x * pxPerFt},${p.y * pxPerFt}`).join(' ');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', userSelect: 'none' }}>

            {/* Top Toolbar */}
            <div style={{ background: '#1e293b', borderRadius: '12px 12px 0 0', border: '1px solid #334155', borderBottom: 'none', padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {mode === 'edit'
                    ? <input value={mapData.name} onChange={e => setMapData(p => p ? { ...p, name: e.target.value } : p)}
                        style={{ background: 'transparent', border: 'none', borderBottom: '1px solid #334155', color: 'white', fontSize: 14, fontWeight: 700, width: 150, outline: 'none' }} />
                    : <span style={{ fontWeight: 700, color: 'white', fontSize: 14 }}>🗺️ {mapData.name}</span>}

                <div style={{ height: 18, width: 1, background: '#334155', margin: '0 2px' }} />

                {(['view', 'edit', 'audit'] as Mode[]).map(m => (
                    <button type="button" key={m} onClick={() => { setMode(m); setTool('select'); setPendingType(null); setDrawingPts([]); setSelectedId(null); setSelectedIds([]); }}
                        style={{ background: mode === m ? '#1e3a5f' : 'transparent', border: `1px solid ${mode === m ? '#1e40af' : '#334155'}`, borderRadius: 6, padding: '4px 10px', color: mode === m ? '#93c5fd' : '#64748b', fontSize: 12, cursor: 'pointer', fontWeight: mode === m ? 600 : 400, textTransform: 'capitalize' }}>
                        {m === 'view' ? '👁 View' : m === 'edit' ? '✏️ Edit' : '📋 Audit'}
                    </button>
                ))}

                <div style={{ flex: 1 }} />

                {mode === 'edit' && (
                    <>
                        <button type="button" onClick={() => { setTool('select'); setPendingType(null); setDrawingPts([]); }}
                            style={{ background: tool === 'select' && !pendingType ? '#1e3a5f' : 'transparent', border: `1px solid ${tool === 'select' && !pendingType ? '#1e40af' : '#334155'}`, borderRadius: 6, padding: '4px 9px', color: tool === 'select' && !pendingType ? '#93c5fd' : '#64748b', fontSize: 12, cursor: 'pointer' }}>
                            ↖ Select
                        </button>
                        <button type="button" onClick={() => { setTool('draw'); setPendingType(null); }}
                            style={{ background: tool === 'draw' ? '#3b1d5f' : 'transparent', border: `1px solid ${tool === 'draw' ? '#7c3aed' : '#334155'}`, borderRadius: 6, padding: '4px 9px', color: tool === 'draw' ? '#c4b5fd' : '#64748b', fontSize: 12, cursor: 'pointer' }}>
                            ✏ Outline
                        </button>
                        <button type="button" onClick={() => setShowVoice(true)} style={{ background: 'transparent', border: '1px solid #334155', borderRadius: 6, padding: '4px 9px', color: '#64748b', fontSize: 12, cursor: 'pointer' }}>🎤 AI</button>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="number" min={5} max={200} value={mapData.width_ft} onChange={e => setMapData(p => p ? { ...p, width_ft: +e.target.value || 40 } : p)}
                                title="Width (ft)" style={{ width: 48, background: '#0f172a', border: '1px solid #334155', borderRadius: 5, padding: '3px 5px', color: 'white', fontSize: 12 }} />
                            <span style={{ color: '#475569', fontSize: 12 }}>×</span>
                            <input type="number" min={5} max={200} value={mapData.height_ft} onChange={e => setMapData(p => p ? { ...p, height_ft: +e.target.value || 25 } : p)}
                                title="Depth (ft)" style={{ width: 48, background: '#0f172a', border: '1px solid #334155', borderRadius: 5, padding: '3px 5px', color: 'white', fontSize: 12 }} />
                            <span style={{ color: '#475569', fontSize: 12 }}>ft</span>
                        </div>
                    </>
                )}

                <button type="button" onClick={() => setZoom(z => Math.max(0.2, z - 0.15))} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 4, width: 24, height: 24, color: 'white', cursor: 'pointer' }}>−</button>
                <span style={{ color: '#94a3b8', fontSize: 12, minWidth: 38, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
                <button type="button" onClick={() => setZoom(z => Math.min(4, z + 0.15))} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 4, width: 24, height: 24, color: 'white', cursor: 'pointer' }}>+</button>
                <button type="button" onClick={() => { setZoom(1); setPan({ x: 40, y: 40 }); }} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 4, padding: '2px 7px', color: '#64748b', cursor: 'pointer', fontSize: 11 }}>↺</button>

                <button type="button" onClick={() => setShowHistory(true)} style={{ background: 'transparent', border: '1px solid #334155', borderRadius: 6, padding: '4px 9px', color: '#64748b', fontSize: 12, cursor: 'pointer' }}>📜</button>
                <button type="button" onClick={() => setShowSave(true)} disabled={saving}
                    style={{ background: '#166534', border: '1px solid #15803d', borderRadius: 6, padding: '4px 12px', color: '#86efac', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                    {saving ? '⏳' : '💾 Save'}
                </button>
            </div>

            {/* Canvas + sidebars */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden', border: '1px solid #334155', borderRadius: '0 0 12px 12px', borderTop: 'none' }}>

                {/* Left palette */}
                {mode === 'edit' && (
                    <div style={{ width: 162, background: '#0f172a', borderRight: '1px solid #1e293b', overflowY: 'auto', padding: 8, flexShrink: 0 }}>
                        <div style={{ fontSize: 10, color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Add Objects</div>
                        {mode === 'edit' && (pendingType || tool === 'draw') && (
                            <div style={{ background: '#1e293b', borderRadius: 6, padding: '6px 8px', marginBottom: 8, fontSize: 10, color: '#fbbf24', border: '1px solid #92400e' }}>
                                {tool === 'draw' ? 'Click to place vertices. Click near start to close. Backspace = undo. Esc = cancel.' : `Click canvas to place ${META[pendingType!].label}. Esc = cancel.`}
                            </div>
                        )}
                        {!pendingType && tool !== 'draw' && (
                            <div style={{ fontSize: 10, color: '#334155', marginBottom: 8 }}>
                                Space+drag to pan · Scroll to zoom · Shift+click multi-select · Drag to box-select · Right-click to select behind
                            </div>
                        )}
                        {PALETTE.map(g => (
                            <div key={g.label} style={{ marginBottom: 10 }}>
                                <div style={{ fontSize: 9, color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{g.label}</div>
                                {g.types.map(type => {
                                    const m = META[type];
                                    const active = pendingType === type;
                                    return (
                                        <button type="button" key={type} onClick={() => { setPendingType(active ? null : type); setTool('select'); setDrawingPts([]); }}
                                            title={`${m.label} — default ${m.w}ft × ${m.h}ft`}
                                            style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', background: active ? m.color : '#1e293b', border: `1px solid ${active ? 'rgba(255,255,255,0.25)' : '#334155'}`, borderRadius: 6, padding: '5px 7px', color: 'white', fontSize: 11, cursor: 'pointer', marginBottom: 2, textAlign: 'left' }}>
                                            <span style={{ fontSize: 13 }}>{m.emoji}</span>
                                            <span>{m.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                )}

                {/* SVG Canvas */}
                <div style={{ flex: 1, background: '#080d18', overflow: 'hidden', position: 'relative' }}>
                    <div style={{ position: 'absolute', bottom: 8, left: 8, background: 'rgba(0,0,0,0.55)', borderRadius: 5, padding: '2px 8px', fontSize: 10, color: '#334155', zIndex: 5, pointerEvents: 'none' }}>
                        {mouseFt.x.toFixed(1)}′, {mouseFt.y.toFixed(1)}′
                        {selectedIds.length > 1 && <span style={{ marginLeft: 8, color: '#60a5fa' }}>{selectedIds.length} selected</span>}
                    </div>
                    {mode === 'audit' && (
                        <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(234,179,8,0.12)', border: '1px solid #854d0e', borderRadius: 7, padding: '4px 10px', fontSize: 11, color: '#fbbf24', zIndex: 5 }}>
                            📋 Audit Mode — select an object and use the panel →
                        </div>
                    )}
                    {savedToast && (
                        <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', background: '#14532d', border: '1px solid #166534', borderRadius: 7, padding: '7px 18px', fontSize: 13, color: '#86efac', zIndex: 20 }}>
                            ✓ Map saved!
                        </div>
                    )}

                    <svg ref={svgRef} width="100%" height="100%" style={{ cursor: cursorStyle, display: 'block' }}
                        onPointerDown={handleSvgPointerDown}
                        onMouseMove={e => { const p = toFt(e); setMouseFt({ x: s(p.x), y: s(p.y) }); }}
                        onWheel={handleWheel}
                        onContextMenu={e => e.preventDefault()}>
                        <defs>
                            <pattern id="grid-sm" width={pxPerFt * SNAP} height={pxPerFt * SNAP} patternUnits="userSpaceOnUse" x={pan.x} y={pan.y}>
                                <path d={`M ${pxPerFt * SNAP} 0 L 0 0 0 ${pxPerFt * SNAP}`} fill="none" stroke="#0d1424" strokeWidth={0.5} />
                            </pattern>
                            <pattern id="grid-lg" width={pxPerFt} height={pxPerFt} patternUnits="userSpaceOnUse" x={pan.x} y={pan.y}>
                                <rect width={pxPerFt} height={pxPerFt} fill="url(#grid-sm)" />
                                <path d={`M ${pxPerFt} 0 L 0 0 0 ${pxPerFt}`} fill="none" stroke="#141e33" strokeWidth={1} />
                            </pattern>
                        </defs>
                        <rect x={0} y={0} width="100%" height="100%" fill="url(#grid-lg)" />

                        <g transform={`translate(${pan.x},${pan.y})`}>
                            {/* Room shadow */}
                            <polygon points={outlinePts} fill="#0b1120" />
                            <polygon points={outlinePts} fill="rgba(30,58,138,0.1)" stroke="#1e40af" strokeWidth={2} strokeDasharray={mode === 'edit' ? '8 4' : '0'} />

                            {/* Rulers */}
                            {mapData.outline.map((pt, i) => {
                                const next = mapData.outline[(i + 1) % mapData.outline.length];
                                const mx = ((pt.x + next.x) / 2) * pxPerFt, my = ((pt.y + next.y) / 2) * pxPerFt;
                                const d = Math.hypot(next.x - pt.x, next.y - pt.y);
                                return d > 1 ? <text key={i} x={mx} y={my - 7} textAnchor="middle" fill="#1e3a5f" fontSize={9}>{d.toFixed(1)}′</text> : null;
                            })}
                            {Array.from({ length: Math.ceil(mapData.width_ft) + 1 }, (_, i) => (
                                <text key={i} x={i * pxPerFt} y={-7} textAnchor="middle" fill="#1e293b" fontSize={8}>{i}</text>
                            ))}
                            {Array.from({ length: Math.ceil(mapData.height_ft) + 1 }, (_, i) => (
                                <text key={i} x={-10} y={i * pxPerFt + 3} textAnchor="end" fill="#1e293b" fontSize={8}>{i}</text>
                            ))}

                            {/* Objects */}
                            {mapData.objects.map(obj => (
                                <ObjRenderer key={obj.id} obj={obj}
                                    selected={selectedId === obj.id}
                                    multiSelected={selectedSet.has(obj.id)}
                                    mode={mode} pxPerFt={pxPerFt}
                                    onPointerDown={handleObjPointerDown}
                                    onContextMenu={handleContextMenu}
                                />
                            ))}

                            {/* Resize + rotate handles */}
                            {selObj && mode === 'edit' && (
                                <ResizeHandles obj={selObj} pxPerFt={pxPerFt} onHandleDown={handleResizePointerDown} onRotateDown={handleRotatePointerDown} />
                            )}

                            {/* Draw outline preview */}
                            {tool === 'draw' && drawingPts.length > 0 && (
                                <>
                                    <polyline points={[...drawingPts, mouseFt].map(p => `${p.x * pxPerFt},${p.y * pxPerFt}`).join(' ')}
                                        fill="none" stroke="#7c3aed" strokeWidth={2} strokeDasharray="6 3" />
                                    {drawingPts.map((p, i) => (
                                        <circle key={i} cx={p.x * pxPerFt} cy={p.y * pxPerFt} r={i === 0 ? 7 : 4}
                                            fill={i === 0 ? '#7c3aed' : 'white'} stroke="#7c3aed" strokeWidth={2} />
                                    ))}
                                    <text x={mouseFt.x * pxPerFt + 10} y={mouseFt.y * pxPerFt - 5} fill="#a78bfa" fontSize={9}>
                                        ({mouseFt.x.toFixed(1)}, {mouseFt.y.toFixed(1)})
                                    </text>
                                </>
                            )}

                            {/* Pending object ghost */}
                            {pendingType && (
                                <rect x={(mouseFt.x - META[pendingType].w / 2) * pxPerFt} y={(mouseFt.y - META[pendingType].h / 2) * pxPerFt}
                                    width={META[pendingType].w * pxPerFt} height={META[pendingType].h * pxPerFt}
                                    fill={META[pendingType].color} opacity={0.45} stroke="white" strokeWidth={1.5} rx={3}
                                    style={{ pointerEvents: 'none' }} />
                            )}

                            {/* Rubber band */}
                            {rubberBand && (
                                <rect
                                    x={Math.min(rubberBand.start.x, rubberBand.end.x) * pxPerFt}
                                    y={Math.min(rubberBand.start.y, rubberBand.end.y) * pxPerFt}
                                    width={Math.abs(rubberBand.end.x - rubberBand.start.x) * pxPerFt}
                                    height={Math.abs(rubberBand.end.y - rubberBand.start.y) * pxPerFt}
                                    fill="rgba(96,165,250,0.08)" stroke="#60a5fa" strokeWidth={1} strokeDasharray="4 2"
                                    style={{ pointerEvents: 'none' }}
                                />
                            )}
                        </g>
                    </svg>
                </div>

                {/* Right properties panel */}
                {(selObj || (mode === 'audit' && selectedIds.length === 1 && (() => { const o = mapData.objects.find(x => x.id === selectedIds[0]); return o?.shelves.length; })()))
                    && (() => {
                        const obj = selObj || mapData.objects.find(x => x.id === selectedIds[0])!;
                        return (
                            <div style={{ width: 252, background: '#0f172a', borderLeft: '1px solid #1e293b', overflowY: 'auto', flexShrink: 0 }}>
                                <PropsPanel obj={obj} products={products} mode={mode} allObjects={mapData.objects}
                                    onUpdate={updateObj} onDelete={deleteObj}
                                    onAuditChange={handleAuditChange}
                                    onAttach={attachObj} onDetach={detachObj} />
                            </div>
                        );
                    })()
                }
            </div>

            {showHistory && <HistoryPanel onClose={() => setShowHistory(false)} onRestore={d => setMapData(d)} />}
            {showVoice && <VoiceDialog onClose={() => setShowVoice(false)} onGenerate={d => { setMapData(d); setMode('edit'); }} />}
            {showSave && <SaveModal onSave={doSave} onClose={() => setShowSave(false)} />}
        </div>
    );
}
