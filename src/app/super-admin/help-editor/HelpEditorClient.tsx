'use client';

import { useState, useEffect } from 'react';

interface HelpBlock {
    type: 'heading' | 'text' | 'image' | 'divider' | 'callout';
    content?: string;
    level?: 1 | 2 | 3;
    src?: string;
    alt?: string;
    style?: 'info' | 'warning' | 'tip';
}

interface HelpArticle {
    id: number;
    category: string;
    title: string;
    slug: string;
    blocks: HelpBlock[];
    sort_order: number;
    published: boolean;
}

const CATEGORIES = [
    { key: 'getting-started', label: 'Getting Started' },
    { key: 'faq', label: 'FAQ' },
    { key: 'how-to', label: 'How-To Guides' },
];

const BLOCK_TYPES = ['heading', 'text', 'image', 'divider', 'callout'] as const;

const emptyArticle = (): Partial<HelpArticle> => ({
    category: 'faq',
    title: '',
    slug: '',
    blocks: [],
    sort_order: 0,
    published: true,
});

export default function HelpEditorClient() {
    const [articles, setArticles] = useState<HelpArticle[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<Partial<HelpArticle> | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState('');
    const [filterCat, setFilterCat] = useState('');

    const fetchArticles = () => {
        setLoading(true);
        fetch('/api/help?all=1')
            .then(r => r.json())
            .then(d => setArticles(d.articles || []))
            .finally(() => setLoading(false));
    };

    useEffect(() => { fetchArticles(); }, []);

    const handleSave = async () => {
        if (!editing?.title || !editing?.category) return;
        setSaving(true);
        setSaveMsg('');
        try {
            const isNew = !editing.id;
            const res = await fetch('/api/help', {
                method: isNew ? 'POST' : 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editing),
            });
            const data = await res.json();
            if (res.ok) {
                setSaveMsg('Saved!');
                fetchArticles();
                setTimeout(() => setSaveMsg(''), 2000);
                if (isNew && data.id) setEditing(prev => ({ ...prev, id: data.id }));
            } else {
                setSaveMsg(data.error || 'Save failed');
            }
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this article?')) return;
        await fetch(`/api/help?id=${id}`, { method: 'DELETE' });
        fetchArticles();
        if (editing?.id === id) setEditing(null);
    };

    const addBlock = (type: HelpBlock['type']) => {
        const block: HelpBlock = type === 'heading' ? { type, level: 2, content: '' }
            : type === 'image' ? { type, src: '', alt: '' }
            : type === 'callout' ? { type, style: 'info', content: '' }
            : { type, content: type === 'divider' ? undefined : '' };
        setEditing(prev => ({ ...prev, blocks: [...(prev?.blocks || []), block] }));
    };

    const updateBlock = (idx: number, update: Partial<HelpBlock>) => {
        setEditing(prev => {
            const blocks = [...(prev?.blocks || [])];
            blocks[idx] = { ...blocks[idx], ...update };
            return { ...prev, blocks };
        });
    };

    const removeBlock = (idx: number) => {
        setEditing(prev => ({ ...prev, blocks: (prev?.blocks || []).filter((_, i) => i !== idx) }));
    };

    const moveBlock = (idx: number, dir: -1 | 1) => {
        setEditing(prev => {
            const blocks = [...(prev?.blocks || [])];
            const target = idx + dir;
            if (target < 0 || target >= blocks.length) return prev;
            [blocks[idx], blocks[target]] = [blocks[target], blocks[idx]];
            return { ...prev, blocks };
        });
    };

    const filtered = filterCat ? articles.filter(a => a.category === filterCat) : articles;

    return (
        <div style={{ display: 'flex', gap: 0, height: '100vh', overflow: 'hidden' }}>
            {/* Article List Sidebar */}
            <div style={{ width: '300px', flexShrink: 0, background: '#0f172a', borderRight: '1px solid #1e293b', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '1rem', borderBottom: '1px solid #1e293b' }}>
                    <h2 style={{ color: 'white', fontSize: '1rem', fontWeight: 700, margin: '0 0 0.75rem' }}>Help Articles</h2>
                    <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
                        style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', color: 'white', padding: '0.4rem 0.5rem', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                        <option value="">All Categories</option>
                        {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                    <button onClick={() => setEditing(emptyArticle())}
                        style={{ width: '100%', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', padding: '0.5rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
                        + New Article
                    </button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
                    {loading ? <p style={{ color: '#6b7280', padding: '1rem', fontSize: '0.85rem' }}>Loading...</p> : filtered.length === 0 ? (
                        <p style={{ color: '#6b7280', padding: '1rem', fontSize: '0.85rem' }}>No articles yet.</p>
                    ) : filtered.map(a => (
                        <button key={a.id} onClick={() => setEditing({ ...a })}
                            style={{
                                display: 'block', width: '100%', textAlign: 'left',
                                background: editing?.id === a.id ? '#1e3a5f' : 'transparent',
                                border: editing?.id === a.id ? '1px solid #1d4ed8' : '1px solid transparent',
                                borderRadius: '6px', padding: '0.6rem 0.75rem', cursor: 'pointer', marginBottom: '2px',
                            }}>
                            <div style={{ color: 'white', fontSize: '0.85rem', fontWeight: 600 }}>{a.title}</div>
                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.2rem', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>{CATEGORIES.find(c => c.key === a.category)?.label}</span>
                                {!a.published && <span style={{ fontSize: '0.65rem', background: '#374151', color: '#9ca3af', borderRadius: '3px', padding: '1px 5px' }}>Draft</span>}
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Editor Area */}
            {editing ? (
                <div style={{ flex: 1, overflowY: 'auto', background: '#111827', padding: '1.5rem' }}>
                    {/* Article meta */}
                    <div style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '10px', padding: '1.25rem', marginBottom: '1.25rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                            <div>
                                <label style={{ color: '#9ca3af', fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>TITLE</label>
                                <input value={editing.title || ''} onChange={e => setEditing(p => ({ ...p, title: e.target.value }))}
                                    placeholder="Article title"
                                    style={{ width: '100%', background: '#111827', border: '1px solid #374151', color: 'white', borderRadius: '6px', padding: '0.5rem 0.75rem', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                            </div>
                            <div>
                                <label style={{ color: '#9ca3af', fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>CATEGORY</label>
                                <select value={editing.category || 'faq'} onChange={e => setEditing(p => ({ ...p, category: e.target.value }))}
                                    style={{ width: '100%', background: '#111827', border: '1px solid #374151', color: 'white', borderRadius: '6px', padding: '0.5rem 0.75rem', fontSize: '0.9rem', boxSizing: 'border-box' }}>
                                    {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ color: '#9ca3af', fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>SLUG (URL)</label>
                                <input value={editing.slug || ''} onChange={e => setEditing(p => ({ ...p, slug: e.target.value }))}
                                    placeholder="auto-generated from title"
                                    style={{ width: '100%', background: '#111827', border: '1px solid #374151', color: 'white', borderRadius: '6px', padding: '0.5rem 0.75rem', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                            </div>
                            <div>
                                <label style={{ color: '#9ca3af', fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>SORT ORDER</label>
                                <input type="number" value={editing.sort_order ?? 0} onChange={e => setEditing(p => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))}
                                    style={{ width: '100%', background: '#111827', border: '1px solid #374151', color: 'white', borderRadius: '6px', padding: '0.5rem 0.75rem', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input type="checkbox" id="published" checked={editing.published !== false}
                                onChange={e => setEditing(p => ({ ...p, published: e.target.checked }))}
                                style={{ width: '16px', height: '16px' }} />
                            <label htmlFor="published" style={{ color: '#d1d5db', fontSize: '0.875rem' }}>Published (visible to users)</label>
                        </div>
                    </div>

                    {/* Block List */}
                    <div style={{ marginBottom: '1.25rem' }}>
                        {(editing.blocks || []).map((block, idx) => (
                            <BlockEditor key={idx} block={block} idx={idx}
                                total={(editing.blocks || []).length}
                                onChange={u => updateBlock(idx, u)}
                                onRemove={() => removeBlock(idx)}
                                onMove={dir => moveBlock(idx, dir)} />
                        ))}
                    </div>

                    {/* Add Block Toolbar */}
                    <div style={{ background: '#1f2937', border: '1px dashed #374151', borderRadius: '8px', padding: '0.75rem', marginBottom: '1.5rem' }}>
                        <span style={{ color: '#6b7280', fontSize: '0.8rem', marginRight: '0.75rem' }}>Add block:</span>
                        {BLOCK_TYPES.map(bt => (
                            <button key={bt} onClick={() => addBlock(bt)}
                                style={{ background: '#374151', color: '#d1d5db', border: 'none', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer', marginRight: '0.4rem', fontSize: '0.8rem', textTransform: 'capitalize' }}>
                                + {bt}
                            </button>
                        ))}
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <button onClick={handleSave} disabled={saving}
                            style={{ background: saving ? '#374151' : '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '0.6rem 1.75rem', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                            {saving ? 'Saving...' : editing.id ? 'Save Changes' : 'Create Article'}
                        </button>
                        {editing.id && (
                            <button onClick={() => handleDelete(editing.id!)}
                                style={{ background: 'none', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '8px', padding: '0.6rem 1.25rem', cursor: 'pointer' }}>
                                Delete
                            </button>
                        )}
                        <button onClick={() => setEditing(null)}
                            style={{ background: 'none', border: '1px solid #374151', color: '#9ca3af', borderRadius: '8px', padding: '0.6rem 1.25rem', cursor: 'pointer' }}>
                            Cancel
                        </button>
                        {saveMsg && <span style={{ color: saveMsg === 'Saved!' ? '#4ade80' : '#ef4444', fontSize: '0.875rem' }}>{saveMsg}</span>}
                    </div>
                </div>
            ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📖</div>
                        <p>Select an article to edit, or create a new one.</p>
                        <a href="/help" target="_blank" style={{ color: '#3b82f6', fontSize: '0.875rem' }}>Preview Help Center →</a>
                    </div>
                </div>
            )}
        </div>
    );
}

function BlockEditor({ block, idx, total, onChange, onRemove, onMove }: {
    block: HelpBlock;
    idx: number;
    total: number;
    onChange: (u: Partial<HelpBlock>) => void;
    onRemove: () => void;
    onMove: (dir: -1 | 1) => void;
}) {
    const inputSty: React.CSSProperties = {
        width: '100%', background: '#111827', border: '1px solid #374151', color: 'white',
        borderRadius: '6px', padding: '0.5rem 0.75rem', fontSize: '0.875rem', boxSizing: 'border-box',
    };
    const textareaSty: React.CSSProperties = { ...inputSty, resize: 'vertical', minHeight: '80px', fontFamily: 'inherit' };

    return (
        <div style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', padding: '0.875rem', marginBottom: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ color: '#9ca3af', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600 }}>{block.type}</span>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                    {idx > 0 && <button onClick={() => onMove(-1)} style={{ background: '#374151', border: 'none', color: '#d1d5db', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer' }}>↑</button>}
                    {idx < total - 1 && <button onClick={() => onMove(1)} style={{ background: '#374151', border: 'none', color: '#d1d5db', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer' }}>↓</button>}
                    <button onClick={onRemove} style={{ background: '#7f1d1d', border: 'none', color: '#fca5a5', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer' }}>×</button>
                </div>
            </div>

            {block.type === 'heading' && (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <select value={block.level || 2} onChange={e => onChange({ level: parseInt(e.target.value) as 1 | 2 | 3 })}
                        style={{ ...inputSty, width: '80px', flexShrink: 0 }}>
                        <option value={1}>H1</option>
                        <option value={2}>H2</option>
                        <option value={3}>H3</option>
                    </select>
                    <input value={block.content || ''} onChange={e => onChange({ content: e.target.value })} placeholder="Heading text" style={inputSty} />
                </div>
            )}

            {block.type === 'text' && (
                <textarea value={block.content || ''} onChange={e => onChange({ content: e.target.value })} placeholder="Paragraph text..." style={textareaSty} />
            )}

            {block.type === 'image' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <input value={block.src || ''} onChange={e => onChange({ src: e.target.value })} placeholder="Image URL (https://...)" style={inputSty} />
                    <input value={block.alt || ''} onChange={e => onChange({ alt: e.target.value })} placeholder="Alt text / caption" style={inputSty} />
                    {block.src && <img src={block.src} alt={block.alt || ''} style={{ maxHeight: '120px', maxWidth: '100%', borderRadius: '4px', objectFit: 'contain', background: '#111827' }} />}
                </div>
            )}

            {block.type === 'divider' && (
                <div style={{ height: '2px', background: '#374151', borderRadius: '1px', margin: '0.25rem 0' }} />
            )}

            {block.type === 'callout' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <select value={block.style || 'info'} onChange={e => onChange({ style: e.target.value as 'info' | 'warning' | 'tip' })}
                        style={{ ...inputSty, width: '120px' }}>
                        <option value="info">ℹ️ Info</option>
                        <option value="warning">⚠️ Warning</option>
                        <option value="tip">💡 Tip</option>
                    </select>
                    <textarea value={block.content || ''} onChange={e => onChange({ content: e.target.value })} placeholder="Callout text..." style={textareaSty} />
                </div>
            )}
        </div>
    );
}
