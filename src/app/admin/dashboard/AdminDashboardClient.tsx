'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
    Image as ImageIcon, Search, Trash2, AtSign, ChevronDown, RefreshCw, Send,
    Heart, MessageCircle, AlertTriangle, Package, ShoppingCart, Activity,
    BarChart2, ArrowRight, Check, X, Clock, RefreshCcw, ChevronRight,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashData {
    stats: { totalItems: number; lowStockCount: number; pendingOrders: number; activityToday: number };
    activityChart: { date: string; count: number; label: string }[];
    categoryBreakdown: { category: string; count: number }[];
    lowStockItems: { id: number; name: string; type: string; currentQty: number; threshold: number }[];
    pendingSwaps: {
        id: number; requestType: string; isGiveaway: boolean;
        requesterName: string; targetName: string | null;
        requesterDate: string; requesterShift: string; requesterStart: string; requesterEnd: string;
        targetDate: string | null; targetShift: string | null;
        message: string | null; createdAt: string;
    }[];
    recentActivity: { id: number; action: string; userName: string | null; timestamp: string; details: any }[];
}

interface FeedUser { id: number; display_name: string; profile_picture: string | null }
interface Comment { id: number; content: string; created_at: string; user_id: number; author_name: string; author_avatar: string | null }
interface Post {
    id: number; content: string | null; images: string[]; tagged_user_ids: number[];
    created_at: string; user_id: number; author_name: string; author_avatar: string | null;
    first_name: string; last_name: string; like_count: number; comment_count: number; liked_by_me: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

function Avatar({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
    if (src) return <img src={src} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
    return (
        <div style={{ width: size, height: size, borderRadius: '50%', background: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.38, color: 'white', flexShrink: 0 }}>
            {name?.[0]?.toUpperCase() || '?'}
        </div>
    );
}

function fmtAction(action: string) {
    return action.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());
}

// ── SVG Bar Chart (7-day activity) ───────────────────────────────────────────

function ActivityBarChart({ data }: { data: { label: string; count: number }[] }) {
    const max = Math.max(...data.map(d => d.count), 1);
    const h = 80;
    const barW = 28;
    const gap = 8;
    const total = data.length * (barW + gap) - gap;

    return (
        <svg viewBox={`0 0 ${total} ${h + 22}`} style={{ width: '100%', height: 'auto' }}>
            {data.map((d, i) => {
                const x = i * (barW + gap);
                const barH = Math.max(4, (d.count / max) * h);
                const y = h - barH;
                const isToday = i === data.length - 1;
                return (
                    <g key={i}>
                        <rect x={x} y={y} width={barW} height={barH}
                            fill={isToday ? '#f59e0b' : '#1d4ed8'}
                            rx={4} opacity={isToday ? 1 : 0.75} />
                        {d.count > 0 && (
                            <text x={x + barW / 2} y={y - 3} textAnchor="middle"
                                fill="#9ca3af" fontSize={9} fontFamily="system-ui">
                                {d.count}
                            </text>
                        )}
                        <text x={x + barW / 2} y={h + 14} textAnchor="middle"
                            fill={isToday ? '#f59e0b' : '#6b7280'} fontSize={9} fontFamily="system-ui">
                            {d.label}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}

// ── SVG Horizontal Bar Chart (category breakdown) ────────────────────────────

function CategoryChart({ data }: { data: { category: string; count: number }[] }) {
    const max = Math.max(...data.map(d => d.count), 1);
    const colors = ['#f59e0b', '#1d4ed8', '#059669', '#7c3aed', '#db2777', '#0891b2', '#dc2626', '#65a30d'];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {data.slice(0, 6).map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '90px', fontSize: '11px', color: '#9ca3af', textAlign: 'right', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.category}
                    </div>
                    <div style={{ flex: 1, height: '14px', background: '#111827', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(d.count / max) * 100}%`, background: colors[i % colors.length], borderRadius: '3px', transition: 'width 0.5s ease' }} />
                    </div>
                    <div style={{ width: '24px', fontSize: '11px', color: '#6b7280', textAlign: 'right', flexShrink: 0 }}>{d.count}</div>
                </div>
            ))}
        </div>
    );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, color, href }: {
    icon: React.ReactNode; label: string; value: string | number;
    sub?: string; color: string; href?: string;
}) {
    const content = (
        <div style={{ background: '#1f2937', border: `1px solid #374151`, borderRadius: '12px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: href ? 'pointer' : 'default', transition: 'border-color 0.15s' }}>
            <div style={{ width: 40, height: 40, borderRadius: '10px', background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>
                {icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '22px', fontWeight: 800, color: 'white', lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '3px' }}>{label}</div>
                {sub && <div style={{ fontSize: '10px', color, marginTop: '2px', fontWeight: 600 }}>{sub}</div>}
            </div>
            {href && <ChevronRight size={14} style={{ color: '#4b5563', flexShrink: 0 }} />}
        </div>
    );
    if (href) return <Link href={href} style={{ textDecoration: 'none' }}>{content}</Link>;
    return <>{content}</>;
}

// ── Post Card ─────────────────────────────────────────────────────────────────

function PostCard({
    post, users, me, onDelete, onLikeToggle,
}: {
    post: Post; users: FeedUser[];
    me: { id: number; name: string; avatar: string | null } | null;
    onDelete: (id: number) => void;
    onLikeToggle: (id: number, liked: boolean, count: number) => void;
}) {
    const [showComments, setShowComments] = useState(false);
    const [comments, setComments] = useState<Comment[]>([]);
    const [commentsLoaded, setCommentsLoaded] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [submittingComment, setSubmittingComment] = useState(false);
    const [localCommentCount, setLocalCommentCount] = useState(post.comment_count);
    const [likePending, setLikePending] = useState(false);

    const loadComments = async () => {
        const res = await fetch(`/api/admin/feed/comments?postId=${post.id}`);
        const data = await res.json();
        setComments(data.comments || []);
        setCommentsLoaded(true);
    };

    const toggleComments = async () => {
        if (!showComments && !commentsLoaded) await loadComments();
        setShowComments(s => !s);
    };

    const submitComment = async () => {
        if (!commentText.trim() || submittingComment) return;
        setSubmittingComment(true);
        const res = await fetch(`/api/admin/feed/comments?postId=${post.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: commentText.trim() }),
        });
        const data = await res.json();
        if (res.ok) { setComments(prev => [...prev, data.comment]); setLocalCommentCount(c => c + 1); setCommentText(''); }
        setSubmittingComment(false);
    };

    const deleteComment = async (commentId: number) => {
        await fetch(`/api/admin/feed/comments?id=${commentId}`, { method: 'DELETE' });
        setComments(prev => prev.filter(c => c.id !== commentId));
        setLocalCommentCount(c => c - 1);
    };

    const toggleLike = async () => {
        if (likePending) return;
        setLikePending(true);
        const res = await fetch(`/api/admin/feed/like?id=${post.id}`, { method: 'POST' });
        const data = await res.json();
        if (res.ok) onLikeToggle(post.id, data.liked, data.count);
        setLikePending(false);
    };

    return (
        <div style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '10px', marginBottom: '0.75rem', overflow: 'hidden' }}>
            <div style={{ padding: '0.85rem', display: 'flex', gap: '0.65rem', alignItems: 'flex-start' }}>
                <Avatar name={post.author_name} src={post.author_avatar} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, color: 'white', fontSize: '0.875rem' }}>{post.author_name}</span>
                        <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>{timeAgo(post.created_at)}</span>
                    </div>
                    {post.content && (
                        <p style={{ margin: '0.3rem 0 0', color: '#e5e7eb', fontSize: '0.85rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{post.content}</p>
                    )}
                    {post.tagged_user_ids?.length > 0 && (
                        <div style={{ marginTop: '0.3rem', display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                            {post.tagged_user_ids.map((uid: number) => {
                                const u = users.find(x => x.id === uid);
                                return u ? <span key={uid} style={{ color: '#60a5fa', fontSize: '0.75rem' }}>@{u.display_name}</span> : null;
                            })}
                        </div>
                    )}
                </div>
                {post.user_id === me?.id && (
                    <button type="button" onClick={() => onDelete(post.id)}
                        style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '2px', flexShrink: 0 }}>
                        <Trash2 size={13} />
                    </button>
                )}
            </div>

            {post.images?.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: post.images.length === 1 ? '1fr' : 'repeat(2, 1fr)', gap: '2px' }}>
                    {post.images.map((img, i) => (
                        <img key={i} src={img} alt="" style={{ width: '100%', maxHeight: post.images.length === 1 ? '280px' : '160px', objectFit: 'cover', display: 'block' }} />
                    ))}
                </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.4rem 0.85rem', borderTop: '1px solid #374151' }}>
                <button type="button" onClick={toggleLike} disabled={likePending}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', cursor: 'pointer', color: post.liked_by_me ? '#ef4444' : '#6b7280', padding: '0.35rem 0.5rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: post.liked_by_me ? 700 : 400 }}>
                    <Heart size={14} fill={post.liked_by_me ? '#ef4444' : 'none'} />
                    {post.like_count > 0 && <span>{post.like_count}</span>}
                </button>
                <button type="button" onClick={toggleComments}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', cursor: 'pointer', color: showComments ? '#60a5fa' : '#6b7280', padding: '0.35rem 0.5rem', borderRadius: '6px', fontSize: '0.8rem' }}>
                    <MessageCircle size={14} />
                    {localCommentCount > 0 ? <span>{localCommentCount}</span> : <span>Comment</span>}
                </button>
            </div>

            {showComments && (
                <div style={{ borderTop: '1px solid #374151', padding: '0.65rem 0.85rem', background: '#111827' }}>
                    {comments.map(c => (
                        <div key={c.id} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'flex-start' }}>
                            <Avatar name={c.author_name} src={c.author_avatar} size={24} />
                            <div style={{ flex: 1, background: '#1f2937', borderRadius: '8px', padding: '0.4rem 0.65rem' }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', justifyContent: 'space-between' }}>
                                    <span style={{ fontWeight: 700, color: 'white', fontSize: '0.75rem' }}>{c.author_name}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                        <span style={{ color: '#6b7280', fontSize: '0.7rem' }}>{timeAgo(c.created_at)}</span>
                                        <button type="button" onClick={() => deleteComment(c.id)}
                                            style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', padding: 0, display: 'flex' }}>
                                            <Trash2 size={10} />
                                        </button>
                                    </div>
                                </div>
                                <p style={{ margin: '2px 0 0', color: '#d1d5db', fontSize: '0.8rem', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{c.content}</p>
                            </div>
                        </div>
                    ))}
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginTop: comments.length > 0 ? '0.4rem' : 0 }}>
                        {me && <Avatar name={me.name} src={me.avatar} size={24} />}
                        <div style={{ flex: 1, display: 'flex', gap: '0.35rem' }}>
                            <input
                                value={commentText}
                                onChange={e => setCommentText(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
                                placeholder="Write a comment…"
                                style={{ flex: 1, background: '#1f2937', border: '1px solid #374151', borderRadius: '20px', color: 'white', padding: '0.35rem 0.75rem', fontSize: '0.8rem', outline: 'none' }}
                            />
                            <button type="button" onClick={submitComment} disabled={submittingComment || !commentText.trim()}
                                style={{ background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: (submittingComment || !commentText.trim()) ? 0.5 : 1 }}>
                                <Send size={11} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function AdminDashboardClient({
    subscriptionPlan,
    role,
    permissions,
}: {
    subscriptionPlan: string;
    role: string;
    permissions: string[];
}) {
    // Dashboard data
    const [dash, setDash] = useState<DashData | null>(null);
    const [dashLoading, setDashLoading] = useState(true);
    const [swapActing, setSwapActing] = useState<number | null>(null);

    // Feed state
    const [posts, setPosts] = useState<Post[]>([]);
    const [feedUsers, setFeedUsers] = useState<FeedUser[]>([]);
    const [feedTotal, setFeedTotal] = useState(0);
    const [feedPage, setFeedPage] = useState(1);
    const [feedLoading, setFeedLoading] = useState(true);
    const [q, setQ] = useState('');
    const [filterUser, setFilterUser] = useState('');
    const [me, setMe] = useState<{ id: number; name: string; avatar: string | null } | null>(null);

    // Compose
    const [content, setContent] = useState('');
    const [images, setImages] = useState<string[]>([]);
    const [taggedIds, setTaggedIds] = useState<number[]>([]);
    const [showTagMenu, setShowTagMenu] = useState(false);
    const [posting, setPosting] = useState(false);
    const imageInputRef = useRef<HTMLInputElement>(null);

    const canSchedule = role === 'admin' || permissions.includes('all') || permissions.includes('manage_schedule');

    // Load dashboard stats
    const loadDash = useCallback(async () => {
        setDashLoading(true);
        const res = await fetch('/api/admin/dashboard');
        if (res.ok) setDash(await res.json());
        setDashLoading(false);
    }, []);

    // Load feed
    const loadFeed = useCallback(async (p = 1, reset = false) => {
        setFeedLoading(true);
        const params = new URLSearchParams({ page: String(p) });
        if (q) params.set('q', q);
        if (filterUser) params.set('userId', filterUser);
        const res = await fetch(`/api/admin/feed?${params}`);
        const data = await res.json();
        setPosts(prev => reset || p === 1 ? (data.posts || []) : [...prev, ...(data.posts || [])]);
        setFeedTotal(data.total || 0);
        setFeedUsers(data.users || []);
        setFeedLoading(false);
    }, [q, filterUser]);

    useEffect(() => { loadDash(); }, [loadDash]);
    useEffect(() => { loadFeed(1, true); }, [loadFeed]);
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
        Array.from(e.target.files || []).forEach(f => {
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

    const handleLikeToggle = (postId: number, liked: boolean, count: number) => {
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, liked_by_me: liked, like_count: count } : p));
    };

    const toggleTag = (uid: number) => {
        setTaggedIds(prev => prev.includes(uid) ? prev.filter(i => i !== uid) : [...prev, uid]);
    };

    const handleSwap = async (id: number, action: 'approve' | 'decline') => {
        setSwapActing(id);
        await fetch('/api/admin/schedule/swap', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ swap_id: id, action }),
        });
        setSwapActing(null);
        loadDash();
    };

    const hasMore = posts.length < feedTotal;

    const panel = (title: string, icon: React.ReactNode, children: React.ReactNode, href?: string) => (
        <div style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #374151', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', color: '#d1d5db', fontSize: '13px', fontWeight: 700 }}>
                    {icon}{title}
                </div>
                {href && (
                    <Link href={href} style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#6b7280', fontSize: '11px', textDecoration: 'none' }}>
                        View all <ChevronRight size={12} />
                    </Link>
                )}
            </div>
            {children}
        </div>
    );

    return (
        <>
            <style>{`
                .db-root {
                    display: flex;
                    height: calc(100vh - 64px);
                    overflow: hidden;
                    color: white;
                    background: #111827;
                }
                .db-feed-col {
                    width: 380px;
                    flex-shrink: 0;
                    border-right: 1px solid #1f2937;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }
                .db-feed-scroll {
                    flex: 1;
                    overflow-y: auto;
                    padding: 12px;
                }
                .db-main-col {
                    flex: 1;
                    min-width: 0;
                    overflow-y: auto;
                    padding: 14px 16px;
                }
                .db-stats-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 10px;
                    margin-bottom: 12px;
                }
                .db-charts-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 10px;
                    margin-bottom: 12px;
                }
                .db-panels-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 10px;
                    margin-bottom: 12px;
                }
                .db-activity-row {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 10px;
                }

                @media (max-width: 1200px) {
                    .db-stats-grid { grid-template-columns: repeat(2, 1fr); }
                    .db-feed-col { width: 320px; }
                }
                @media (max-width: 960px) {
                    .db-feed-col { width: 280px; }
                    .db-charts-grid { grid-template-columns: 1fr; }
                    .db-panels-grid { grid-template-columns: 1fr; }
                    .db-activity-row { grid-template-columns: 1fr; }
                }
                @media (max-width: 768px) {
                    .db-root {
                        flex-direction: column;
                        height: auto;
                        overflow: visible;
                    }
                    .db-feed-col {
                        width: 100%;
                        border-right: none;
                        border-bottom: 1px solid #1f2937;
                        max-height: 55vh;
                    }
                    .db-main-col {
                        overflow-y: visible;
                    }
                    .db-stats-grid { grid-template-columns: repeat(2, 1fr); }
                    .db-charts-grid { grid-template-columns: 1fr; }
                    .db-panels-grid { grid-template-columns: 1fr; }
                    .db-activity-row { grid-template-columns: 1fr; }
                }
            `}</style>

            <div className="db-root">

                {/* ── Left: Feed ── */}
                <div className="db-feed-col">
                    {/* Feed header + compose */}
                    <div style={{ padding: '12px', borderBottom: '1px solid #374151', background: '#111827' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#d1d5db' }}>Organization Feed</span>
                            <button type="button" onClick={() => loadFeed(1, true)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                <RefreshCw size={13} />
                            </button>
                        </div>
                        {/* Compose */}
                        <div style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '10px', padding: '10px' }}>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                {me && <Avatar name={me.name} src={me.avatar} size={28} />}
                                <div style={{ flex: 1 }}>
                                    <textarea
                                        value={content}
                                        onChange={e => setContent(e.target.value)}
                                        placeholder="Share an update…"
                                        style={{ width: '100%', background: '#111827', border: '1px solid #374151', borderRadius: '6px', color: 'white', padding: '0.5rem 0.75rem', fontSize: '0.825rem', resize: 'vertical', minHeight: '56px', outline: 'none', fontFamily: 'inherit' }}
                                        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitPost(); }}
                                    />
                                    {images.length > 0 && (
                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                                            {images.map((img, i) => (
                                                <div key={i} style={{ position: 'relative' }}>
                                                    <img src={img} alt="" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: '4px', border: '1px solid #374151' }} />
                                                    <button type="button" onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                                                        style={{ position: 'absolute', top: -5, right: -5, background: '#ef4444', border: 'none', borderRadius: '50%', width: 15, height: 15, cursor: 'pointer', color: 'white', fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {taggedIds.length > 0 && (
                                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                                            {taggedIds.map(uid => {
                                                const u = feedUsers.find(x => x.id === uid);
                                                return u ? (
                                                    <span key={uid} style={{ background: '#1d4ed8', color: 'white', padding: '1px 6px', borderRadius: '999px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 3 }}>
                                                        @{u.display_name}
                                                        <button type="button" onClick={() => toggleTag(uid)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 0, fontSize: '10px' }}>×</button>
                                                    </span>
                                                ) : null;
                                            })}
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                                        <button type="button" onClick={() => imageInputRef.current?.click()}
                                            style={{ background: '#374151', border: 'none', borderRadius: '5px', padding: '5px', cursor: 'pointer', color: '#9ca3af', display: 'flex' }} title="Add photos">
                                            <ImageIcon size={13} />
                                        </button>
                                        <div style={{ position: 'relative' }}>
                                            <button type="button" onClick={() => setShowTagMenu(s => !s)}
                                                style={{ background: '#374151', border: 'none', borderRadius: '5px', padding: '5px', cursor: 'pointer', color: '#9ca3af', display: 'flex' }} title="Tag someone">
                                                <AtSign size={13} />
                                            </button>
                                            {showTagMenu && (
                                                <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 50, background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', minWidth: '160px', maxHeight: '180px', overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', marginTop: 3 }}>
                                                    {feedUsers.filter(u => u.id !== me?.id).map(u => (
                                                        <div key={u.id} onClick={() => toggleTag(u.id)}
                                                            style={{ padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', background: taggedIds.includes(u.id) ? '#1e3a5f' : 'transparent' }}>
                                                            <Avatar name={u.display_name} src={u.profile_picture} size={20} />
                                                            <span style={{ fontSize: '0.8rem', color: 'white' }}>{u.display_name}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ flex: 1 }} />
                                        <button type="button" onClick={submitPost} disabled={posting || (!content.trim() && images.length === 0)}
                                            style={{ background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '6px', padding: '5px 12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', opacity: (posting || (!content.trim() && images.length === 0)) ? 0.5 : 1 }}>
                                            <Send size={12} /> Post
                                        </button>
                                    </div>
                                    <input ref={imageInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleImageAdd} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Search */}
                    <div style={{ padding: '8px 12px', borderBottom: '1px solid #1f2937', display: 'flex', gap: '6px' }}>
                        <div style={{ flex: 1, position: 'relative' }}>
                            <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
                            <input value={q} onChange={e => { setQ(e.target.value); setFeedPage(1); }}
                                placeholder="Search posts…"
                                style={{ width: '100%', background: '#1f2937', border: '1px solid #374151', borderRadius: '6px', color: 'white', padding: '0.4rem 0.6rem 0.4rem 1.75rem', fontSize: '0.8rem', outline: 'none' }} />
                        </div>
                        <select value={filterUser} onChange={e => { setFilterUser(e.target.value); setFeedPage(1); }}
                            style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '6px', color: filterUser ? 'white' : '#9ca3af', padding: '0.4rem 0.5rem', fontSize: '0.75rem', outline: 'none', maxWidth: '110px' }}>
                            <option value="">All members</option>
                            {feedUsers.map(u => <option key={u.id} value={u.id}>{u.display_name}</option>)}
                        </select>
                    </div>

                    {/* Feed scroll */}
                    <div className="db-feed-scroll">
                        {feedLoading && posts.length === 0 ? (
                            <div style={{ textAlign: 'center', color: '#6b7280', padding: '2rem', fontSize: '0.875rem' }}>Loading…</div>
                        ) : posts.length === 0 ? (
                            <div style={{ textAlign: 'center', color: '#6b7280', padding: '2rem', border: '2px dashed #374151', borderRadius: '10px', margin: '0.5rem 0' }}>
                                No posts yet. Be the first to share!
                            </div>
                        ) : (
                            posts.map(post => (
                                <PostCard key={post.id} post={post} users={feedUsers} me={me} onDelete={deletePost} onLikeToggle={handleLikeToggle} />
                            ))
                        )}
                        {hasMore && (
                            <button type="button" onClick={() => { const next = feedPage + 1; setFeedPage(next); loadFeed(next); }}
                                style={{ width: '100%', background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#9ca3af', padding: '0.6rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                                <ChevronDown size={14} /> Load more ({feedTotal - posts.length})
                            </button>
                        )}
                    </div>
                </div>

                {/* ── Right: Dashboard panels ── */}
                <div className="db-main-col">

                    {/* Stat cards */}
                    <div className="db-stats-grid">
                        <StatCard icon={<Package size={18} />} label="Total Products" value={dashLoading ? '—' : dash?.stats.totalItems ?? 0}
                            color="#f59e0b" href="/admin/products" />
                        <StatCard icon={<AlertTriangle size={18} />} label="Low Stock" value={dashLoading ? '—' : dash?.stats.lowStockCount ?? 0}
                            sub={dash?.stats.lowStockCount ? 'Needs attention' : undefined}
                            color={dash?.stats.lowStockCount ? '#ef4444' : '#6b7280'} href="/admin/reporting" />
                        <StatCard icon={<ShoppingCart size={18} />} label="Pending Orders" value={dashLoading ? '—' : dash?.stats.pendingOrders ?? 0}
                            color="#1d4ed8" href="/admin/orders" />
                        <StatCard icon={<Activity size={18} />} label="Activity Today" value={dashLoading ? '—' : dash?.stats.activityToday ?? 0}
                            color="#059669" />
                    </div>

                    {/* Charts */}
                    <div className="db-charts-grid">
                        {panel('7-Day Activity', <BarChart2 size={14} style={{ color: '#f59e0b' }} />, (
                            <div style={{ padding: '12px 14px' }}>
                                {dashLoading ? (
                                    <div style={{ height: '90px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4b5563', fontSize: '12px' }}>Loading…</div>
                                ) : (
                                    <ActivityBarChart data={dash?.activityChart || []} />
                                )}
                            </div>
                        ))}
                        {panel('Products by Category', <Package size={14} style={{ color: '#1d4ed8' }} />, (
                            <div style={{ padding: '12px 14px' }}>
                                {dashLoading ? (
                                    <div style={{ height: '90px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4b5563', fontSize: '12px' }}>Loading…</div>
                                ) : dash?.categoryBreakdown?.length ? (
                                    <CategoryChart data={dash.categoryBreakdown} />
                                ) : (
                                    <div style={{ color: '#4b5563', fontSize: '12px', textAlign: 'center', padding: '20px 0' }}>No products yet</div>
                                )}
                            </div>
                        ), '/admin/products')}
                    </div>

                    {/* Low stock + Swap requests */}
                    <div className="db-panels-grid">
                        {/* Low stock */}
                        {panel('Low Stock Alerts', <AlertTriangle size={14} style={{ color: '#ef4444' }} />, (
                            <div>
                                {dashLoading ? (
                                    <div style={{ padding: '16px', color: '#4b5563', fontSize: '12px', textAlign: 'center' }}>Loading…</div>
                                ) : !dash?.lowStockItems?.length ? (
                                    <div style={{ padding: '16px', color: '#4b5563', fontSize: '12px', textAlign: 'center' }}>
                                        <span style={{ color: '#059669' }}>✓</span> All stock levels healthy
                                    </div>
                                ) : dash.lowStockItems.map(item => {
                                    const isCritical = item.currentQty === 0;
                                    return (
                                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', borderBottom: '1px solid #374151' }}>
                                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: isCritical ? '#ef4444' : '#f59e0b', flexShrink: 0 }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '12px', fontWeight: 600, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                                                <div style={{ fontSize: '10px', color: '#6b7280' }}>{item.type}</div>
                                            </div>
                                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                <div style={{ fontSize: '13px', fontWeight: 700, color: isCritical ? '#ef4444' : '#f59e0b' }}>{item.currentQty}</div>
                                                <div style={{ fontSize: '10px', color: '#6b7280' }}>/ {item.threshold} min</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ), '/admin/reporting')}

                        {/* Swap requests */}
                        {canSchedule && panel('Swap Requests', <RefreshCcw size={14} style={{ color: '#7c3aed' }} />, (
                            <div>
                                {dashLoading ? (
                                    <div style={{ padding: '16px', color: '#4b5563', fontSize: '12px', textAlign: 'center' }}>Loading…</div>
                                ) : !dash?.pendingSwaps?.length ? (
                                    <div style={{ padding: '16px', color: '#4b5563', fontSize: '12px', textAlign: 'center' }}>
                                        <span style={{ color: '#059669' }}>✓</span> No pending swap requests
                                    </div>
                                ) : dash.pendingSwaps.map(swap => (
                                    <div key={swap.id} style={{ padding: '10px 14px', borderBottom: '1px solid #374151' }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '12px', fontWeight: 600, color: 'white' }}>
                                                    {swap.requesterName}
                                                    {swap.isGiveaway ? ' → give away' : swap.targetName ? ` ↔ ${swap.targetName}` : ' → open'}
                                                </div>
                                                <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '2px' }}>
                                                    {swap.requesterShift} · {swap.requesterDate}
                                                    {swap.requesterStart && ` · ${swap.requesterStart}–${swap.requesterEnd}`}
                                                </div>
                                                {swap.message && (
                                                    <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>"{swap.message}"</div>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                                                <button type="button"
                                                    disabled={swapActing === swap.id}
                                                    onClick={() => handleSwap(swap.id, 'approve')}
                                                    style={{ background: '#14532d', border: '1px solid #16a34a', color: '#86efac', borderRadius: '5px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px', fontWeight: 600 }}>
                                                    <Check size={10} /> OK
                                                </button>
                                                <button type="button"
                                                    disabled={swapActing === swap.id}
                                                    onClick={() => handleSwap(swap.id, 'decline')}
                                                    style={{ background: '#450a0a', border: '1px solid #dc2626', color: '#fca5a5', borderRadius: '5px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px', fontWeight: 600 }}>
                                                    <X size={10} /> No
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ), '/admin/schedule')}

                        {/* Fallback when no schedule perm */}
                        {!canSchedule && panel('Recent Activity', <Activity size={14} style={{ color: '#059669' }} />, (
                            <div>
                                {(dash?.recentActivity || []).slice(0, 6).map(a => (
                                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 14px', borderBottom: '1px solid #374151' }}>
                                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#374151', flexShrink: 0 }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{ fontSize: '11px', color: '#d1d5db' }}>{fmtAction(a.action)}</span>
                                            {a.userName && <span style={{ fontSize: '11px', color: '#6b7280' }}> · {a.userName}</span>}
                                        </div>
                                        <span style={{ fontSize: '10px', color: '#4b5563', flexShrink: 0 }}>{timeAgo(a.timestamp)}</span>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>

                    {/* Recent activity log */}
                    {panel('Recent Activity', <Clock size={14} style={{ color: '#6b7280' }} />, (
                        <div>
                            {(dash?.recentActivity || []).map((a, i) => (
                                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 14px', borderBottom: i < (dash?.recentActivity?.length || 0) - 1 ? '1px solid #1f2937' : 'none' }}>
                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#374151', flexShrink: 0 }} />
                                    <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '11px', color: '#d1d5db', fontWeight: 600 }}>{fmtAction(a.action)}</span>
                                        {a.userName && <span style={{ fontSize: '11px', color: '#6b7280' }}>by {a.userName}</span>}
                                    </div>
                                    <span style={{ fontSize: '10px', color: '#4b5563', flexShrink: 0 }}>{timeAgo(a.timestamp)}</span>
                                </div>
                            ))}
                            {!dashLoading && !dash?.recentActivity?.length && (
                                <div style={{ padding: '14px', color: '#4b5563', fontSize: '12px', textAlign: 'center' }}>No recent activity</div>
                            )}
                        </div>
                    ))}

                </div>
            </div>
        </>
    );
}
