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
    { key: 'getting-started', label: 'Getting Started', icon: '🚀' },
    { key: 'faq', label: 'FAQ', icon: '❓' },
    { key: 'how-to', label: 'How-To Guides', icon: '📖' },
];

function renderBlock(block: HelpBlock, idx: number) {
    switch (block.type) {
        case 'heading': {
            const Tag = `h${block.level || 2}` as keyof JSX.IntrinsicElements;
            const sizes: Record<number, string> = { 1: '1.5rem', 2: '1.2rem', 3: '1rem' };
            return (
                <Tag key={idx} style={{ color: 'white', fontWeight: 700, margin: '1.25rem 0 0.5rem', fontSize: sizes[block.level || 2] }}>
                    {block.content}
                </Tag>
            );
        }
        case 'text':
            return (
                <p key={idx} style={{ color: '#d1d5db', lineHeight: '1.7', margin: '0.5rem 0', whiteSpace: 'pre-wrap' }}>
                    {block.content}
                </p>
            );
        case 'image':
            return block.src ? (
                <div key={idx} style={{ margin: '1rem 0', textAlign: 'center' }}>
                    <img src={block.src} alt={block.alt || ''} style={{ maxWidth: '100%', borderRadius: '8px', border: '1px solid #374151' }} />
                    {block.alt && <p style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '0.25rem' }}>{block.alt}</p>}
                </div>
            ) : null;
        case 'divider':
            return <hr key={idx} style={{ border: 'none', borderTop: '1px solid #374151', margin: '1.25rem 0' }} />;
        case 'callout': {
            const calloutColors: Record<string, { bg: string; border: string; icon: string }> = {
                info: { bg: '#1e3a5f', border: '#1d4ed8', icon: 'ℹ️' },
                warning: { bg: '#422006', border: '#d97706', icon: '⚠️' },
                tip: { bg: '#14532d', border: '#16a34a', icon: '💡' },
            };
            const c = calloutColors[block.style || 'info'];
            return (
                <div key={idx} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: '8px', padding: '0.75rem 1rem', margin: '1rem 0', display: 'flex', gap: '0.5rem' }}>
                    <span style={{ flexShrink: 0 }}>{c.icon}</span>
                    <span style={{ color: '#d1d5db', fontSize: '0.9rem', lineHeight: '1.6' }}>{block.content}</span>
                </div>
            );
        }
        default:
            return null;
    }
}

export default function HelpClient() {
    const [articles, setArticles] = useState<HelpArticle[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState('getting-started');
    const [activeArticle, setActiveArticle] = useState<HelpArticle | null>(null);
    const [search, setSearch] = useState('');

    useEffect(() => {
        fetch('/api/help')
            .then(r => r.json())
            .then(d => setArticles(d.articles || []))
            .finally(() => setLoading(false));
    }, []);

    const filtered = articles.filter(a => {
        const matchesCat = activeCategory === 'all' || a.category === activeCategory;
        const matchesSearch = !search || a.title.toLowerCase().includes(search.toLowerCase()) ||
            a.blocks.some(b => b.content?.toLowerCase().includes(search.toLowerCase()));
        return matchesCat && matchesSearch;
    });

    const categoriesWithContent = CATEGORIES.filter(c => articles.some(a => a.category === c.key));

    return (
        <div style={{ minHeight: '100vh', background: '#0f172a', color: 'white' }}>
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)', borderBottom: '1px solid #1e3a5f', padding: '2.5rem 1.5rem', textAlign: 'center' }}>
                <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800, color: 'white' }}>Help Center</h1>
                <p style={{ color: '#93c5fd', marginTop: '0.5rem', fontSize: '1rem' }}>Find answers, guides, and tips for using TopShelf</p>
                <div style={{ maxWidth: '480px', margin: '1.25rem auto 0', position: 'relative' }}>
                    <input
                        type="text"
                        placeholder="Search help articles..."
                        value={search}
                        onChange={e => { setSearch(e.target.value); if (e.target.value) setActiveCategory('all'); }}
                        style={{ width: '100%', background: '#1f2937', border: '1px solid #374151', borderRadius: '2rem', color: 'white', padding: '0.7rem 1rem 0.7rem 2.75rem', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }}
                    />
                    <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }}>🔍</span>
                    {search && (
                        <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1 }}>×</button>
                    )}
                </div>
            </div>

            <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 1.5rem', display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
                {/* Sidebar */}
                {!activeArticle && (
                    <nav style={{ width: '220px', flexShrink: 0, position: 'sticky', top: '1rem' }}>
                        <div style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', overflow: 'hidden' }}>
                            {CATEGORIES.map(c => (
                                <button
                                    key={c.key}
                                    onClick={() => { setActiveCategory(c.key); setSearch(''); }}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                                        width: '100%', padding: '0.75rem 1rem', border: 'none',
                                        background: activeCategory === c.key ? '#2563eb' : 'transparent',
                                        color: activeCategory === c.key ? 'white' : '#d1d5db',
                                        cursor: 'pointer', textAlign: 'left', fontSize: '0.9rem', fontWeight: activeCategory === c.key ? 600 : 400,
                                        borderBottom: '1px solid #374151',
                                    }}
                                >
                                    {c.icon} {c.label}
                                    <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: activeCategory === c.key ? 'rgba(255,255,255,0.7)' : '#6b7280' }}>
                                        {articles.filter(a => a.category === c.key).length}
                                    </span>
                                </button>
                            ))}
                            <a href="/inventory" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', color: '#9ca3af', textDecoration: 'none', fontSize: '0.85rem' }}>
                                ← Back to App
                            </a>
                        </div>
                    </nav>
                )}

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    {activeArticle ? (
                        /* Article View */
                        <div>
                            <button onClick={() => setActiveArticle(null)}
                                style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.9rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                ← Back to {CATEGORIES.find(c => c.key === activeArticle.category)?.label || 'Help'}
                            </button>
                            <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: '12px', padding: '2rem' }}>
                                <h1 style={{ color: 'white', fontSize: '1.6rem', fontWeight: 800, marginTop: 0 }}>{activeArticle.title}</h1>
                                <hr style={{ border: 'none', borderTop: '1px solid #374151', margin: '1rem 0 1.5rem' }} />
                                {activeArticle.blocks.map((block, i) => renderBlock(block, i))}
                            </div>
                        </div>
                    ) : loading ? (
                        <p style={{ color: '#6b7280', textAlign: 'center', marginTop: '3rem' }}>Loading...</p>
                    ) : filtered.length === 0 ? (
                        <div style={{ textAlign: 'center', marginTop: '3rem', color: '#6b7280' }}>
                            <p style={{ fontSize: '1.1rem' }}>No articles found{search ? ` for "${search}"` : ''}.</p>
                            {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: '1px solid #374151', color: '#9ca3af', borderRadius: '6px', padding: '0.4rem 1rem', cursor: 'pointer', marginTop: '0.5rem' }}>Clear search</button>}
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                            {filtered.map(article => (
                                <button
                                    key={article.id}
                                    onClick={() => setActiveArticle(article)}
                                    style={{
                                        background: '#111827', border: '1px solid #374151', borderRadius: '10px',
                                        padding: '1.25rem', cursor: 'pointer', textAlign: 'left',
                                        color: 'white', transition: 'border-color 0.15s',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#3b82f6')}
                                    onMouseLeave={e => (e.currentTarget.style.borderColor = '#374151')}
                                >
                                    <span style={{ fontSize: '0.7rem', background: '#1e3a5f', color: '#93c5fd', borderRadius: '4px', padding: '2px 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        {CATEGORIES.find(c => c.key === article.category)?.label}
                                    </span>
                                    <h3 style={{ margin: '0.6rem 0 0.4rem', fontSize: '1rem', fontWeight: 600 }}>{article.title}</h3>
                                    <p style={{ margin: 0, color: '#9ca3af', fontSize: '0.8rem' }}>
                                        {article.blocks.find(b => b.type === 'text')?.content?.slice(0, 100) || 'Read more →'}
                                        {(article.blocks.find(b => b.type === 'text')?.content?.length || 0) > 100 ? '...' : ''}
                                    </p>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
