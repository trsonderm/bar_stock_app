'use client';

import { useState, useEffect } from 'react';

// ── Endpoint catalog ──────────────────────────────────────────────────────────

const BASE = typeof window !== 'undefined' ? window.location.origin : '';

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

interface Endpoint {
    group: string;
    method: Method;
    path: string;
    description: string;
    scopes: string[];
    params?: { name: string; in: 'query' | 'body' | 'path'; type: string; required: boolean; description: string }[];
    body?: string;
    response?: string;
}

const ENDPOINTS: Endpoint[] = [
    // ── INVENTORY ──────────────────────────────────────────────────────────────
    {
        group: 'Inventory',
        method: 'GET', path: '/api/v1/inventory',
        description: 'List all inventory items with current stock quantities. Supports pagination, filtering, and sorting.',
        scopes: ['inventory:read'],
        params: [
            { name: 'location_id', in: 'query', type: 'integer', required: false, description: 'Scope quantities to a specific location' },
            { name: 'category', in: 'query', type: 'string', required: false, description: 'Filter by category name' },
            { name: 'low_stock', in: 'query', type: 'boolean', required: false, description: 'If true, return only items at or below threshold' },
            { name: 'limit', in: 'query', type: 'integer', required: false, description: 'Page size (default 100, max 500)' },
            { name: 'offset', in: 'query', type: 'integer', required: false, description: 'Page offset (default 0)' },
            { name: 'sort', in: 'query', type: 'string', required: false, description: '"name" | "quantity" | "type" (default: name)' },
        ],
        response: `{ "data": [{ "id": 1, "name": "Vodka", "category": "Spirits", "quantity": 24.5, "low_stock_threshold": 10 }], "meta": { "total": 142, "limit": 100, "offset": 0 } }`,
    },
    {
        group: 'Inventory',
        method: 'GET', path: '/api/v1/inventory/{itemId}',
        description: 'Get a single item with quantity breakdown across every location.',
        scopes: ['inventory:read'],
        params: [
            { name: 'itemId', in: 'path', type: 'integer', required: true, description: 'Item ID' },
        ],
        response: `{ "data": { "id": 1, "name": "Vodka", "category": "Spirits", "total_quantity": 48, "quantities": [{ "location_id": 1, "location_name": "Main Bar", "quantity": 24 }] } }`,
    },
    {
        group: 'Inventory',
        method: 'PUT', path: '/api/v1/inventory/{itemId}',
        description: 'Update item metadata — name, category, supplier, costs, or low stock threshold.',
        scopes: ['inventory:write'],
        params: [{ name: 'itemId', in: 'path', type: 'integer', required: true, description: 'Item ID' }],
        body: `{\n  "name": "Premium Vodka",\n  "category": "Spirits",\n  "supplier": "Distributor Co",\n  "unit_cost": 22.50,\n  "low_stock_threshold": 12\n}`,
        response: `{ "data": { "id": 1, "updated": true } }`,
    },
    {
        group: 'Inventory',
        method: 'DELETE', path: '/api/v1/inventory/{itemId}',
        description: 'Permanently delete an item and all its inventory records.',
        scopes: ['inventory:write'],
        params: [{ name: 'itemId', in: 'path', type: 'integer', required: true, description: 'Item ID' }],
        response: `{ "data": { "id": 1, "deleted": true } }`,
    },
    {
        group: 'Inventory',
        method: 'POST', path: '/api/v1/inventory/adjust',
        description: 'Add or subtract stock. Positive change = add, negative = subtract. Quantity never goes below 0.',
        scopes: ['inventory:write'],
        body: `{\n  "item_id": 1,\n  "change": -2,\n  "location_id": 1,\n  "note": "Broken bottle"\n}`,
        response: `{ "data": { "item_id": 1, "item_name": "Vodka", "location_id": 1, "change": -2, "quantity_after": 22.5 } }`,
    },
    {
        group: 'Inventory',
        method: 'POST', path: '/api/v1/inventory/transfer',
        description: 'Move stock between locations. Fails if source location has insufficient quantity.',
        scopes: ['inventory:write'],
        body: `{\n  "item_id": 1,\n  "from_location_id": 1,\n  "to_location_id": 2,\n  "quantity": 6,\n  "note": "Restock upstairs"\n}`,
        response: `{ "data": { "item_id": 1, "quantity_transferred": 6 } }`,
    },
    {
        group: 'Inventory',
        method: 'GET', path: '/api/v1/inventory/low-stock',
        description: 'Return items currently at or below their configured low-stock threshold, with deficit amount.',
        scopes: ['inventory:read'],
        params: [
            { name: 'location_id', in: 'query', type: 'integer', required: false, description: 'Scope to a specific location' },
            { name: 'limit', in: 'query', type: 'integer', required: false, description: 'Page size (default 100)' },
            { name: 'offset', in: 'query', type: 'integer', required: false, description: 'Page offset' },
        ],
        response: `{ "data": [{ "id": 5, "name": "Gin", "quantity": 2, "low_stock_threshold": 10, "deficit": 8 }], "meta": { "total": 12 } }`,
    },
    // ── LOCATIONS ─────────────────────────────────────────────────────────────
    {
        group: 'Locations',
        method: 'GET', path: '/api/v1/locations',
        description: 'List all locations configured for the organization.',
        scopes: ['locations:read'],
        response: `{ "data": [{ "id": 1, "name": "Main Bar", "address": "123 Main St" }] }`,
    },
    // ── CATEGORIES ────────────────────────────────────────────────────────────
    {
        group: 'Categories',
        method: 'GET', path: '/api/v1/categories',
        description: 'List all item categories.',
        scopes: ['categories:read'],
        params: [
            { name: 'include_counts', in: 'query', type: 'boolean', required: false, description: 'Include item count per category' },
        ],
        response: `{ "data": [{ "id": 1, "name": "Spirits", "item_count": 42 }] }`,
    },
    // ── ORDERS ────────────────────────────────────────────────────────────────
    {
        group: 'Orders',
        method: 'GET', path: '/api/v1/orders',
        description: 'List purchase orders. Optionally filter by status.',
        scopes: ['orders:read'],
        params: [
            { name: 'status', in: 'query', type: 'string', required: false, description: '"PENDING" | "DELIVERED" | "CANCELLED" | "all" (default: all)' },
            { name: 'limit', in: 'query', type: 'integer', required: false, description: 'Page size (default 50, max 200)' },
            { name: 'offset', in: 'query', type: 'integer', required: false, description: 'Page offset' },
        ],
        response: `{ "data": [{ "id": 1, "status": "PENDING", "location_name": "Main Bar", "item_count": 4 }] }`,
    },
    {
        group: 'Orders',
        method: 'POST', path: '/api/v1/orders',
        description: 'Create a new purchase order.',
        scopes: ['orders:write'],
        body: `{\n  "location_id": 1,\n  "expected_delivery": "2026-05-15",\n  "notes": "Weekly restock",\n  "items": [\n    { "item_id": 1, "quantity": 12, "unit_cost": 22.50 },\n    { "item_id": 5, "quantity": 6 }\n  ]\n}`,
        response: `{ "data": { "id": 42, "status": "PENDING", "items": [{ "item_id": 1, "quantity": 12 }] } }`,
    },
    {
        group: 'Orders',
        method: 'GET', path: '/api/v1/orders/{id}',
        description: 'Get a single order with all line items.',
        scopes: ['orders:read'],
        params: [{ name: 'id', in: 'path', type: 'integer', required: true, description: 'Order ID' }],
        response: `{ "data": { "id": 42, "status": "PENDING", "items": [{ "item_id": 1, "item_name": "Vodka", "quantity": 12 }] } }`,
    },
    {
        group: 'Orders',
        method: 'PUT', path: '/api/v1/orders/{id}',
        description: 'Update order status or notes.',
        scopes: ['orders:write'],
        params: [{ name: 'id', in: 'path', type: 'integer', required: true, description: 'Order ID' }],
        body: `{\n  "status": "DELIVERED",\n  "notes": "All items received"\n}`,
        response: `{ "data": { "id": 42, "updated": true } }`,
    },
    {
        group: 'Orders',
        method: 'DELETE', path: '/api/v1/orders/{id}',
        description: 'Delete a PENDING order. Cannot delete delivered or cancelled orders.',
        scopes: ['orders:write'],
        params: [{ name: 'id', in: 'path', type: 'integer', required: true, description: 'Order ID' }],
        response: `{ "data": { "id": 42, "deleted": true } }`,
    },
    // ── AUDITS ────────────────────────────────────────────────────────────────
    {
        group: 'Audits',
        method: 'GET', path: '/api/v1/audits',
        description: 'List audit sessions grouped by auditor and timestamp.',
        scopes: ['audits:read'],
        params: [
            { name: 'limit', in: 'query', type: 'integer', required: false, description: 'Page size (default 50)' },
            { name: 'offset', in: 'query', type: 'integer', required: false, description: 'Page offset' },
        ],
        response: `{ "data": [{ "auditor_name": "Jane Smith", "audited_at": "2026-05-09T14:00:00Z", "item_count": 18 }] }`,
    },
    {
        group: 'Audits',
        method: 'POST', path: '/api/v1/audits',
        description: 'Submit an audit — set the exact (actual) quantities for items at a location. Variance is calculated automatically.',
        scopes: ['audits:write'],
        body: `{\n  "location_id": 1,\n  "label": "Weekly count",\n  "items": [\n    { "item_id": 1, "actual_quantity": 22, "note": "2 broken" },\n    { "item_id": 5, "actual_quantity": 8 }\n  ]\n}`,
        response: `{ "data": { "items_audited": 2, "items": [{ "item_name": "Vodka", "previous_quantity": 24, "actual_quantity": 22, "variance": -2 }] } }`,
    },
];

const GROUPS = [...new Set(ENDPOINTS.map(e => e.group))];

const METHOD_COLORS: Record<Method, string> = {
    GET: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    POST: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    PUT: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    DELETE: 'bg-red-500/15 text-red-400 border-red-500/30',
};

// ── Key management ────────────────────────────────────────────────────────────

interface ApiKey { id: number; name: string; prefix: string; scopes: string[]; is_active: boolean; last_used_at: string | null; created_at: string }

const ALL_SCOPES = ['inventory:read', 'inventory:write', 'orders:read', 'orders:write', 'audits:read', 'audits:write', 'locations:read', 'categories:read'];

// ── Component ─────────────────────────────────────────────────────────────────

export default function DeveloperClient() {
    const [tab, setTab] = useState<'keys' | 'docs'>('docs');
    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(Object.fromEntries(GROUPS.map(g => [g, true])));
    const [expandedPath, setExpandedPath] = useState<string | null>(null);

    // Key management
    const [keys, setKeys] = useState<ApiKey[]>([]);
    const [newKeyName, setNewKeyName] = useState('');
    const [newKeyScopes, setNewKeyScopes] = useState<string[]>(['*']);
    const [createdKey, setCreatedKey] = useState<string | null>(null);
    const [keyLoading, setKeyLoading] = useState(false);
    const [keyCopied, setKeyCopied] = useState(false);

    const fetchKeys = async () => {
        const r = await fetch('/api/admin/api-keys');
        if (r.ok) { const d = await r.json(); setKeys(d.keys || []); }
    };

    useEffect(() => { fetchKeys(); }, []);

    const createKey = async () => {
        if (!newKeyName.trim()) return;
        setKeyLoading(true);
        const scopes = newKeyScopes.includes('*') ? ['*'] : newKeyScopes;
        const r = await fetch('/api/admin/api-keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newKeyName.trim(), scopes }),
        });
        const d = await r.json();
        if (r.ok) {
            setCreatedKey(d.key.full_key);
            setNewKeyName('');
            setNewKeyScopes(['*']);
            fetchKeys();
        }
        setKeyLoading(false);
    };

    const revokeKey = async (id: number) => {
        if (!confirm('Revoke this API key? This cannot be undone.')) return;
        await fetch('/api/admin/api-keys', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
        fetchKeys();
    };

    const copyKey = () => {
        if (createdKey) { navigator.clipboard.writeText(createdKey); setKeyCopied(true); setTimeout(() => setKeyCopied(false), 2000); }
    };

    const toggleScope = (s: string) => {
        if (s === '*') { setNewKeyScopes(['*']); return; }
        setNewKeyScopes(prev => {
            const next = prev.filter(x => x !== '*');
            return next.includes(s) ? next.filter(x => x !== s) : [...next, s];
        });
    };

    return (
        <div className="min-h-screen bg-gray-950 text-gray-100">
            {/* Header */}
            <div className="border-b border-gray-800 bg-gray-950 sticky top-0 z-10">
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-bold text-white">TopShelf Developer API</h1>
                        <p className="text-sm text-gray-500 mt-0.5">REST API v1 · Bearer token authentication</p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setTab('docs')} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'docs' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}>Documentation</button>
                        <button onClick={() => setTab('keys')} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'keys' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}>API Keys</button>
                    </div>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-6 py-8">
                {tab === 'keys' ? (
                    // ── API Keys tab ──────────────────────────────────────────
                    <div className="max-w-2xl">
                        <h2 className="text-lg font-semibold text-white mb-1">API Keys</h2>
                        <p className="text-sm text-gray-400 mb-6">Keys grant programmatic access to the v1 API. Each key belongs to your organization. Store the full key immediately — it is shown only once.</p>

                        {/* New key created banner */}
                        {createdKey && (
                            <div className="mb-6 bg-emerald-950 border border-emerald-700 rounded-xl p-5">
                                <div className="text-emerald-400 font-semibold text-sm mb-2">✓ API key created — copy it now, it won't be shown again</div>
                                <div className="flex items-center gap-3 bg-gray-900 rounded-lg px-4 py-3 font-mono text-sm text-emerald-300 break-all">
                                    <span className="flex-1">{createdKey}</span>
                                    <button onClick={copyKey} className="shrink-0 bg-gray-700 hover:bg-gray-600 text-gray-200 px-3 py-1 rounded-md text-xs font-medium">{keyCopied ? 'Copied!' : 'Copy'}</button>
                                </div>
                                <button onClick={() => setCreatedKey(null)} className="mt-3 text-xs text-gray-500 hover:text-gray-300">Dismiss</button>
                            </div>
                        )}

                        {/* Create form */}
                        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
                            <div className="text-sm font-semibold text-gray-200 mb-4">Create New API Key</div>
                            <input
                                value={newKeyName}
                                onChange={e => setNewKeyName(e.target.value)}
                                placeholder="Key name (e.g. Mobile App, POS Integration)"
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500 mb-4"
                            />
                            <div className="text-xs text-gray-400 mb-2 font-medium">Scopes</div>
                            <div className="flex flex-wrap gap-2 mb-4">
                                <button onClick={() => setNewKeyScopes(['*'])} className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${newKeyScopes.includes('*') ? 'bg-purple-600/20 border-purple-500 text-purple-300' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>Full Access (*)</button>
                                {ALL_SCOPES.map(s => (
                                    <button key={s} onClick={() => toggleScope(s)} disabled={newKeyScopes.includes('*')} className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${newKeyScopes.includes(s) && !newKeyScopes.includes('*') ? 'bg-blue-600/20 border-blue-500 text-blue-300' : 'border-gray-700 text-gray-500 hover:border-gray-500 disabled:opacity-40'}`}>{s}</button>
                                ))}
                            </div>
                            <button onClick={createKey} disabled={keyLoading || !newKeyName.trim()} className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
                                {keyLoading ? 'Creating…' : 'Create Key'}
                            </button>
                        </div>

                        {/* Existing keys */}
                        <div className="space-y-3">
                            {keys.map(k => (
                                <div key={k.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-start gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium text-white text-sm">{k.name}</div>
                                        <div className="font-mono text-xs text-gray-500 mt-0.5">{k.prefix}••••••••</div>
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {k.scopes.map(s => <span key={s} className="px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 text-xs">{s}</span>)}
                                        </div>
                                        <div className="text-xs text-gray-600 mt-2">
                                            Created {new Date(k.created_at).toLocaleDateString()} · {k.last_used_at ? `Last used ${new Date(k.last_used_at).toLocaleDateString()}` : 'Never used'}
                                        </div>
                                    </div>
                                    <button onClick={() => revokeKey(k.id)} className="shrink-0 text-xs text-red-400 hover:text-red-300 border border-red-900 hover:border-red-700 px-3 py-1 rounded-lg transition-colors">Revoke</button>
                                </div>
                            ))}
                            {keys.length === 0 && <div className="text-center text-gray-600 py-8 text-sm">No API keys yet</div>}
                        </div>
                    </div>
                ) : (
                    // ── Docs tab ──────────────────────────────────────────────
                    <div className="flex gap-8">
                        {/* Sidebar nav */}
                        <div className="w-44 shrink-0 hidden lg:block">
                            <div className="sticky top-24 space-y-1">
                                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Authentication</div>
                                <a href="#auth" className="block text-sm text-gray-400 hover:text-gray-200 py-0.5">Getting Started</a>
                                <a href="#errors" className="block text-sm text-gray-400 hover:text-gray-200 py-0.5 mb-4">Errors</a>
                                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 mt-4">Endpoints</div>
                                {GROUPS.map(g => <a key={g} href={`#${g.toLowerCase()}`} className="block text-sm text-gray-400 hover:text-gray-200 py-0.5">{g}</a>)}
                            </div>
                        </div>

                        {/* Main content */}
                        <div className="flex-1 min-w-0 space-y-10">

                            {/* Auth */}
                            <section id="auth">
                                <h2 className="text-lg font-bold text-white mb-4">Authentication</h2>
                                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
                                    <p className="text-sm text-gray-300">All requests must include an <code className="text-blue-400 bg-gray-800 px-1.5 py-0.5 rounded text-xs">Authorization</code> header with a Bearer API key. Keys are created in the <button onClick={() => setTab('keys')} className="text-blue-400 underline underline-offset-2">API Keys</button> tab.</p>
                                    <div>
                                        <div className="text-xs text-gray-500 mb-1.5 font-medium">Request header</div>
                                        <pre className="bg-gray-950 border border-gray-800 rounded-lg p-4 text-sm text-emerald-300 overflow-x-auto">Authorization: Bearer tsk_live_••••••••••••••••••••••••••••••••</pre>
                                    </div>
                                    <div>
                                        <div className="text-xs text-gray-500 mb-1.5 font-medium">Example curl request</div>
                                        <pre className="bg-gray-950 border border-gray-800 rounded-lg p-4 text-sm text-gray-300 overflow-x-auto">{`curl -H "Authorization: Bearer YOUR_KEY" \\\n     "${BASE}/api/v1/inventory"`}</pre>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 pt-2 text-sm">
                                        <div className="bg-gray-950 border border-gray-800 rounded-lg p-4">
                                            <div className="text-gray-400 font-medium mb-1">Base URL</div>
                                            <code className="text-blue-300 text-xs">{BASE}/api/v1</code>
                                        </div>
                                        <div className="bg-gray-950 border border-gray-800 rounded-lg p-4">
                                            <div className="text-gray-400 font-medium mb-1">Content-Type</div>
                                            <code className="text-blue-300 text-xs">application/json</code>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* Scopes */}
                            <section>
                                <h2 className="text-lg font-bold text-white mb-4">Scopes</h2>
                                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead><tr className="border-b border-gray-800"><th className="text-left px-5 py-3 text-gray-400 font-medium text-xs uppercase">Scope</th><th className="text-left px-5 py-3 text-gray-400 font-medium text-xs uppercase">Access</th></tr></thead>
                                        <tbody>
                                            {[
                                                ['*', 'Full access to all endpoints'],
                                                ['inventory:read', 'List items, get item details, low-stock report'],
                                                ['inventory:write', 'Adjust stock, transfer, update/delete items'],
                                                ['orders:read', 'List and view purchase orders'],
                                                ['orders:write', 'Create, update, and delete purchase orders'],
                                                ['audits:read', 'View audit history'],
                                                ['audits:write', 'Submit inventory audits'],
                                                ['locations:read', 'List locations'],
                                                ['categories:read', 'List categories'],
                                            ].map(([scope, desc]) => (
                                                <tr key={scope} className="border-b border-gray-800/50 last:border-0">
                                                    <td className="px-5 py-3 font-mono text-xs text-purple-300">{scope}</td>
                                                    <td className="px-5 py-3 text-gray-400 text-xs">{desc}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>

                            {/* Errors */}
                            <section id="errors">
                                <h2 className="text-lg font-bold text-white mb-4">Error Responses</h2>
                                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
                                    <p className="text-sm text-gray-400">All errors return a consistent structure. HTTP status codes follow REST conventions.</p>
                                    <pre className="bg-gray-950 border border-gray-800 rounded-lg p-4 text-sm text-red-300 overflow-x-auto">{`{
  "error": {
    "code": "NOT_FOUND",
    "message": "Item not found."
  },
  "meta": { "api_version": "v1", "request_id": "a3f8b2c1", "timestamp": "2026-05-09T14:00:00Z" }
}`}</pre>
                                    <div className="grid grid-cols-2 gap-3 text-xs">
                                        {[
                                            ['401', 'UNAUTHORIZED', 'Missing or invalid API key'],
                                            ['403', 'FORBIDDEN', 'Key lacks required scope'],
                                            ['400', 'BAD_REQUEST', 'Invalid parameters or body'],
                                            ['404', 'NOT_FOUND', 'Resource does not exist'],
                                            ['500', 'INTERNAL_ERROR', 'Server-side error'],
                                        ].map(([code, name, desc]) => (
                                            <div key={code} className="bg-gray-950 border border-gray-800 rounded-lg p-3">
                                                <div className="flex items-center gap-2 mb-1"><span className="text-red-400 font-bold">{code}</span><span className="font-mono text-gray-400">{name}</span></div>
                                                <div className="text-gray-500">{desc}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </section>

                            {/* Endpoint groups */}
                            {GROUPS.map(group => (
                                <section key={group} id={group.toLowerCase()}>
                                    <button
                                        onClick={() => setOpenGroups(g => ({ ...g, [group]: !g[group] }))}
                                        className="flex items-center gap-3 mb-4 w-full text-left"
                                    >
                                        <h2 className="text-lg font-bold text-white">{group}</h2>
                                        <span className="text-gray-600 text-xs">{openGroups[group] ? '▲' : '▼'}</span>
                                    </button>

                                    {openGroups[group] && (
                                        <div className="space-y-3">
                                            {ENDPOINTS.filter(e => e.group === group).map(ep => {
                                                const key = ep.method + ep.path;
                                                const isOpen = expandedPath === key;
                                                return (
                                                    <div key={key} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                                                        {/* Collapsed row */}
                                                        <button
                                                            onClick={() => setExpandedPath(isOpen ? null : key)}
                                                            className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-800/50 transition-colors text-left"
                                                        >
                                                            <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded border font-mono ${METHOD_COLORS[ep.method]}`}>{ep.method}</span>
                                                            <code className="text-gray-200 text-sm font-mono">{ep.path}</code>
                                                            <span className="text-gray-500 text-sm flex-1 hidden md:block">{ep.description}</span>
                                                            <span className="text-gray-600 text-xs shrink-0">{isOpen ? '▲' : '▼'}</span>
                                                        </button>

                                                        {/* Expanded detail */}
                                                        {isOpen && (
                                                            <div className="border-t border-gray-800 px-5 py-5 space-y-5">
                                                                <p className="text-sm text-gray-300">{ep.description}</p>

                                                                {/* Required scopes */}
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-xs text-gray-500 font-medium">Required scope:</span>
                                                                    {ep.scopes.map(s => <span key={s} className="px-2 py-0.5 rounded-full bg-purple-900/40 border border-purple-700/40 text-purple-300 text-xs font-mono">{s}</span>)}
                                                                </div>

                                                                {/* Parameters */}
                                                                {ep.params && ep.params.length > 0 && (
                                                                    <div>
                                                                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Parameters</div>
                                                                        <div className="bg-gray-950 border border-gray-800 rounded-lg overflow-hidden">
                                                                            <table className="w-full text-xs">
                                                                                <thead><tr className="border-b border-gray-800"><th className="text-left px-4 py-2 text-gray-500">Name</th><th className="text-left px-4 py-2 text-gray-500">In</th><th className="text-left px-4 py-2 text-gray-500">Type</th><th className="text-left px-4 py-2 text-gray-500">Required</th><th className="text-left px-4 py-2 text-gray-500">Description</th></tr></thead>
                                                                                <tbody>
                                                                                    {ep.params.map(p => (
                                                                                        <tr key={p.name} className="border-b border-gray-800/50 last:border-0">
                                                                                            <td className="px-4 py-2.5 font-mono text-blue-300">{p.name}</td>
                                                                                            <td className="px-4 py-2.5 text-gray-500">{p.in}</td>
                                                                                            <td className="px-4 py-2.5 text-amber-400">{p.type}</td>
                                                                                            <td className="px-4 py-2.5">{p.required ? <span className="text-red-400">required</span> : <span className="text-gray-600">optional</span>}</td>
                                                                                            <td className="px-4 py-2.5 text-gray-400">{p.description}</td>
                                                                                        </tr>
                                                                                    ))}
                                                                                </tbody>
                                                                            </table>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Request body */}
                                                                {ep.body && (
                                                                    <div>
                                                                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Request Body</div>
                                                                        <pre className="bg-gray-950 border border-gray-800 rounded-lg p-4 text-sm text-blue-200 overflow-x-auto">{ep.body}</pre>
                                                                    </div>
                                                                )}

                                                                {/* Response example */}
                                                                {ep.response && (
                                                                    <div>
                                                                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Response Example</div>
                                                                        <pre className="bg-gray-950 border border-gray-800 rounded-lg p-4 text-sm text-emerald-300 overflow-x-auto">{ep.response}</pre>
                                                                    </div>
                                                                )}

                                                                {/* curl example */}
                                                                <div>
                                                                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">curl Example</div>
                                                                    <pre className="bg-gray-950 border border-gray-800 rounded-lg p-4 text-sm text-gray-300 overflow-x-auto">{buildCurl(ep)}</pre>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </section>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function buildCurl(ep: Endpoint): string {
    const url = `${BASE}${ep.path.replace('{itemId}', '1').replace('{id}', '1')}`;
    const lines = [`curl -X ${ep.method} \\`, `     -H "Authorization: Bearer YOUR_KEY" \\`];
    if (ep.body) lines.push(`     -H "Content-Type: application/json" \\`, `     -d '${ep.body.replace(/\n/g, ' ').replace(/\s+/g, ' ')}' \\`);
    lines.push(`     "${url}"`);
    return lines.join('\n');
}
