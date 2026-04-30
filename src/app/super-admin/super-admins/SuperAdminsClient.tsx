'use client';

import { useState, useEffect } from 'react';
import { Shield, UserPlus, Trash2, RefreshCw } from 'lucide-react';

interface SuperAdmin {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    is_active: boolean;
    created_at: string;
}

export default function SuperAdminsClient() {
    const [admins, setAdmins] = useState<SuperAdmin[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState('');
    const [form, setForm] = useState({ first_name: '', last_name: '', email: '', password: '' });

    const load = async () => {
        const res = await fetch('/api/super-admin/super-admins');
        const data = await res.json();
        setAdmins(data.rows || []);
    };

    useEffect(() => { load(); }, []);

    const handleAdd = async () => {
        if (!form.email || !form.password) { setMsg('Email and password are required.'); return; }
        setLoading(true);
        setMsg('');
        const res = await fetch('/api/super-admin/super-admins', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form),
        });
        const data = await res.json();
        if (res.ok) {
            setMsg(data.promoted ? 'Existing user promoted to super admin.' : 'Super admin created.');
            setShowModal(false);
            setForm({ first_name: '', last_name: '', email: '', password: '' });
            load();
        } else {
            setMsg(data.error || 'Failed');
        }
        setLoading(false);
    };

    const handleRevoke = async (id: number, name: string) => {
        if (!confirm(`Remove super admin access from ${name}?`)) return;
        await fetch(`/api/super-admin/super-admins?id=${id}`, { method: 'DELETE' });
        load();
    };

    return (
        <div className="p-8 max-w-4xl mx-auto text-white">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Shield className="text-blue-400" /> Super Admins
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">Users with full system access across all organizations.</p>
                </div>
                <div className="flex gap-3">
                    <button onClick={load} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors">
                        <RefreshCw size={14} />
                    </button>
                    <button onClick={() => { setShowModal(true); setMsg(''); }} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-bold transition-colors">
                        <UserPlus size={15} /> Add Super Admin
                    </button>
                </div>
            </div>

            {msg && <div className="mb-4 px-4 py-2 bg-blue-900/20 border border-blue-700/40 rounded-lg text-blue-300 text-sm">{msg}</div>}

            <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-slate-950 text-slate-400 uppercase text-xs font-bold">
                            <th className="px-5 py-3 text-left">Name</th>
                            <th className="px-5 py-3 text-left">Email</th>
                            <th className="px-5 py-3 text-left">Added</th>
                            <th className="px-5 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {admins.map(a => (
                            <tr key={a.id} className="hover:bg-slate-800/40">
                                <td className="px-5 py-3">
                                    <div className="flex items-center gap-2">
                                        <div className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-600/40 flex items-center justify-center text-blue-400 font-bold text-xs">
                                            {a.first_name?.charAt(0)}
                                        </div>
                                        <span className="font-medium text-white">{a.first_name} {a.last_name}</span>
                                    </div>
                                </td>
                                <td className="px-5 py-3 text-slate-300">{a.email}</td>
                                <td className="px-5 py-3 text-slate-500">{new Date(a.created_at).toLocaleDateString()}</td>
                                <td className="px-5 py-3 text-right">
                                    <button
                                        onClick={() => handleRevoke(a.id, `${a.first_name} ${a.last_name}`)}
                                        className="text-red-400 hover:text-red-300 p-1.5 rounded hover:bg-red-500/10 transition-colors"
                                        title="Revoke super admin access"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {admins.length === 0 && (
                            <tr><td colSpan={4} className="px-5 py-10 text-center text-slate-600">No super admins found.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
                    <div className="bg-slate-900 border border-slate-700 p-8 rounded-xl w-full max-w-md">
                        <h2 className="text-xl font-bold text-white mb-5 flex items-center gap-2">
                            <Shield className="text-blue-400" size={20} /> Add Super Admin
                        </h2>
                        <p className="text-slate-400 text-sm mb-5">Enter an existing user's email to promote them, or fill all fields to create a new super admin account.</p>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">First Name</label>
                                    <input type="text" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white text-sm" />
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Last Name</label>
                                    <input type="text" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white text-sm" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Email <span className="text-red-400">*</span></label>
                                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white text-sm" />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Password <span className="text-red-400">*</span></label>
                                <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white text-sm" />
                            </div>
                            {msg && <p className="text-red-400 text-sm">{msg}</p>}
                            <div className="flex gap-3 pt-2">
                                <button onClick={handleAdd} disabled={loading}
                                    className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg py-2.5 font-bold text-sm transition-colors">
                                    {loading ? 'Saving…' : 'Add Super Admin'}
                                </button>
                                <button onClick={() => setShowModal(false)}
                                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg py-2.5 font-medium text-sm border border-slate-700 transition-colors">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
