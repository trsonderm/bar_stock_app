'use client';
import { useState, useEffect } from 'react';

export default function NotificationSettings() {
    const [prefs, setPrefs] = useState({ price_changes: true, stock_changes: true, system: true });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/user/preferences')
            .then(res => res.json())
            .then(data => {
                if (data.preferences) setPrefs(data.preferences);
                setLoading(false);
            });
    }, []);

    const handleChange = async (key: string, val: boolean) => {
        const newPrefs = { ...prefs, [key]: val };
        setPrefs(newPrefs);
        await fetch('/api/user/preferences', {
            method: 'POST',
            body: JSON.stringify(newPrefs)
        });
    };

    if (loading) return <div>Loading preferences...</div>;

    return (
        <div className="bg-gray-800 border border-gray-700 p-6 rounded-xl mt-6">
            <h3 className="text-lg font-bold text-white mb-4">Notification Preferences</h3>
            <div className="space-y-4">
                <label className="flex items-center gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={prefs.price_changes}
                        onChange={e => handleChange('price_changes', e.target.checked)}
                        className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-amber-500"
                    />
                    <span className="text-gray-300">Price Changes</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={prefs.stock_changes}
                        onChange={e => handleChange('stock_changes', e.target.checked)}
                        className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-amber-500"
                    />
                    <span className="text-gray-300">Stock/Quantity Changes</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={prefs.system}
                        onChange={e => handleChange('system', e.target.checked)}
                        className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-amber-500"
                    />
                    <span className="text-gray-300">System Alerts</span>
                </label>
            </div>
        </div>
    );
}
