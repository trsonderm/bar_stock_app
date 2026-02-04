'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

export default function TicketDetail() {
    const { id } = useParams();
    const [ticket, setTicket] = useState<any>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [reply, setReply] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadData();
    }, [id]);

    const loadData = async () => {
        const res = await fetch(`/api/support/tickets/${id}`);
        const data = await res.json();
        setTicket(data.ticket);
        setMessages(data.messages || []);
    };

    const handleReply = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const form = e.currentTarget as HTMLFormElement;
        const status = (form.elements.namedItem('status') as HTMLSelectElement).value;

        const formData = new FormData();
        formData.append('message', reply);
        if (status) formData.append('status', status);

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

    if (!ticket) return <div>Loading...</div>;

    return (
        <div style={{ maxWidth: '800px' }}>
            <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Ticket #{ticket.id}: {ticket.subject}</h1>
            <div style={{ marginBottom: '2rem', padding: '1rem', background: '#1f2937', borderRadius: '0.5rem' }}>
                <p><strong>Status:</strong> {ticket.status}</p>
                <p><strong>Org:</strong> {ticket.org_name}</p>
                <p><strong>Description:</strong> {ticket.description}</p>
            </div>

            <h3 style={{ marginBottom: '1rem' }}>Conversation</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
                {messages.map(m => (
                    <div key={m.id} style={{
                        padding: '1rem',
                        borderRadius: '0.5rem',
                        background: m.role === 'admin' && m.user_id !== ticket.user_id ? '#374151' : '#1f2937',
                        alignSelf: m.role === 'admin' && m.user_id !== ticket.user_id ? 'flex-end' : 'flex-start', // Rough logic for 'other' vs 'me'
                        maxWidth: '80%'
                    }}>
                        <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: '0.25rem' }}>{m.first_name} ({m.role})</div>
                        <p>{m.message}</p>
                        {m.attachments && JSON.parse(m.attachments).map((path: string, i: number) => (
                            <a key={i} href={path} target="_blank" style={{ display: 'block', marginTop: '0.5rem', color: '#60a5fa', fontSize: '0.8rem' }}>View Attachment</a>
                        ))}
                    </div>
                ))}
            </div>

            <form onSubmit={handleReply} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: '#374151', padding: '1rem', borderRadius: '0.5rem' }}>
                <textarea
                    value={reply}
                    onChange={e => setReply(e.target.value)}
                    placeholder="Write a reply..."
                    style={{ width: '100%', minHeight: '100px', padding: '1rem', borderRadius: '0.5rem', background: '#1f2937', border: '1px solid #4b5563', color: 'white' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <label style={{ color: '#d1d5db', fontSize: '0.9rem' }}>Set Status:</label>
                        <select
                            name="status"
                            defaultValue={ticket.status}
                            style={{ padding: '0.5rem', borderRadius: '0.25rem', background: '#1f2937', color: 'white', border: '1px solid #4b5563' }}
                        >
                            <option value="open">Open</option>
                            <option value="pending">Pending</option>
                            <option value="closed">Closed</option>
                        </select>
                    </div>
                    <button
                        disabled={loading}
                        style={{ padding: '0.5rem 1.5rem', background: '#3b82f6', color: 'white', borderRadius: '0.5rem', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                        {loading ? 'Sending...' : 'Send Reply'}
                    </button>
                </div>
            </form>
        </div>
    );
}
