'use client';

import React, { useState } from 'react';
import {
    Ticket,
    Search,
    MessageSquare,
    CheckCircle,
    AlertCircle,
    MoreHorizontal,
    Send
} from 'lucide-react';
import { AdminPageHeader } from '../components/AdminPageHeader';

export default function SupportPage() {
    const [tickets, setTickets] = useState<any[]>([]);
    const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);

    React.useEffect(() => {
        fetch('/api/support/tickets')
            .then(res => res.json())
            .then(data => {
                if(data.tickets) {
                    setTickets(data.tickets);
                }
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    const actions = [
        { label: 'Ticket Settings', variant: 'secondary' as const },
        { label: 'Create Ticket', variant: 'primary' as const },
    ];

    return (
        <div className="flex flex-col h-screen overflow-hidden bg-slate-950">
            {/* Header Section - Non-scrolling */}
            <div className="flex-none p-6 border-b border-slate-800 bg-slate-950 z-10">
                <AdminPageHeader
                    title="Support Tickets"
                    subtitle="Manage and resolve customer inquiries"
                    icon={Ticket}
                    actions={actions}
                />
            </div>

            {/* Main Content Area - Split Pane */}
            <div className="flex-1 flex min-h-0 overflow-hidden">
                {/* Ticket List Sidebar */}
                <div className="w-96 border-r border-slate-800 flex flex-col bg-slate-900/30">
                    <div className="p-4 border-b border-slate-800 space-y-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input
                                type="text"
                                placeholder="Search tickets..."
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div className="flex gap-2 text-xs">
                            <button className="flex-1 py-1.5 px-3 bg-blue-600 text-white rounded-md font-medium">All</button>
                            <button className="flex-1 py-1.5 px-3 bg-slate-800 text-slate-400 hover:text-white rounded-md font-medium transition-colors">Open</button>
                            <button className="flex-1 py-1.5 px-3 bg-slate-800 text-slate-400 hover:text-white rounded-md font-medium transition-colors">My Tickets</button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {loading && <div className="p-4 text-slate-500">Loading tickets...</div>}
                        {!loading && tickets.length === 0 && <div className="p-4 text-slate-500">No support tickets found.</div>}
                        {tickets.map(ticket => (
                            <div
                                key={ticket.id}
                                onClick={() => setSelectedTicket(ticket)}
                                className={`p-4 border-b border-slate-800 cursor-pointer transition-colors ${selectedTicket?.id === ticket.id
                                        ? 'bg-blue-600/10 border-l-2 border-l-blue-500'
                                        : 'hover:bg-slate-800/50 border-l-2 border-l-transparent'
                                    }`}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ticket.status === 'open' ? 'bg-emerald-500/10 text-emerald-400' :
                                            ticket.status === 'in_progress' ? 'bg-blue-500/10 text-blue-400' :
                                                'bg-slate-500/10 text-slate-400'
                                        }`}>
                                        {ticket.status.toUpperCase()}
                                    </span>
                                    <span className="text-xs text-slate-500">{new Date(ticket.created_at).toLocaleDateString()}</span>
                                </div>
                                <h4 className={`text-sm font-medium mb-1 line-clamp-1 ${selectedTicket?.id === ticket.id ? 'text-blue-400' : 'text-slate-200'}`}>
                                    {ticket.subject}
                                </h4>
                                <div className="flex items-center justify-between text-xs text-slate-500">
                                    <span>{ticket.first_name || 'User'} {ticket.last_name || ''}</span>
                                    <span className={`flex items-center gap-1 ${ticket.priority === 'Critical' ? 'text-rose-400' :
                                            ticket.priority === 'High' ? 'text-amber-400' :
                                                'text-slate-500'
                                        }`}>
                                        {ticket.org_name || 'System Org'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Ticket Detail / Conversation View */}
                <div className="flex-1 flex flex-col bg-slate-950 relative">
                    {selectedTicket ? (
                        <>
                            {/* Ticket Header */}
                            <div className="p-6 border-b border-slate-800 bg-slate-900/20 flex justify-between items-start">
                                <div>
                                    <h2 className="text-xl font-bold text-white mb-2">{selectedTicket.subject}</h2>
                                    <div className="flex items-center gap-4 text-sm text-slate-400">
                                        <span className="flex items-center gap-1.5">
                                            <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] font-bold text-white">
                                                {selectedTicket.first_name ? selectedTicket.first_name.charAt(0) : 'U'}
                                            </div>
                                            {selectedTicket.first_name} {selectedTicket.last_name} from {selectedTicket.org_name || 'Unknown'}
                                        </span>
                                        <span>•</span>
                                        <span>ID: {selectedTicket.id}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
                                        <CheckCircle className="w-5 h-5" />
                                    </button>
                                    <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
                                        <MoreHorizontal className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            {/* Conversation Area (Scrollable) */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                <div className="flex gap-4">
                                    <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center font-bold text-white shrink-0 mt-1">
                                        {selectedTicket.first_name ? selectedTicket.first_name.charAt(0) : 'U'}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-baseline justify-between mb-1">
                                            <span className="font-bold text-slate-200">{selectedTicket.first_name} {selectedTicket.last_name}</span>
                                            <span className="text-xs text-slate-500">{new Date(selectedTicket.created_at).toLocaleString()}</span>
                                        </div>
                                        <div className="p-4 bg-slate-900 rounded-2xl rounded-tl-none border border-slate-800 text-slate-300 text-sm leading-relaxed">
                                            <p>{selectedTicket.description || 'No description provided.'}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-4 flex-row-reverse">
                                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white shrink-0 mt-1">
                                        SA
                                    </div>
                                    <div className="flex-1 text-right">
                                        <div className="flex items-baseline justify-end gap-2 mb-1">
                                            <span className="font-bold text-slate-200">Support Agent</span>
                                            <span className="text-xs text-slate-500">Just now</span>
                                        </div>
                                        <div className="p-4 bg-blue-600/10 rounded-2xl rounded-tr-none border border-blue-600/20 text-blue-100 text-sm leading-relaxed text-left inline-block">
                                            <p>Hello! Thanks for reaching out. Yes, we can absolutely enable that for your account. I've just updated your permissions - please refresh the page and let me know if you see the "Report Builder" tab.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Reply Box */}
                            <div className="p-4 border-t border-slate-800 bg-slate-900/30">
                                <div className="relative">
                                    <textarea
                                        placeholder="Type your reply..."
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl p-4 pr-12 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none h-24"
                                    ></textarea>
                                    <button className="absolute right-3 bottom-3 p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors shadow-lg shadow-blue-500/20">
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
        </div>
    );
}
