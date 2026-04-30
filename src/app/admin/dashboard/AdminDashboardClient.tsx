'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Image as ImageIcon, Search, Trash2, AtSign, ChevronDown, RefreshCw, Send } from 'lucide-react';

interface FeedUser {
    id: number;
    display_name: string;
    profile_picture: string | null;
}

interface Post {
    id: number;
    content: string | null;
    images: string[];
    tagged_user_ids: number[];
    created_at: string;
    user_id: number;
    author_name: string;
    author_avatar: string | null;
    first_name: string;
    last_name: string;
}

function Avatar({ name, src, size = 38 }: { name: string; src?: string | null; size?: number }) {
    if (src) return <img src={src} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
    return (
        <div style={{ width: size, height: size, borderRadius: '50%', background: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.38, color: 'white', flexShrink: 0 }}>
            {name?.[0]?.toUpperCase() || '?'}
        </div>
    );
}

function timeAgo(iso: string) {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

export default function AdminDashboardClient({ subscriptionPlan }: { subscriptionPlan: string }) {
    const [posts, setPosts] = useState<Post[]>([]);
    const [users, setUsers] = useState<FeedUser[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState('');
    const [filterUser, setFilterUser] = useState('');
    const [me, setMe] = useState<{ id: number; name: string; avatar: string | null } | null>(null);

    // Compose state
    const [content, setContent] = useState('');
    const [images, setImages] = useState<string[]>([]);
    const [taggedIds, setTaggedIds] = useState<number[]>([]);
    const [showTagMenu, setShowTagMenu] = useState(false);
    const [posting, setPosting] = useState(false);
    const imageInputRef = useRef<HTMLInputElement>(null);

    const loadFeed = useCallback(async (p = 1, reset = false) => {
        setLoading(true);
        const params = new URLSearchParams({ page: String(p) });
        if (q) params.set('q', q);
        if (filterUser) params.set('userId', filterUser);
        const res = await fetch(`/api/admin/feed?${params}`);
        const data = await res.json();
        setPosts(prev => reset || p === 1 ? (data.posts || []) : [...prev, ...(data.posts || [])]);
        setTotal(data.total || 0);
        setUsers(data.users || []);
        setLoading(false);
    }, [q, filterUser]);

    useEffect(() => { loadFeed(1, true); }, [loadFeed]);

    // Get my profile
    useEffect(() => {
        fetch('/api/admin/profile').then(r => r.json()).then(d => {
            if (d.user) setMe({
                id: d.user.id,
                name: d.user.display_name || `${d.user.first_name} ${d.user.last_name}`,
                avatar: d.user.profile_picture,
            });
        });
    }, []);

    const handleImageAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        files.forEach(f => {
            const reader = new FileReader();
            reader.onload = ev => setImages(prev => [...prev, ev.target?.result as string]);
            reader.readAsDataURL(f);
        });
        e.target.value = '';
    };

    const submitPost = async () => {
        if (!content.trim() && images.length === 0) return;
        setPosting(true);
        await fetch('/api/admin/feed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, images, tagged_user_ids: taggedIds }),
        });
        setContent(''); setImages([]); setTaggedIds([]); setShowTagMenu(false);
        setPosting(false);
        loadFeed(1, true);
    };

    const deletePost = async (id: number) => {
        if (!confirm('Delete this post?')) return;
        await fetch(`/api/admin/feed?id=${id}`, { method: 'DELETE' });
        setPosts(prev => prev.filter(p => p.id !== id));
    };

    const toggleTag = (uid: number) => {
        setTaggedIds(prev => prev.includes(uid) ? prev.filter(i => i !== uid) : [...prev, uid]);
    };

    const PAGE_SIZE = 20;
    const hasMore = posts.length < total;

    return (
        <div style={{ maxWidth: '680px', margin: '0 auto', padding: '1.5rem 1rem', color: 'white' }}>

            {/* Compose */}
            <div style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                    {me && <Avatar name={me.name} src={me.avatar} />}
                    <div style={{ flex: 1 }}>
                        <textarea
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            placeholder="Share an update with your team…"
                            style={{
                                width: '100%', background: '#111827', border: '1px solid #374151', borderRadius: '8px',
                                color: 'white', padding: '0.65rem 0.9rem', fontSize: '0.9rem', resize: 'vertical' as const,
                                minHeight: '72px', outline: 'none', fontFamily: 'inherit',
                            }}
                            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitPost(); }}
                        />

                        {/* Image previews */}
                        {images.length > 0 && (
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' as const, marginTop: '0.5rem' }}>
                                {images.map((img, i) => (
                                    <div key={i} style={{ position: 'relative' }}>
                                        <img src={img} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: '6px', border: '1px solid #374151' }} />
                                        <button onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                                            style={{ position: 'absolute', top: -6, right: -6, background: '#ef4444', border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', color: 'white', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Tagged users */}
                        {taggedIds.length > 0 && (
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' as const, marginTop: '0.4rem' }}>
                                {taggedIds.map(uid => {
                                    const u = users.find(x => x.id === uid);
                                    return u ? (
                                        <span key={uid} style={{ background: '#1d4ed8', color: 'white', padding: '2px 8px', borderRadius: '999px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            @{u.display_name}
                                            <button onClick={() => toggleTag(uid)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 0, fontSize: '11px' }}>×</button>
                                        </span>
                                    ) : null;
                                })}
                            </div>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.65rem' }}>
                            <button onClick={() => imageInputRef.current?.click()}
                                style={{ background: '#374151', border: 'none', borderRadius: '6px', padding: '6px', cursor: 'pointer', color: '#9ca3af', display: 'flex' }} title="Add photos">
                                <ImageIcon size={16} />
                            </button>
                            <div style={{ position: 'relative' }}>
                                <button onClick={() => setShowTagMenu(s => !s)}
                                    style={{ background: '#374151', border: 'none', borderRadius: '6px', padding: '6px', cursor: 'pointer', color: '#9ca3af', display: 'flex' }} title="Tag someone">
                                    <AtSign size={16} />
                                </button>
                                {showTagMenu && (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 50, background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', minWidth: '180px', maxHeight: '200px', overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', marginTop: 4 }}>
                                        {users.filter(u => u.id !== me?.id).map(u => (
                                            <div key={u.id} onClick={() => toggleTag(u.id)}
                                                style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', background: taggedIds.includes(u.id) ? '#1e3a5f' : 'transparent' }}
                                                onMouseEnter={e => { if (!taggedIds.includes(u.id)) (e.currentTarget as HTMLElement).style.background = '#374151'; }}
                                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = taggedIds.includes(u.id) ? '#1e3a5f' : 'transparent'; }}>
                                                <Avatar name={u.display_name} src={u.profile_picture} size={24} />
                                                <span style={{ fontSize: '0.85rem', color: 'white' }}>{u.display_name}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div style={{ flex: 1 }} />
                            <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>Ctrl+Enter</span>
                            <button onClick={submitPost} disabled={posting || (!content.trim() && images.length === 0)}
                                style={{ background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem', opacity: (posting || (!content.trim() && images.length === 0)) ? 0.5 : 1 }}>
                                <Send size={14} /> Post
                            </button>
                        </div>
                        <input ref={imageInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleImageAdd} />
                    </div>
                </div>
            </div>

            {/* Search + Filter */}
            <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1rem', flexWrap: 'wrap' as const }}>
                <div style={{ flex: 1, position: 'relative', minWidth: '180px' }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
                    <input value={q} onChange={e => { setQ(e.target.value); setPage(1); }}
                        placeholder="Search posts…"
                        style={{ width: '100%', background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: 'white', padding: '0.5rem 0.75rem 0.5rem 2rem', fontSize: '0.875rem', outline: 'none' }} />
                </div>
                <select value={filterUser} onChange={e => { setFilterUser(e.target.value); setPage(1); }}
                    style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: filterUser ? 'white' : '#9ca3af', padding: '0.5rem 0.75rem', fontSize: '0.875rem', outline: 'none' }}>
                    <option value="">All team members</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.display_name}</option>)}
                </select>
                <button onClick={() => loadFeed(1, true)} style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#9ca3af', padding: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                    <RefreshCw size={15} />
                </button>
            </div>

            {/* Feed */}
            {loading && posts.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#6b7280', padding: '3rem' }}>Loading…</div>
            ) : posts.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#6b7280', padding: '3rem', border: '2px dashed #374151', borderRadius: '12px' }}>
                    No posts yet. Be the first to share an update!
                </div>
            ) : (
                posts.map(post => (
                    <div key={post.id} style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '12px', marginBottom: '0.85rem', overflow: 'hidden' }}>
                        <div style={{ padding: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                            <Avatar name={post.author_name} src={post.author_avatar} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' as const }}>
                                    <span style={{ fontWeight: 700, color: 'white', fontSize: '0.925rem' }}>{post.author_name}</span>
                                    <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>{timeAgo(post.created_at)}</span>
                                </div>
                                {post.content && (
                                    <p style={{ margin: '0.4rem 0 0', color: '#e5e7eb', fontSize: '0.9rem', lineHeight: 1.55, whiteSpace: 'pre-wrap' as const }}>{post.content}</p>
                                )}
                                {/* Tagged users */}
                                {post.tagged_user_ids?.length > 0 && (
                                    <div style={{ marginTop: '0.4rem', display: 'flex', flexWrap: 'wrap' as const, gap: '0.3rem' }}>
                                        {post.tagged_user_ids.map((uid: number) => {
                                            const u = users.find(x => x.id === uid);
                                            return u ? <span key={uid} style={{ color: '#60a5fa', fontSize: '0.8rem' }}>@{u.display_name}</span> : null;
                                        })}
                                    </div>
                                )}
                            </div>
                            {(post.user_id === me?.id) && (
                                <button onClick={() => deletePost(post.id)}
                                    style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '4px', borderRadius: '4px', flexShrink: 0 }}
                                    title="Delete post">
                                    <Trash2 size={15} />
                                </button>
                            )}
                        </div>
                        {post.images?.length > 0 && (
                            <div style={{ display: 'grid', gridTemplateColumns: post.images.length === 1 ? '1fr' : 'repeat(2, 1fr)', gap: '2px' }}>
                                {post.images.map((img, i) => (
                                    <img key={i} src={img} alt="" style={{ width: '100%', maxHeight: post.images.length === 1 ? '400px' : '200px', objectFit: 'cover', display: 'block' }} />
                                ))}
                            </div>
                        )}
                    </div>
                ))
            )}

            {hasMore && (
                <button onClick={() => { const next = page + 1; setPage(next); loadFeed(next); }}
                    style={{ width: '100%', background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#9ca3af', padding: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                    <ChevronDown size={16} /> Load older posts ({total - posts.length} more)
                </button>
            )}
        </div>
    );
}
