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
    | 'pool_table' | 'jukebox' | 'atm'
    | 'draft_tower' | 'text_label';

export interface Pt { x: number; y: number; }
export interface OutlineVertex extends Pt { arcCtrl?: Pt; }

export interface RoomArea {
    id: string;
    name: string;
    color?: string;
    outline: OutlineVertex[];
}

export interface ShelfProduct {
    id: string;
    product_id: number | null;
    product_name: string | null;
    product_type?: string | null;
    quantity?: number;
    row?: number;   // depth row: 0 = front/top, 1 = behind/below, etc.
}

export interface Shelf {
    id: string;
    label: string;
    depth?: number;   // number of front-to-back rows (default 1)
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
    textColor?: string;
    labelFontSize?: number;
    parentId?: string;
    tableStyle?: 'round' | 'rect' | 'booth';
    chairCount?: number;
}

export interface MapData {
    name: string;
    width_ft: number;
    height_ft: number;
    grid_ft: number;
    outline: OutlineVertex[];
    rooms?: RoomArea[];
    objects: MapObject[];
    iconLayout?: 'vertical' | 'horizontal';
}

type Tool = 'select' | 'draw';
type Mode = 'view' | 'edit' | 'audit';
type HandlePos = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

type DragState =
    | { type: 'move'; ids: string[]; startMouse: Pt; startPositions: Record<string, Pt> }
    | { type: 'resize'; id: string; handle: HandlePos; startMouse: Pt; startObj: MapObject }
    | { type: 'rotate'; id: string; centerPx: Pt; startAngle: number; startRotation: number; prevAngle: number; accumulatedRot: number }
    | { type: 'pan'; startMouse: Pt; startPan: Pt }
    | { type: 'rubber'; startFt: Pt }
    | { type: 'room-vertex'; roomId: string; idx: number; startMouse: Pt; startPt: Pt }
    | { type: 'arc-ctrl'; roomId: string; vertIdx: number; startMouse: Pt };

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
    draft_tower:   { label: 'Draft Tower',     color: '#92400e', emoji: '🍺', w: 3,   h: 1.5, shelves: true  },
    text_label:    { label: 'Text Label',      color: 'transparent', emoji: 'T', w: 4, h: 0.75, shelves: false },
};

const PALETTE = [
    { label: 'Bar Structure',  types: ['bar_counter','back_bar','service_area','draft_tower'] as ObjType[] },
    { label: 'Equipment',      types: ['ice_well','register','sink','counter_cooler'] as ObjType[] },
    { label: 'Storage',        types: ['bottle_row','mixer_row','shelf_unit'] as ObjType[] },
    { label: 'Rooms',          types: ['liquor_room','cooler','office','bathroom'] as ObjType[] },
    { label: 'Architectural',  types: ['door','window','pillar','table'] as ObjType[] },
    { label: 'Entertainment',  types: ['pool_table','jukebox','atm'] as ObjType[] },
    { label: 'Labels & Text', types: ['text_label'] as ObjType[] },
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
    rooms: [], objects: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const s = (v: number) => Math.round(v / SNAP) * SNAP;
const uid = () => 'o_' + Math.random().toString(36).slice(2, 8);
const rid = () => 'r_' + Math.random().toString(36).slice(2, 8);
const sid = () => 's_' + Math.random().toString(36).slice(2, 8);
const pid = () => 'p_' + Math.random().toString(36).slice(2, 8);

// Build an SVG path string from an outline, handling arc segments via quadratic bezier
function outlineToPath(verts: OutlineVertex[], pxPerFt: number): string {
    if (!verts.length) return '';
    let d = `M ${verts[0].x * pxPerFt} ${verts[0].y * pxPerFt}`;
    for (let i = 0; i < verts.length; i++) {
        const curr = verts[i];
        const next = verts[(i + 1) % verts.length];
        if (curr.arcCtrl) {
            d += ` Q ${curr.arcCtrl.x * pxPerFt} ${curr.arcCtrl.y * pxPerFt} ${next.x * pxPerFt} ${next.y * pxPerFt}`;
        } else {
            d += ` L ${next.x * pxPerFt} ${next.y * pxPerFt}`;
        }
    }
    return d + ' Z';
}

// Midpoint of segment i (or midpoint of arc if control point exists)
function arcHandlePt(verts: OutlineVertex[], i: number): Pt {
    const A = verts[i], B = verts[(i + 1) % verts.length];
    if (A.arcCtrl) {
        return { x: (A.x + 2 * A.arcCtrl.x + B.x) / 4, y: (A.y + 2 * A.arcCtrl.y + B.y) / 4 };
    }
    return { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
}

const ROOM_COLORS = ['#1e3a5f', '#14532d', '#3b0764', '#7c2d12', '#164e63', '#422006'];
function nextRoomColor(rooms: RoomArea[]) { return ROOM_COLORS[rooms.length % ROOM_COLORS.length]; }

const PRESET_COLORS = [
    '#1e3a5f','#1e40af','#1d4ed8','#2563eb','#3b82f6','#60a5fa',
    '#14532d','#15803d','#16a34a','#22c55e',
    '#7f1d1d','#b91c1c','#dc2626','#ef4444',
    '#7c3aed','#6d28d9','#4c1d95',
    '#78350f','#92400e','#b45309','#d97706',
    '#164e63','#0e7490','#0891b2','#22d3ee',
    '#0f172a','#1e293b','#334155','#475569','#64748b','#94a3b8',
    '#ffffff','#f8fafc','#e2e8f0',
];

function makeShelves(n = 3): Shelf[] {
    const labels = ['Top Shelf', 'Middle Shelf', 'Bottom Shelf', 'Floor Level', 'Shelf 5'];
    return Array.from({ length: n }, (_, i) => ({
        id: sid(), label: labels[i] || `Shelf ${i + 1}`,
        products: Array.from({ length: 8 }, () => ({ id: pid(), product_id: null, product_name: null })),
    }));
}

function makeDraftShelves(tapCount = 2): Shelf[] {
    return [{
        id: sid(), label: 'Draft Taps',
        products: Array.from({ length: tapCount }, () => ({ id: pid(), product_id: null, product_name: null })),
    }];
}

function makeObj(type: ObjType, x: number, y: number, count: number): MapObject {
    const m = META[type];
    const shelves = type === 'draft_tower' ? makeDraftShelves(2)
        : m.shelves ? makeShelves(3) : [];
    return {
        id: uid(), type, name: type === 'text_label' ? 'Label' : `${m.label} ${count + 1}`,
        x, y, width: m.w, height: m.h,
        rotation: 0, shelves,
        doorDirection: 's', notes: '', color: undefined,
        textColor: type === 'text_label' ? '#ffffff' : undefined,
        labelFontSize: type === 'text_label' ? 14 : undefined,
        chairCount: type === 'table' ? 4 : undefined,
        tableStyle: type === 'table' ? 'rect' : undefined,
    };
}

function objVisual(o: MapObject) {
    const r = o.rotation * Math.PI / 180;
    const cosR = Math.abs(Math.cos(r)), sinR = Math.abs(Math.sin(r));
    const vw = cosR * o.width + sinR * o.height;
    const vh = sinR * o.width + cosR * o.height;
    const cx = o.x + o.width / 2, cy = o.y + o.height / 2;
    return { cx, cy, vw, vh, x: cx - vw / 2, y: cy - vh / 2 };
}

function snapToEdges(obj: MapObject, others: MapObject[], excludeIds: Set<string>): { x: number; y: number } {
    const { cx, cy, vw, vh } = objVisual(obj);
    const T = EDGE_SNAP_FT;
    let bestDx = T + 1, bestDy = T + 1, snapCx = cx, snapCy = cy;

    for (const o of others) {
        if (excludeIds.has(o.id)) continue;
        const ov = objVisual(o);
        for (const myX of [cx - vw / 2, cx + vw / 2]) {
            for (const theirX of [ov.cx - ov.vw / 2, ov.cx + ov.vw / 2]) {
                const d = theirX - myX;
                if (Math.abs(d) < Math.abs(bestDx)) { bestDx = d; snapCx = cx + d; }
            }
        }
        for (const myY of [cy - vh / 2, cy + vh / 2]) {
            for (const theirY of [ov.cy - ov.vh / 2, ov.cy + ov.vh / 2]) {
                const d = theirY - myY;
                if (Math.abs(d) < Math.abs(bestDy)) { bestDy = d; snapCy = cy + d; }
            }
        }
    }

    return {
        x: (Math.abs(bestDx) <= T ? snapCx : cx) - obj.width / 2,
        y: (Math.abs(bestDy) <= T ? snapCy : cy) - obj.height / 2,
    };
}

// Returns all object ids under the given point, ordered bottom→top (array order)
function getStackAt(objects: MapObject[], pt: Pt): string[] {
    return objects.filter(o => {
        const { x, y, vw, vh } = objVisual(o);
        return pt.x >= x && pt.x <= x + vw && pt.y >= y && pt.y <= y + vh;
    }).map(o => o.id);
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

// ─── Table Graphic (top-down seating) ────────────────────────────────────────

function TableGraphic({ x, y, w, h, chairCount, tableStyle }:
    { x: number; y: number; w: number; h: number; chairCount: number; tableStyle: 'round' | 'rect' | 'booth' }) {
    const col = '#1e1b4b';
    const chairFill = 'rgba(255,255,255,0.22)';
    const gap = 5;

    if (tableStyle === 'booth') {
        const seatD = Math.min(Math.min(w, h) * 0.26, 14);
        return (
            <g style={{ pointerEvents: 'none' }}>
                <rect x={x} y={y} width={w} height={seatD} fill="#312e81" rx={4} />
                <rect x={x} y={y + seatD} width={seatD} height={h - seatD * 2} fill="#312e81" rx={3} />
                <rect x={x + w - seatD} y={y + seatD} width={seatD} height={h - seatD * 2} fill="#312e81" rx={3} />
                <rect x={x + seatD + 3} y={y + seatD + 3} width={w - seatD * 2 - 6} height={h - seatD * 2 - 6} fill={col} rx={3} />
                <rect x={x + seatD * 0.5} y={y + h - seatD} width={w - seatD} height={seatD} fill="#312e81" rx={4} />
                <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={Math.max(7, Math.min(11, w / 6))}>Booth</text>
            </g>
        );
    }

    if (tableStyle === 'round') {
        const cx = x + w / 2, cy = y + h / 2;
        const tableR = Math.min(w, h) * 0.3;
        const chairR = Math.min(4, tableR * 0.32);
        const dist = tableR + chairR + 2;
        return (
            <g style={{ pointerEvents: 'none' }}>
                {Array.from({ length: chairCount }, (_, i) => {
                    const angle = (2 * Math.PI * i / chairCount) - Math.PI / 2;
                    const ccx = cx + Math.cos(angle) * dist;
                    const ccy = cy + Math.sin(angle) * dist;
                    return (
                        <ellipse key={i} cx={ccx} cy={ccy} rx={chairR + 1} ry={chairR}
                            fill={chairFill}
                            transform={`rotate(${angle * 180 / Math.PI + 90},${ccx},${ccy})`} />
                    );
                })}
                <circle cx={cx} cy={cy} r={tableR} fill={col} />
            </g>
        );
    }

    // Rect: distribute chairs around the perimeter
    const perim = 2 * (w + h);
    return (
        <g style={{ pointerEvents: 'none' }}>
            {Array.from({ length: chairCount }, (_, i) => {
                const t = (i / chairCount) * perim;
                const cw = 7, ch = 4;
                if (t < w) {
                    const px = x + t;
                    return <rect key={i} x={px - cw / 2} y={y - gap - ch} width={cw} height={ch} rx={1} fill={chairFill} />;
                } else if (t < w + h) {
                    const py = y + (t - w);
                    return <rect key={i} x={x + w + gap} y={py - cw / 2} width={ch} height={cw} rx={1} fill={chairFill} />;
                } else if (t < 2 * w + h) {
                    const px = x + w - (t - w - h);
                    return <rect key={i} x={px - cw / 2} y={y + h + gap} width={cw} height={ch} rx={1} fill={chairFill} />;
                } else {
                    const py = y + h - (t - 2 * w - h);
                    return <rect key={i} x={x - gap - ch} y={py - cw / 2} width={ch} height={cw} rx={1} fill={chairFill} />;
                }
            })}
            <rect x={x} y={y} width={w} height={h} fill={col} rx={Math.min(w, h) * 0.15} />
        </g>
    );
}

// ─── Draft Tower Graphic (top-down) ───────────────────────────────────────────

function DraftTowerGraphic({ x, y, w, h, shelves }: { x: number; y: number; w: number; h: number; shelves: Shelf[] }) {
    const taps = shelves[0]?.products ?? [];
    const tapCount = Math.max(1, taps.length);
    const tapW = w / tapCount;
    const baseH = Math.max(6, h * 0.18);
    const handleR = Math.min(tapW * 0.29, h * 0.22, 12);
    const stemH = h * 0.25;

    return (
        <g style={{ pointerEvents: 'none' }}>
            {/* Drip tray */}
            <rect x={x + 2} y={y + h - baseH} width={w - 4} height={baseH} fill="#451a03" rx={2} />
            <rect x={x + 4} y={y + h - baseH + 2} width={w - 8} height={baseH - 4} fill="#1c0a00" rx={1} />
            {/* Per-tap graphics */}
            {taps.map((tap, i) => {
                const tapCx = x + i * tapW + tapW / 2;
                const color = tap.product_id ? productColor(tap.product_name || '') : '#44403c';
                return (
                    <g key={tap.id}>
                        {i > 0 && <line x1={x + i * tapW} y1={y + 4} x2={x + i * tapW} y2={y + h - baseH - 2} stroke="rgba(0,0,0,0.3)" strokeWidth={1} />}
                        {/* Handle (top-down oval) */}
                        <ellipse cx={tapCx} cy={y + h * 0.28} rx={handleR} ry={Math.max(3, h * 0.12)}
                            fill={color} stroke="rgba(0,0,0,0.4)" strokeWidth={1} />
                        {/* Tap stem */}
                        <rect x={tapCx - Math.max(2, tapW * 0.08)} y={y + h * 0.4}
                            width={Math.max(4, tapW * 0.16)} height={stemH}
                            fill="#6b4c2a" rx={1} />
                        {/* Nozzle */}
                        <ellipse cx={tapCx} cy={y + h * 0.4 + stemH}
                            rx={Math.max(2.5, tapW * 0.1)} ry={2} fill="#451a03" />
                        {/* Product label or tap number */}
                        <text x={tapCx} y={y + h - baseH - 4} textAnchor="middle"
                            fill={tap.product_name ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.25)'}
                            fontSize={Math.max(5, Math.min(9, tapW * 0.22))}>
                            {tap.product_name
                                ? (tap.product_name.length > 7 ? tap.product_name.slice(0, 6) + '…' : tap.product_name)
                                : String(i + 1)}
                        </text>
                    </g>
                );
            })}
            {/* DRAFT label */}
            <text x={x + w / 2} y={y + 9} textAnchor="middle"
                fill="rgba(255,255,255,0.35)" fontSize={Math.max(6, Math.min(10, w / (tapCount + 1)))} fontWeight="600" letterSpacing="1">
                DRAFT
            </text>
        </g>
    );
}

// ─── Shelf Products Renderer ───────────────────────────────────────────────────

function ShelfProducts({ obj, px: pxPerFt, mode, iconLayout = 'vertical', onSelectProduct }:
    { obj: MapObject; px: number; mode: Mode; iconLayout?: 'vertical' | 'horizontal'; onSelectProduct?: (product: ShelfProduct) => void }) {
    const x = obj.x * pxPerFt, y = obj.y * pxPerFt;
    const w = obj.width * pxPerFt, h = obj.height * pxPerFt;
    if (!obj.shelves.length) return null;
    const rowH = h / obj.shelves.length;
    const interactive = mode === 'view' || mode === 'audit';

    return (
        <g style={{ pointerEvents: interactive ? 'all' : 'none' }}>
            {obj.shelves.map((shelf, si) => {
                const filled = shelf.products.filter(p => p.product_id);
                if (!filled.length) return null;
                const rowY = y + si * rowH;

                if (iconLayout === 'horizontal') {
                    const totalIcons = filled.reduce((acc, p) => acc + Math.max(1, p.quantity ?? 1), 0);
                    const iconSpacing = (w - 8) / Math.max(totalIcons, 1);
                    const r = Math.max(2.5, Math.min(iconSpacing * 0.42, rowH * 0.38));
                    let iconIdx = 0;
                    return filled.map(p => {
                        const qty = Math.max(1, p.quantity ?? 1);
                        const col = productColor(p.product_name || '');
                        const icons = Array.from({ length: qty }, (_, i) => {
                            const cx = x + 4 + (iconIdx + i + 0.5) * iconSpacing;
                            const cy = rowY + rowH / 2;
                            return <BottleIcon key={i} cx={cx} cy={cy} r={r} color={col} />;
                        });
                        iconIdx += qty;
                        return (
                            <g key={p.id} onClick={() => interactive && onSelectProduct?.(p)}
                                style={{ cursor: interactive ? 'pointer' : 'default' }}>
                                {icons}
                            </g>
                        );
                    });
                }

                // Vertical mode: products as columns, icons stacked bottom-to-top
                const colW = (w - 8) / filled.length;
                const maxQty = Math.max(...filled.map(p => Math.max(1, p.quantity ?? 1)));
                const r = Math.max(2.5, Math.min(colW * 0.38, rowH / (maxQty * 2.4)));
                const step = r * 2.3;

                return filled.map((p, pi) => {
                    const qty = Math.max(1, p.quantity ?? 1);
                    const cx = x + 4 + colW * pi + colW / 2;
                    const col = productColor(p.product_name || '');
                    const bottomY = rowY + rowH - r - 2;
                    return (
                        <g key={p.id} onClick={() => interactive && onSelectProduct?.(p)}
                            style={{ cursor: interactive ? 'pointer' : 'default' }}>
                            {Array.from({ length: qty }, (_, i) => (
                                <BottleIcon key={i} cx={cx} cy={bottomY - i * step} r={r} color={col} />
                            ))}
                            {mode === 'audit' && p.quantity !== undefined && (
                                <text x={cx} y={rowY + rowH + 9} textAnchor="middle"
                                    fill={p.quantity === 0 ? '#ef4444' : p.quantity <= 2 ? '#f59e0b' : '#22c55e'}
                                    fontSize={7} fontWeight="600">{p.quantity}</text>
                            )}
                        </g>
                    );
                });
            })}
        </g>
    );
}

// ─── Object Renderer ──────────────────────────────────────────────────────────

function ObjRenderer({ obj, selected, multiSelected, mode, pxPerFt, iconLayout, onPointerDown, onContextMenu, onSelectProduct, onOpenShelfDetail }:
    { obj: MapObject; selected: boolean; multiSelected: boolean; mode: Mode; pxPerFt: number; iconLayout?: 'vertical' | 'horizontal'; onPointerDown: (e: React.PointerEvent, id: string) => void; onContextMenu: (e: React.MouseEvent, id: string) => void; onSelectProduct?: (product: ShelfProduct) => void; onOpenShelfDetail?: (id: string) => void }) {
    const m = META[obj.type];
    const col = obj.color || m.color;
    const txtCol = obj.textColor || 'rgba(255,255,255,0.85)';
    const x = obj.x * pxPerFt, y = obj.y * pxPerFt;
    const w = obj.width * pxPerFt, h = obj.height * pxPerFt;
    const cx = x + w / 2, cy = y + h / 2;
    const fs = Math.max(7, Math.min(13, w / 8));
    const isDoor = obj.type === 'door';
    const isWindow = obj.type === 'window';
    const hasShelves = obj.shelves.length > 0 && obj.type !== 'draft_tower';
    const isDraft = obj.type === 'draft_tower';
    const isRoom = ['liquor_room', 'cooler', 'office', 'bathroom'].includes(obj.type);
    const isTextLabel = obj.type === 'text_label';
    const highlight = selected || multiSelected;
    const cursor = mode === 'edit' ? 'move' : 'default';

    return (
        <g transform={`rotate(${obj.rotation},${cx},${cy})`}
            onPointerDown={e => onPointerDown(e, obj.id)}
            onContextMenu={e => onContextMenu(e, obj.id)}
            style={{ cursor }}>

            {isTextLabel ? (
                <>
                    {/* Invisible hit area */}
                    <rect x={x} y={y} width={w} height={h} fill="rgba(255,255,255,0.03)" rx={2}
                        stroke={highlight ? 'rgba(251,191,36,0.5)' : 'rgba(255,255,255,0.08)'} strokeWidth={1} strokeDasharray="4 3" />
                    <text x={cx} y={cy + (obj.labelFontSize ?? 14) * 0.38}
                        textAnchor="middle" fill={obj.textColor || '#ffffff'}
                        fontSize={obj.labelFontSize ?? 14} fontWeight="600"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}>
                        {obj.name}
                    </text>
                </>
            ) : isDoor ? (
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
            ) : isDraft ? (
                <DraftTowerGraphic x={x} y={y} w={w} h={h} shelves={obj.shelves} />
            ) : isRoom ? (
                <>
                    <rect x={x} y={y} width={w} height={h} fill={col} fillOpacity={0.45} rx={3} stroke={col} strokeWidth={2} strokeDasharray={selected ? '0' : '7 3'} />
                    {obj.shelves.map((shelf, i) => {
                        const sy = y + h * 0.12 + i * (h * 0.7 / Math.max(obj.shelves.length, 1));
                        return <line key={shelf.id} x1={x + 10} y1={sy} x2={x + w - 10} y2={sy} stroke="rgba(255,255,255,0.18)" strokeWidth={1.5} />;
                    })}
                    <text x={cx} y={cy - 4} textAnchor="middle" fill="white" fontSize={fs + 2}>{m.emoji}</text>
                    <text x={cx} y={cy + fs + 2} textAnchor="middle" fill={txtCol} fontSize={fs - 1}>{obj.name}</text>
                    <ShelfProducts obj={obj} px={pxPerFt} mode={mode} iconLayout={iconLayout} onSelectProduct={onSelectProduct} />
                    {/* Shelf expand button */}
                    {onOpenShelfDetail && obj.shelves.length > 0 && (
                        <g onClick={e => { e.stopPropagation(); onOpenShelfDetail(obj.id); }} style={{ cursor: 'pointer' }}>
                            <rect x={x + w - 18} y={y + 2} width={16} height={14} rx={3} fill="rgba(0,0,0,0.5)" />
                            <text x={x + w - 10} y={y + 12} textAnchor="middle" fill="#93c5fd" fontSize={9}>⊞</text>
                        </g>
                    )}
                </>
            ) : hasShelves ? (
                <>
                    <rect x={x} y={y} width={w} height={h} fill={col} rx={2} />
                    {obj.shelves.map((shelf, i) => {
                        const sy = y + (h / obj.shelves.length) * i;
                        return <line key={shelf.id} x1={x} y1={sy} x2={x + w} y2={sy} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />;
                    })}
                    <ShelfProducts obj={obj} px={pxPerFt} mode={mode} iconLayout={iconLayout} onSelectProduct={onSelectProduct} />
                    <text x={cx} y={cy + fs / 2} textAnchor="middle" fill={txtCol} fontSize={fs - 1}>{obj.name}</text>
                    {/* Shelf expand button */}
                    {onOpenShelfDetail && obj.shelves.length > 0 && (
                        <g onClick={e => { e.stopPropagation(); onOpenShelfDetail(obj.id); }} style={{ cursor: 'pointer' }}>
                            <rect x={x + w - 18} y={y + 2} width={16} height={14} rx={3} fill="rgba(0,0,0,0.5)" />
                            <text x={x + w - 10} y={y + 12} textAnchor="middle" fill="#93c5fd" fontSize={9}>⊞</text>
                        </g>
                    )}
                </>
            ) : obj.type === 'table' ? (
                <>
                    <TableGraphic x={x} y={y} w={w} h={h}
                        chairCount={obj.chairCount ?? 4}
                        tableStyle={obj.tableStyle ?? 'rect'} />
                    <text x={cx} y={cy + fs / 3} textAnchor="middle" fill={obj.textColor || 'rgba(255,255,255,0.7)'} fontSize={fs - 2}>{obj.name}</text>
                </>
            ) : obj.type === 'ice_well' ? (
                <>
                    <rect x={x} y={y} width={w} height={h} fill={col} rx={2} />
                    <rect x={x + 3} y={y + 3} width={w - 6} height={h - 6} fill="rgba(147,210,255,0.15)" rx={1} />
                    <text x={cx} y={cy - 2} textAnchor="middle" fill="#bae6fd" fontSize={fs + 1}>❄</text>
                    <text x={cx} y={cy + fs + 1} textAnchor="middle" fill={txtCol} fontSize={fs - 2}>{obj.name}</text>
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
                    <text x={cx} y={cy + fs + 1} textAnchor="middle" fill={txtCol} fontSize={fs - 1}>{obj.name}</text>
                </>
            )}

            {/* Selection ring */}
            {highlight && !isTextLabel && (
                <rect x={x - 2} y={y - 2} width={w + 4} height={h + 4} rx={3}
                    fill="none" stroke={selected ? '#fbbf24' : '#60a5fa'} strokeWidth={selected ? 2 : 1.5}
                    strokeDasharray={selected ? '0' : '5 3'}
                    style={{ pointerEvents: 'none' }} />
            )}

            {/* Dimension tag */}
            {selected && mode === 'edit' && !isTextLabel && (
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

    // Draft tower tap helpers
    function addTap() {
        const taps = obj.shelves[0]?.products ?? [];
        const newShelf = { ...(obj.shelves[0] ?? { id: sid(), label: 'Draft Taps' }), products: [...taps, { id: pid(), product_id: null, product_name: null }] };
        onUpdate({ ...obj, shelves: obj.shelves.length > 0 ? [newShelf, ...obj.shelves.slice(1)] : [newShelf] });
    }
    function removeTap() {
        const taps = obj.shelves[0]?.products ?? [];
        if (taps.length <= 1) return;
        const newShelf = { ...(obj.shelves[0]), products: taps.slice(0, -1) };
        onUpdate({ ...obj, shelves: [newShelf, ...obj.shelves.slice(1)] });
    }
    function assignTap(ti: number, productId: number | null, productName: string | null) {
        const shelf = obj.shelves[0];
        if (!shelf) return;
        const updated = { ...shelf, products: shelf.products.map((p, j) => j !== ti ? p : { ...p, product_id: productId, product_name: productName }) };
        onUpdate({ ...obj, shelves: [updated, ...obj.shelves.slice(1)] });
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

                    <label style={{ color: '#94a3b8', display: 'block', marginBottom: 4 }}>Object Color</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                        {PRESET_COLORS.map(c => (
                            <button type="button" key={c} onClick={() => onUpdate({ ...obj, color: c })}
                                title={c}
                                style={{ width: 18, height: 18, borderRadius: 3, background: c, border: (obj.color || m.color) === c ? '2px solid #fbbf24' : '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', padding: 0 }} />
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
                        <input type="color" title="Custom object color" value={obj.color || m.color} onChange={e => onUpdate({ ...obj, color: e.target.value })}
                            style={{ width: 36, height: 28, border: 'none', borderRadius: 4, cursor: 'pointer', background: 'none' }} />
                        <button type="button" onClick={() => onUpdate({ ...obj, color: undefined })}
                            style={{ background: 'transparent', border: '1px solid #334155', borderRadius: 5, padding: '3px 8px', color: '#64748b', cursor: 'pointer', fontSize: 11 }}>Reset</button>
                    </div>

                    <label style={{ color: '#94a3b8', display: 'block', marginBottom: 4 }}>Text Color</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                        {['#ffffff','#f8fafc','#fbbf24','#93c5fd','#86efac','#fca5a5','#000000','#1e293b'].map(c => (
                            <button type="button" key={c} onClick={() => onUpdate({ ...obj, textColor: c })}
                                title={c}
                                style={{ width: 18, height: 18, borderRadius: 3, background: c, border: (obj.textColor || 'rgba(255,255,255,0.85)') === c ? '2px solid #fbbf24' : '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', padding: 0 }} />
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
                        <input type="color" title="Custom text color" value={obj.textColor || '#ffffff'} onChange={e => onUpdate({ ...obj, textColor: e.target.value })}
                            style={{ width: 36, height: 28, border: 'none', borderRadius: 4, cursor: 'pointer', background: 'none' }} />
                        <button type="button" onClick={() => onUpdate({ ...obj, textColor: undefined })}
                            style={{ background: 'transparent', border: '1px solid #334155', borderRadius: 5, padding: '3px 8px', color: '#64748b', cursor: 'pointer', fontSize: 11 }}>Reset</button>
                    </div>

                    {obj.type === 'text_label' && (
                        <>
                            <label style={{ color: '#94a3b8', display: 'block', marginBottom: 2 }}>Font Size</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                <input type="range" title="Font size" min={8} max={48} step={1} value={obj.labelFontSize ?? 14}
                                    onChange={e => onUpdate({ ...obj, labelFontSize: +e.target.value })} style={{ flex: 1 }} />
                                <span style={{ color: '#64748b', minWidth: 28, textAlign: 'right' }}>{obj.labelFontSize ?? 14}px</span>
                            </div>
                        </>
                    )}

                    {/* Table-specific: style + chair count */}
                    {obj.type === 'table' && (
                        <>
                            <label style={{ color: '#94a3b8', display: 'block', marginBottom: 2 }}>Table Style</label>
                            <select title="Table style" value={obj.tableStyle ?? 'rect'} onChange={e => onUpdate({ ...obj, tableStyle: e.target.value as 'round' | 'rect' | 'booth' })}
                                style={{ ...inp, marginBottom: 10 }}>
                                <option value="rect">Rectangular</option>
                                <option value="round">Round</option>
                                <option value="booth">Booth</option>
                            </select>
                            {(obj.tableStyle ?? 'rect') !== 'booth' && (
                                <>
                                    <label style={{ color: '#94a3b8', display: 'block', marginBottom: 2 }}>Chairs</label>
                                    <input title="Number of chairs" type="number" min={0} max={24} value={obj.chairCount ?? 4}
                                        onChange={e => onUpdate({ ...obj, chairCount: Math.max(0, Math.min(24, parseInt(e.target.value) || 0)) })}
                                        style={{ ...inp, marginBottom: 10 }} />
                                </>
                            )}
                        </>
                    )}

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

            {/* Draft Tower: tap-specific UI */}
            {obj.type === 'draft_tower' && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ color: '#e2e8f0', fontWeight: 600 }}>Draft Taps ({obj.shelves[0]?.products.length ?? 0})</span>
                        {mode === 'edit' && (
                            <div style={{ display: 'flex', gap: 4 }}>
                                <button type="button" onClick={removeTap}
                                    style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 5, padding: '2px 8px', color: '#94a3b8', cursor: 'pointer', fontSize: 11 }}>- Tap</button>
                                <button type="button" onClick={addTap}
                                    style={{ background: '#1e3a5f', border: '1px solid #1e40af', borderRadius: 5, padding: '2px 8px', color: '#93c5fd', cursor: 'pointer', fontSize: 11 }}>+ Tap</button>
                            </div>
                        )}
                    </div>
                    {(obj.shelves[0]?.products ?? []).map((tap, ti) => (
                        <div key={tap.id} style={{ background: '#1e293b', borderRadius: 6, padding: '5px 8px', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 9, height: 9, borderRadius: '50%', background: tap.product_id ? productColor(tap.product_name || '') : '#44403c', flexShrink: 0, display: 'inline-block' }} />
                            <span style={{ color: '#64748b', fontSize: 11, minWidth: 20 }}>#{ti + 1}</span>
                            {mode === 'edit' ? (
                                <select title={`Tap ${ti + 1} product`} value={tap.product_id ?? ''} onChange={e => {
                                    const pr = products.find(x => x.id === parseInt(e.target.value));
                                    assignTap(ti, pr?.id ?? null, pr?.name ?? null);
                                }} style={{ flex: 1, background: '#0f172a', border: '1px solid #334155', borderRadius: 4, padding: '2px 5px', color: tap.product_id ? 'white' : '#475569', fontSize: 11 }}>
                                    <option value="">— no product —</option>
                                    {products.map(pr => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
                                </select>
                            ) : (
                                <span style={{ flex: 1, color: tap.product_id ? '#e2e8f0' : '#475569', fontSize: 11 }}>{tap.product_name || '— no product —'}</span>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Shelves (non-draft-tower) */}
            {obj.type !== 'draft_tower' && (m.shelves || obj.shelves.length > 0) && (
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
                                {mode === 'edit' && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <span style={{ color: '#475569', fontSize: 10 }}>Rows:</span>
                                        <button type="button" title="Remove depth row"
                                            onClick={() => onUpdate({ ...obj, shelves: obj.shelves.map((s, i) => i !== si ? s : { ...s, depth: Math.max(1, (s.depth ?? 1) - 1) }) })}
                                            style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 3, width: 18, height: 18, color: '#94a3b8', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0 }}>−</button>
                                        <span style={{ color: '#e2e8f0', fontSize: 11, minWidth: 12, textAlign: 'center' }}>{shelf.depth ?? 1}</span>
                                        <button type="button" title="Add depth row"
                                            onClick={() => onUpdate({ ...obj, shelves: obj.shelves.map((s, i) => i !== si ? s : { ...s, depth: (s.depth ?? 1) + 1 }) })}
                                            style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 3, width: 18, height: 18, color: '#94a3b8', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0 }}>+</button>
                                        <button type="button" onClick={() => removeShelf(si)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 15, padding: '0 4px', marginLeft: 2 }}>×</button>
                                    </div>
                                )}
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

// ─── Shelf Detail Modal ───────────────────────────────────────────────────────

function ShelfDetailModal({ obj, products, mode, onUpdate, onClose }: {
    obj: MapObject; products: any[]; mode: Mode;
    onUpdate: (o: MapObject) => void; onClose: () => void;
}) {
    const [dragOver, setDragOver] = useState<{ shelfIdx: number; row: number; col: number } | null>(null);
    const [dragging, setDragging] = useState<{ shelfIdx: number; productId: string } | null>(null);

    function assignProduct(si: number, pi: number, productId: number | null, productName: string | null) {
        onUpdate({
            ...obj,
            shelves: obj.shelves.map((s, i) => i !== si ? s : {
                ...s,
                products: s.products.map((p, j) => j !== pi ? p : { ...p, product_id: productId, product_name: productName }),
            }),
        });
    }

    function setProductRow(si: number, productId: string, row: number) {
        onUpdate({
            ...obj,
            shelves: obj.shelves.map((s, i) => i !== si ? s : {
                ...s,
                products: s.products.map(p => p.id !== productId ? p : { ...p, row }),
            }),
        });
    }

    function moveProduct(fromSi: number, fromProdId: string, toSi: number, toRow: number) {
        const shelves = obj.shelves.map((s, i) => {
            if (i === fromSi) {
                return { ...s, products: s.products.map(p => p.id !== fromProdId ? p : { ...p, row: toRow }) };
            }
            return s;
        });
        // If moving between shelves, also reassign shelf (swap product to target shelf)
        if (fromSi !== toSi) {
            const fromProd = obj.shelves[fromSi].products.find(p => p.id === fromProdId);
            if (!fromProd) return;
            const updated = obj.shelves.map((s, i) => {
                if (i === fromSi) return { ...s, products: s.products.filter(p => p.id !== fromProdId) };
                if (i === toSi) return { ...s, products: [...s.products, { ...fromProd, row: toRow }] };
                return s;
            });
            onUpdate({ ...obj, shelves: updated });
            return;
        }
        onUpdate({ ...obj, shelves });
    }

    const inp = { background: '#1e293b', border: '1px solid #334155', borderRadius: 5, padding: '3px 6px', color: 'white', fontSize: 11, width: '100%', boxSizing: 'border-box' as const };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={{ background: '#1e293b', borderRadius: 14, width: 'min(90vw, 860px)', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', border: '1px solid #334155', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
                {/* Header */}
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <span style={{ fontWeight: 700, color: '#e2e8f0', fontSize: 15 }}>⊞ {obj.name} — Shelf Detail</span>
                    <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
                </div>

                {/* Body */}
                <div style={{ overflowY: 'auto', padding: '16px 18px', flex: 1 }}>
                    {obj.shelves.map((shelf, si) => {
                        const depth = shelf.depth ?? 1;
                        const rows: ShelfProduct[][] = Array.from({ length: depth }, (_, r) =>
                            shelf.products.filter(p => (p.row ?? 0) === r)
                        );
                        const unassigned = shelf.products.filter(p => (p.row ?? 0) >= depth);

                        return (
                            <div key={shelf.id} style={{ marginBottom: 20 }}>
                                <div style={{ color: '#93c5fd', fontWeight: 700, fontSize: 13, marginBottom: 10, letterSpacing: '0.03em' }}>
                                    {shelf.label} <span style={{ color: '#475569', fontWeight: 400, fontSize: 11 }}>({depth} row{depth !== 1 ? 's' : ''} deep)</span>
                                </div>

                                {/* Depth rows grid */}
                                {rows.map((rowProducts, rowIdx) => (
                                    <div key={rowIdx} style={{ marginBottom: 6 }}>
                                        <div style={{ color: '#64748b', fontSize: 10, marginBottom: 3 }}>
                                            {rowIdx === 0 ? 'Front / Top' : rowIdx === depth - 1 ? 'Back / Bottom' : `Row ${rowIdx + 1}`}
                                        </div>
                                        <div
                                            onDragOver={e => { e.preventDefault(); setDragOver({ shelfIdx: si, row: rowIdx, col: rowProducts.length }); }}
                                            onDrop={e => {
                                                e.preventDefault();
                                                const data = e.dataTransfer.getData('text/plain');
                                                if (data) {
                                                    const { fromSi, prodId } = JSON.parse(data);
                                                    moveProduct(fromSi, prodId, si, rowIdx);
                                                }
                                                setDragOver(null);
                                                setDragging(null);
                                            }}
                                            onDragLeave={() => setDragOver(null)}
                                            style={{
                                                display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 44,
                                                background: dragOver?.shelfIdx === si && dragOver?.row === rowIdx ? 'rgba(59,130,246,0.15)' : '#0f172a',
                                                border: `1px dashed ${dragOver?.shelfIdx === si && dragOver?.row === rowIdx ? '#3b82f6' : '#1e3a5f'}`,
                                                borderRadius: 8, padding: '6px 8px', transition: 'background 0.15s',
                                            }}>
                                            {rowProducts.length === 0 && (
                                                <span style={{ color: '#334155', fontSize: 11, alignSelf: 'center' }}>Drop products here</span>
                                            )}
                                            {rowProducts.map((p) => {
                                                const pi = shelf.products.findIndex(sp => sp.id === p.id);
                                                return (
                                                    <div key={p.id}
                                                        draggable
                                                        onDragStart={e => {
                                                            e.dataTransfer.setData('text/plain', JSON.stringify({ fromSi: si, prodId: p.id }));
                                                            setDragging({ shelfIdx: si, productId: p.id });
                                                        }}
                                                        onDragEnd={() => setDragging(null)}
                                                        style={{
                                                            background: dragging?.productId === p.id ? '#334155' : '#1e293b',
                                                            border: '1px solid #334155', borderRadius: 8, padding: '5px 8px',
                                                            cursor: 'grab', display: 'flex', alignItems: 'center', gap: 6,
                                                            opacity: dragging?.productId === p.id ? 0.4 : 1,
                                                            minWidth: 120, maxWidth: 200,
                                                        }}>
                                                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.product_id ? productColor(p.product_name || '') : '#44403c', flexShrink: 0, display: 'inline-block' }} />
                                                        {mode === 'edit' ? (
                                                            <select title={`Slot product`} value={p.product_id ?? ''} onChange={e => {
                                                                const pr = products.find(x => x.id === parseInt(e.target.value));
                                                                assignProduct(si, pi, pr?.id ?? null, pr?.name ?? null);
                                                            }} style={{ ...inp, width: 'auto', flex: 1 }}>
                                                                <option value="">— empty —</option>
                                                                {products.map(pr => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
                                                            </select>
                                                        ) : (
                                                            <span style={{ fontSize: 11, color: p.product_id ? '#e2e8f0' : '#475569', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                {p.product_name || '— empty —'}
                                                            </span>
                                                        )}
                                                        {/* Row selector dots */}
                                                        {mode === 'edit' && depth > 1 && (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                                {Array.from({ length: depth }, (_, r) => (
                                                                    <button type="button" key={r} title={`Move to row ${r + 1}`}
                                                                        onClick={() => setProductRow(si, p.id, r)}
                                                                        style={{ width: 8, height: 8, borderRadius: '50%', border: 'none', padding: 0, cursor: 'pointer', background: (p.row ?? 0) === r ? '#3b82f6' : '#334155' }} />
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}

                                {/* Unassigned products (row beyond depth) */}
                                {unassigned.length > 0 && (
                                    <div style={{ background: '#1a0f0f', borderRadius: 6, padding: '6px 8px', border: '1px solid #7f1d1d', fontSize: 11, color: '#fca5a5', marginTop: 4 }}>
                                        ⚠ {unassigned.length} product{unassigned.length > 1 ? 's' : ''} assigned to rows beyond current depth — drag them to a valid row above.
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div style={{ padding: '10px 18px', borderTop: '1px solid #334155', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
                    <button type="button" onClick={onClose}
                        style={{ background: '#1e3a5f', border: '1px solid #1e40af', borderRadius: 7, padding: '6px 18px', color: '#93c5fd', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                        Done
                    </button>
                </div>
            </div>
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

// ─── Audit Panel ─────────────────────────────────────────────────────────────

function AuditPanel({ objects, inventoryQtys, onAuditChange, onFinish, saving }: {
    objects: MapObject[];
    inventoryQtys: Record<number, number>;
    onAuditChange: (objId: string, shelfId: string, slotId: string, qty: number) => void;
    onFinish: () => void;
    saving: boolean;
}) {
    type AuditEntry = { obj: MapObject; shelf: Shelf; product: ShelfProduct };
    const entries: AuditEntry[] = [];
    for (const obj of objects) {
        for (const shelf of obj.shelves) {
            for (const product of shelf.products) {
                if (product.product_id) entries.push({ obj, shelf, product });
            }
        }
    }

    const counted = entries.filter(e => e.product.quantity !== undefined && e.product.quantity !== null);
    const uncounted = entries.filter(e => e.product.quantity === undefined || e.product.quantity === null);
    const pct = entries.length === 0 ? 0 : Math.round((counted.length / entries.length) * 100);

    const btnSt: React.CSSProperties = {
        background: '#1e293b', border: '1px solid #334155', borderRadius: 3,
        width: 22, height: 22, color: 'white', cursor: 'pointer', fontSize: 15,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    };

    function renderEntry({ obj, shelf, product }: AuditEntry, isCounted: boolean) {
        const qty = product.quantity ?? 0;
        const sysQty = product.product_id ? (inventoryQtys[product.product_id] ?? null) : null;
        const qtyColor = qty === 0 ? '#ef4444' : qty <= 2 ? '#f59e0b' : '#22c55e';
        const diffFromSys = isCounted && sysQty !== null ? qty - sysQty : null;
        return (
            <div key={product.id} style={{ background: '#0f172a', borderRadius: 6, padding: '6px 8px', marginBottom: 4, borderLeft: `3px solid ${isCounted ? qtyColor : '#334155'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ color: '#475569', fontSize: 10 }}>{obj.name} › {shelf.label}</span>
                    {sysQty !== null && (
                        <span style={{ color: '#334155', fontSize: 10 }}>
                            Sys: <span style={{ color: '#64748b' }}>{sysQty}</span>
                            {diffFromSys !== null && diffFromSys !== 0 && (
                                <span style={{ color: diffFromSys > 0 ? '#4ade80' : '#f87171', marginLeft: 3, fontWeight: 700 }}>
                                    {diffFromSys > 0 ? '+' : ''}{diffFromSys}
                                </span>
                            )}
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {isCounted && <span style={{ color: '#22c55e', fontSize: 12, flexShrink: 0 }}>✓</span>}
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: productColor(product.product_name || ''), flexShrink: 0, display: 'inline-block' }} />
                    <span style={{ flex: 1, color: isCounted ? '#e2e8f0' : '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.product_name}</span>
                    <button type="button" style={btnSt} onClick={() => onAuditChange(obj.id, shelf.id, product.id, Math.max(0, qty - 1))}>−</button>
                    <span style={{ minWidth: 22, textAlign: 'center', color: isCounted ? qtyColor : '#64748b', fontWeight: 700 }}>{isCounted ? qty : '?'}</span>
                    <button type="button" style={btnSt} onClick={() => onAuditChange(obj.id, shelf.id, product.id, qty + 1)}>+</button>
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: 12 }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid #1e293b' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ color: '#fbbf24', fontWeight: 700, fontSize: 13 }}>📋 Audit List</span>
                    <span style={{ color: pct === 100 ? '#22c55e' : '#64748b', fontSize: 11, fontWeight: 600 }}>{counted.length}/{entries.length}</span>
                </div>
                {entries.length > 0 && (
                    <div style={{ background: '#0f172a', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#22c55e' : '#3b82f6', borderRadius: 4, transition: 'width 0.3s' }} />
                    </div>
                )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
                {entries.length === 0 ? (
                    <div style={{ color: '#334155', textAlign: 'center', padding: 20 }}>No products assigned to shelves yet. Switch to Edit mode to assign products.</div>
                ) : (
                    <>
                        {uncounted.length > 0 && (
                            <>
                                <div style={{ color: '#64748b', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 2px 4px' }}>
                                    Need to Count ({uncounted.length})
                                </div>
                                {uncounted.map(e => renderEntry(e, false))}
                            </>
                        )}
                        {counted.length > 0 && (
                            <>
                                <div style={{ color: '#64748b', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '8px 2px 4px' }}>
                                    Counted ({counted.length})
                                </div>
                                {counted.map(e => renderEntry(e, true))}
                            </>
                        )}
                    </>
                )}
            </div>

            <div style={{ padding: 10, borderTop: '1px solid #1e293b' }}>
                {pct === 100 && (
                    <div style={{ color: '#22c55e', textAlign: 'center', fontSize: 11, marginBottom: 6 }}>All items counted!</div>
                )}
                <button type="button" onClick={onFinish} disabled={saving}
                    style={{ width: '100%', background: saving ? '#0f172a' : '#166534', border: `1px solid ${saving ? '#334155' : '#15803d'}`, borderRadius: 7, padding: '8px', color: saving ? '#64748b' : '#86efac', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13 }}>
                    {saving ? '⏳ Saving…' : '✓ Finish Audit & Save'}
                </button>
            </div>
        </div>
    );
}

// ─── Room Props Panel ─────────────────────────────────────────────────────────

function RoomPropsPanel({ room, mode, onUpdate, onDelete }: {
    room: RoomArea; mode: Mode;
    onUpdate: (r: RoomArea) => void;
    onDelete: (id: string) => void;
}) {
    const inp = { background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '5px 8px', color: 'white', fontSize: 12, width: '100%', boxSizing: 'border-box' as const };
    return (
        <div style={{ padding: 14, fontSize: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ color: '#a78bfa', fontWeight: 700, fontSize: 13 }}>🏠 Sub-Room</span>
                {mode === 'edit' && <button type="button" onClick={() => onDelete(room.id)} style={{ background: '#7f1d1d', border: 'none', borderRadius: 5, padding: '3px 8px', color: '#fca5a5', cursor: 'pointer', fontSize: 11 }}>Remove</button>}
            </div>
            {mode === 'edit' && (
                <>
                    <label style={{ color: '#94a3b8', display: 'block', marginBottom: 2 }}>Name</label>
                    <input title="Room name" value={room.name} onChange={e => onUpdate({ ...room, name: e.target.value })} style={{ ...inp, marginBottom: 10 }} />
                    <label style={{ color: '#94a3b8', display: 'block', marginBottom: 4 }}>Fill Color</label>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
                        <input type="color" title="Room fill color" value={room.color ?? '#1e3a5f'} onChange={e => onUpdate({ ...room, color: e.target.value })}
                            style={{ width: 36, height: 28, border: 'none', borderRadius: 4, cursor: 'pointer', background: 'none' }} />
                        <button type="button" onClick={() => onUpdate({ ...room, color: undefined })}
                            style={{ background: 'transparent', border: '1px solid #334155', borderRadius: 5, padding: '3px 8px', color: '#64748b', cursor: 'pointer', fontSize: 11 }}>Reset</button>
                    </div>
                    <div style={{ background: '#0f172a', borderRadius: 7, padding: '8px 10px', color: '#475569', fontSize: 11 }}>
                        Click the room edge to show vertex handles. Drag purple dots to reshape.
                        Drag the <span style={{ color: '#f59e0b' }}>amber arc handles</span> on each segment to curve walls.
                        Double-drag back to center to straighten.
                    </div>
                </>
            )}
            {mode !== 'edit' && (
                <div style={{ color: '#475569', fontSize: 11 }}>Switch to Edit mode to modify this room.</div>
            )}
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
    const [selectedProduct, setSelectedProduct] = useState<ShelfProduct | null>(null);
    const [shelfDetailId, setShelfDetailId] = useState<string | null>(null);
    const [inventoryQtys, setInventoryQtys] = useState<Record<number, number>>({});
    const [showAuditConfirm, setShowAuditConfirm] = useState(false);
    const [auditNote, setAuditNote] = useState('');
    const [auditEmailReport, setAuditEmailReport] = useState(false);
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
    const [gridMode, setGridMode] = useState<'off' | 'dots' | 'lines'>('lines');
    // null = nothing, '__main__' = main outline, roomId = sub-room
    const [roomSelected, setRoomSelected] = useState<string | null>(null);

    const svgRef = useRef<SVGSVGElement>(null);
    const dragRef = useRef<DragState | null>(null);
    const spaceRef = useRef(false);
    const clickCycleRef = useRef<{ pt: Pt; stack: string[]; idx: number } | null>(null);

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
            if (e.key === 'Escape') { setDrawingPts([]); setPendingType(null); setSelectedId(null); setSelectedIds([]); setSelectedProduct(null); setRoomSelected(null); clickCycleRef.current = null; if (tool === 'draw') setTool('select'); }
            if ((e.key === 'Delete' || e.key === 'Backspace') && document.activeElement === document.body) {
                if (roomSelected && roomSelected !== '__main__') {
                    setMapData(prev => prev ? { ...prev, rooms: (prev.rooms ?? []).filter(r => r.id !== roomSelected) } : prev);
                    setRoomSelected(null); return;
                }
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

    // ── Load inventory quantities when entering audit mode ────────────────────

    useEffect(() => {
        if (mode !== 'audit') return;
        fetch('/api/inventory?sort=name')
            .then(r => r.json())
            .then(data => {
                if (data.items) {
                    const qtys: Record<number, number> = {};
                    data.items.forEach((item: any) => { qtys[item.id] = Number(item.quantity); });
                    setInventoryQtys(qtys);
                }
            })
            .catch(() => {});
    }, [mode]);

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

        if (mode !== 'edit') { setSelectedId(null); setSelectedIds([]); setSelectedProduct(null); return; }

        setRoomSelected(null);
        clickCycleRef.current = null;

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

        setRoomSelected(null);

        // Click-through: find every object under cursor (rotation-aware), cycle backward through stack
        const stack = getStackAt(mapData.objects, pt);

        if (stack.length > 1) {
            const prev = clickCycleRef.current;
            const samePt = prev && Math.hypot(pt.x - prev.pt.x, pt.y - prev.pt.y) < 1.5;
            const sameStack = samePt && prev && prev.stack.length === stack.length && prev.stack.every((s2, i) => s2 === stack[i]);

            // First click: select topmost (last in array). Subsequent clicks at same spot: cycle backward.
            const idx = sameStack && prev
                ? (prev.idx - 1 + stack.length) % stack.length
                : stack.length - 1;

            const targetId = stack[idx];
            clickCycleRef.current = { pt, stack, idx };
            setSelectedId(targetId);
            setSelectedIds([]);

            const obj = mapData.objects.find(o => o.id === targetId)!;
            dragRef.current = { type: 'move', ids: [targetId], startMouse: pt, startPositions: { [targetId]: { x: obj.x, y: obj.y } } };
            (e.currentTarget as Element).setPointerCapture(e.pointerId);
            return;
        }

        clickCycleRef.current = null;

        // No overlap — normal single-object selection and drag
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
        dragRef.current = { type: 'rotate', id, centerPx, startAngle, startRotation: obj.rotation, prevAngle: startAngle, accumulatedRot: obj.rotation };
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

    function handleRoomVertexDown(e: React.PointerEvent, roomId: string, idx: number) {
        if (mode !== 'edit' || !mapData) return;
        e.stopPropagation();
        const outline = roomId === '__main__' ? mapData.outline : (mapData.rooms ?? []).find(r => r.id === roomId)?.outline ?? [];
        const pt = outline[idx];
        dragRef.current = { type: 'room-vertex', roomId, idx, startMouse: toFt(e), startPt: { ...pt } };
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
    }

    function handleArcDown(e: React.PointerEvent, roomId: string, vertIdx: number) {
        if (mode !== 'edit' || !mapData) return;
        e.stopPropagation();
        dragRef.current = { type: 'arc-ctrl', roomId, vertIdx, startMouse: toFt(e) };
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
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

            if (drag.type === 'room-vertex') {
                const nx = s(drag.startPt.x + ftX - drag.startMouse.x);
                const ny = s(drag.startPt.y + ftY - drag.startMouse.y);
                setMapData(prev => {
                    if (!prev) return prev;
                    if (drag.roomId === '__main__') {
                        const newOutline = prev.outline.map((p, i) => i === drag.idx ? { ...p, x: nx, y: ny } : p);
                        const xs = newOutline.map(p => p.x), ys = newOutline.map(p => p.y);
                        return { ...prev, outline: newOutline, width_ft: Math.max(...xs) - Math.min(...xs), height_ft: Math.max(...ys) - Math.min(...ys) };
                    }
                    return { ...prev, rooms: (prev.rooms ?? []).map(r => r.id !== drag.roomId ? r : { ...r, outline: r.outline.map((p, i) => i === drag.idx ? { ...p, x: nx, y: ny } : p) }) };
                });
                return;
            }

            if (drag.type === 'arc-ctrl') {
                setMapData(prev => {
                    if (!prev) return prev;
                    const getOutline = (id: string) => id === '__main__' ? prev.outline : (prev.rooms ?? []).find(r => r.id === id)?.outline ?? [];
                    const outline = getOutline(drag.roomId);
                    const A = outline[drag.vertIdx], B = outline[(drag.vertIdx + 1) % outline.length];
                    // Treat mouse position as the midpoint of the bezier curve, back-calculate control point
                    const ctrl = { x: 2 * ftX - (A.x + B.x) / 2, y: 2 * ftY - (A.y + B.y) / 2 };
                    // Snap ctrl to grid
                    ctrl.x = s(ctrl.x); ctrl.y = s(ctrl.y);
                    // If ctrl is very close to straight midpoint, remove arc (straighten)
                    const straight = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
                    const newCtrl = Math.hypot(ctrl.x - straight.x, ctrl.y - straight.y) < 0.4 ? undefined : ctrl;
                    const updateOutline = (ol: OutlineVertex[]) => ol.map((v, i) => i !== drag.vertIdx ? v : { ...v, arcCtrl: newCtrl });
                    if (drag.roomId === '__main__') return { ...prev, outline: updateOutline(prev.outline) };
                    return { ...prev, rooms: (prev.rooms ?? []).map(r => r.id !== drag.roomId ? r : { ...r, outline: updateOutline(r.outline) }) };
                });
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
                            // Rotation-aware snap: snap visual top-left corner to grid, recover stored position
                            const { vw, vh } = objVisual(obj);
                            const rawCx = start.x + obj.width / 2 + dx;
                            const rawCy = start.y + obj.height / 2 + dy;
                            let nx = (s(rawCx - vw / 2) + vw / 2) - obj.width / 2;
                            let ny = (s(rawCy - vh / 2) + vh / 2) - obj.height / 2;
                            if (drag.ids.length === 1) {
                                const candidate = { ...obj, x: nx, y: ny };
                                const snapped = snapToEdges(candidate, prev.objects, new Set(drag.ids));
                                nx = snapped.x; ny = snapped.y;
                            }
                            // Doors and windows: lock to nearest object edge
                            let rotation = obj.rotation;
                            if ((obj.type === 'door' || obj.type === 'window') && drag.ids.length === 1) {
                                const T = EDGE_SNAP_FT * 2;
                                const ocx = nx + obj.width / 2, ocy = ny + obj.height / 2;
                                outer: for (const o of prev.objects) {
                                    if (o.id === obj.id) continue;
                                    for (const ey of [o.y, o.y + o.height]) {
                                        if (Math.abs(ocy - ey) < T && ocx >= o.x - T && ocx <= o.x + o.width + T) {
                                            ny = ey - obj.height / 2; rotation = 0; break outer;
                                        }
                                    }
                                    for (const ex of [o.x, o.x + o.width]) {
                                        if (Math.abs(ocx - ex) < T && ocy >= o.y - T && ocy <= o.y + o.height + T) {
                                            nx = ex - obj.width / 2; rotation = 90; break outer;
                                        }
                                    }
                                }
                            }
                            return { ...obj, x: nx, y: ny, rotation };
                        }),
                    };
                });
            }

            if (drag.type === 'rotate') {
                const angle = Math.atan2(e.clientY - drag.centerPx.y, e.clientX - drag.centerPx.x) * (180 / Math.PI);
                // Delta from previous frame — normalize to [-180,180] to avoid atan2 wraparound jump
                let delta = angle - drag.prevAngle;
                if (delta > 180) delta -= 360;
                if (delta < -180) delta += 360;
                drag.prevAngle = angle;
                drag.accumulatedRot = (drag.accumulatedRot + delta + 360) % 360;
                // Snap to 15° increments when within 3° of a multiple
                let newRot = drag.accumulatedRot;
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

    function getAuditChanges() {
        if (!mapData) return [];
        // Group by product_id, summing quantities across all shelf slots
        const grouped: Record<number, { name: string; newQty: number }> = {};
        for (const obj of mapData.objects) {
            for (const shelf of obj.shelves) {
                for (const p of shelf.products) {
                    if (p.product_id && p.quantity !== undefined && p.quantity !== null) {
                        if (!grouped[p.product_id]) {
                            grouped[p.product_id] = { name: p.product_name || '', newQty: 0 };
                        }
                        grouped[p.product_id].newQty += p.quantity;
                    }
                }
            }
        }
        return Object.entries(grouped).map(([idStr, { name, newQty }]) => {
            const id = parseInt(idStr);
            const oldQty = inventoryQtys[id] ?? 0;
            return { id, name, oldQty, newQty, diff: newQty - oldQty };
        });
    }

    function handleAuditFinish() {
        const changes = getAuditChanges();
        if (changes.length === 0) {
            // Nothing counted yet — just save the map
            doSave('Audit save');
            return;
        }
        setShowAuditConfirm(true);
    }

    async function submitAudit() {
        const changes = getAuditChanges();
        setSaving(true);
        try {
            const res = await fetch('/api/admin/audit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ changes, note: auditNote || 'Bar Map Audit', emailReport: auditEmailReport }),
            });
            if (!res.ok) throw new Error('Audit submit failed');
            // Save the bar map so counted quantities are persisted
            if (mapData) {
                await fetch('/api/admin/bar-map', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: mapData.name, map_data: mapData, width_ft: mapData.width_ft, height_ft: mapData.height_ft, description: 'Audit save' }),
                });
            }
            setShowAuditConfirm(false);
            setAuditNote('');
            setSavedToast(true);
            setTimeout(() => setSavedToast(false), 2500);
        } catch (e) {
            console.error('[bar-map audit submit]', e);
        } finally {
            setSaving(false);
        }
    }

    function addRoom() {
        if (!mapData) return;
        const cx = mapData.width_ft / 2, cy = mapData.height_ft / 2;
        const w = 10, h = 8;
        const rooms = mapData.rooms ?? [];
        const newRoom: RoomArea = {
            id: rid(), name: `Room ${rooms.length + 1}`,
            color: nextRoomColor(rooms),
            outline: [
                { x: cx - w / 2, y: cy - h / 2 }, { x: cx + w / 2, y: cy - h / 2 },
                { x: cx + w / 2, y: cy + h / 2 }, { x: cx - w / 2, y: cy + h / 2 },
            ],
        };
        setMapData(prev => prev ? { ...prev, rooms: [...(prev.rooms ?? []), newRoom] } : prev);
        setRoomSelected(newRoom.id);
        setSelectedId(null); setSelectedIds([]);
    }

    function updateRoom(r: RoomArea) {
        setMapData(prev => prev ? { ...prev, rooms: (prev.rooms ?? []).map(x => x.id === r.id ? r : x) } : prev);
    }

    function deleteRoom(id: string) {
        setMapData(prev => prev ? { ...prev, rooms: (prev.rooms ?? []).filter(r => r.id !== id) } : prev);
        setRoomSelected(null);
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
        setMapData({ name: 'My Bar', width_ft: w, height_ft: h, grid_ft: 1, outline: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }], rooms: [], objects: [] });
        setMode('edit');
    }

    // ── Derived ──────────────────────────────────────────────────────────────

    const selObj = selectedId ? mapData?.objects.find(o => o.id === selectedId) ?? null : null;
    const selectedProductParent = selectedProduct
        ? mapData?.objects.find(o => o.shelves.some(s => s.products.some(p => p.id === selectedProduct.id))) ?? null
        : null;
    const cursorStyle = spaceRef.current ? (dragRef.current?.type === 'pan' ? 'grabbing' : 'grab') : tool === 'draw' ? 'crosshair' : pendingType ? 'copy' : 'default';

    if (!mapData) {
        return (
            <div style={{ background: '#0f172a', borderRadius: 14, border: '1px solid #1e293b', height: 'calc(100vh - 180px)' }}>
                <WelcomeScreen onBlank={() => { setMapData({ ...EMPTY_MAP }); setMode('edit'); }} onVoice={() => setShowVoice(true)} onPreset={applyPreset} />
                {showVoice && <VoiceDialog onClose={() => setShowVoice(false)} onGenerate={d => { setMapData(d); setMode('edit'); }} />}
            </div>
        );
    }

    const outlinePath = outlineToPath(mapData.outline, pxPerFt);
    const selRoom = roomSelected && roomSelected !== '__main__' ? (mapData.rooms ?? []).find(r => r.id === roomSelected) ?? null : null;

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

                {mode === 'audit' && (
                    <button type="button"
                        onClick={() => setMapData(p => p ? { ...p, iconLayout: p.iconLayout === 'horizontal' ? 'vertical' : 'horizontal' } : p)}
                        title="Toggle bottle icon stacking direction"
                        style={{ background: 'transparent', border: '1px solid #334155', borderRadius: 6, padding: '4px 9px', color: '#94a3b8', fontSize: 11, cursor: 'pointer' }}>
                        {mapData.iconLayout === 'horizontal' ? '↔ H-Stack' : '↕ V-Stack'}
                    </button>
                )}

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
                        <button type="button" onClick={addRoom} title="Add an enclosed sub-room area"
                            style={{ background: 'transparent', border: '1px solid #334155', borderRadius: 6, padding: '4px 9px', color: '#a78bfa', fontSize: 12, cursor: 'pointer' }}>
                            🏠 + Room
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
                <button type="button"
                    onClick={() => setGridMode(g => g === 'off' ? 'lines' : g === 'lines' ? 'dots' : 'off')}
                    title={gridMode === 'off' ? 'Show grid lines' : gridMode === 'lines' ? 'Switch to dot grid' : 'Hide grid'}
                    style={{ background: gridMode !== 'off' ? '#1e293b' : 'transparent', border: `1px solid ${gridMode !== 'off' ? '#3b82f6' : '#334155'}`, borderRadius: 4, padding: '2px 7px', color: gridMode !== 'off' ? '#60a5fa' : '#475569', cursor: 'pointer', fontSize: 11, height: 24 }}>
                    {gridMode === 'dots' ? '·⊞' : '⊞'}{gridMode !== 'off' ? '' : ' Off'}
                </button>

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
                            {/* Dot pattern — small dot at every 0.5ft, larger at every 1ft */}
                            <pattern id="grid-dots-half" width={pxPerFt * SNAP} height={pxPerFt * SNAP} patternUnits="userSpaceOnUse" x={pan.x} y={pan.y}>
                                <circle cx={0} cy={0} r={1.2} fill="#253a6e" />
                            </pattern>
                            <pattern id="grid-dots" width={pxPerFt} height={pxPerFt} patternUnits="userSpaceOnUse" x={pan.x} y={pan.y}>
                                <rect width={pxPerFt} height={pxPerFt} fill="url(#grid-dots-half)" />
                                <circle cx={0} cy={0} r={2.5} fill="#2e4d8a" />
                            </pattern>
                            {/* Line pattern */}
                            <pattern id="grid-sm" width={pxPerFt * SNAP} height={pxPerFt * SNAP} patternUnits="userSpaceOnUse" x={pan.x} y={pan.y}>
                                <path d={`M ${pxPerFt * SNAP} 0 L 0 0 0 ${pxPerFt * SNAP}`} fill="none" stroke="#1a2f55" strokeWidth={0.8} />
                            </pattern>
                            <pattern id="grid-lg" width={pxPerFt} height={pxPerFt} patternUnits="userSpaceOnUse" x={pan.x} y={pan.y}>
                                <rect width={pxPerFt} height={pxPerFt} fill="url(#grid-sm)" />
                                <path d={`M ${pxPerFt} 0 L 0 0 0 ${pxPerFt}`} fill="none" stroke="#243d70" strokeWidth={1.5} />
                            </pattern>
                        </defs>
                        <rect x={0} y={0} width="100%" height="100%" fill={
                            gridMode === 'lines' ? 'url(#grid-lg)' :
                            gridMode === 'dots'  ? 'url(#grid-dots)' :
                            '#080d18'
                        } />

                        <g transform={`translate(${pan.x},${pan.y})`}>
                            {/* Main room fills — below everything */}
                            <path d={outlinePath} fill="#0b1120" style={{ pointerEvents: 'none' }} />
                            <path d={outlinePath} fill="rgba(30,58,138,0.1)"
                                stroke={roomSelected === '__main__' ? '#7c3aed' : '#1e40af'}
                                strokeWidth={roomSelected === '__main__' ? 3 : 2}
                                strokeDasharray={mode === 'edit' && !roomSelected ? '8 4' : '0'}
                                style={{ pointerEvents: 'none' }} />

                            {/* Sub-rooms — above floor, below objects */}
                            {(mapData.rooms ?? []).map(room => {
                                const rPath = outlineToPath(room.outline, pxPerFt);
                                const rColor = room.color ?? '#1e3a5f';
                                const rSel = roomSelected === room.id;
                                return (
                                    <g key={room.id}>
                                        <path d={rPath} fill={rColor} fillOpacity={0.28} style={{ pointerEvents: 'none' }} />
                                        <path d={rPath} fill="none"
                                            stroke={rSel ? '#a78bfa' : rColor} strokeWidth={rSel ? 2.5 : 1.5}
                                            strokeDasharray={rSel ? '0' : '7 3'}
                                            style={{ pointerEvents: 'none' }} />
                                        <text x={(room.outline.reduce((a, p) => a + p.x, 0) / room.outline.length) * pxPerFt}
                                            y={(room.outline.reduce((a, p) => a + p.y, 0) / room.outline.length) * pxPerFt}
                                            textAnchor="middle" dominantBaseline="middle"
                                            fill="rgba(255,255,255,0.35)" fontSize={Math.max(8, pxPerFt * 0.4)}
                                            style={{ pointerEvents: 'none' }}>
                                            {room.name}
                                        </text>
                                    </g>
                                );
                            })}

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
                                    iconLayout={mapData.iconLayout || 'vertical'}
                                    onPointerDown={handleObjPointerDown}
                                    onContextMenu={handleContextMenu}
                                    onSelectProduct={mode !== 'edit' ? p => setSelectedProduct(p) : undefined}
                                    onOpenShelfDetail={id => setShelfDetailId(id)}
                                />
                            ))}

                            {/* Resize + rotate handles */}
                            {selObj && mode === 'edit' && (
                                <ResizeHandles obj={selObj} pxPerFt={pxPerFt} onHandleDown={handleResizePointerDown} onRotateDown={handleRotatePointerDown} />
                            )}

                            {/* Main room edge hit area — after objects so always on top */}
                            {mode === 'edit' && (
                                <path d={outlinePath} fill="none"
                                    stroke="rgba(0,0,0,0.01)" strokeWidth={16}
                                    style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                                    onPointerDown={e => { e.stopPropagation(); setRoomSelected('__main__'); setSelectedId(null); setSelectedIds([]); clickCycleRef.current = null; }}
                                />
                            )}
                            {/* Sub-room edge hit areas */}
                            {mode === 'edit' && (mapData.rooms ?? []).map(room => (
                                <path key={`hit-${room.id}`} d={outlineToPath(room.outline, pxPerFt)} fill="none"
                                    stroke="rgba(0,0,0,0.01)" strokeWidth={16}
                                    style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                                    onPointerDown={e => { e.stopPropagation(); setRoomSelected(room.id); setSelectedId(null); setSelectedIds([]); clickCycleRef.current = null; }}
                                />
                            ))}
                            {/* Vertex + arc handles for selected room/outline */}
                            {roomSelected && mode === 'edit' && (() => {
                                const isMain = roomSelected === '__main__';
                                const outline = isMain ? mapData.outline : (mapData.rooms ?? []).find(r => r.id === roomSelected)?.outline ?? [];
                                const dotColor = isMain ? '#7c3aed' : '#a78bfa';
                                return (
                                    <>
                                        {outline.map((vpt, i) => (
                                            <circle key={`v${i}`} cx={vpt.x * pxPerFt} cy={vpt.y * pxPerFt} r={9}
                                                fill={dotColor} stroke="white" strokeWidth={2}
                                                style={{ cursor: 'grab' }}
                                                onPointerDown={e => handleRoomVertexDown(e, roomSelected, i)}
                                            />
                                        ))}
                                        {outline.map((vpt, i) => {
                                            const hpt = arcHandlePt(outline, i);
                                            const hasArc = !!vpt.arcCtrl;
                                            return (
                                                <g key={`arc${i}`} onPointerDown={e => handleArcDown(e, roomSelected, i)}>
                                                    {/* Bow icon — small arc shape centered on hpt */}
                                                    <circle cx={hpt.x * pxPerFt} cy={hpt.y * pxPerFt} r={hasArc ? 7 : 5}
                                                        fill={hasArc ? '#f59e0b' : '#1e293b'}
                                                        stroke={hasArc ? '#fbbf24' : '#475569'}
                                                        strokeWidth={1.5}
                                                        style={{ cursor: 'crosshair' }}
                                                    />
                                                    {/* Arc symbol inside */}
                                                    <path
                                                        d={`M ${hpt.x * pxPerFt - 3.5} ${hpt.y * pxPerFt + 1.5} Q ${hpt.x * pxPerFt} ${hpt.y * pxPerFt - 3.5} ${hpt.x * pxPerFt + 3.5} ${hpt.y * pxPerFt + 1.5}`}
                                                        fill="none" stroke={hasArc ? 'white' : '#64748b'} strokeWidth={1.5} strokeLinecap="round"
                                                        style={{ pointerEvents: 'none' }}
                                                    />
                                                </g>
                                            );
                                        })}
                                    </>
                                );
                            })()}

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

                {/* Right panel — audit list, object props, or room props */}
                {mode === 'audit' ? (
                    <div style={{ width: 260, background: '#0f172a', borderLeft: '1px solid #1e293b', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
                        <AuditPanel objects={mapData.objects} inventoryQtys={inventoryQtys} onAuditChange={handleAuditChange} onFinish={handleAuditFinish} saving={saving} />
                    </div>
                ) : selectedProduct && mode === 'view' ? (
                    <div style={{ width: 252, background: '#0f172a', borderLeft: '1px solid #1e293b', flexShrink: 0 }}>
                        <div style={{ padding: 14, fontSize: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                                <span style={{ color: '#fbbf24', fontWeight: 700, fontSize: 13 }}>Selected Product</span>
                                <button type="button" onClick={() => setSelectedProduct(null)}
                                    style={{ background: 'none', border: 'none', color: '#475569', fontSize: 18, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#1e293b', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
                                <span style={{ width: 20, height: 20, borderRadius: '50%', background: productColor(selectedProduct.product_name || ''), flexShrink: 0, display: 'inline-block', boxShadow: `0 0 8px ${productColor(selectedProduct.product_name || '')}88` }} />
                                <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 13, flex: 1 }}>{selectedProduct.product_name}</span>
                            </div>
                            {selectedProductParent && (
                                <div style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>
                                    📍 {selectedProductParent.name}
                                    {selectedProductParent.shelves.find(s => s.products.some(p => p.id === selectedProduct.id))?.label
                                        ? ` › ${selectedProductParent.shelves.find(s => s.products.some(p => p.id === selectedProduct.id))!.label}`
                                        : ''}
                                </div>
                            )}
                            {selectedProduct.quantity !== undefined && (
                                <div style={{ background: '#0f172a', borderRadius: 7, padding: '8px 12px', marginTop: 8 }}>
                                    <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 3 }}>Quantity</div>
                                    <div style={{ fontSize: 22, fontWeight: 700, color: selectedProduct.quantity === 0 ? '#ef4444' : selectedProduct.quantity <= 2 ? '#f59e0b' : '#22c55e' }}>
                                        {selectedProduct.quantity}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ) : selRoom ? (
                    <div style={{ width: 252, background: '#0f172a', borderLeft: '1px solid #1e293b', overflowY: 'auto', flexShrink: 0 }}>
                        <RoomPropsPanel room={selRoom} mode={mode} onUpdate={updateRoom} onDelete={deleteRoom} />
                    </div>
                ) : selObj ? (
                    <div style={{ width: 252, background: '#0f172a', borderLeft: '1px solid #1e293b', overflowY: 'auto', flexShrink: 0 }}>
                        <PropsPanel obj={selObj} products={products} mode={mode} allObjects={mapData.objects}
                            onUpdate={updateObj} onDelete={deleteObj}
                            onAuditChange={handleAuditChange}
                            onAttach={attachObj} onDetach={detachObj} />
                    </div>
                ) : null}
            </div>

            {showAuditConfirm && (() => {
                const changes = getAuditChanges();
                const added = changes.filter(c => c.diff > 0);
                const removed = changes.filter(c => c.diff < 0);
                const same = changes.filter(c => c.diff === 0);
                return (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 14, width: 'min(96vw,640px)', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
                            <div style={{ padding: '14px 18px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                                <div>
                                    <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: 15 }}>Confirm Bar Map Audit</div>
                                    <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                                        {changes.length} product{changes.length !== 1 ? 's' : ''} counted
                                        {added.length > 0 && <span style={{ color: '#4ade80', marginLeft: 8 }}>+{added.length} above system</span>}
                                        {removed.length > 0 && <span style={{ color: '#f87171', marginLeft: 8 }}>−{removed.length} below system</span>}
                                        {same.length > 0 && <span style={{ color: '#64748b', marginLeft: 8 }}>{same.length} matched</span>}
                                    </div>
                                </div>
                                <button type="button" onClick={() => setShowAuditConfirm(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
                            </div>

                            <div style={{ overflowY: 'auto', flex: 1 }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                        <tr style={{ background: '#0f172a', position: 'sticky', top: 0 }}>
                                            <th style={{ textAlign: 'left', padding: '8px 14px', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>Product</th>
                                            <th style={{ textAlign: 'right', padding: '8px 14px', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>System</th>
                                            <th style={{ textAlign: 'right', padding: '8px 14px', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>Counted</th>
                                            <th style={{ textAlign: 'right', padding: '8px 14px', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>Diff</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {changes.map(c => (
                                            <tr key={c.id} style={{ borderBottom: '1px solid #0f172a' }}>
                                                <td style={{ padding: '7px 14px', color: '#e2e8f0', fontWeight: 500 }}>{c.name}</td>
                                                <td style={{ padding: '7px 14px', textAlign: 'right', color: '#64748b' }}>{Number(c.oldQty).toFixed(2)}</td>
                                                <td style={{ padding: '7px 14px', textAlign: 'right', color: 'white', fontWeight: 600 }}>{Number(c.newQty).toFixed(2)}</td>
                                                <td style={{ padding: '7px 14px', textAlign: 'right', fontWeight: 700, color: c.diff > 0 ? '#4ade80' : c.diff < 0 ? '#f87171' : '#475569' }}>
                                                    {c.diff > 0 ? '+' : ''}{Number(c.diff).toFixed(2)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div style={{ padding: '12px 18px', borderTop: '1px solid #334155', flexShrink: 0 }}>
                                <label style={{ color: '#94a3b8', fontSize: 11, display: 'block', marginBottom: 4 }}>Audit Note (optional)</label>
                                <input
                                    value={auditNote}
                                    onChange={e => setAuditNote(e.target.value)}
                                    placeholder="e.g. Saturday night close count"
                                    style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 6, padding: '6px 10px', color: 'white', fontSize: 12, boxSizing: 'border-box', marginBottom: 10 }}
                                />
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#cbd5e1', fontSize: 12, marginBottom: 12 }}>
                                    <input type="checkbox" checked={auditEmailReport} onChange={e => setAuditEmailReport(e.target.checked)} style={{ width: 14, height: 14 }} />
                                    Email audit report to reporting recipients
                                </label>
                                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                    <button type="button" onClick={() => setShowAuditConfirm(false)} disabled={saving}
                                        style={{ background: 'transparent', border: '1px solid #334155', borderRadius: 7, padding: '7px 16px', color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}>
                                        Cancel
                                    </button>
                                    <button type="button" onClick={submitAudit} disabled={saving}
                                        style={{ background: saving ? '#0f172a' : '#166534', border: `1px solid ${saving ? '#334155' : '#15803d'}`, borderRadius: 7, padding: '7px 18px', color: saving ? '#64748b' : '#86efac', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13 }}>
                                        {saving ? '⏳ Saving…' : '✓ Finalize Audit'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {showHistory && <HistoryPanel onClose={() => setShowHistory(false)} onRestore={d => setMapData(d)} />}
            {showVoice && <VoiceDialog onClose={() => setShowVoice(false)} onGenerate={d => { setMapData(d); setMode('edit'); }} />}
            {showSave && <SaveModal onSave={doSave} onClose={() => setShowSave(false)} />}
            {shelfDetailId && mapData && (() => {
                const sdObj = mapData.objects.find(o => o.id === shelfDetailId);
                return sdObj ? (
                    <ShelfDetailModal
                        obj={sdObj}
                        products={products}
                        mode={mode}
                        onUpdate={updateObj}
                        onClose={() => setShelfDetailId(null)}
                    />
                ) : null;
            })()}
        </div>
    );
}
