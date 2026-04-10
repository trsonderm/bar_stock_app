'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
    Ticket,
    Search,
    MessageSquare,
    CheckCircle,
    AlertCircle,
    Send,
    X,
    RefreshCw,
} from 'lucide-react';
import { AdminPageHeader } from '../components/AdminPageHeader';

export default function SupportPage() {
    const [tickets, setTickets] = useState<any[]>([]);
    const [filteredTickets, setFilteredTickets] = useState<any[]>([]);
    const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [messagesLoading, setMessagesLoading] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [replying, setReplying] = useState(false);
    const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'my'>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [newStatus, setNewStatus] = useState('');

    const [showSettings, setShowSettings] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [settingsSaving, setSettingsSaving] = useState(false);
    const [settings, setSettings] = useState({
        auto_reply: true,
        sla_hours: '24',
        operating_hours: '9AM-5PM EST'
    });
    const [createForm, setCreateForm] = useState({ subject: '', description: '', priority: 'Normal' });

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const fetchTickets = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/support/tickets');
            const data = await res.json();
            if (data.tickets) setTickets(data.tickets);
        } catch { } finally {
            setLoading(false);
        }
    };

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/super-admin/settings');
            const data = await res.json();
            if (data.config?.help_desk) {
                try {
                    const parsed = JSON.parse(data.config.help_desk);
                    setSettings(prev => ({ ...prev, ...parsed }));
                } catch { }
            }
        } catch { }
    };

    useEffect(() => { fetchTickets(); fetchSettings(); }, []);

    useEffect(() => {
        let list = [...tickets];
        if (statusFilter === 'open') list = list.filter(t => t.status === 'open' || t.status === 'in_progress');
        if (statusFilter === 'my') list = list.filter(t => t.status !== 'closed');
        if (searchTerm) list = list.filter(t =>
            t.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.org_name?.toLowerCase().includes(searchTerm.toLowerCase())
        );
        setFilteredTickets(list);
    }, [tickets, statusFilter, searchTerm]);

    const loadMessages = async (ticket: any) => {
        setSelectedTicket(ticket);
        setMessages([]);
        setNewStatus(ticket.status);
        setMessagesLoading(true);
        try {
            const res = await fetch(`/api/support/tickets/${ticket.id}`);
            const data = await res.json();
            setMessages(data.messages || []);
            // Also refresh ticket to get latest status
            if (data.ticket) {
                setSelectedTicket(data.ticket);
                setNewStatus(data.ticket.status);
            }
        } catch { } finally {
            setMessagesLoading(false);
        }
    };

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    const sendReply = async () => {
        if (!replyText.trim() && !newStatus) return;
        if (!selectedTicket) return;
        setReplying(true);
        try {
            const formData = new FormData();
            if (replyText.trim()) formData.append('message', replyText.trim());
            if (newStatus && newStatus !== selectedTicket.status) formData.append('status', newStatus);

            const res = await fetch(`/api/support/tickets/${selectedTicket.id}`, {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) {
                const d = await res.json();
                throw new Error(d.error || 'Failed to send');
            }

            setReplyText('');
            // Reload messages and update ticket status in list
            await loadMessages({ ...selectedTicket, status: newStatus || selectedTicket.status });
            setTickets(prev => prev.map(t => t.id === selectedTicket.id ? { ...t, status: newStatus || t.status } : t));
        } catch (e: any) {
            alert(e.message || 'Failed to send reply');
        } finally {
            setReplying(false);
        }
    };

    const closeTicket = async () => {
        if (!selectedTicket) return;
        setNewStatus('closed');
        const formData = new FormData();
        formData.append('status', 'closed');
        await fetch(`/api/support/tickets/${selectedTicket.id}`, { method: 'POST', body: formData });
        setTickets(prev => prev.map(t => t.id === selectedTicket.id ? { ...t, status: 'closed' } : t));
        setSelectedTicket((prev: any) => prev ? { ...prev, status: 'closed' } : prev);
    };

    const handleSaveSettings = async () => {
        setSettingsSaving(true);
        try {
            const res = await fetch('/api/super-admin/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ help_desk: JSON.stringify(settings) })
            });
            if (!res.ok) throw new Error('Failed');
            setShowSettings(false);
        } catch { alert('Failed to save settings'); }
        finally { setSettingsSaving(false); }
    };

    const handleCreateTicket = async () => {
        if (!createForm.subject || !createForm.description) { alert('Fill in all fields'); return; }
        try {
            const fd = new FormData();
            fd.append('subject', createForm.subject);
            fd.append('description', createForm.description);
            const res = await fetch('/api/support/tickets', { method: 'POST', body: fd });
            if (res.ok) {
                setShowCreate(false);
                setCreateForm({ subject: '', description: '', priority: 'Normal' });
                fetchTickets();
            } else {
                alert('Failed to create ticket');
            }
        } catch { alert('Error creating ticket'); }
    };

    const statusColor = (status: string) => {
        if (status === 'open') return { bg: 'bg-emerald-500/10', text: 'text-emerald-400' };
        if (status === 'in_progress') return { bg: 'bg-blue-500/10', text: 'text-blue-400' };
        if (status === 'pending') return { bg: 'bg-amber-500/10', text: 'text-amber-400' };
        return { bg: 'bg-slate-500/10', text: 'text-slate-400' };
    };

    const actions = [
        { label: 'Ticket Settings', variant: 'secondary' as const, onClick: () => setShowSettings(true) },
        { label: 'Create Ticket', variant: 'primary' as const, onClick: () => setShowCreate(true) },
    ];

    return (
        <div className="flex flex-col h-screen overflow-hidden bg-slate-950">
            <div className="flex-none p-6 border-b border-slate-800 bg-slate-950 z-10">
                <AdminPageHeader
                    title="Support Tickets"
                    subtitle="Manage and resolve customer inquiries"
                    icon={Ticket}
                    actions={actions}
                />
            </div>

            <div className="flex-1 flex min-h-0 overflow-hidden">
                {/* Ticket List Sidebar */}
                <div className="w-96 border-r border-slate-800 flex flex-col bg-slate-900/30">
                    <div className="p-4 border-b border-slate-800 space-y-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input
                                type="text"
                                placeholder="Search tickets..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div className="flex gap-2 text-xs">
                            {(['all', 'open', 'my'] as const).map(f => (
                                <button
                                    key={f}
                                    onClick={() => setStatusFilter(f)}
                                    className={`flex-1 py-1.5 px-3 rounded-md font-medium transition-colors ${statusFilter === f ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                                >
                                    {f === 'all' ? 'All' : f === 'open' ? 'Open' : 'Unresolved'}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {loading && <div className="p-4 text-slate-500">Loading tickets...</div>}
                        {!loading && filteredTickets.length === 0 && (
                            <div className="p-6 text-center text-slate-500">
                                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                <p>No tickets found.</p>
                            </div>
                        )}
                        {filteredTickets.map(ticket => {
                            const sc = statusColor(ticket.status);
                            return (
                                <div
                                    key={ticket.id}
                                    onClick={() => loadMessages(ticket)}
                                    className={`p-4 border-b border-slate-800 cursor-pointer transition-colors ${selectedTicket?.id === ticket.id
                                        ? 'bg-blue-600/10 border-l-2 border-l-blue-500'
                                        : 'hover:bg-slate-800/50 border-l-2 border-l-transparent'
                                        }`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${sc.bg} ${sc.text}`}>
                                            {ticket.status.toUpperCase()}
                                        </span>
                                        <span className="text-xs text-slate-500">{new Date(ticket.created_at).toLocaleDateString()}</span>
                                    </div>
                                    <h4 className={`text-sm font-medium mb-1 line-clamp-1 ${selectedTicket?.id === ticket.id ? 'text-blue-400' : 'text-slate-200'}`}>
                                        {ticket.subject}
                                    </h4>
                                    <div className="flex items-center justify-between text-xs text-slate-500">
                                        <span>{ticket.first_name || 'User'} {ticket.last_name || ''}</span>
                                        <span>{ticket.org_name || 'System'}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Ticket Detail */}
                <div className="flex-1 flex flex-col bg-slate-950 relative">
                    {selectedTicket ? (
                        <>
                            {/* Ticket Header */}
                            <div className="p-6 border-b border-slate-800 bg-slate-900/20 flex justify-between items-start">
                                <div>
                                    <h2 className="text-xl font-bold text-white mb-2">{selectedTicket.subject}</h2>
                                    <div className="flex items-center gap-4 text-sm text-slate-400 flex-wrap">
                                        <span className="flex items-center gap-1.5">
                                            <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] font-bold text-white">
                                                {selectedTicket.first_name ? selectedTicket.first_name.charAt(0) : 'U'}
                                            </div>
                                            {selectedTicket.first_name} {selectedTicket.last_name} from {selectedTicket.org_name || 'Unknown'}
                                        </span>
                                        <span>•</span>
                                        <span>Ticket #{selectedTicket.id}</span>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${statusColor(selectedTicket.status).bg} ${statusColor(selectedTicket.status).text}`}>
                                            {selectedTicket.status.toUpperCase()}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {selectedTicket.status !== 'closed' && (
                                        <button
                                            onClick={closeTicket}
                                            title="Close ticket"
                                            className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition-colors"
                                        >
                                            <CheckCircle className="w-5 h-5" />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => loadMessages(selectedTicket)}
                                        title="Refresh"
                                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setSelectedTicket(null)}
                                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-4">
                                {messagesLoading && <p className="text-slate-500 text-center">Loading messages...</p>}
                                {!messagesLoading && messages.length === 0 && (
                                    <p className="text-slate-600 text-center text-sm">No messages yet.</p>
                                )}
                                {messages.map(m => {
                                    const isSelf = m.role === 'admin' || m.role === 'super_admin';
                                    return (
                                        <div key={m.id} className={`flex gap-3 ${isSelf ? 'flex-row-reverse' : ''}`}>
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-xs shrink-0 mt-1 ${isSelf ? 'bg-blue-600' : 'bg-indigo-500'}`}>
                                                {m.first_name ? m.first_name.charAt(0) : 'U'}
                                            </div>
                                            <div className={`flex-1 ${isSelf ? 'text-right' : ''}`}>
                                                <div className={`flex items-baseline gap-2 mb-1 ${isSelf ? 'justify-end' : ''}`}>
                                                    <span className="font-bold text-slate-200 text-sm">{m.first_name} {m.last_name}</span>
                                                    <span className="text-xs text-slate-500">{new Date(m.created_at).toLocaleString()}</span>
                                                </div>
                                                <div className={`p-3 rounded-2xl text-sm text-slate-200 leading-relaxed inline-block text-left max-w-[80%] ${isSelf
                                                    ? 'bg-blue-600/10 border border-blue-600/20 rounded-tr-none'
                                                    : 'bg-slate-900 border border-slate-800 rounded-tl-none'
                                                    }`}>
                                                    {m.message}
                                                    {m.attachments && (() => {
                                                        try {
                                                            const att = typeof m.attachments === 'string' ? JSON.parse(m.attachments) : m.attachments;
                                                            return att.length > 0 ? att.map((path: string, i: number) => (
                                                                <a key={i} href={path} target="_blank" className="block mt-1 text-blue-400 text-xs underline">View Attachment</a>
                                                            )) : null;
                                                        } catch { return null; }
                                                    })()}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Reply Box */}
                            <div className="p-4 border-t border-slate-800 bg-slate-900/30 space-y-2">
                                <div className="flex items-center gap-3">
                                    <label className="text-xs text-slate-400">Set Status:</label>
                                    <select
                                        value={newStatus}
                                        onChange={e => setNewStatus(e.target.value)}
                                        className="bg-slate-800 border border-slate-700 text-white text-xs rounded px-2 py-1"
                                    >
                                        <option value="open">Open</option>
                                        <option value="in_progress">In Progress</option>
                                        <option value="pending">Pending</option>
                                        <option value="closed">Closed</option>
                                    </select>
                                </div>
                                <div className="relative">
                                    <textarea
                                        value={replyText}
                                        onChange={e => setReplyText(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendReply(); } }}
                                        placeholder="Type your reply... (Ctrl+Enter to send)"
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl p-4 pr-14 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none h-24"
                                    />
                                    <button
                                        onClick={sendReply}
                                        disabled={replying || (!replyText.trim() && newStatus === selectedTicket.status)}
                                        className="absolute right-3 bottom-3 p-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg transition-colors"
                                    >
                                        <Send className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
                            <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center mb-4 border border-slate-800">
                                <MessageSquare className="w-8 h-8 opacity-50" />
                            </div>
                            <h3 className="text-lg font-medium text-slate-300 mb-1">No Ticket Selected</h3>
                            <p className="text-sm">Select a ticket from the sidebar to view details</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Settings Modal */}
            {showSettings && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-xl w-full max-w-md">
                        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-blue-400" /> Help Desk Settings
                        </h2>
                        <div className="space-y-4">
                            <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
                                <input type="checkbox" checked={settings.auto_reply} onChange={e => setSettings({ ...settings, auto_reply: e.target.checked })} className="rounded bg-slate-800 border-slate-700 text-blue-500" />
                                Enable Auto-Reply for New Tickets
                            </label>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Target SLA (Hours)</label>
                                <input type="number" value={settings.sla_hours} onChange={e => setSettings({ ...settings, sla_hours: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Operating Hours</label>
                                <input type="text" value={settings.operating_hours} onChange={e => setSettings({ ...settings, operating_hours: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white" placeholder="e.g. 9AM-5PM EST" />
                            </div>
                            <div className="flex gap-2 pt-4">
                                <button onClick={handleSaveSettings} disabled={settingsSaving} className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg py-2 font-medium">{settingsSaving ? 'Saving...' : 'Save'}</button>
                                <button onClick={() => setShowSettings(false)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg py-2 font-medium">Cancel</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Create Ticket Modal */}
            {showCreate && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-xl w-full max-w-md">
                        <h2 className="text-xl font-bold text-white mb-4">Open New Support Ticket</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Subject</label>
                                <input type="text" value={createForm.subject} onChange={e => setCreateForm({ ...createForm, subject: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white" placeholder="Brief summary..." />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
                                <textarea value={createForm.description} onChange={e => setCreateForm({ ...createForm, description: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white h-24 resize-none" placeholder="Elaborate on the issue..." />
                            </div>
                            <div className="flex gap-2 pt-4">
                                <button onClick={handleCreateTicket} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-2 font-medium">Submit Ticket</button>
                                <button onClick={() => setShowCreate(false)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg py-2 font-medium">Cancel</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
