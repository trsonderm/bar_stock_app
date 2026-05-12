'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import InputAdornment from '@mui/material/InputAdornment';
import SearchIcon from '@mui/icons-material/Search';
import TopNav from '@/components/TopNav';
import NotificationBell from '@/components/NotificationBell';

interface Recipe {
    id: number;
    name: string;
    description: string | null;
    ingredients: { item: string; amount: string; unit?: string }[];
    instructions: string | null;
    category: string | null;
    glass: string | null;
    amount: string | null;
    tags: string[];
    source: 'local' | 'global';
    image_url?: string | null;
}

const CATEGORIES = ['Cocktail', 'Shot', 'Mocktail', 'Beer', 'Wine', 'Spirit', 'Other'];

export default function RecipesClient({ user }: { user: any }) {
    const router = useRouter();
    const isAdmin = user.role === 'admin';

    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [sourceFilter, setSourceFilter] = useState<'all' | 'local' | 'global'>('all');
    const [selected, setSelected] = useState<Recipe | null>(null);

    // Edit/create modal
    const [editOpen, setEditOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<Recipe | null>(null);
    const [form, setForm] = useState({ name: '', description: '', instructions: '', category: '', glass: '', amount: '', tags: '', ingredients: '' });
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const fetchRecipes = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (search) params.set('q', search);
            if (categoryFilter) params.set('category', categoryFilter);
            if (sourceFilter !== 'all') params.set('source', sourceFilter);
            const res = await fetch(`/api/admin/recipes?${params}`);
            const data = await res.json();
            setRecipes(data.recipes || []);
        } finally {
            setLoading(false);
        }
    }, [search, categoryFilter, sourceFilter]);

    useEffect(() => {
        const t = setTimeout(fetchRecipes, 300);
        return () => clearTimeout(t);
    }, [fetchRecipes]);

    const openCreate = () => {
        setEditTarget(null);
        setForm({ name: '', description: '', instructions: '', category: '', glass: '', amount: '', tags: '', ingredients: '' });
        setEditOpen(true);
    };

    const openEdit = (r: Recipe) => {
        if (r.source === 'global') return;
        setEditTarget(r);
        setForm({
            name: r.name,
            description: r.description || '',
            instructions: r.instructions || '',
            category: r.category || '',
            glass: r.glass || '',
            amount: r.amount || '',
            tags: (r.tags || []).join(', '),
            ingredients: (r.ingredients || []).map(i => `${i.amount}${i.unit ? ' ' + i.unit : ''} ${i.item}`).join('\n'),
        });
        setEditOpen(true);
    };

    const parseIngredients = (raw: string) =>
        raw.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
            const parts = line.split(/\s+/);
            const amount = parts[0] || '';
            const rest = parts.slice(1).join(' ');
            return { amount, item: rest };
        });

    const handleSave = async () => {
        if (!form.name.trim()) return;
        setSaving(true);
        try {
            const payload = {
                name: form.name.trim(),
                description: form.description || null,
                instructions: form.instructions || null,
                category: form.category || null,
                glass: form.glass || null,
                amount: form.amount || null,
                tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
                ingredients: parseIngredients(form.ingredients),
            };

            if (editTarget) {
                await fetch(`/api/admin/recipes/${editTarget.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            } else {
                await fetch('/api/admin/recipes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            }
            setEditOpen(false);
            fetchRecipes();
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!editTarget || !confirm(`Delete "${editTarget.name}"?`)) return;
        setDeleting(true);
        try {
            await fetch(`/api/admin/recipes/${editTarget.id}`, { method: 'DELETE' });
            setEditOpen(false);
            if (selected?.id === editTarget.id) setSelected(null);
            fetchRecipes();
        } finally {
            setDeleting(false);
        }
    };

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
            <TopNav user={user}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <NotificationBell />
                    <Button variant="text" color="inherit" size="small" onClick={() => router.push('/inventory')}>
                        ← Stock View
                    </Button>
                </Box>
            </TopNav>

            {/* Sticky toolbar */}
            <Box sx={{ position: 'sticky', top: 64, zIndex: 1100, bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider', px: 2, py: 1, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                <TextField
                    size="small"
                    placeholder="Search recipes…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
                    sx={{ minWidth: 220 }}
                />
                <TextField
                    select
                    size="small"
                    value={categoryFilter}
                    onChange={e => setCategoryFilter(e.target.value)}
                    SelectProps={{ native: true }}
                    sx={{ minWidth: 130 }}
                >
                    <option value="">All Categories</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </TextField>
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                    {(['all', 'local', 'global'] as const).map(s => (
                        <Button
                            key={s}
                            size="small"
                            variant={sourceFilter === s ? 'contained' : 'outlined'}
                            onClick={() => setSourceFilter(s)}
                            sx={{ textTransform: 'capitalize', minWidth: 64 }}
                        >
                            {s === 'all' ? 'All' : s === 'local' ? 'My Library' : 'Global'}
                        </Button>
                    ))}
                </Box>
                {isAdmin && (
                    <Button variant="contained" size="small" onClick={openCreate} sx={{ ml: 'auto', bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' } }}>
                        + Add Recipe
                    </Button>
                )}
            </Box>

            <Box sx={{ display: 'flex', height: 'calc(100vh - 128px)' }}>
                {/* Recipe list */}
                <Box sx={{ width: { xs: '100%', md: selected ? '40%' : '100%' }, overflowY: 'auto', borderRight: selected ? '1px solid' : 'none', borderColor: 'divider', p: 2 }}>
                    {loading && <Typography color="text.secondary" sx={{ p: 2 }}>Loading…</Typography>}
                    {!loading && recipes.length === 0 && (
                        <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
                            <Typography variant="h6">No recipes found</Typography>
                            {isAdmin && <Typography variant="body2" sx={{ mt: 1 }}>Add your first recipe with the button above.</Typography>}
                        </Box>
                    )}
                    <Box sx={{ display: 'grid', gridTemplateColumns: selected ? '1fr' : { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 2 }}>
                        {recipes.map(r => (
                            <Box
                                key={`${r.source}-${r.id}`}
                                onClick={() => setSelected(s => s?.id === r.id && s.source === r.source ? null : r)}
                                sx={{
                                    bgcolor: 'background.paper',
                                    border: '1px solid',
                                    borderColor: selected?.id === r.id && selected.source === r.source ? '#7c3aed' : 'divider',
                                    borderRadius: 2,
                                    p: 2,
                                    cursor: 'pointer',
                                    transition: 'border-color 0.15s',
                                    '&:hover': { borderColor: '#a78bfa' },
                                }}
                            >
                                {r.image_url && (
                                    <Box component="img" src={r.image_url} alt={r.name}
                                        sx={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 1, mb: 1 }} />
                                )}
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{r.name}</Typography>
                                    <Chip
                                        label={r.source === 'global' ? 'Global' : 'My Library'}
                                        size="small"
                                        sx={{ fontSize: '0.65rem', bgcolor: r.source === 'global' ? '#1e3a5f' : '#1a2e1a', color: r.source === 'global' ? '#93c5fd' : '#86efac', flexShrink: 0 }}
                                    />
                                </Box>
                                {r.category && <Typography variant="caption" color="text.secondary">{r.category}</Typography>}
                                {r.description && (
                                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                        {r.description}
                                    </Typography>
                                )}
                                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                                    {r.ingredients?.length || 0} ingredient{r.ingredients?.length !== 1 ? 's' : ''}
                                </Typography>
                            </Box>
                        ))}
                    </Box>
                </Box>

                {/* Detail panel */}
                {selected && (
                    <Box sx={{ flex: 1, overflowY: 'auto', p: 3, display: { xs: 'none', md: 'block' } }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                            <Box>
                                <Typography variant="h5" sx={{ fontWeight: 700 }}>{selected.name}</Typography>
                                        {selected.category && <Chip label={selected.category} size="small" sx={{ mt: 0.5, mr: 0.5 }} />}
                                {selected.glass && <Chip label={`Glass: ${selected.glass}`} size="small" variant="outlined" sx={{ mt: 0.5, mr: 0.5 }} />}
                                {selected.amount && <Chip label={`Serves: ${selected.amount}`} size="small" variant="outlined" sx={{ mt: 0.5, mr: 0.5 }} />}
                                {selected.tags?.map(t => <Chip key={t} label={t} size="small" sx={{ mt: 0.5, mr: 0.5 }} variant="outlined" />)}
                                <Chip label={selected.source === 'global' ? 'Global Library' : 'My Library'} size="small" sx={{ mt: 0.5, bgcolor: selected.source === 'global' ? '#1e3a5f' : '#1a2e1a', color: selected.source === 'global' ? '#93c5fd' : '#86efac' }} />
                            </Box>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                                {isAdmin && selected.source === 'local' && (
                                    <Button size="small" variant="outlined" onClick={() => openEdit(selected)}>Edit</Button>
                                )}
                                <Button size="small" onClick={() => setSelected(null)}>✕</Button>
                            </Box>
                        </Box>

                        {selected.image_url && (
                            <Box component="img" src={selected.image_url} alt={selected.name}
                                sx={{ width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: 2, mb: 2 }} />
                        )}

                        {selected.description && (
                            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>{selected.description}</Typography>
                        )}

                        {selected.ingredients?.length > 0 && (
                            <Box sx={{ mb: 3 }}>
                                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Ingredients</Typography>
                                <Box component="ul" sx={{ m: 0, pl: 2 }}>
                                    {selected.ingredients.map((ing, i) => (
                                        <Typography key={i} component="li" variant="body2" sx={{ mb: 0.25 }}>
                                            <strong>{ing.amount}{ing.unit ? ` ${ing.unit}` : ''}</strong> {ing.item}
                                        </Typography>
                                    ))}
                                </Box>
                            </Box>
                        )}

                        {selected.instructions && (
                            <Box>
                                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Instructions</Typography>
                                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', color: 'text.secondary' }}>{selected.instructions}</Typography>
                            </Box>
                        )}
                    </Box>
                )}
            </Box>

            {/* Create / Edit modal */}
            <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>{editTarget ? `Edit: ${editTarget.name}` : 'New Recipe'}</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
                    <TextField label="Name *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} fullWidth size="small" />
                    <TextField
                        select label="Category" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                        fullWidth size="small" SelectProps={{ native: true }}
                    >
                        <option value="">— None —</option>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </TextField>
                    <TextField label="Description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} fullWidth size="small" multiline rows={2} />
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                        <TextField label="Glass Type" value={form.glass} onChange={e => setForm(p => ({ ...p, glass: e.target.value }))} fullWidth size="small" placeholder="e.g. Collins glass" />
                        <TextField label="Serving Size" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} fullWidth size="small" placeholder="e.g. 4 oz" />
                    </Box>
                    <TextField
                        label="Ingredients (one per line: amount unit item)"
                        placeholder={'1.5 oz Vodka\n0.5 oz Triple Sec\n1 oz Lime Juice'}
                        value={form.ingredients}
                        onChange={e => setForm(p => ({ ...p, ingredients: e.target.value }))}
                        fullWidth size="small" multiline rows={5}
                    />
                    <TextField label="Instructions" value={form.instructions} onChange={e => setForm(p => ({ ...p, instructions: e.target.value }))} fullWidth size="small" multiline rows={4} />
                    <TextField label="Tags (comma separated)" value={form.tags} onChange={e => setForm(p => ({ ...p, tags: e.target.value }))} fullWidth size="small" placeholder="sweet, citrus, popular" />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
                    <Box>
                        {editTarget && (
                            <Button color="error" onClick={handleDelete} disabled={deleting}>
                                {deleting ? 'Deleting…' : 'Delete'}
                            </Button>
                        )}
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button onClick={() => setEditOpen(false)}>Cancel</Button>
                        <Button variant="contained" onClick={handleSave} disabled={saving || !form.name.trim()}
                            sx={{ bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' } }}>
                            {saving ? 'Saving…' : 'Save'}
                        </Button>
                    </Box>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
