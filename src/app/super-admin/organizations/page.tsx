'use client';

import React, { useState, useEffect } from 'react';
import {
    Building2,
    MoreVertical,
    Shield,
    CreditCard,
    ArrowUpRight,
    Search
} from 'lucide-react';
import { AdminPageHeader } from '../components/AdminPageHeader';
import { StatCard } from '../components/StatCard';
import { AdminTable } from '../components/AdminTable';

export default function OrganizationsPage() {
    const [orgs, setOrgs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetch('/api/super-admin/organizations')
            .then(res => res.json())
            .then(data => {
                if (data.organizations) setOrgs(data.organizations);
                setLoading(false);
            });
    }, []);

    const handleUpdate = async (id: number, field: string, value: any) => {
        try {
            await fetch('/api/super-admin/organizations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, [field]: value })
            });
            // Update local
            setOrgs(prev => prev.map(o => o.id === id ? { ...o, [field]: value } : o));
        } catch (e) {
            alert('Update failed');
        }
    };

    const actions = [
        { label: 'Export List', variant: 'secondary' as const },
        { label: 'Add Organization', variant: 'primary' as const },
    ];

    const columns = [
        {
            header: 'Organization',
            cell: (row: any) => (
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 font-bold border border-slate-700">
                        {row.id.toString().substring(0, 2)}
                    </div>
                    <div>
                        <p className="font-medium text-white">{row.name}</p>
                        <p className="text-xs text-slate-500">ID: {row.id}</p>
                    </div>
                </div>
            )
        },
        {
            header: 'Plan',
            cell: (row: any) => (
                <select
                    value={row.subscription_plan || 'base'}
                    onChange={(e) => handleUpdate(row.id, 'subscription_plan', e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                >
                    <option value="base">Base ($200/yr)</option>
                    <option value="pro">Pro ($300/yr)</option>
                    <option value="free_trial">Free Trial</option>
                </select>
            )
        },
        {
            header: 'Billing Status',
            cell: (row: any) => (
                <select
                    value={row.billing_status || 'free'}
                    onChange={(e) => handleUpdate(row.id, 'billing_status', e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                >
                    <option value="free">Free (Lifetime)</option>
                    <option value="active">Active (Billed)</option>
                    <option value="past_due">Past Due</option>
                    <option value="canceled">Canceled</option>
                </select>
            )
        },
        {
            header: 'SMS / Twilio',
            cell: (row: any) => (
                <label className="flex items-center gap-2 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={!!row.sms_enabled}
                        onChange={(e) => handleUpdate(row.id, 'sms_enabled', e.target.checked)}
                    />
                    <span className="text-xs text-slate-300">{row.sms_enabled ? 'On' : 'Off'}</span>
                </label>
            )
        },
        { header: 'Joined', accessorKey: 'created_at' as const },
    ];

    const filteredData = orgs.filter(org =>
        org.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) return <div className="p-8 text-white">Loading...</div>;

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <AdminPageHeader
                title="Organizations"
                subtitle="Manage client accounts and subscriptions"
                icon={Building2}
                actions={actions}
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard
                    label="Total Organizations"
                    value={orgs.length.toString()}
                    icon={Building2}
                    color="blue"
                />
                <StatCard
                    label="Active (Billed)"
                    value={orgs.filter(o => o.billing_status === 'active').length.toString()}
                    icon={CreditCard}
                    color="emerald"
                />
                <StatCard
                    label="SMS Enabled"
                    value={orgs.filter(o => o.sms_enabled).length.toString()}
                    icon={Shield}
                    color="amber"
                />
            </div>

            <AdminTable
                data={filteredData}
                columns={columns}
                keyField="id"
                searchPlaceholder="Search organizations..."
                onSearch={setSearchTerm}
                actions={(item) => (
                    <button className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
                        <MoreVertical className="w-4 h-4" />
                    </button>
                )}
                pagination={{
                    currentPage: 1,
                    totalPages: 1,
                    onPageChange: () => { }
                }}
            />
        </div>
    );
}
