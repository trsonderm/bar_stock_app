'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import UsersClient from '@/app/admin/users/UsersClient';
import ProductsClient from '@/app/admin/products/ProductsClient';

interface OrgData {
    id: number;
    name: string;
    created_at: string;
    subscription_plan: string;
    billing_status: string;
    sms_enabled: boolean;
    bar_map_enabled: boolean;
    toast_pos_enabled: boolean;
    clover_pos_enabled: boolean;
    pending_invoice?: boolean;
}

type Tab = 'overview' | 'features' | 'users' | 'inventory';

export default function OrganizationDeepDive() {
    const params = useParams();
    const orgId = parseInt(params.id as string);
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const [orgData, setOrgData] = useState<OrgData | null>(null);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');

    useEffect(() => {
        loadOrg();
    }, [orgId]);

    async function loadOrg() {
        const res = await fetch('/api/super-admin/organizations');
        const data = await res.json();
        const org = data.organizations.find((o: any) => o.id === orgId);
        setOrgData(org || null);
    }

    async function toggleFlag(field: string, val: boolean) {
        if (!orgData) return;
        setSaving(true);
        await fetch('/api/super-admin/organizations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: orgId, [field]: val }),
        });
        setOrgData(prev => prev ? { ...prev, [field]: val } : prev);
        setSaving(false);
        setMsg(`${field.replace(/_/g, ' ')} updated.`);
        setTimeout(() => setMsg(''), 2500);
    }

    if (!orgData) return <div className="p-8 text-white">Loading Organization…</div>;

    const tabs: { id: Tab; label: string }[] = [
        { id: 'overview', label: 'Overview' },
        { id: 'features', label: 'Features' },
        { id: 'users', label: 'Users' },
        { id: 'inventory', label: 'Inventory & Products' },
    ];

    const Toggle = ({ label, description, field, value }: { label: string; description: string; field: string; value: boolean }) => (
        <div className="flex items-center justify-between py-4 border-b border-gray-700 last:border-0">
            <div>
                <p className="text-white font-medium text-sm">{label}</p>
                <p className="text-gray-400 text-xs mt-0.5">{description}</p>
            </div>
            <button
                type="button"
                title={`${value ? 'Disable' : 'Enable'} ${label}`}
                disabled={saving}
                onClick={() => toggleFlag(field, !value)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${value ? 'bg-blue-600' : 'bg-gray-600'}`}
            >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
        </div>
    );

    return (
        <div className="p-8">
            <div className="flex items-center gap-4 mb-8">
                <Link href="/super-admin/organizations" className="text-gray-400 hover:text-white">← Back</Link>
                <h1 className="text-3xl font-bold text-white">
                    <span className="text-gray-500">Org #{orgId}:</span> {orgData.name}
                </h1>
            </div>

            {msg && (
                <div className="mb-4 px-4 py-2.5 bg-green-900/30 border border-green-700/50 text-green-300 rounded-lg text-sm">{msg}</div>
            )}

            <div className="flex gap-4 border-b border-gray-700 mb-8">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2 font-medium ${activeTab === tab.id ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-white'}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'overview' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-white">
                    <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
                        <h3 className="font-bold mb-4 border-b border-gray-700 pb-2">Details</h3>
                        <p className="text-gray-400">Created: {new Date(orgData.created_at).toLocaleDateString()}</p>
                        <p className="text-gray-400">Plan: {orgData.subscription_plan || 'Free'}</p>
                        <p className="text-gray-400">Status: {orgData.billing_status || 'Active'}</p>
                        <p className="text-gray-400 mt-4">Invoices Pending: {orgData.pending_invoice ? 'Yes' : 'No'}</p>
                    </div>
                </div>
            )}

            {activeTab === 'features' && (
                <div className="max-w-xl">
                    <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
                        <h3 className="text-white font-bold mb-1">Feature Access</h3>
                        <p className="text-gray-400 text-sm mb-5">Enable or disable specific features for this organization.</p>

                        <Toggle
                            label="Bar Map"
                            description="Access to the interactive visual bar layout editor"
                            field="bar_map_enabled"
                            value={!!orgData.bar_map_enabled}
                        />
                        <Toggle
                            label="Toast POS Integration"
                            description="Allow this org to sync transaction data from Toast POS"
                            field="toast_pos_enabled"
                            value={!!orgData.toast_pos_enabled}
                        />
                        <Toggle
                            label="Clover POS Integration"
                            description="Allow this org to sync transaction data from Clover POS"
                            field="clover_pos_enabled"
                            value={!!orgData.clover_pos_enabled}
                        />
                        <Toggle
                            label="SMS Notifications"
                            description="Allow this org to send SMS alerts"
                            field="sms_enabled"
                            value={!!orgData.sms_enabled}
                        />
                    </div>

                    <p className="text-gray-500 text-xs mt-3">
                        Note: POS features also require global POS credentials to be configured under Super Admin → Toast/Clover POS.
                        The POS global enable toggle (<Link href="/super-admin/pos" className="text-blue-400 hover:underline">POS Overview</Link>) overrides per-org settings when on.
                    </p>
                </div>
            )}

            {activeTab === 'users' && (
                <div>
                    <div className="bg-yellow-900/20 border border-yellow-700 text-yellow-200 p-4 rounded mb-4">
                        ⚠️ You are editing <b>{orgData.name}</b> users as Super Admin.
                    </div>
                    <UsersClient overrideOrgId={orgId} />
                </div>
            )}

            {activeTab === 'inventory' && (
                <div>
                    <div className="bg-yellow-900/20 border border-yellow-700 text-yellow-200 p-4 rounded mb-4">
                        ⚠️ You are editing <b>{orgData.name}</b> inventory as Super Admin.
                    </div>
                    <ProductsClient overrideOrgId={orgId} />
                </div>
            )}
        </div>
    );
}
