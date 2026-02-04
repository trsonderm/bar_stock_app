'use client';

import { useState, useEffect } from 'react';

export default function GlobalSettings() {
    const [config, setConfig] = useState({ billing_enabled: false, maintenance_mode: false, quick_login_enabled: true });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetch('/api/super-admin/settings')
            .then(res => res.json())
            .then(data => {
                if (data.config) {
                    setConfig({
                        billing_enabled: data.config.billing_enabled === 'true',
                        maintenance_mode: data.config.maintenance_mode === 'true',
                        quick_login_enabled: data.config.quick_login_enabled === 'true'
                    });
                }
            });
    }, []);

    const handleSave = async () => {
        setLoading(true);
        await fetch('/api/super-admin/settings', {
            method: 'POST',
            body: JSON.stringify(config)
        });
        setLoading(false);
        alert('Settings Saved');
    };

    return (
        <div className="bg-gray-800 border border-gray-700 p-6 rounded-xl mt-8">
            <h2 className="text-xl font-bold text-white mb-4">Global Configuration</h2>
            <div className="flex gap-8">
                <label className="flex items-center gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={config.billing_enabled}
                        onChange={e => setConfig({ ...config, billing_enabled: e.target.checked })}
                        className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-blue-600"
                    />
                    <span className="text-gray-300">Enable Billing System</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={config.maintenance_mode}
                        onChange={e => setConfig({ ...config, maintenance_mode: e.target.checked })}
                        className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-red-600"
                    />
                    <span className="text-gray-300">Maintenance Mode</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={(config as any).quick_login_enabled}
                        onChange={e => setConfig({ ...config, quick_login_enabled: e.target.checked } as any)}
                        className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-amber-500"
                    />
                    <span className="text-gray-300">Quick Login Shortcuts</span>
                </label>
            </div>
            <button
                onClick={handleSave}
                disabled={loading}
                className="mt-6 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium"
            >
                {loading ? 'Saving...' : 'Save Configuration'}
            </button>
        </div>
    );
}
