'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    BookOpen, Plus, Upload, Search, Edit2, Trash2, X, RefreshCw,
    ChevronRight, AlertCircle, CheckCircle, ArrowRight, Tag,
    UtensilsCrossed, FileText,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Category {
    id: number;
    name: string;
    slug: string;
    org_id: number | null;
    is_system: boolean;
}

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
    category_id: number | null;
    tags: string[];
    image_url: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

type ImportField = 'name' | 'description' | 'instructions' | 'ingredients' | 'category' | 'tags' | 'skip';

interface ImportPreviewRow {
    name: string;
    description: string;
    instructions: string;
    ingredients: Ingredient[];
    category: string;
    tags: string[];
    issues: string[];
}

interface ImportResult {
    imported: number;
    skipped: number;
    errors: string[];
}

// ─── CSV / JSON helpers ───────────────────────────────────────────────────────

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
        let inQ = false;
        let cell = '';
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === '"') {
                if (inQ && line[i + 1] === '"') { cell += '"'; i++; }
                else inQ = !inQ;
            } else if (c === delim && !inQ) {
                row.push(cell.trim());
                cell = '';
            } else {
                cell += c;
            }
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
        const rows = arr.map((item: any) =>
            headers.map(h => {
                const v = item[h];
                if (v == null) return '';
                if (typeof v === 'object') return JSON.stringify(v);
                return String(v);
            })
        );
        return { headers, rows };
    } catch {
        return null;
    }
}

function parseIngredients(value: string): Ingredient[] {
    if (!value?.trim()) return [];
    // Try JSON array
    if (value.trim().startsWith('[')) {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
                return parsed.map((p: any) => ({
                    name: p.name || p.item || p.ingredient || '',
                    amount: String(p.amount || p.qty || ''),
                    unit: p.unit || '',
                    instructions: p.instructions || p.notes || '',
                })).filter(i => i.name);
            }
        } catch {}
    }
    // Text lines: "1.5 oz Vodka" or semicolon-separated
    const sep = value.includes(';') ? ';' : '\n';
    return value.split(sep)
        .map(l => l.trim()).filter(Boolean)
        .map(line => {
            const m = line.match(/^([\d.\/\s]+)?\s*([a-zA-Z]{1,5}\s*)?\s+(.+)$/);
            if (m && m[3]) {
                return { name: m[3].trim(), amount: (m[1] || '').trim(), unit: (m[2] || '').trim(), instructions: '' };
            }
            return { name: line, amount: '', unit: '', instructions: '' };
        })
        .filter(i => i.name);
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
    const get = (field: ImportField) =>
        headers.reduce((acc, h, i) => mapping[h] === field ? (raw[i] ?? '') : acc, '');

    const name = get('name').trim();
    const issues: string[] = [];
    if (!name) issues.push('Missing name');

    return {
        name,
        description: get('description').trim(),
        instructions: get('instructions').trim(),
        ingredients: parseIngredients(get('ingredients')),
        category: get('category').trim(),
        tags: get('tags').split(/[,;]+/).map(t => t.trim()).filter(Boolean),
        issues,
    };
}

// ─── Component ────────────────────────────────────────────────────────────────

const EMPTY_ING: Ingredient = { name: '', amount: '', unit: '', instructions: '' };

const FIELD_OPTIONS: { value: ImportField; label: string }[] = [
    { value: 'skip', label: '— Skip —' },
    { value: 'name', label: 'Name *' },
    { value: 'description', label: 'Description' },
    { value: 'instructions', label: 'Instructions' },
    { value: 'ingredients', label: 'Ingredients' },
    { value: 'category', label: 'Category' },
    { value: 'tags', label: 'Tags' },
];

export default function RecipesManagerClient() {
    // ── List ──
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState('');
    const [catFilter, setCatFilter] = useState('');
    const [selected, setSelected] = useState<Recipe | null>(null);

    // ── Edit modal ──
    const [editOpen, setEditOpen] = useState(false);
    const [editId, setEditId] = useState<number | null>(null);
    const [editName, setEditName] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [editIngredients, setEditIngredients] = useState<Ingredient[]>([{ ...EMPTY_ING }]);
    const [editInstructions, setEditInstructions] = useState('');
    const [editCatId, setEditCatId] = useState<number | null>(null);
    const [editCat, setEditCat] = useState('');
    const [editTags, setEditTags] = useState('');
    const [editActive, setEditActive] = useState(true);
    const [editSaving, setEditSaving] = useState(false);
    const [editError, setEditError] = useState('');
    const [showIngNotes, setShowIngNotes] = useState(false);

    // ── Name typeahead ──
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [showSugs, setShowSugs] = useState(false);
    const sugTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── New category inline ──
    const [newCatName, setNewCatName] = useState('');
    const [showNewCat, setShowNewCat] = useState(false);
    const [savingCat, setSavingCat] = useState(false);

    // ── Import modal ──
    const [importOpen, setImportOpen] = useState(false);
    const [importStep, setImportStep] = useState(1);
    const [importDragOver, setImportDragOver] = useState(false);
    const [importError, setImportError] = useState('');
    const [importHeaders, setImportHeaders] = useState<string[]>([]);
    const [importRawRows, setImportRawRows] = useState<string[][]>([]);
    const [importMapping, setImportMapping] = useState<Record<string, ImportField>>({});
    const [importPreview, setImportPreview] = useState<ImportPreviewRow[]>([]);
    const [globalImportCatId, setGlobalImportCatId] = useState<number | null>(null);
    const [globalImportCat, setGlobalImportCat] = useState('');
    const [skipDuplicates, setSkipDuplicates] = useState(true);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<ImportResult | null>(null);

    // ── Data loading ──
    const load = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams();
        if (q) params.set('q', q);
        if (catFilter) params.set('category', catFilter);
        const [rRes, cRes] = await Promise.all([
            fetch(`/api/super-admin/recipes?${params}`),
            fetch('/api/super-admin/recipe-categories'),
        ]);
        const [rData, cData] = await Promise.all([rRes.json(), cRes.json()]);
        setRecipes(rData.recipes || []);
        setCategories(cData.categories || []);
        setLoading(false);
    }, [q, catFilter]);

    useEffect(() => { load(); }, [load]);

    // ── Typeahead ──
    function handleNameChange(val: string) {
        setEditName(val);
        if (sugTimer.current) clearTimeout(sugTimer.current);
        if (val.length < 2) { setSuggestions([]); setShowSugs(false); return; }
        sugTimer.current = setTimeout(async () => {
            const res = await fetch(`/api/super-admin/recipes?q=${encodeURIComponent(val)}`);
            const data = await res.json();
            const names = (data.recipes || []).map((r: Recipe) => r.name).slice(0, 6);
            setSuggestions(names);
            setShowSugs(names.length > 0);
        }, 350);
    }

    // ── Edit handlers ──
    function openCreate() {
        setEditId(null); setEditName(''); setEditDesc('');
        setEditIngredients([{ ...EMPTY_ING }]); setEditInstructions('');
        setEditCatId(null); setEditCat(''); setEditTags('');
        setEditActive(true); setEditError(''); setEditOpen(true);
    }

    function openEdit(r: Recipe) {
        setEditId(r.id); setEditName(r.name); setEditDesc(r.description || '');
        setEditIngredients(
            r.ingredients?.length
                ? r.ingredients.map(i => ({ name: i.name || i.item || '', amount: i.amount || '', unit: i.unit || '', instructions: i.instructions || '' }))
                : [{ ...EMPTY_ING }]
        );
        setEditInstructions(r.instructions || '');
        setEditCatId(r.category_id);
        setEditCat(r.category || '');
        setEditTags((r.tags || []).join(', '));
        setEditActive(r.is_active); setEditError(''); setEditOpen(true);
    }

    async function saveRecipe() {
        if (!editName.trim()) { setEditError('Name is required'); return; }
        setEditSaving(true); setEditError('');
        const body = {
            name: editName.trim(),
            description: editDesc.trim() || null,
            ingredients: editIngredients.filter(i => i.name.trim()),
            instructions: editInstructions.trim() || null,
            category_id: editCatId,
            category: editCat.trim() || null,
            tags: editTags.split(',').map(t => t.trim()).filter(Boolean),
            is_active: editActive,
        };
        const url = editId ? `/api/super-admin/recipes/${editId}` : '/api/super-admin/recipes';
        const res = await fetch(url, { method: editId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        setEditSaving(false);
        if (!res.ok) { const d = await res.json(); setEditError(d.error || 'Failed to save'); return; }
        setEditOpen(false);
        if (selected?.id === editId) setSelected(null);
        await load();
    }

    async function deleteRecipe(id: number) {
        if (!confirm('Delete this recipe? This cannot be undone.')) return;
        await fetch(`/api/super-admin/recipes/${id}`, { method: 'DELETE' });
        if (selected?.id === id) setSelected(null);
        await load();
    }

    // ── Category creation ──
    async function createCategory() {
        if (!newCatName.trim()) return;
        setSavingCat(true);
        const slug = newCatName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const res = await fetch('/api/super-admin/recipe-categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newCatName.trim(), slug }),
        });
        setSavingCat(false);
        if (res.ok) {
            const data = await res.json();
            const newCat: Category = { id: data.id, name: newCatName.trim(), slug, org_id: null, is_system: false };
            setCategories(prev => [...prev, newCat].sort((a, b) => a.name.localeCompare(b.name)));
            setEditCatId(data.id); setEditCat(newCatName.trim());
            setNewCatName(''); setShowNewCat(false);
        }
    }

    // ── Import handlers ──
    function openImport() {
        setImportStep(1); setImportError(''); setImportHeaders([]); setImportRawRows([]);
        setImportMapping({}); setImportPreview([]); setGlobalImportCatId(null);
        setGlobalImportCat(''); setSkipDuplicates(true); setImportResult(null);
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

        setImportHeaders(parsed.headers);
        setImportRawRows(parsed.rows);
        setImportMapping(autoMap(parsed.headers));
        setImportStep(2);
    }

    function applyMapping() {
        const rows = importRawRows.map(r => buildPreviewRow(r, importHeaders, importMapping));
        setImportPreview(rows);
        setImportStep(3);
    }

    async function runImport() {
        setImporting(true);
        const validRows = importPreview.filter(r => r.issues.length === 0);
        const records = validRows.map(row => ({
            name: row.name,
            description: row.description || null,
            ingredients: row.ingredients,
            instructions: row.instructions || null,
            category: row.category || globalImportCat || null,
            category_id: !row.category && globalImportCatId ? globalImportCatId : null,
            tags: row.tags,
        }));

        const res = await fetch('/api/super-admin/recipes/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ records, skipDuplicates }),
        });
        const data = await res.json();
        setImporting(false);
        setImportResult({ imported: data.imported || 0, skipped: data.skipped || 0, errors: data.errors || [] });
        setImportStep(5);
        if ((data.imported || 0) > 0) await load();
    }

    // ── Ingredient editor helpers ──
    const updateIng = (idx: number, field: keyof Ingredient, val: string) =>
        setEditIngredients(prev => prev.map((ing, i) => i === idx ? { ...ing, [field]: val } : ing));
    const addIng = () => setEditIngredients(prev => [...prev, { ...EMPTY_ING }]);
    const removeIng = (idx: number) => setEditIngredients(prev => prev.filter((_, i) => i !== idx));

    const validImportCount = importPreview.filter(r => r.issues.length === 0).length;
    const issueCount = importPreview.filter(r => r.issues.length > 0).length;

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center gap-3 p-6 pb-4 border-b border-slate-800 flex-wrap">
                <div>
                    <h1 className="text-xl font-bold text-white">Global Recipe Library</h1>
                    <p className="text-xs text-slate-400 mt-0.5">{recipes.length} recipe{recipes.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="flex-1 flex items-center gap-2 min-w-0">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search recipes…"
                            className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
                        className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none">
                        <option value="">All Categories</option>
                        {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                    <button onClick={load} className="p-2 text-slate-400 hover:text-white transition-colors">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={openImport}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-medium transition-colors">
                        <Upload className="w-4 h-4" /> Import CSV / JSON
                    </button>
                    <button onClick={openCreate}
                        className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors">
                        <Plus className="w-4 h-4" /> Add Recipe
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex flex-1 overflow-hidden">
                {/* Recipe list */}
                <div className="flex-1 overflow-y-auto p-6">
                    {loading ? (
                        <div className="text-slate-500 text-sm">Loading…</div>
                    ) : recipes.length === 0 ? (
                        <div className="text-center py-20">
                            <BookOpen className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                            <p className="text-slate-400 font-medium">No recipes yet</p>
                            <p className="text-slate-600 text-sm mt-1">Use "Import" to bulk-load from CSV/JSON, or "Add Recipe" to create one manually.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                            {recipes.map(r => (
                                <div key={r.id} onClick={() => setSelected(s => s?.id === r.id ? null : r)}
                                    className={`group cursor-pointer bg-slate-900 border rounded-xl p-4 transition-all ${selected?.id === r.id ? 'border-blue-500/60 bg-blue-950/20' : 'border-slate-700 hover:border-slate-500'}`}>
                                    <div className="flex items-start gap-2">
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-slate-100 text-sm truncate">{r.name}</p>
                                            {r.category && (
                                                <span className="text-xs text-blue-400 bg-blue-900/30 px-1.5 py-0.5 rounded mt-1 inline-block">{r.category}</span>
                                            )}
                                        </div>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                            <button onClick={e => { e.stopPropagation(); openEdit(r); }}
                                                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors">
                                                <Edit2 className="w-3.5 h-3.5" />
                                            </button>
                                            <button onClick={e => { e.stopPropagation(); deleteRecipe(r.id); }}
                                                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                    {r.description && <p className="text-xs text-slate-400 mt-2 line-clamp-2">{r.description}</p>}
                                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                                        {(r.ingredients || []).length > 0 && <span>{r.ingredients.length} ingredient{r.ingredients.length !== 1 ? 's' : ''}</span>}
                                        {!r.is_active && <span className="text-amber-500">inactive</span>}
                                    </div>
                                    {(r.tags || []).length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {r.tags.slice(0, 4).map(t => (
                                                <span key={t} className="text-xs bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded">{t}</span>
                                            ))}
                                            {r.tags.length > 4 && <span className="text-xs text-slate-600">+{r.tags.length - 4}</span>}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Detail panel */}
                {selected && (
                    <div className="w-96 border-l border-slate-800 overflow-y-auto p-6 space-y-5 flex-shrink-0">
                        <div className="flex items-start gap-2">
                            <h2 className="text-lg font-bold text-white flex-1">{selected.name}</h2>
                            <div className="flex gap-1">
                                <button onClick={() => openEdit(selected)} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded">
                                    <Edit2 className="w-4 h-4" />
                                </button>
                                <button onClick={() => setSelected(null)} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {selected.category && (
                            <span className="inline-block text-xs text-blue-400 bg-blue-900/30 border border-blue-800/40 px-2 py-1 rounded-full">{selected.category}</span>
                        )}
                        {selected.description && <p className="text-sm text-slate-300">{selected.description}</p>}

                        {(selected.ingredients || []).length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Ingredients</p>
                                <ul className="space-y-2">
                                    {selected.ingredients.map((ing, i) => (
                                        <li key={i}>
                                            <span className="text-sm text-slate-200">
                                                {ing.amount && <span className="text-slate-400">{ing.amount} </span>}
                                                {ing.unit && <span className="text-slate-400">{ing.unit} </span>}
                                                {ing.name || (ing as any).item}
                                            </span>
                                            {ing.instructions && (
                                                <p className="text-xs text-slate-500 mt-0.5 pl-2 border-l border-slate-700">{ing.instructions}</p>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {selected.instructions && (
                            <div>
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Instructions</p>
                                <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{selected.instructions}</p>
                            </div>
                        )}

                        {(selected.tags || []).length > 0 && (
                            <div className="flex flex-wrap gap-1">
                                {selected.tags.map(t => (
                                    <span key={t} className="flex items-center gap-1 text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">
                                        <Tag className="w-3 h-3" />{t}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Edit / Create Modal ─────────────────────────────────────────────── */}
            {editOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl">
                        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between rounded-t-2xl">
                            <div className="flex items-center gap-2">
                                <UtensilsCrossed className="w-5 h-5 text-blue-400" />
                                <h2 className="text-lg font-bold text-white">{editId ? 'Edit Recipe' : 'New Recipe'}</h2>
                            </div>
                            <button onClick={() => setEditOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
                        </div>

                        <div className="overflow-y-auto flex-1 p-6 space-y-5">
                            {/* Name with typeahead */}
                            <div className="relative">
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Name *</label>
                                <input value={editName} onChange={e => handleNameChange(e.target.value)}
                                    onFocus={() => suggestions.length > 0 && setShowSugs(true)}
                                    onBlur={() => setTimeout(() => setShowSugs(false), 150)}
                                    placeholder="Recipe name…"
                                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                                {showSugs && suggestions.length > 0 && (
                                    <div className="absolute top-full mt-1 left-0 right-0 z-20 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl overflow-hidden">
                                        <p className="px-3 py-1.5 text-xs text-slate-500 border-b border-slate-700">Existing recipes — click to copy name</p>
                                        {suggestions.map(s => (
                                            <button key={s} onMouseDown={() => { setEditName(s); setShowSugs(false); }}
                                                className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 flex items-center gap-2">
                                                <ChevronRight className="w-3 h-3 text-slate-500" /> {s}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Description</label>
                                <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={2}
                                    placeholder="Brief description…"
                                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                                />
                            </div>

                            {/* Category */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Category</label>
                                <select value={editCatId ?? ''} onChange={e => {
                                    const v = e.target.value;
                                    if (v === '__new') { setShowNewCat(true); return; }
                                    const id = v ? parseInt(v) : null;
                                    setEditCatId(id);
                                    setEditCat(categories.find(c => c.id === id)?.name || '');
                                }}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none">
                                    <option value="">— No category —</option>
                                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}{c.is_system ? '' : ' ✦'}</option>)}
                                    <option value="__new">+ Create new category…</option>
                                </select>
                                {showNewCat && (
                                    <div className="flex gap-2 mt-2">
                                        <input value={newCatName} onChange={e => setNewCatName(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && createCategory()}
                                            placeholder="Category name…"
                                            className="flex-1 px-3 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        />
                                        <button onClick={createCategory} disabled={savingCat || !newCatName.trim()}
                                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-lg">
                                            {savingCat ? '…' : 'Create'}
                                        </button>
                                        <button onClick={() => { setShowNewCat(false); setNewCatName(''); }} className="px-3 py-1.5 text-slate-400 hover:text-white text-sm">Cancel</button>
                                    </div>
                                )}
                            </div>

                            {/* Ingredients table */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Ingredients</label>
                                    <button onClick={() => setShowIngNotes(!showIngNotes)}
                                        className="text-xs text-slate-500 hover:text-blue-400 transition-colors">
                                        {showIngNotes ? 'Hide step notes' : 'Show step notes'}
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    <div className={`grid gap-1.5 text-xs text-slate-500 px-0.5 ${showIngNotes ? 'grid-cols-[56px_60px_1fr_1fr_20px]' : 'grid-cols-[56px_60px_1fr_20px]'}`}>
                                        <span>Amount</span><span>Unit</span><span>Ingredient *</span>
                                        {showIngNotes && <span>Step note</span>}
                                        <span />
                                    </div>
                                    {editIngredients.map((ing, i) => (
                                        <div key={i} className={`grid gap-1.5 items-center ${showIngNotes ? 'grid-cols-[56px_60px_1fr_1fr_20px]' : 'grid-cols-[56px_60px_1fr_20px]'}`}>
                                            <input value={ing.amount} onChange={e => updateIng(i, 'amount', e.target.value)} placeholder="1.5"
                                                className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                            <input value={ing.unit} onChange={e => updateIng(i, 'unit', e.target.value)} placeholder="oz"
                                                className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                            <input value={ing.name} onChange={e => updateIng(i, 'name', e.target.value)} placeholder="Ingredient name"
                                                className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                            {showIngNotes && (
                                                <input value={ing.instructions || ''} onChange={e => updateIng(i, 'instructions', e.target.value)} placeholder="e.g. Muddle first"
                                                    className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                            )}
                                            <button onClick={() => removeIng(i)} className="flex justify-center text-slate-600 hover:text-red-400 transition-colors">
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                    <button onClick={addIng} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors mt-1">
                                        <Plus className="w-3.5 h-3.5" /> Add ingredient
                                    </button>
                                </div>
                            </div>

                            {/* Full instructions */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Recipe Instructions</label>
                                <textarea value={editInstructions} onChange={e => setEditInstructions(e.target.value)} rows={6}
                                    placeholder="Step-by-step preparation instructions for the whole recipe…"
                                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
                                />
                            </div>

                            {/* Tags */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Tags</label>
                                <input value={editTags} onChange={e => setEditTags(e.target.value)}
                                    placeholder="vodka, citrus, summer (comma-separated)"
                                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                            </div>

                            {/* Active toggle */}
                            <div className="flex items-center gap-3">
                                <button onClick={() => setEditActive(!editActive)}
                                    className={`relative w-10 h-6 rounded-full transition-colors ${editActive ? 'bg-blue-600' : 'bg-slate-700'}`}>
                                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-150 ${editActive ? 'left-5' : 'left-1'}`} />
                                </button>
                                <span className="text-sm text-slate-300">Active (visible in library)</span>
                            </div>

                            {editError && (
                                <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 border border-red-800/30 rounded-lg px-3 py-2">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {editError}
                                </div>
                            )}
                        </div>

                        <div className="sticky bottom-0 bg-slate-900 border-t border-slate-800 px-6 py-4 flex justify-end gap-3 rounded-b-2xl">
                            <button onClick={() => setEditOpen(false)} className="px-4 py-2 text-slate-400 hover:text-white text-sm transition-colors">Cancel</button>
                            <button onClick={saveRecipe} disabled={editSaving}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-lg font-medium transition-colors">
                                {editSaving ? 'Saving…' : editId ? 'Save Changes' : 'Create Recipe'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Import Modal ────────────────────────────────────────────────────── */}
            {importOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl">
                        {/* Import header */}
                        <div className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-blue-400" />
                                    <h2 className="text-lg font-bold text-white">Import Recipes</h2>
                                </div>
                                {/* Step indicator */}
                                <div className="flex items-center gap-1.5">
                                    {['Upload', 'Map', 'Preview', 'Options', 'Done'].map((label, idx) => (
                                        <div key={label} className="flex items-center gap-1">
                                            <div className={`h-5 px-2 rounded-full text-xs font-medium flex items-center transition-all ${
                                                idx + 1 < importStep ? 'bg-emerald-600 text-white' :
                                                idx + 1 === importStep ? 'bg-blue-600 text-white' :
                                                'bg-slate-800 text-slate-500'
                                            }`}>{idx + 1 < importStep ? '✓' : label}</div>
                                            {idx < 4 && <div className={`w-4 h-px ${idx + 1 < importStep ? 'bg-emerald-600' : 'bg-slate-700'}`} />}
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <button onClick={() => setImportOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            {/* Step 1: Upload */}
                            {importStep === 1 && (
                                <div className="max-w-xl mx-auto">
                                    <div
                                        onDragOver={e => { e.preventDefault(); setImportDragOver(true); }}
                                        onDragLeave={() => setImportDragOver(false)}
                                        onDrop={e => { e.preventDefault(); setImportDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleImportFile(f); }}
                                        onClick={() => document.getElementById('import-file-input')?.click()}
                                        className={`border-2 border-dashed rounded-2xl p-14 text-center cursor-pointer transition-colors ${importDragOver ? 'border-blue-500 bg-blue-950/20' : 'border-slate-700 hover:border-slate-500'}`}
                                    >
                                        <Upload className="w-10 h-10 text-slate-500 mx-auto mb-4" />
                                        <p className="text-slate-200 font-semibold text-base">Drop your file here</p>
                                        <p className="text-slate-500 text-sm mt-1">or click to browse</p>
                                        <p className="text-slate-600 text-xs mt-4">Supports .csv and .json — delimiter auto-detected</p>
                                        <input id="import-file-input" type="file" accept=".csv,.json,.tsv" className="hidden"
                                            onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = ''; }} />
                                    </div>
                                    {importError && (
                                        <div className="mt-4 flex items-start gap-2 text-red-400 text-sm bg-red-900/20 border border-red-800/30 rounded-xl p-3">
                                            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {importError}
                                        </div>
                                    )}
                                    <div className="mt-6 bg-slate-800/50 rounded-xl border border-slate-700/60 p-4 space-y-2">
                                        <p className="text-xs font-semibold text-slate-300">Supported formats</p>
                                        <ul className="text-xs text-slate-500 space-y-1">
                                            <li>• CSV with header row (comma, semicolon, tab, or pipe delimited)</li>
                                            <li>• JSON array: <code className="text-slate-400 bg-slate-900 px-1 rounded">[{`{"name":"Margarita","category":"Cocktail"}`}]</code></li>
                                            <li>• JSON object: <code className="text-slate-400 bg-slate-900 px-1 rounded">{`{"recipes":[...]}`}</code></li>
                                            <li>• Ingredients: <code className="text-slate-400 bg-slate-900 px-1 rounded">"1.5 oz Vodka; 0.5 oz Lime"</code> or JSON array</li>
                                        </ul>
                                    </div>
                                </div>
                            )}

                            {/* Step 2: Column mapping */}
                            {importStep === 2 && (
                                <div>
                                    <p className="text-sm text-slate-400 mb-5">
                                        Map each detected column to a recipe field. Auto-detected below — adjust any that are wrong.
                                        <span className="text-slate-500"> ({importRawRows.length} rows detected)</span>
                                    </p>
                                    <div className="space-y-2">
                                        {importHeaders.map(h => {
                                            const sampleIdx = importHeaders.indexOf(h);
                                            const sample = importRawRows.slice(0, 3).map(r => r[sampleIdx]).filter(Boolean).join(' / ');
                                            return (
                                                <div key={h} className="flex items-center gap-3 bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3">
                                                    <div className="w-44 flex-shrink-0">
                                                        <p className="text-sm text-slate-200 font-medium truncate">{h}</p>
                                                        <p className="text-xs text-slate-500 truncate mt-0.5">{sample || '—'}</p>
                                                    </div>
                                                    <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                                                    <select value={importMapping[h] || 'skip'}
                                                        onChange={e => setImportMapping(prev => ({ ...prev, [h]: e.target.value as ImportField }))}
                                                        className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500">
                                                        {FIELD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                    </select>
                                                    {importMapping[h] !== 'skip' && (
                                                        <span className="text-xs text-emerald-400 bg-emerald-900/20 border border-emerald-800/30 px-2 py-0.5 rounded-full flex-shrink-0">✓</span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {!Object.values(importMapping).includes('name') && (
                                        <div className="mt-4 flex items-center gap-2 text-amber-400 text-sm bg-amber-900/20 border border-amber-800/30 rounded-xl p-3">
                                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                            Map at least one column to "Name *" to continue.
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Step 3: Preview & clean */}
                            {importStep === 3 && (
                                <div>
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <p className="text-sm font-semibold text-slate-200">Data Preview</p>
                                            <p className="text-xs text-slate-500 mt-0.5">
                                                Showing first {Math.min(importPreview.length, 30)} of {importRawRows.length} rows
                                                {issueCount > 0 && <span className="text-amber-400 ml-2">· {issueCount} rows have issues and will be skipped</span>}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="overflow-x-auto rounded-xl border border-slate-700">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-slate-800 border-b border-slate-700">
                                                    <th className="text-left px-3 py-2 text-xs font-semibold text-slate-400 w-8">#</th>
                                                    <th className="text-left px-3 py-2 text-xs font-semibold text-slate-400">Name</th>
                                                    <th className="text-left px-3 py-2 text-xs font-semibold text-slate-400">Category</th>
                                                    <th className="text-left px-3 py-2 text-xs font-semibold text-slate-400">Ingredients</th>
                                                    <th className="text-left px-3 py-2 text-xs font-semibold text-slate-400 max-w-[160px]">Instructions</th>
                                                    <th className="text-left px-3 py-2 text-xs font-semibold text-slate-400">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {importPreview.slice(0, 30).map((row, i) => (
                                                    <tr key={i} className={`border-b border-slate-800/50 ${row.issues.length ? 'bg-red-950/10' : 'hover:bg-slate-800/30'}`}>
                                                        <td className="px-3 py-2 text-slate-600 text-xs">{i + 1}</td>
                                                        <td className="px-3 py-2 text-slate-200 font-medium max-w-[140px] truncate">
                                                            {row.name || <span className="text-red-400 italic">missing</span>}
                                                        </td>
                                                        <td className="px-3 py-2 text-xs text-slate-400 max-w-[80px] truncate">
                                                            {row.category || <span className="text-slate-600">—</span>}
                                                        </td>
                                                        <td className="px-3 py-2 text-xs text-slate-400">
                                                            {row.ingredients.length > 0 ? `${row.ingredients.length} items` : <span className="text-slate-600">—</span>}
                                                        </td>
                                                        <td className="px-3 py-2 text-xs text-slate-400 max-w-[160px] truncate">
                                                            {row.instructions || <span className="text-slate-600">—</span>}
                                                        </td>
                                                        <td className="px-3 py-2 text-xs">
                                                            {row.issues.length > 0 ? (
                                                                <span className="text-red-400 flex items-center gap-1">
                                                                    <AlertCircle className="w-3 h-3" />{row.issues[0]}
                                                                </span>
                                                            ) : (
                                                                <span className="text-emerald-400 flex items-center gap-1">
                                                                    <CheckCircle className="w-3 h-3" />OK
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    {importRawRows.length > 30 && (
                                        <p className="text-xs text-slate-600 mt-2 text-right">+{importRawRows.length - 30} more rows</p>
                                    )}
                                </div>
                            )}

                            {/* Step 4: Options */}
                            {importStep === 4 && (
                                <div className="max-w-lg mx-auto space-y-5">
                                    <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5">
                                        <p className="text-sm font-semibold text-slate-200 mb-1">Default category for all imports</p>
                                        <p className="text-xs text-slate-500 mb-3">
                                            Applied to recipes that don't have a category from the import file. Rows that already have a category keep it.
                                        </p>
                                        <select value={globalImportCatId ?? ''}
                                            onChange={e => {
                                                const v = e.target.value;
                                                setGlobalImportCatId(v ? parseInt(v) : null);
                                                setGlobalImportCat(categories.find(c => c.id === parseInt(v))?.name || '');
                                            }}
                                            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none">
                                            <option value="">— Keep from file / no default —</option>
                                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>

                                    <div className="flex items-center justify-between bg-slate-800/60 border border-slate-700 rounded-xl p-5">
                                        <div>
                                            <p className="text-sm font-semibold text-slate-200">Skip duplicate names</p>
                                            <p className="text-xs text-slate-500 mt-0.5">Recipes whose name already exists in the library will be skipped</p>
                                        </div>
                                        <button onClick={() => setSkipDuplicates(!skipDuplicates)}
                                            className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${skipDuplicates ? 'bg-blue-600' : 'bg-slate-700'}`}>
                                            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${skipDuplicates ? 'left-6' : 'left-1'}`} />
                                        </button>
                                    </div>

                                    <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 space-y-2">
                                        <p className="text-sm font-semibold text-slate-200">Import summary</p>
                                        <div className="flex justify-between text-sm"><span className="text-slate-400">Total rows</span><span className="text-slate-200 font-medium">{importRawRows.length}</span></div>
                                        <div className="flex justify-between text-sm"><span className="text-slate-400">Will be imported</span><span className="text-emerald-400 font-medium">{validImportCount}</span></div>
                                        {issueCount > 0 && <div className="flex justify-between text-sm"><span className="text-slate-400">Skipped (issues)</span><span className="text-amber-400 font-medium">{issueCount}</span></div>}
                                    </div>
                                </div>
                            )}

                            {/* Step 5: Result */}
                            {importStep === 5 && importResult && (
                                <div className="max-w-md mx-auto text-center py-10">
                                    <CheckCircle className="w-14 h-14 text-emerald-400 mx-auto mb-4" />
                                    <h3 className="text-xl font-bold text-white mb-1">Import Complete</h3>
                                    <p className="text-slate-500 text-sm mb-6">The global recipe library has been updated.</p>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between bg-slate-800 rounded-xl px-5 py-3">
                                            <span className="text-slate-400">Recipes imported</span>
                                            <span className="text-emerald-400 font-bold text-base">{importResult.imported}</span>
                                        </div>
                                        {importResult.skipped > 0 && (
                                            <div className="flex justify-between bg-slate-800 rounded-xl px-5 py-3">
                                                <span className="text-slate-400">Skipped</span>
                                                <span className="text-amber-400 font-medium">{importResult.skipped}</span>
                                            </div>
                                        )}
                                    </div>
                                    {importResult.errors.length > 0 && (
                                        <div className="mt-4 bg-red-950/20 border border-red-800/30 rounded-xl p-4 text-left">
                                            <p className="text-red-400 text-xs font-semibold mb-2">Errors ({importResult.errors.length})</p>
                                            {importResult.errors.slice(0, 6).map((e, i) => (
                                                <p key={i} className="text-red-300 text-xs">{e}</p>
                                            ))}
                                            {importResult.errors.length > 6 && (
                                                <p className="text-red-500 text-xs mt-1">+{importResult.errors.length - 6} more</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Import footer */}
                        <div className="border-t border-slate-800 px-6 py-4 flex items-center justify-between">
                            <button
                                onClick={() => {
                                    if (importStep === 1 || importStep === 5) setImportOpen(false);
                                    else setImportStep(s => (s - 1) as typeof importStep);
                                }}
                                className="px-4 py-2 text-slate-400 hover:text-white text-sm transition-colors">
                                {importStep === 1 || importStep === 5 ? 'Close' : '← Back'}
                            </button>
                            {importStep < 5 && (
                                <button
                                    disabled={
                                        (importStep === 2 && !Object.values(importMapping).includes('name')) ||
                                        importing
                                    }
                                    onClick={() => {
                                        if (importStep === 1) return; // handled by file drop
                                        if (importStep === 2) applyMapping();
                                        else if (importStep === 3) setImportStep(4);
                                        else if (importStep === 4) runImport();
                                    }}
                                    className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm rounded-lg font-medium transition-colors">
                                    {importing && <RefreshCw className="w-4 h-4 animate-spin" />}
                                    {importStep === 4
                                        ? `Import ${validImportCount} Recipe${validImportCount !== 1 ? 's' : ''}`
                                        : 'Continue →'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
