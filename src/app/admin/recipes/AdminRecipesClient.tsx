'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Plus, Upload, Search, Edit2, Trash2, X, RefreshCw,
    AlertCircle, CheckCircle, ArrowRight, FileText, BookOpen,
} from 'lucide-react';
import styles from '../admin.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Ingredient {
    name: string;
    amount: string;
    unit: string;
    instructions?: string;
}

interface Recipe {
    id: number;
    name: string;
    description: string | null;
    ingredients: (Ingredient & { item?: string })[];
    instructions: string | null;
    category: string | null;
    glass: string | null;
    amount: string | null;
    tags: string[];
    is_active: boolean;
    source: 'local' | 'global';
    created_at: string;
}

type ImportField = 'name' | 'description' | 'instructions' | 'ingredients' | 'category' | 'tags' | 'skip';
type PivotField = 'recipe_name' | 'ing_name' | 'ing_amount' | 'ing_unit' | 'ing_instructions' | 'instructions' | 'description' | 'category' | 'glass' | 'amount' | 'tags' | 'skip';

interface ImportPreviewRow {
    name: string;
    description: string;
    instructions: string;
    ingredients: Ingredient[];
    category: string;
    glass: string;
    amount: string;
    tags: string[];
    issues: string[];
}

interface ImportResult { imported: number; skipped: number; errors: string[] }

// ─── CSV helpers (copied from super-admin manager) ────────────────────────────

function detectDelimiter(text: string): string {
    const sample = text.slice(0, 3000);
    const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0, '|': 0 };
    for (const ch of sample) if (ch in counts) counts[ch]++;
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
    const clean = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const delim = detectDelimiter(clean);
    const allRows: string[][] = [];
    for (const line of clean.split('\n')) {
        if (!line.trim()) continue;
        const row: string[] = [];
        let inQ = false; let cell = '';
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === '"') { if (inQ && line[i + 1] === '"') { cell += '"'; i++; } else inQ = !inQ; }
            else if (c === delim && !inQ) { row.push(cell.trim()); cell = ''; }
            else { cell += c; }
        }
        row.push(cell.trim());
        allRows.push(row);
    }
    if (!allRows.length) return { headers: [], rows: [] };
    return { headers: allRows[0], rows: allRows.slice(1).filter(r => r.some(c => c)) };
}

function parseJSONFile(text: string): { headers: string[]; rows: string[][] } | null {
    try {
        const parsed = JSON.parse(text);
        let arr: any[] = [];
        if (Array.isArray(parsed)) arr = parsed;
        else if (parsed.recipes) arr = parsed.recipes;
        else if (parsed.data) arr = parsed.data;
        else if (parsed.items) arr = parsed.items;
        else return null;
        if (!arr.length) return { headers: [], rows: [] };
        const headers = [...new Set(arr.flatMap((item: any) => Object.keys(item)))] as string[];
        const rows = arr.map((item: any) => headers.map(h => {
            const v = item[h]; if (v == null) return ''; if (typeof v === 'object') return JSON.stringify(v); return String(v);
        }));
        return { headers, rows };
    } catch { return null; }
}

function parseIngredients(value: string): Ingredient[] {
    if (!value?.trim()) return [];
    if (value.trim().startsWith('[')) {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return parsed.map((p: any) => ({ name: p.name || p.item || p.ingredient || '', amount: String(p.amount || p.qty || ''), unit: p.unit || '', instructions: p.instructions || '' })).filter(i => i.name);
        } catch {}
    }
    const sep = value.includes(';') ? ';' : '\n';
    return value.split(sep).map(l => l.trim()).filter(Boolean).map(line => {
        const m = line.match(/^([\d.\/\s]+)?\s*([a-zA-Z]{1,5}\s*)?\s+(.+)$/);
        if (m && m[3]) return { name: m[3].trim(), amount: (m[1] || '').trim(), unit: (m[2] || '').trim(), instructions: '' };
        return { name: line, amount: '', unit: '', instructions: '' };
    }).filter(i => i.name);
}

const FIELD_ALIASES: Record<ImportField, string[]> = {
    name: ['name', 'title', 'recipe', 'recipe_name', 'recipename', 'drink', 'drink_name'],
    description: ['description', 'desc', 'summary', 'about', 'overview'],
    instructions: ['instructions', 'directions', 'method', 'procedure', 'steps', 'preparation', 'prep', 'how_to'],
    ingredients: ['ingredients', 'ingredient', 'ingredients_list', 'ingredientes'],
    category: ['category', 'type', 'kind', 'cuisine', 'style', 'class'],
    tags: ['tags', 'tag', 'keywords', 'labels', 'terms'],
    skip: [],
};

function autoMap(headers: string[]): Record<string, ImportField> {
    const mapping: Record<string, ImportField> = {};
    for (const h of headers) {
        const lower = h.toLowerCase().replace(/[\s\-]+/g, '_');
        let matched: ImportField = 'skip';
        for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
            if ((aliases as string[]).includes(lower)) { matched = field as ImportField; break; }
        }
        mapping[h] = matched;
    }
    return mapping;
}

function buildPreviewRow(raw: string[], headers: string[], mapping: Record<string, ImportField>): ImportPreviewRow {
    const get = (field: ImportField) => headers.reduce((acc, h, i) => mapping[h] === field ? (raw[i] ?? '') : acc, '');
    const name = get('name').trim();
    const issues: string[] = [];
    if (!name) issues.push('Missing name');
    return {
        name, description: get('description').trim(), instructions: get('instructions').trim(),
        ingredients: parseIngredients(get('ingredients')),
        category: get('category').trim(),
        glass: '', amount: '',
        tags: get('tags').split(/[,;]+/).map(t => t.trim()).filter(Boolean), issues,
    };
}

// ─── Pivot helpers ────────────────────────────────────────────────────────────

const PIVOT_FIELD_ALIASES: Record<PivotField, string[]> = {
    recipe_name: ['drink', 'cocktail', 'recipe', 'name', 'recipe_name', 'drink_name', 'title'],
    ing_name: ['ingredient', 'ingredient_name', 'item', 'ing', 'component'],
    ing_amount: ['amount', 'qty', 'quantity', 'measure', 'volume'],
    ing_unit: ['unit', 'units'],
    ing_instructions: ['ingredientuse', 'ingredient_use', 'use', 'method', 'role', 'type', 'build', 'garnish'],
    instructions: ['howtomix', 'how_to_mix', 'how_to', 'directions', 'steps', 'preparation', 'instructions'],
    description: ['description', 'desc', 'summary', 'notes'],
    category: ['category', 'style', 'class'],
    glass: ['glass', 'glass_type', 'glassware', 'serve_in', 'served_in'],
    amount: ['serving', 'yield', 'serve_size', 'serving_size', 'total_amount', 'total', 'serve'],
    tags: ['tags', 'tag', 'keywords'],
    skip: [],
};

function autoPivotMap(headers: string[]): Record<string, PivotField> {
    const mapping: Record<string, PivotField> = {};
    for (const h of headers) {
        const lower = h.toLowerCase().replace(/[\s\-]+/g, '_');
        let matched: PivotField = 'skip';
        for (const [field, aliases] of Object.entries(PIVOT_FIELD_ALIASES)) {
            if ((aliases as string[]).includes(lower)) { matched = field as PivotField; break; }
        }
        mapping[h] = matched;
    }
    return mapping;
}

function detectPivotFormat(headers: string[]): boolean {
    const lower = headers.map(h => h.toLowerCase().replace(/[\s\-]+/g, '_'));
    return lower.some(h => ['ingredient', 'ingredient_name', 'item', 'ing'].includes(h)) && !lower.includes('ingredients');
}

function buildPivotedPreview(rawRows: string[][], headers: string[], mapping: Record<string, PivotField>): ImportPreviewRow[] {
    const getCol = (row: string[], field: PivotField): string =>
        headers.reduce((acc, h, i) => mapping[h] === field ? (row[i] ?? '') : acc, '');
    const groups = new Map<string, string[][]>();
    for (const row of rawRows) {
        const key = getCol(row, 'recipe_name').trim();
        if (!key) continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(row);
    }
    const result: ImportPreviewRow[] = [];
    for (const [name, rows] of groups) {
        const first = rows[0];
        const ingredients: Ingredient[] = rows.map(r => ({
            name: getCol(r, 'ing_name').trim(), amount: getCol(r, 'ing_amount').trim(),
            unit: getCol(r, 'ing_unit').trim(), instructions: getCol(r, 'ing_instructions').trim(),
        })).filter(i => i.name);
        const issues: string[] = [];
        if (!name) issues.push('Missing name');
        result.push({
            name, description: getCol(first, 'description').trim(), instructions: getCol(first, 'instructions').trim(),
            ingredients, category: getCol(first, 'category').trim(),
            glass: getCol(first, 'glass').trim(), amount: getCol(first, 'amount').trim(),
            tags: getCol(first, 'tags').split(/[,;]+/).map(t => t.trim()).filter(Boolean), issues,
        });
    }
    return result;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPTY_ING: Ingredient = { name: '', amount: '', unit: '', instructions: '' };

const FIELD_OPTIONS: { value: ImportField; label: string }[] = [
    { value: 'skip', label: '— Skip —' }, { value: 'name', label: 'Name *' },
    { value: 'description', label: 'Description' }, { value: 'instructions', label: 'Instructions' },
    { value: 'ingredients', label: 'Ingredients' }, { value: 'category', label: 'Category' },
    { value: 'tags', label: 'Tags' },
];

const PIVOT_FIELD_OPTIONS: { value: PivotField; label: string }[] = [
    { value: 'skip', label: '— Skip —' }, { value: 'recipe_name', label: 'Recipe Name *' },
    { value: 'description', label: 'Recipe Description' }, { value: 'instructions', label: 'Recipe Instructions' },
    { value: 'category', label: 'Category' }, { value: 'glass', label: 'Glass Type' },
    { value: 'amount', label: 'Serving Amount' }, { value: 'tags', label: 'Tags' },
    { value: 'ing_name', label: 'Ingredient Name' }, { value: 'ing_amount', label: 'Ingredient Amount' },
    { value: 'ing_unit', label: 'Ingredient Unit' }, { value: 'ing_instructions', label: 'Ingredient Use / Method' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminRecipesClient() {
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState('');
    const [sourceFilter, setSourceFilter] = useState<'local' | 'global' | 'both'>('local');

    // Edit modal
    const [editOpen, setEditOpen] = useState(false);
    const [editId, setEditId] = useState<number | null>(null);
    const [editName, setEditName] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [editIngredients, setEditIngredients] = useState<Ingredient[]>([{ ...EMPTY_ING }]);
    const [editInstructions, setEditInstructions] = useState('');
    const [editCategory, setEditCategory] = useState('');
    const [editGlass, setEditGlass] = useState('');
    const [editAmount, setEditAmount] = useState('');
    const [editTags, setEditTags] = useState('');
    const [editSaving, setEditSaving] = useState(false);
    const [editError, setEditError] = useState('');

    // Bulk selection
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [bulkCategory, setBulkCategory] = useState('');
    const [bulkActionOpen, setBulkActionOpen] = useState(false);

    // Import modal
    const [importOpen, setImportOpen] = useState(false);
    const [importStep, setImportStep] = useState<1 | 2 | 3 | 4 | 5>(1);
    const [importDragOver, setImportDragOver] = useState(false);
    const [importError, setImportError] = useState('');
    const [importHeaders, setImportHeaders] = useState<string[]>([]);
    const [importRawRows, setImportRawRows] = useState<string[][]>([]);
    const [importMapping, setImportMapping] = useState<Record<string, ImportField>>({});
    const [importPreview, setImportPreview] = useState<ImportPreviewRow[]>([]);
    const [skipDuplicates, setSkipDuplicates] = useState(true);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<ImportResult | null>(null);
    const [pivotMode, setPivotMode] = useState(false);
    const [pivotMapping, setPivotMapping] = useState<Record<string, PivotField>>({});

    const load = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams({ source: sourceFilter });
        if (q) params.set('q', q);
        const res = await fetch(`/api/admin/recipes?${params}`);
        const data = await res.json();
        setRecipes(data.recipes || []);
        setLoading(false);
    }, [q, sourceFilter]);

    useEffect(() => { load(); }, [load]);

    // Edit handlers
    function openCreate() {
        setEditId(null); setEditName(''); setEditDesc('');
        setEditIngredients([{ ...EMPTY_ING }]); setEditInstructions('');
        setEditCategory(''); setEditGlass(''); setEditAmount('');
        setEditTags(''); setEditError(''); setEditOpen(true);
    }

    function openEdit(r: Recipe) {
        setEditId(r.id); setEditName(r.name); setEditDesc(r.description || '');
        setEditIngredients(r.ingredients?.length ? r.ingredients.map(i => ({ name: i.name || i.item || '', amount: i.amount || '', unit: i.unit || '', instructions: i.instructions || '' })) : [{ ...EMPTY_ING }]);
        setEditInstructions(r.instructions || '');
        setEditCategory(r.category || '');
        setEditGlass(r.glass || '');
        setEditAmount(r.amount || '');
        setEditTags((r.tags || []).join(', '));
        setEditError(''); setEditOpen(true);
    }

    async function saveRecipe() {
        if (!editName.trim()) { setEditError('Name is required'); return; }
        setEditSaving(true); setEditError('');
        const body = {
            name: editName.trim(), description: editDesc.trim() || null,
            ingredients: editIngredients.filter(i => i.name.trim()),
            instructions: editInstructions.trim() || null,
            category: editCategory.trim() || null,
            glass: editGlass.trim() || null,
            amount: editAmount.trim() || null,
            tags: editTags.split(',').map(t => t.trim()).filter(Boolean),
        };
        const url = editId ? `/api/admin/recipes/${editId}` : '/api/admin/recipes';
        const res = await fetch(url, { method: editId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        setEditSaving(false);
        if (!res.ok) { const d = await res.json(); setEditError(d.error || 'Failed to save'); return; }
        setEditOpen(false);
        await load();
    }

    async function deleteRecipe(id: number) {
        if (!confirm('Delete this recipe? This cannot be undone.')) return;
        await fetch(`/api/admin/recipes/${id}`, { method: 'DELETE' });
        setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
        await load();
    }

    async function deleteAllRecipes() {
        const localCount = recipes.filter(r => r.source === 'local').length;
        if (!confirm(`Delete all ${localCount} recipes in your library? This cannot be undone.`)) return;
        await Promise.all(
            recipes.filter(r => r.source === 'local').map(r => fetch(`/api/admin/recipes/${r.id}`, { method: 'DELETE' }))
        );
        setSelectedIds(new Set());
        await load();
    }

    async function deleteSelected() {
        if (selectedIds.size === 0) return;
        if (!confirm(`Delete ${selectedIds.size} selected recipe${selectedIds.size !== 1 ? 's' : ''}? This cannot be undone.`)) return;
        await Promise.all([...selectedIds].map(id => fetch(`/api/admin/recipes/${id}`, { method: 'DELETE' })));
        setSelectedIds(new Set());
        await load();
    }

    async function updateCategorySelected() {
        if (selectedIds.size === 0) return;
        await Promise.all([...selectedIds].map(id =>
            fetch(`/api/admin/recipes/${id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category: bulkCategory || null }),
            })
        ));
        setBulkActionOpen(false); setBulkCategory(''); setSelectedIds(new Set());
        await load();
    }

    function toggleSelect(id: number) {
        setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    }

    function toggleSelectAll() {
        const localIds = recipes.filter(r => r.source === 'local').map(r => r.id);
        if (localIds.every(id => selectedIds.has(id))) setSelectedIds(new Set());
        else setSelectedIds(new Set(localIds));
    }

    const updateIng = (idx: number, field: keyof Ingredient, val: string) =>
        setEditIngredients(prev => prev.map((ing, i) => i === idx ? { ...ing, [field]: val } : ing));
    const addIng = () => setEditIngredients(prev => [...prev, { ...EMPTY_ING }]);
    const removeIng = (idx: number) => setEditIngredients(prev => prev.filter((_, i) => i !== idx));

    // Import handlers
    function openImport() {
        setImportStep(1); setImportError(''); setImportHeaders([]); setImportRawRows([]);
        setImportMapping({}); setImportPreview([]); setSkipDuplicates(true);
        setImportResult(null); setPivotMode(false); setPivotMapping({});
        setImportOpen(true);
    }

    async function handleImportFile(file: File) {
        setImportError('');
        const text = await file.text();
        let parsed: { headers: string[]; rows: string[][] } | null = null;
        if (file.name.endsWith('.json')) {
            parsed = parseJSONFile(text);
            if (!parsed) { setImportError('Could not parse JSON. Expected an array, or an object with a recipes/data/items key.'); return; }
        } else {
            parsed = parseCSV(text);
        }
        if (!parsed.headers.length) { setImportError('No columns detected — check that the file has a header row.'); return; }
        if (!parsed.rows.length) { setImportError('No data rows found.'); return; }

        const isPivot = detectPivotFormat(parsed.headers);
        setPivotMode(isPivot);
        setPivotMapping(autoPivotMap(parsed.headers));
        setImportHeaders(parsed.headers);
        setImportRawRows(parsed.rows);
        setImportMapping(autoMap(parsed.headers));
        setImportStep(2);
    }

    function applyMapping() {
        const rows = pivotMode
            ? buildPivotedPreview(importRawRows, importHeaders, pivotMapping)
            : importRawRows.map(r => buildPreviewRow(r, importHeaders, importMapping));
        setImportPreview(rows);
        setImportStep(3);
    }

    async function runImport() {
        setImporting(true);
        const validRows = importPreview.filter(r => r.issues.length === 0);
        const records = validRows.map(row => ({
            name: row.name, description: row.description || null,
            ingredients: row.ingredients, instructions: row.instructions || null,
            category: row.category || null,
            glass: row.glass || null, amount: row.amount || null,
            tags: row.tags,
        }));
        const res = await fetch('/api/admin/recipes/import', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ records, skipDuplicates }),
        });
        const data = await res.json();
        setImporting(false);
        setImportResult({ imported: data.imported || 0, skipped: data.skipped || 0, errors: data.errors || [] });
        setImportStep(5);
        if ((data.imported || 0) > 0) await load();
    }

    const validImportCount = importPreview.filter(r => r.issues.length === 0).length;
    const issueCount = importPreview.filter(r => r.issues.length > 0).length;
    const localRecipes = recipes.filter(r => r.source === 'local');
    const globalRecipes = recipes.filter(r => r.source === 'global');

    const localRecipeIds = recipes.filter(r => r.source === 'local').map(r => r.id);
    const allLocalSelected = localRecipeIds.length > 0 && localRecipeIds.every(id => selectedIds.has(id));

    return (
        <div>
            {/* Header */}
            <div className={styles.pageHeader} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Recipe Library</h1>
                    <p style={{ color: '#9ca3af', margin: '0.25rem 0 0', fontSize: '0.875rem' }}>
                        {localRecipes.length} local recipe{localRecipes.length !== 1 ? 's' : ''}
                        {globalRecipes.length > 0 && ` · ${globalRecipes.length} global`}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button type="button" onClick={openImport}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: '#374151', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 }}>
                        <Upload size={16} /> Import CSV / JSON
                    </button>
                    <button type="button" onClick={openCreate}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 }}>
                        <Plus size={16} /> New Recipe
                    </button>
                    {localRecipes.length > 0 && (
                        <button type="button" onClick={deleteAllRecipes}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 }}>
                            <Trash2 size={16} /> Delete All
                        </button>
                    )}
                </div>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                    <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search recipes…"
                        style={{ width: '100%', paddingLeft: '2.25rem', paddingRight: '0.75rem', paddingTop: '0.5rem', paddingBottom: '0.5rem', background: '#1f2937', border: '1px solid #374151', borderRadius: '0.5rem', color: 'white', fontSize: '0.875rem', boxSizing: 'border-box' }} />
                </div>
                <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value as any)} title="Filter by source"
                    style={{ padding: '0.5rem 0.75rem', background: '#1f2937', border: '1px solid #374151', borderRadius: '0.5rem', color: 'white', fontSize: '0.875rem', cursor: 'pointer' }}>
                    <option value="local">My Library Only</option>
                    <option value="global">Global Library</option>
                    <option value="both">Both Libraries</option>
                </select>
                <button type="button" onClick={load} title="Refresh" style={{ padding: '0.5rem', background: '#1f2937', border: '1px solid #374151', borderRadius: '0.5rem', color: '#9ca3af', cursor: 'pointer' }}>
                    <RefreshCw size={16} />
                </button>
            </div>

            {/* Bulk action bar */}
            {selectedIds.size > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem 1rem', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                    <span style={{ color: '#93c5fd', fontSize: '0.875rem', fontWeight: 500 }}>{selectedIds.size} selected</span>
                    {!bulkActionOpen ? (
                        <>
                            <button type="button" onClick={() => setBulkActionOpen(true)}
                                style={{ padding: '0.375rem 0.75rem', background: '#374151', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.8rem' }}>
                                Change Category
                            </button>
                            <button type="button" onClick={deleteSelected}
                                style={{ padding: '0.375rem 0.75rem', background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.8rem' }}>
                                Delete Selected
                            </button>
                            <button type="button" onClick={() => setSelectedIds(new Set())}
                                style={{ marginLeft: 'auto', padding: '0.375rem 0.5rem', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}>
                                <X size={16} />
                            </button>
                        </>
                    ) : (
                        <>
                            <input value={bulkCategory} onChange={e => setBulkCategory(e.target.value)} placeholder="Category name (blank to clear)"
                                style={{ flex: 1, minWidth: 180, padding: '0.375rem 0.75rem', background: '#1f2937', border: '1px solid #374151', borderRadius: '0.375rem', color: 'white', fontSize: '0.875rem' }} />
                            <button type="button" onClick={updateCategorySelected}
                                style={{ padding: '0.375rem 0.75rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.8rem' }}>
                                Apply
                            </button>
                            <button type="button" onClick={() => { setBulkActionOpen(false); setBulkCategory(''); }}
                                style={{ padding: '0.375rem 0.5rem', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}>
                                <X size={16} />
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* Recipe list */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>Loading…</div>
            ) : recipes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
                    <BookOpen size={40} style={{ margin: '0 auto 1rem', display: 'block', opacity: 0.4 }} />
                    <p style={{ margin: 0 }}>No recipes found. Import a CSV/JSON file or add your first recipe.</p>
                </div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #374151' }}>
                                <th style={{ padding: '0.5rem 0.75rem', width: 32 }}>
                                    <input type="checkbox" checked={allLocalSelected} onChange={toggleSelectAll}
                                        title="Select all local recipes"
                                        style={{ cursor: 'pointer', accentColor: '#3b82f6' }} />
                                </th>
                                <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', color: '#9ca3af', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' }}>Name</th>
                                <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', color: '#9ca3af', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' }}>Category</th>
                                <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', color: '#9ca3af', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' }}>Glass</th>
                                <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', color: '#9ca3af', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' }}>Ingredients</th>
                                <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', color: '#9ca3af', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' }}>Source</th>
                                <th style={{ padding: '0.5rem 0.75rem' }} />
                            </tr>
                        </thead>
                        <tbody>
                            {recipes.map(r => (
                                <tr key={`${r.source}-${r.id}`} style={{ borderBottom: '1px solid #1f2937', background: selectedIds.has(r.id) ? 'rgba(59,130,246,0.05)' : undefined }}>
                                    <td style={{ padding: '0.625rem 0.75rem' }}>
                                        {r.source === 'local' && (
                                            <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)}
                                                title={`Select ${r.name}`}
                                                style={{ cursor: 'pointer', accentColor: '#3b82f6' }} />
                                        )}
                                    </td>
                                    <td style={{ padding: '0.625rem 0.75rem', color: 'white', fontWeight: 500, maxWidth: 240 }}>
                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                                        {r.description && (
                                            <div style={{ color: '#6b7280', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{r.description}</div>
                                        )}
                                        {r.amount && (
                                            <div style={{ color: '#4b5563', fontSize: '0.7rem', marginTop: 1 }}>Serves: {r.amount}</div>
                                        )}
                                    </td>
                                    <td style={{ padding: '0.625rem 0.75rem', color: '#9ca3af' }}>{r.category || '—'}</td>
                                    <td style={{ padding: '0.625rem 0.75rem', color: '#9ca3af', fontSize: '0.8rem' }}>{r.glass || '—'}</td>
                                    <td style={{ padding: '0.625rem 0.75rem', color: '#9ca3af' }}>
                                        {r.ingredients?.length > 0 ? (
                                            <details style={{ cursor: 'pointer' }}>
                                                <summary style={{ color: '#6b7280', fontSize: '0.8rem', listStyle: 'none', userSelect: 'none' }}>
                                                    {r.ingredients.length} ingredient{r.ingredients.length !== 1 ? 's' : ''}
                                                </summary>
                                                <ul style={{ margin: '0.375rem 0 0', padding: '0 0 0 1rem', listStyle: 'disc', fontSize: '0.75rem', color: '#9ca3af', lineHeight: 1.7 }}>
                                                    {r.ingredients.map((ing, i) => (
                                                        <li key={i}>
                                                            {ing.amount ? `${ing.amount}${ing.unit ? ' ' + ing.unit : ''} ` : ''}{ing.name || (ing as any).item}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </details>
                                        ) : '—'}
                                    </td>
                                    <td style={{ padding: '0.625rem 0.75rem' }}>
                                        <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 999, background: r.source === 'local' ? 'rgba(59,130,246,0.15)' : 'rgba(16,185,129,0.15)', color: r.source === 'local' ? '#60a5fa' : '#34d399' }}>
                                            {r.source === 'local' ? 'My Library' : 'Global'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right' }}>
                                        {r.source === 'local' && (
                                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                <button type="button" onClick={() => openEdit(r)} title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '0.25rem' }}>
                                                    <Edit2 size={15} />
                                                </button>
                                                <button type="button" onClick={() => deleteRecipe(r.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '0.25rem' }}>
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ── Edit / Create Modal ──────────────────────────────────────────── */}
            {editOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', padding: '1rem' }}>
                    <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: '1rem', width: '100%', maxWidth: 640, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' }}>
                        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #1f2937', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: 'white' }}>{editId ? 'Edit Recipe' : 'New Recipe'}</h2>
                            <button type="button" onClick={() => setEditOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {editError && <div style={{ padding: '0.75rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '0.5rem', color: '#f87171', fontSize: '0.875rem' }}>{editError}</div>}

                            <div><label style={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600, marginBottom: '0.375rem' }}>NAME *</label>
                                <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Recipe name"
                                    style={{ width: '100%', padding: '0.5rem 0.75rem', background: '#1f2937', border: '1px solid #374151', borderRadius: '0.5rem', color: 'white', fontSize: '0.875rem', boxSizing: 'border-box' }} /></div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div><label style={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600, marginBottom: '0.375rem' }}>CATEGORY</label>
                                    <input value={editCategory} onChange={e => setEditCategory(e.target.value)} placeholder="e.g. Cocktail"
                                        style={{ width: '100%', padding: '0.5rem 0.75rem', background: '#1f2937', border: '1px solid #374151', borderRadius: '0.5rem', color: 'white', fontSize: '0.875rem', boxSizing: 'border-box' }} /></div>
                                <div><label style={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600, marginBottom: '0.375rem' }}>TAGS</label>
                                    <input value={editTags} onChange={e => setEditTags(e.target.value)} placeholder="citrus, rum, popular"
                                        style={{ width: '100%', padding: '0.5rem 0.75rem', background: '#1f2937', border: '1px solid #374151', borderRadius: '0.5rem', color: 'white', fontSize: '0.875rem', boxSizing: 'border-box' }} /></div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div><label style={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600, marginBottom: '0.375rem' }}>GLASS TYPE</label>
                                    <input value={editGlass} onChange={e => setEditGlass(e.target.value)} placeholder="e.g. Collins glass"
                                        style={{ width: '100%', padding: '0.5rem 0.75rem', background: '#1f2937', border: '1px solid #374151', borderRadius: '0.5rem', color: 'white', fontSize: '0.875rem', boxSizing: 'border-box' }} /></div>
                                <div><label style={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600, marginBottom: '0.375rem' }}>SERVING SIZE</label>
                                    <input value={editAmount} onChange={e => setEditAmount(e.target.value)} placeholder="e.g. 4 oz"
                                        style={{ width: '100%', padding: '0.5rem 0.75rem', background: '#1f2937', border: '1px solid #374151', borderRadius: '0.5rem', color: 'white', fontSize: '0.875rem', boxSizing: 'border-box' }} /></div>
                            </div>

                            <div><label style={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600, marginBottom: '0.375rem' }}>DESCRIPTION</label>
                                <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Short description" rows={2}
                                    style={{ width: '100%', padding: '0.5rem 0.75rem', background: '#1f2937', border: '1px solid #374151', borderRadius: '0.5rem', color: 'white', fontSize: '0.875rem', resize: 'vertical', boxSizing: 'border-box' }} /></div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600, marginBottom: '0.375rem' }}>INGREDIENTS</label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '80px 60px 1fr auto', gap: '0.375rem', fontSize: '0.7rem', color: '#6b7280', padding: '0 0.25rem' }}>
                                        <span>Amount</span><span>Unit</span><span>Ingredient</span><span />
                                    </div>
                                    {editIngredients.map((ing, i) => (
                                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 60px 1fr auto', gap: '0.375rem', alignItems: 'center' }}>
                                            <input value={ing.amount} onChange={e => updateIng(i, 'amount', e.target.value)} placeholder="1.5"
                                                style={{ padding: '0.375rem 0.5rem', background: '#1f2937', border: '1px solid #374151', borderRadius: '0.375rem', color: 'white', fontSize: '0.8rem' }} />
                                            <input value={ing.unit} onChange={e => updateIng(i, 'unit', e.target.value)} placeholder="oz"
                                                style={{ padding: '0.375rem 0.5rem', background: '#1f2937', border: '1px solid #374151', borderRadius: '0.375rem', color: 'white', fontSize: '0.8rem' }} />
                                            <input value={ing.name} onChange={e => updateIng(i, 'name', e.target.value)} placeholder="Ingredient name"
                                                style={{ padding: '0.375rem 0.5rem', background: '#1f2937', border: '1px solid #374151', borderRadius: '0.375rem', color: 'white', fontSize: '0.8rem' }} />
                                            <button type="button" onClick={() => removeIng(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: '0.25rem' }}><X size={14} /></button>
                                        </div>
                                    ))}
                                    <button type="button" onClick={addIng} style={{ alignSelf: 'flex-start', background: 'none', border: '1px dashed #374151', borderRadius: '0.375rem', color: '#6b7280', cursor: 'pointer', padding: '0.375rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                        <Plus size={13} /> Add ingredient
                                    </button>
                                </div>
                            </div>

                            <div><label style={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600, marginBottom: '0.375rem' }}>INSTRUCTIONS</label>
                                <textarea value={editInstructions} onChange={e => setEditInstructions(e.target.value)} placeholder="How to make this drink…" rows={4}
                                    style={{ width: '100%', padding: '0.5rem 0.75rem', background: '#1f2937', border: '1px solid #374151', borderRadius: '0.5rem', color: 'white', fontSize: '0.875rem', resize: 'vertical', boxSizing: 'border-box' }} /></div>
                        </div>
                        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #1f2937', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            <button type="button" onClick={() => setEditOpen(false)} style={{ padding: '0.5rem 1rem', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '0.875rem' }}>Cancel</button>
                            <button type="button" onClick={saveRecipe} disabled={editSaving}
                                style={{ padding: '0.5rem 1.25rem', background: editSaving ? '#1d4ed8' : '#3b82f6', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: editSaving ? 'not-allowed' : 'pointer', fontSize: '0.875rem', fontWeight: 500, opacity: editSaving ? 0.7 : 1 }}>
                                {editSaving ? 'Saving…' : editId ? 'Save Changes' : 'Create Recipe'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Import Modal ─────────────────────────────────────────────────── */}
            {importOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', padding: '1rem' }}>
                    <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: '1rem', width: '100%', maxWidth: 800, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' }}>
                        {/* Header */}
                        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #1f2937', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <FileText size={20} style={{ color: '#60a5fa' }} />
                                    <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: 'white' }}>Import Recipes</h2>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                    {['Upload', 'Map', 'Preview', 'Options', 'Done'].map((label, idx) => (
                                        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <div style={{ height: 20, padding: '0 8px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 600, display: 'flex', alignItems: 'center', background: idx + 1 < importStep ? '#059669' : idx + 1 === importStep ? '#2563eb' : '#1f2937', color: idx + 1 <= importStep ? 'white' : '#6b7280' }}>
                                                {idx + 1 < importStep ? '✓' : label}
                                            </div>
                                            {idx < 4 && <div style={{ width: 16, height: 1, background: idx + 1 < importStep ? '#059669' : '#374151' }} />}
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <button type="button" onClick={() => setImportOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
                            {/* Step 1: Upload */}
                            {importStep === 1 && (
                                <div style={{ maxWidth: 480, margin: '0 auto' }}>
                                    <div
                                        onDragOver={e => { e.preventDefault(); setImportDragOver(true); }}
                                        onDragLeave={() => setImportDragOver(false)}
                                        onDrop={e => { e.preventDefault(); setImportDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleImportFile(f); }}
                                        onClick={() => document.getElementById('import-file-input-admin')?.click()}
                                        style={{ border: `2px dashed ${importDragOver ? '#3b82f6' : '#374151'}`, borderRadius: '1rem', padding: '3.5rem', textAlign: 'center', cursor: 'pointer', background: importDragOver ? 'rgba(59,130,246,0.05)' : 'transparent', transition: 'all 0.2s' }}>
                                        <Upload size={40} style={{ margin: '0 auto 1rem', display: 'block', color: '#4b5563' }} />
                                        <p style={{ margin: '0 0 0.25rem', color: '#e5e7eb', fontWeight: 600 }}>Drop your file here</p>
                                        <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>or click to browse</p>
                                        <p style={{ margin: '1rem 0 0', color: '#4b5563', fontSize: '0.75rem' }}>Supports .csv and .json — delimiter auto-detected</p>
                                        <input id="import-file-input-admin" type="file" accept=".csv,.json,.tsv" style={{ display: 'none' }}
                                            onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = ''; }} />
                                    </div>
                                    {importError && <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '0.75rem', color: '#f87171', fontSize: '0.875rem', display: 'flex', gap: '0.5rem' }}><AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />{importError}</div>}
                                    <div style={{ marginTop: '1.5rem', background: '#1f2937', border: '1px solid #374151', borderRadius: '0.75rem', padding: '1rem' }}>
                                        <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#d1d5db' }}>Supported formats</p>
                                        <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: '0.75rem', color: '#6b7280', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                            <li>• CSV with header row (comma, semicolon, tab, or pipe)</li>
                                            <li>• Pivoted CSV: one row per ingredient — auto-detected and grouped by recipe name</li>
                                            <li>• JSON array or object with a "recipes" key</li>
                                            <li>• Ingredients as JSON array or semicolon-separated text</li>
                                        </ul>
                                    </div>
                                </div>
                            )}

                            {/* Step 2: Column mapping */}
                            {importStep === 2 && (
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem', background: '#1f2937', border: '1px solid #374151', borderRadius: '0.75rem', padding: '0.75rem 1rem' }}>
                                        <div style={{ flex: 1 }}>
                                            <p style={{ margin: '0 0 0.25rem', fontSize: '0.875rem', fontWeight: 600, color: 'white' }}>
                                                {pivotMode ? 'Pivoted format detected' : 'Standard format'}
                                            </p>
                                            <p style={{ margin: 0, fontSize: '0.75rem', color: '#6b7280' }}>
                                                {pivotMode ? 'One row per ingredient — rows grouped by recipe name.' : 'One row per recipe.'}{' '}
                                                <span style={{ color: '#4b5563' }}>({importRawRows.length} rows)</span>
                                            </p>
                                        </div>
                                        <button type="button" onClick={() => setPivotMode(m => !m)}
                                            style={{ flexShrink: 0, padding: '0.375rem 0.75rem', background: 'none', border: '1px solid #4b5563', borderRadius: '0.5rem', color: '#9ca3af', cursor: 'pointer', fontSize: '0.75rem' }}>
                                            Switch to {pivotMode ? 'standard' : 'pivoted'}
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {importHeaders.map(h => {
                                            const sampleIdx = importHeaders.indexOf(h);
                                            const sample = importRawRows.slice(0, 3).map(r => r[sampleIdx]).filter(Boolean).join(' / ');
                                            const currentVal = pivotMode ? (pivotMapping[h] || 'skip') : (importMapping[h] || 'skip');
                                            const isMapped = currentVal !== 'skip';
                                            return (
                                                <div key={h} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: '#1f2937', border: '1px solid #374151', borderRadius: '0.75rem', padding: '0.75rem 1rem' }}>
                                                    <div style={{ width: 160, flexShrink: 0 }}>
                                                        <p style={{ margin: '0 0 0.125rem', fontSize: '0.875rem', color: 'white', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h}</p>
                                                        <p style={{ margin: 0, fontSize: '0.7rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sample || '—'}</p>
                                                    </div>
                                                    <ArrowRight size={16} style={{ color: '#4b5563', flexShrink: 0 }} />
                                                    {pivotMode ? (
                                                        <select title={`Map column "${h}"`} value={pivotMapping[h] || 'skip'}
                                                            onChange={e => setPivotMapping(prev => ({ ...prev, [h]: e.target.value as PivotField }))}
                                                            style={{ background: '#111827', border: '1px solid #4b5563', borderRadius: '0.5rem', padding: '0.375rem 0.625rem', color: '#d1d5db', fontSize: '0.875rem' }}>
                                                            {PIVOT_FIELD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                        </select>
                                                    ) : (
                                                        <select title={`Map column "${h}"`} value={importMapping[h] || 'skip'}
                                                            onChange={e => setImportMapping(prev => ({ ...prev, [h]: e.target.value as ImportField }))}
                                                            style={{ background: '#111827', border: '1px solid #4b5563', borderRadius: '0.5rem', padding: '0.375rem 0.625rem', color: '#d1d5db', fontSize: '0.875rem' }}>
                                                            {FIELD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                        </select>
                                                    )}
                                                    {isMapped && <span style={{ fontSize: '0.7rem', color: '#34d399', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', padding: '0.15rem 0.5rem', borderRadius: 999, flexShrink: 0 }}>✓</span>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {pivotMode ? !Object.values(pivotMapping).includes('recipe_name') && (
                                        <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '0.75rem', color: '#fbbf24', fontSize: '0.875rem', display: 'flex', gap: '0.5rem' }}><AlertCircle size={16} style={{ flexShrink: 0 }} />Map at least one column to "Recipe Name *" to continue.</div>
                                    ) : !Object.values(importMapping).includes('name') && (
                                        <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '0.75rem', color: '#fbbf24', fontSize: '0.875rem', display: 'flex', gap: '0.5rem' }}><AlertCircle size={16} style={{ flexShrink: 0 }} />Map at least one column to "Name *" to continue.</div>
                                    )}
                                </div>
                            )}

                            {/* Step 3: Preview */}
                            {importStep === 3 && (
                                <div>
                                    <div style={{ marginBottom: '1rem' }}>
                                        <p style={{ margin: '0 0 0.25rem', fontSize: '0.875rem', fontWeight: 600, color: 'white' }}>Data Preview</p>
                                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#6b7280' }}>
                                            {pivotMode ? `${importRawRows.length} ingredient rows → ${importPreview.length} recipes` : `Showing first ${Math.min(importPreview.length, 30)} of ${importRawRows.length} rows`}
                                            {issueCount > 0 && <span style={{ color: '#f59e0b', marginLeft: '0.5rem' }}>· {issueCount} {pivotMode ? 'recipes' : 'rows'} have issues and will be skipped</span>}
                                        </p>
                                    </div>
                                    <div style={{ overflowX: 'auto', border: '1px solid #374151', borderRadius: '0.75rem' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                            <thead>
                                                <tr style={{ background: '#1f2937', borderBottom: '1px solid #374151' }}>
                                                    {['#', 'Name', 'Category', 'Ingredients', 'Instructions', 'Status'].map(h => (
                                                        <th key={h} style={{ textAlign: 'left', padding: '0.5rem 0.75rem', color: '#9ca3af', fontWeight: 600, fontSize: '0.7rem' }}>{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {importPreview.slice(0, 30).map((row, i) => (
                                                    <tr key={i} style={{ borderBottom: '1px solid #1f2937', background: row.issues.length ? 'rgba(239,68,68,0.05)' : 'transparent' }}>
                                                        <td style={{ padding: '0.5rem 0.75rem', color: '#4b5563', fontSize: '0.7rem' }}>{i + 1}</td>
                                                        <td style={{ padding: '0.5rem 0.75rem', color: 'white', fontWeight: 500, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name || <span style={{ color: '#ef4444', fontStyle: 'italic' }}>missing</span>}</td>
                                                        <td style={{ padding: '0.5rem 0.75rem', color: '#9ca3af', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.category || '—'}</td>
                                                        <td style={{ padding: '0.5rem 0.75rem', color: '#9ca3af' }}>{row.ingredients.length > 0 ? `${row.ingredients.length} items` : '—'}</td>
                                                        <td style={{ padding: '0.5rem 0.75rem', color: '#9ca3af', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.instructions || '—'}</td>
                                                        <td style={{ padding: '0.5rem 0.75rem' }}>
                                                            {row.issues.length > 0
                                                                ? <span style={{ color: '#f87171', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 4 }}><AlertCircle size={12} />{row.issues[0]}</span>
                                                                : <span style={{ color: '#34d399', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={12} />OK</span>}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    {importPreview.length > 30 && <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#4b5563', textAlign: 'right' }}>+{importPreview.length - 30} more recipes</p>}
                                </div>
                            )}

                            {/* Step 4: Options */}
                            {importStep === 4 && (
                                <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '0.75rem', padding: '1.25rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div>
                                                <p style={{ margin: '0 0 0.25rem', fontSize: '0.875rem', fontWeight: 600, color: 'white' }}>Skip duplicate names</p>
                                                <p style={{ margin: 0, fontSize: '0.75rem', color: '#6b7280' }}>Recipes already in your library will be skipped</p>
                                            </div>
                                            <button type="button" onClick={() => setSkipDuplicates(!skipDuplicates)}
                                                style={{ position: 'relative', width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: skipDuplicates ? '#2563eb' : '#374151', flexShrink: 0 }}>
                                                <span style={{ position: 'absolute', top: 4, width: 16, height: 16, background: 'white', borderRadius: '50%', transition: 'all 0.2s', left: skipDuplicates ? 24 : 4 }} />
                                            </button>
                                        </div>
                                    </div>
                                    <div style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '0.75rem', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: 'white' }}>Import summary</p>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}><span style={{ color: '#9ca3af' }}>Total recipes</span><span style={{ color: 'white', fontWeight: 500 }}>{importPreview.length}</span></div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}><span style={{ color: '#9ca3af' }}>Will be imported</span><span style={{ color: '#34d399', fontWeight: 500 }}>{validImportCount}</span></div>
                                        {issueCount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}><span style={{ color: '#9ca3af' }}>Skipped (issues)</span><span style={{ color: '#f59e0b', fontWeight: 500 }}>{issueCount}</span></div>}
                                    </div>
                                </div>
                            )}

                            {/* Step 5: Result */}
                            {importStep === 5 && importResult && (
                                <div style={{ maxWidth: 380, margin: '0 auto', textAlign: 'center', padding: '2.5rem 0' }}>
                                    <CheckCircle size={56} style={{ color: '#34d399', margin: '0 auto 1rem', display: 'block' }} />
                                    <h3 style={{ margin: '0 0 0.25rem', color: 'white', fontSize: '1.25rem', fontWeight: 700 }}>Import Complete</h3>
                                    <p style={{ margin: '0 0 1.5rem', color: '#6b7280', fontSize: '0.875rem' }}>Your recipe library has been updated.</p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', background: '#1f2937', borderRadius: '0.75rem', padding: '0.75rem 1.25rem' }}>
                                            <span style={{ color: '#9ca3af' }}>Recipes imported</span>
                                            <span style={{ color: '#34d399', fontWeight: 700, fontSize: '1rem' }}>{importResult.imported}</span>
                                        </div>
                                        {importResult.skipped > 0 && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', background: '#1f2937', borderRadius: '0.75rem', padding: '0.75rem 1.25rem' }}>
                                                <span style={{ color: '#9ca3af' }}>Skipped</span>
                                                <span style={{ color: '#f59e0b', fontWeight: 500 }}>{importResult.skipped}</span>
                                            </div>
                                        )}
                                    </div>
                                    {importResult.errors.length > 0 && (
                                        <div style={{ marginTop: '1rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '0.75rem', padding: '1rem', textAlign: 'left' }}>
                                            <p style={{ margin: '0 0 0.5rem', color: '#f87171', fontSize: '0.75rem', fontWeight: 600 }}>Errors ({importResult.errors.length})</p>
                                            {importResult.errors.slice(0, 6).map((e, i) => <p key={i} style={{ margin: '0.125rem 0', color: '#fca5a5', fontSize: '0.75rem' }}>{e}</p>)}
                                            {importResult.errors.length > 6 && <p style={{ margin: '0.25rem 0 0', color: '#ef4444', fontSize: '0.75rem' }}>+{importResult.errors.length - 6} more</p>}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Import footer */}
                        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #1f2937', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <button type="button"
                                onClick={() => { if (importStep === 1 || importStep === 5) setImportOpen(false); else setImportStep(s => (s - 1) as typeof importStep); }}
                                style={{ padding: '0.5rem 1rem', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '0.875rem' }}>
                                {importStep === 1 || importStep === 5 ? 'Close' : '← Back'}
                            </button>
                            {importStep < 5 && (
                                <button type="button"
                                    disabled={
                                        (importStep === 2 && pivotMode && !Object.values(pivotMapping).includes('recipe_name')) ||
                                        (importStep === 2 && !pivotMode && !Object.values(importMapping).includes('name')) ||
                                        importing
                                    }
                                    onClick={() => {
                                        if (importStep === 1) return;
                                        if (importStep === 2) applyMapping();
                                        else if (importStep === 3) setImportStep(4);
                                        else if (importStep === 4) runImport();
                                    }}
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.25rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500, opacity: (importStep === 2 && pivotMode && !Object.values(pivotMapping).includes('recipe_name')) || (importStep === 2 && !pivotMode && !Object.values(importMapping).includes('name')) ? 0.4 : 1 }}>
                                    {importing && <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />}
                                    {importStep === 4 ? `Import ${validImportCount} Recipe${validImportCount !== 1 ? 's' : ''}` : 'Continue →'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
