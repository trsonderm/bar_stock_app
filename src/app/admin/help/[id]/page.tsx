'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import styles from '../../admin.module.css'; // Use admin styles

export default function TicketDetailPage() {
    const { id } = useParams();
    const router = useRouter();
    const [ticket, setTicket] = useState<any>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [reply, setReply] = useState('');
    const [loading, setLoading] = useState(false);
    const [pageLoading, setPageLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, [id]);

    const loadData = async () => {
        try {
            const res = await fetch(`/api/support/tickets/${id}`);
            if (res.ok) {
                const data = await res.json();
                setTicket(data.ticket);
                setMessages(data.messages || []);
            } else {
                alert('Ticket not found or unauthorized');
                router.push('/admin/help');
            }
        } catch (e) {
            console.error(e);
        } finally {
            setPageLoading(false);
        }
    };

    const handleReply = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!reply.trim()) return;

        setLoading(true);

        const formData = new FormData();
        formData.append('message', reply);

        // Users cannot change status via reply usually, or maybe we allow them to close?
        // Let's just allow message for now. If they want to close, maybe a separate button.
        // For simplicity, just finding message.

        const res = await fetch(`/api/support/tickets/${id}`, {
            method: 'POST',
            body: formData
        });

        if (res.ok) {
            setReply('');
            loadData();
        } else {
            alert('Failed to send reply');
        }
        setLoading(false);
    };

    if (pageLoading) return <div className={styles.container}>Loading Ticket...</div>;
    if (!ticket) return <div className={styles.container}>Ticket not found.</div>;

    return (
        <div className={styles.container}>
            <div className={styles.card} style={{ maxWidth: '800px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <button onClick={() => router.push('/admin/help')} style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        &larr; Back to Help
                    </button>
                    <span style={{
                        background: ticket.status === 'open' ? '#059669' : ticket.status === 'closed' ? '#374151' : '#d97706',
                        padding: '0.25rem 0.75rem', borderRadius: '1rem', fontSize: '0.8rem', fontWeight: 'bold'
                    }}>
                        {ticket.status.toUpperCase()}
                    </span>
                </div>

                <h1 className={styles.cardTitle}>#{ticket.id}: {ticket.subject}</h1>
                <p style={{ color: '#d1d5db', marginBottom: '2rem', lineHeight: '1.6' }}>
                    {ticket.description}
                </p>

                <div style={{ borderTop: '1px solid #374151', paddingTop: '1rem', marginTop: '1rem' }}>
                    <h3 style={{ color: 'white', marginBottom: '1rem' }}>Conversation</h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
                        {messages.map(m => {
                            // Determine if this message is from ME (the current user) or Support
                            // Logic: user_id checks. 
                            // But for simple view:
                            // If m.role === 'admin' and not super admin? Wait.
                            // The API returns m.role.
                            // If I am a Manager (admin role), and I wrote it, it's me.
                            // If Super Admin wrote it, it's Support.
                            const isSupport = m.role === 'super_admin' || (typeof m.role === 'string' && m.role.includes('super_admin')); // Simplified check
                            // actually, let's look at the data structure. 'role' comes from users table.
                            // If distinct from 'admin', likely 'super_admin' role exists? 
                            // Or we check if m.user_id === ticket.user_id (The Creator).

                            const isMe = m.user_id === ticket.user_id; // Roughly correct if I am the ticket creator

                            return (
                                <div key={m.id} style={{
                                    padding: '1rem',
                                    borderRadius: '0.5rem',
                                    background: isMe ? '#1f2937' : '#374151',
                                    border: isMe ? '1px solid #374151' : '1px solid #4b5563',
                                    alignSelf: isMe ? 'flex-end' : 'flex-start',
                                    maxWidth: '85%',
                                    minWidth: '50%'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: isMe ? '#60a5fa' : '#fbbf24' }}>
                                            {isMe ? 'You' : 'Support Team'}
                                        </span>
                                        <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                                            {new Date(m.created_at).toLocaleString()}
                                        </span>
                                    </div>
                                    <p style={{ color: '#e5e7eb', whiteSpace: 'pre-wrap' }}>{m.message}</p>

                                    {m.attachments && (
                                        <div style={{ marginTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.5rem' }}>
                                            {JSON.parse(m.attachments).map((path: string, i: number) => (
                                                <a key={i} href={path} target="_blank" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#60a5fa', fontSize: '0.85rem', textDecoration: 'none' }}>
                                                    📎 Attachment {i + 1}
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {messages.length === 0 && <div style={{ color: '#6b7280', fontStyle: 'italic' }}>No replies yet.</div>}
                    </div>

                    {ticket.status !== 'closed' && (
                        <form onSubmit={handleReply} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <textarea
                                value={reply}
                                onChange={e => setReply(e.target.value)}
                                placeholder="Type your reply here..."
                                className={styles.input}
                                style={{ minHeight: '100px', width: '100%' }}
                                required
                            />
                            <button
                                type="submit"
                                disabled={loading}
                                className={styles.submitBtn}
                                style={{ alignSelf: 'flex-end', width: 'auto' }}
                            >
                                {loading ? 'Sending...' : 'Send Reply'}
                            </button>
                        </form>
                    )}
                    {ticket.status === 'closed' && (
                        <div style={{ textAlign: 'center', padding: '1rem', background: '#374151', borderRadius: '0.5rem', color: '#9ca3af' }}>
                            This ticket is closed. You can no longer reply.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
