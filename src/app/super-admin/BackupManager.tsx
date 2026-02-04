'use client';

import { useState, useEffect } from 'react';

export default function BackupManager() {
    const [backups, setBackups] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchBackups = async () => {
        const res = await fetch('/api/super-admin/backups');
        const data = await res.json();
        if (data.backups) setBackups(data.backups);
    };

    useEffect(() => {
        fetchBackups();
    }, []);

    const handleBackup = async () => {
        if (!confirm('Create a new backup now?')) return;
        setLoading(true);
        try {
            const res = await fetch('/api/super-admin/backups', {
                method: 'POST',
                body: JSON.stringify({ action: 'backup' })
            });
            if (res.ok) {
                alert('Backup Created Successfully');
                fetchBackups();
            } else {
                alert('Backup Failed');
            }
        } catch (e) {
            console.error(e);
            alert('Error creating backup');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-gray-800 border border-gray-700 p-6 rounded-xl mt-8">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-white">System Backups</h2>
                <button
                    onClick={handleBackup}
                    disabled={loading}
                    className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors"
                >
                    {loading ? 'Creating...' : '+ Create Backup'}
                </button>
            </div>

            <div className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
                <table className="w-full text-left text-sm text-gray-400">
                    <thead className="bg-gray-800 text-gray-200 uppercase text-xs">
                        <tr>
                            <th className="px-4 py-3">Filename</th>
                            <th className="px-4 py-3">Date Created</th>
                            <th className="px-4 py-3 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {backups.map((b) => (
                            <tr key={b.name} className="hover:bg-gray-800/50">
                                <td className="px-4 py-3 font-mono text-white">{b.name}</td>
                                <td className="px-4 py-3">{new Date(b.created).toLocaleString()}</td>
                                <td className="px-4 py-3 text-right">
                                    <button className="text-blue-400 hover:underline">Download</button>
                                </td>
                            </tr>
                        ))}
                        {backups.length === 0 && (
                            <tr>
                                <td colSpan={3} className="px-4 py-6 text-center italic text-gray-600">
                                    No backups found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            <p className="mt-4 text-xs text-gray-500">
                Backups are stored in <code>/backups</code> volume.
                Automated backups run daily at 4:00 AM UTC.
            </p>
        </div>
    );
}
