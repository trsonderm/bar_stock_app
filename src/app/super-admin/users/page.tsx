'use client';

import React, { useState } from 'react';
import {
    Users,
    MoreVertical,
    Shield,
    UserPlus,
    Search,
    Mail
} from 'lucide-react';
import { AdminPageHeader } from '../components/AdminPageHeader';
import { StatCard } from '../components/StatCard';
import { AdminTable } from '../components/AdminTable';

export default function GlobalUsersPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    React.useEffect(() => {
        fetch('/api/super-admin/users')
            .then(r => r.json())
            .then(d => {
                if(d.users) setUsers(d.users);
                setLoading(false);
            });
    }, []);

    const actions = [
        { label: 'Export Users', variant: 'secondary' as const },
        { label: 'Add User', variant: 'primary' as const, icon: UserPlus },
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
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400`}>
                    <span className={`w-1.5 h-1.5 rounded-full bg-emerald-400`} />
                    Active
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
                    <button className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
                        <MoreVertical className="w-4 h-4" />
                    </button>
                )}
                pagination={{
                    currentPage: 1,
                    totalPages: 5, // Mock
                    onPageChange: () => { }
                }}
            />
        </div>
    );
}
