'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import UsersClient from '@/app/admin/users/UsersClient';
import ProductsClient from '@/app/admin/products/ProductsClient';

export default function OrganizationDeepDive() {
    const params = useParams();
    const orgId = parseInt(params.id as string);
    const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'inventory'>('overview');
    const [orgData, setOrgData] = useState<any>(null);

    useEffect(() => {
        // Fetch Org Details (reusing existing API, but might need a specific get-one endpoint or filter list)
        // For efficiency, let's assume valid ID and we can fetch from list or a new endpoint. 
        // Using the list endpoint filter for now.
        fetch('/api/super-admin/organizations')
            .then(res => res.json())
            .then(data => {
                const org = data.organizations.find((o: any) => o.id === orgId);
                setOrgData(org);
            });
    }, [orgId]);

    if (!orgData) return <div className="p-8 text-white">Loading Organization...</div>;

    return (
        <div className="p-8">
            <div className="flex items-center gap-4 mb-8">
                <Link href="/super-admin/organizations" className="text-gray-400 hover:text-white">← Back</Link>
                <h1 className="text-3xl font-bold text-white"><span className="text-gray-500">Org #{orgId}:</span> {orgData.name}</h1>
            </div>

            <div className="flex gap-4 border-b border-gray-700 mb-8">
                <button
                    onClick={() => setActiveTab('overview')}
                    className={`px-4 py-2 font-medium ${activeTab === 'overview' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-white'}`}
                >
                    Overview
                </button>
                <button
                    onClick={() => setActiveTab('users')}
                    className={`px-4 py-2 font-medium ${activeTab === 'users' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-white'}`}
                >
                    Users
                </button>
                <button
                    onClick={() => setActiveTab('inventory')}
                    className={`px-4 py-2 font-medium ${activeTab === 'inventory' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-white'}`}
                >
                    Inventory & Products
                </button>
            </div>

            {activeTab === 'overview' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-white">
                    <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
                        <h3 className="font-bold mb-4 border-b border-gray-700 pb-2">Details</h3>
                        <p className="text-gray-400">Created: {new Date(orgData.created_at).toLocaleDateString()}</p>
                        <p className="text-gray-400">Plan: {orgData.subscription_plan || 'Free'}</p>
                        <p className="text-gray-400">Status: {orgData.subscription_status || 'Active'}</p>
                        <p className="text-gray-400 mt-4">Invoices Pending: {orgData.pending_invoice ? 'Yes' : 'No'}</p>
                    </div>
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
