'use client';

import React, { useState, useEffect } from 'react';
import { Users, Shield, UserPlus, Mail, Edit, Trash, Power } from 'lucide-react';
import { AdminPageHeader } from '../components/AdminPageHeader';
import { StatCard } from '../components/StatCard';
import { AdminTable } from '../components/AdminTable';

export default function GlobalUsersPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [showModal, setShowModal] = useState(false);
    const [editingUser, setEditingUser] = useState<any>(null);
    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        email: '',
        role: 'user',
        password: '',
        organization_id: ''
    });

    const fetchData = () => {
        setLoading(true);
        fetch('/api/super-admin/users')
            .then(r => r.json())
            .then(d => {
                if (d.users) setUsers(d.users);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleCreateClick = () => {
        setEditingUser(null);
        setFormData({ first_name: '', last_name: '', email: '', role: 'user', password: '', organization_id: '' });
        setShowModal(true);
    };

    const handleEditClick = (user: any) => {
        setEditingUser(user);
        setFormData({
            first_name: user.first_name,
            last_name: user.last_name,
            email: user.email,
            role: user.role,
            password: '',
            organization_id: user.organization_id?.toString() || ''
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        const url = '/api/super-admin/users';
        const method = editingUser ? 'PUT' : 'POST';
        const body = {
            ...formData,
            id: editingUser ? editingUser.id : undefined,
            organization_id: formData.organization_id ? parseInt(formData.organization_id) : null
        };

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (res.ok) {
            setShowModal(false);
            fetchData();
        } else {
            alert('Failed to save user');
        }
    };

    const handleToggleStatus = async (user: any) => {
        await fetch('/api/super-admin/users', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: user.id, is_active: !user.is_active })
        });
        fetchData();
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to archive this user?')) return;
        await fetch('/api/super-admin/users', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        fetchData();
    };

    const actions = [
        { label: 'Export Users', variant: 'secondary' as const },
        { label: 'Add User', variant: 'primary' as const, icon: UserPlus, onClick: handleCreateClick },
    ];

    const columns = [
        {
            header: 'User',
            cell: (row: any) => {
                const fullName = `${row.first_name} ${row.last_name}`;
                return (
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 font-bold border border-slate-700">
                            {row.first_name?.charAt(0) || 'U'}
                        </div>
                        <div>
                            <p className="font-medium text-white">{fullName}</p>
                            <p className="text-xs text-slate-500">{row.email}</p>
                        </div>
                    </div>
                )
            }
        },
        {
            header: 'Organization',
            cell: (row: any) => row.organization_name || 'System Admin'
        },
        {
            header: 'Role',
            cell: (row: any) => (
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${row.role === 'admin' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                        row.role === 'manager' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                            'bg-slate-500/10 text-slate-400 border-slate-500/20'
                    }`}>
                    {row.role === 'admin' && <Shield className="w-3 h-3" />}
                    {row.role}
                </span>
            )
        },
        {
            header: 'Status',
            cell: (row: any) => (
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${row.is_active !== false ? 'text-emerald-400' : 'text-amber-400'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${row.is_active !== false ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                    {row.is_active !== false ? 'Active' : 'Disabled'}
                </span>
            )
        }
    ];

    const filteredData = users.filter(user =>
        (user.first_name + ' ' + user.last_name).toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) return <div className="p-8 max-w-7xl mx-auto space-y-8 text-white font-bold">Connecting to live global database...</div>;

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <AdminPageHeader
                title="Global Users"
                subtitle="Manage user access and permissions across all organizations"
                icon={Users}
                actions={actions}
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard
                    label="Total Users"
                    value={users.length.toString()}
                    icon={Users}
                    color="blue"
                    trend={{ value: 1, label: 'new this week', positive: true }}
                />
                <StatCard
                    label="Active Admins"
                    value={users.filter(u => u.role === 'admin').length.toString()}
                    icon={Shield}
                    color="purple"
                />
                <StatCard
                    label="Pending Invites"
                    value="12"
                    icon={Mail}
                    color="amber"
                />
            </div>

            <AdminTable
                data={filteredData}
                columns={columns}
                keyField="id"
                searchPlaceholder="Search users by name or email..."
                onSearch={setSearchTerm}
                actions={(item) => (
                    <div className="flex gap-2 justify-end">
                        <button onClick={() => handleEditClick(item)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors" title="Edit User">
                            <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleToggleStatus(item)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors" title="Toggle Status">
                            <Power className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(item.id)} className="p-2 hover:bg-red-500/20 rounded-lg text-slate-400 hover:text-red-400 transition-colors" title="Archive User">
                            <Trash className="w-4 h-4" />
                        </button>
                    </div>
                )}
                pagination={{
                    currentPage: 1,
                    totalPages: 1,
                    onPageChange: () => { }
                }}
            />

            {showModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                    <div className="bg-slate-900 border border-slate-700 p-8 rounded-xl w-full max-w-md">
                        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                            <UserPlus className="w-5 h-5 text-blue-400" />
                            {editingUser ? 'Edit Global User' : 'Add Global User'}
                        </h2>
                        
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">First Name</label>
                                    <input type="text" value={formData.first_name} onChange={e => setFormData({...formData, first_name: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Last Name</label>
                                    <input type="text" value={formData.last_name} onChange={e => setFormData({...formData, last_name: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white" />
                                </div>
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Email Address</label>
                                <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white" />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Password {editingUser && '(Leave blank to keep)'}</label>
                                <input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Role</label>
                                    <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white">
                                        <option value="user">User</option>
                                        <option value="manager">Manager</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Organization ID</label>
                                    <input type="number" placeholder="Sys Admin=Blank" value={formData.organization_id} onChange={e => setFormData({...formData, organization_id: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white placeholder-slate-500" />
                                </div>
                            </div>

                            <div className="flex gap-3 pt-6">
                                <button onClick={handleSave} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-2.5 font-medium transition-colors">
                                    Save User
                                </button>
                                <button onClick={() => setShowModal(false)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg py-2.5 font-medium transition-colors border border-slate-700">
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
