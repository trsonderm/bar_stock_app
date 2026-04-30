'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, ChevronLeft, Search } from 'lucide-react';

interface OrgUser { id: number; name: string; profile_picture: string | null; }
interface Convo { other_id: number; other_name: string; other_avatar: string | null; last_msg: string; last_at: string; unread_count: number; }
interface Message { id: number; sender_id: number; recipient_id: number; content: string; is_read: boolean; created_at: string; sender_name: string; sender_avatar: string | null; }

function Avatar({ name, src, size = 34 }: { name: string; src?: string | null; size?: number }) {
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
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return new Date(iso).toLocaleDateString();
}

export default function MessagePanel({ onClose, myId }: { onClose: () => void; myId: number }) {
    const [convos, setConvos] = useState<Convo[]>([]);
    const [orgUsers, setOrgUsers] = useState<OrgUser[]>([]);
    const [activeUser, setActiveUser] = useState<OrgUser | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [draft, setDraft] = useState('');
    const [search, setSearch] = useState('');
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const loadConvos = useCallback(async () => {
        const res = await fetch('/api/admin/messages');
        const data = await res.json();
        setConvos(data.conversations || []);
        setOrgUsers(data.orgUsers || []);
    }, []);

    const loadMessages = useCallback(async (userId: number) => {
        const res = await fetch(`/api/admin/messages?with=${userId}`);
        const data = await res.json();
        setMessages(data.messages || []);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }, []);

    useEffect(() => { loadConvos(); }, [loadConvos]);

    useEffect(() => {
        if (!activeUser) return;
        loadMessages(activeUser.id);
        pollRef.current = setInterval(() => loadMessages(activeUser.id), 5000);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [activeUser, loadMessages]);

    const openConvo = (userId: number, userName: string, avatar: string | null) => {
        setActiveUser({ id: userId, name: userName, profile_picture: avatar });
        setSearch('');
    };

    const sendMsg = async () => {
        if (!draft.trim() || !activeUser || sending) return;
        setSending(true);
        await fetch('/api/admin/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipient_id: activeUser.id, content: draft.trim() }),
        });
        setDraft('');
        setSending(false);
        loadMessages(activeUser.id);
        loadConvos();
    };

    const filteredUsers = orgUsers.filter(u =>
        !search || u.name.toLowerCase().includes(search.toLowerCase())
    );

    const panelStyle: React.CSSProperties = {
        position: 'fixed', right: 16, bottom: 0, width: 340, height: 480,
        background: '#1f2937', border: '1px solid #374151', borderRadius: '12px 12px 0 0',
        boxShadow: '0 -4px 30px rgba(0,0,0,0.5)', zIndex: 9000, display: 'flex', flexDirection: 'column', overflow: 'hidden',
    };

    return (
        <div style={panelStyle}>
            {/* Header */}
            <div style={{ background: '#111827', borderBottom: '1px solid #374151', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                {activeUser && (
                    <button onClick={() => { setActiveUser(null); loadConvos(); }}
                        style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 0, display: 'flex' }}>
                        <ChevronLeft size={18} />
                    </button>
                )}
                <span style={{ flex: 1, fontWeight: 700, color: 'white', fontSize: '0.9rem' }}>
                    {activeUser ? activeUser.name : 'Messages'}
                </span>
                <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 0, display: 'flex' }}>
                    <X size={16} />
                </button>
            </div>

            {/* Conversation list */}
            {!activeUser && (
                <>
                    <div style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid #374151' }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
                            <input value={search} onChange={e => setSearch(e.target.value)}
                                placeholder="Search or new message…"
                                style={{ width: '100%', background: '#111827', border: '1px solid #374151', borderRadius: '6px', color: 'white', padding: '0.4rem 0.6rem 0.4rem 1.6rem', fontSize: '0.8rem', outline: 'none' }} />
                        </div>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {convos.length === 0 && !search && (
                            <p style={{ color: '#6b7280', fontSize: '0.8rem', textAlign: 'center', padding: '1.5rem' }}>No conversations yet. Search above to start one.</p>
                        )}
                        {convos.filter(c => !search || c.other_name.toLowerCase().includes(search.toLowerCase())).map(c => (
                            <div key={c.other_id} onClick={() => openConvo(c.other_id, c.other_name, c.other_avatar)}
                                style={{ display: 'flex', gap: '0.65rem', padding: '0.75rem 1rem', cursor: 'pointer', borderBottom: '1px solid #111827' }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#374151')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                <Avatar name={c.other_name} src={c.other_avatar} size={36} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                        <span style={{ fontWeight: c.unread_count > 0 ? 700 : 500, color: 'white', fontSize: '0.85rem' }}>{c.other_name}</span>
                                        <span style={{ color: '#6b7280', fontSize: '0.72rem' }}>{timeAgo(c.last_at)}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ color: '#9ca3af', fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, maxWidth: '190px' }}>{c.last_msg}</span>
                                        {c.unread_count > 0 && (
                                            <span style={{ background: '#1d4ed8', color: 'white', borderRadius: '999px', padding: '1px 7px', fontSize: '0.7rem', fontWeight: 700 }}>{c.unread_count}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {/* New conversations from search */}
                        {search && filteredUsers.filter(u => !convos.find(c => c.other_id === u.id)).map(u => (
                            <div key={u.id} onClick={() => openConvo(u.id, u.name, u.profile_picture)}
                                style={{ display: 'flex', gap: '0.65rem', padding: '0.75rem 1rem', cursor: 'pointer', borderBottom: '1px solid #111827', alignItems: 'center' }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#374151')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                <Avatar name={u.name} src={u.profile_picture} size={36} />
                                <span style={{ color: '#e5e7eb', fontSize: '0.85rem' }}>{u.name}</span>
                                <span style={{ color: '#6b7280', fontSize: '0.75rem', marginLeft: 'auto' }}>New</span>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* Active conversation */}
            {activeUser && (
                <>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
                        {messages.map(m => {
                            const isMe = m.sender_id === myId;
                            return (
                                <div key={m.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: '0.5rem', gap: '0.4rem', alignItems: 'flex-end' }}>
                                    {!isMe && <Avatar name={m.sender_name} src={m.sender_avatar} size={26} />}
                                    <div style={{
                                        maxWidth: '78%', padding: '0.5rem 0.75rem', borderRadius: isMe ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                                        background: isMe ? '#1d4ed8' : '#374151', color: 'white', fontSize: '0.85rem', lineHeight: 1.45,
                                    }}>
                                        {m.content}
                                        <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', textAlign: 'right' as const, marginTop: '2px' }}>{timeAgo(m.created_at)}</div>
                                    </div>
                                </div>
                            );
                        })}
                        {messages.length === 0 && (
                            <p style={{ color: '#6b7280', fontSize: '0.8rem', textAlign: 'center', marginTop: '2rem' }}>Start a conversation with {activeUser.name}</p>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                    <div style={{ padding: '0.6rem', borderTop: '1px solid #374151', display: 'flex', gap: '0.5rem' }}>
                        <input
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }}
                            placeholder="Message…"
                            style={{ flex: 1, background: '#111827', border: '1px solid #374151', borderRadius: '6px', color: 'white', padding: '0.5rem 0.75rem', fontSize: '0.85rem', outline: 'none' }}
                        />
                        <button onClick={sendMsg} disabled={sending || !draft.trim()}
                            style={{ background: '#1d4ed8', border: 'none', borderRadius: '6px', color: 'white', padding: '0.5rem 0.65rem', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: (sending || !draft.trim()) ? 0.5 : 1 }}>
                            <Send size={15} />
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
