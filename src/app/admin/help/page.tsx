'use client';

import { useEffect, useState } from 'react';

export default function HelpPage() {
    const [tickets, setTickets] = useState<any[]>([]);
    const [subject, setSubject] = useState('');
    const [description, setDescription] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadTickets();
    }, []);

    const loadTickets = async () => {
        const res = await fetch('/api/support/tickets');
        const data = await res.json();
        setTickets(data.tickets || []);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const formData = new FormData();
        formData.append('subject', subject);
        formData.append('description', description);
        if (file) formData.append('file', file);

        const res = await fetch('/api/support/tickets', {
            method: 'POST',
            body: formData
        });

        if (res.ok) {
            setSubject('');
            setDescription('');
            setFile(null);
            loadTickets();
        } else {
            alert('Failed to submit ticket');
        }
        setLoading(false);
    };

    return (
        <div style={{ padding: '2rem', maxWidth: '800px' }}>
            <h1 style={{ fontSize: '2rem', marginBottom: '2rem' }}>Help & Support</h1>

            <div style={{ background: '#1f2937', padding: '1.5rem', borderRadius: '0.75rem', marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Submit a Ticket</h2>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <input
                        placeholder="Subject"
                        value={subject}
                        onChange={e => setSubject(e.target.value)}
                        style={{ padding: '0.75rem', borderRadius: '0.5rem', background: '#374151', border: 'none', color: 'white' }}
                        required
                    />
                    <textarea
                        placeholder="Description of issue..."
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        style={{ padding: '0.75rem', borderRadius: '0.5rem', background: '#374151', border: 'none', color: 'white', minHeight: '100px' }}
                        required
                    />
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#9ca3af' }}>Screenshot (Optional)</label>
                        <input
                            type="file"
                            accept="image/*"
                            onChange={e => setFile(e.target.files ? e.target.files[0] : null)}
                            style={{ color: '#9ca3af' }}
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        style={{ padding: '0.75rem', borderRadius: '0.5rem', background: '#3b82f6', color: 'white', border: 'none', cursor: 'pointer', alignSelf: 'flex-start' }}
                    >
                        {loading ? 'Submitting...' : 'Submit Ticket'}
                    </button>
                </form>
            </div>

            <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Your Tickets</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {tickets.map(t => (
                    <div key={t.id} style={{ background: '#1f2937', padding: '1rem', borderRadius: '0.5rem', cursor: 'pointer', transition: 'background 0.2s' }} onClick={() => window.location.href = `/admin/help/${t.id}`}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <span style={{ fontWeight: 'bold' }}>{t.subject}</span>
                            <span style={{
                                padding: '0.25rem 0.5rem',
                                borderRadius: '0.25rem',
                                background: t.status === 'open' ? '#059669' : '#6b7280',
                                fontSize: '0.75rem'
                            }}>{t.status}</span>
                        </div>
                        <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>{t.description}</p>
                        <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.5rem' }}>{new Date(t.created_at).toLocaleString()} &bull; <span style={{ color: '#60a5fa' }}>Click to view</span></p>
                    </div>
                ))}
                {tickets.length === 0 && <p style={{ color: '#6b7280' }}>No tickets found.</p>}
            </div>
        </div>
    );
}
