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

// Mock data
const MOCK_USERS = [
    { id: '1', name: "John Doe", email: "john@fosters.com", role: 'Super Admin', org: 'System', status: 'Active', joined: 'Oct 2023' },
    { id: '2', name: "Jane Smith", email: "jane@blueparrot.com", role: 'Admin', org: 'The Blue Parrot', status: 'Active', joined: 'Nov 2023' },
    { id: '3', name: "Bob Wilson", email: "bob@saltydog.com", role: 'Manager', org: 'Salty Dog Saloon', status: 'Inactive', joined: 'Jan 2024' },
    { id: '4', name: "Alice Brown", email: "alice@ricks.com", role: 'Staff', org: "Rick's Café", status: 'Active', joined: 'Sep 2023' },
    { id: '5', name: "Charlie Day", email: "charlie@havana.com", role: 'Admin', org: 'Havana Club', status: 'Suspended', joined: 'Aug 2023' },
];

export default function GlobalUsersPage() {
    const [searchTerm, setSearchTerm] = useState('');

    const actions = [
        { label: 'Export Users', variant: 'secondary' as const },
        { label: 'Add User', variant: 'primary' as const, icon: UserPlus },
    ];

    const columns = [
        {
            header: 'User',
            cell: (row: typeof MOCK_USERS[0]) => (
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 font-bold border border-slate-700">
                        {row.name.charAt(0)}
                    </div>
                    <div>
                        <p className="font-medium text-white">{row.name}</p>
                        <p className="text-xs text-slate-500">{row.email}</p>
                    </div>
                </div>
            )
        },
        { header: 'Organization', accessorKey: 'org' as const },
        {
            header: 'Role',
            cell: (row: typeof MOCK_USERS[0]) => (
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${row.role === 'Super Admin' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                        row.role === 'Admin' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                            'bg-slate-500/10 text-slate-400 border-slate-500/20'
                    }`}>
                    {row.role === 'Super Admin' && <Shield className="w-3 h-3" />}
                    {row.role}
                </span>
            )
        },
        {
            header: 'Status',
            cell: (row: typeof MOCK_USERS[0]) => (
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${row.status === 'Active' ? 'text-emerald-400' :
                        row.status === 'Suspended' ? 'text-rose-400' :
                            'text-slate-400'
                    }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${row.status === 'Active' ? 'bg-emerald-400' :
                            row.status === 'Suspended' ? 'bg-rose-400' :
                                'bg-slate-400'
                        }`} />
                    {row.status}
                </span>
            )
        },
        { header: 'Joined', accessorKey: 'joined' as const },
    ];

    const filteredData = MOCK_USERS.filter(user =>
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

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
                    value="1,245"
                    icon={Users}
                    color="blue"
                    trend={{ value: 8, label: 'new this week', positive: true }}
                />
                <StatCard
                    label="Active Admins"
                    value="156"
                    icon={Shield}
                    color="purple"
                    trend={{ value: 2, label: 'vs last month', positive: true }}
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
