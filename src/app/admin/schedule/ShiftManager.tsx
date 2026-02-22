'use client';

import { useState, useEffect } from 'react';
import styles from '../admin.module.css';
import { Plus, Trash2, Edit, Save, X, Clock } from 'lucide-react';

interface Shift {
    id: number;
    label: string;
    start_time: string;
    end_time: string;
    color: string;
    organization_id: number;
}

export default function ShiftManager() {
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingShift, setEditingShift] = useState<Shift | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        label: '',
        start_time: '09:00',
        end_time: '17:00',
        color: '#3b82f6'
    });

    useEffect(() => {
        fetchShifts();
    }, []);

    const fetchShifts = async () => {
        try {
            const res = await fetch('/api/admin/schedule/shifts');
            const data = await res.json();
            if (data.shifts) setShifts(data.shifts);
            setLoading(false);
        } catch (e) {
            console.error(e);
            setLoading(false);
        }
    };

    const handleEdit = (shift: Shift) => {
        setEditingShift(shift);
        setFormData({
            label: shift.label,
            start_time: shift.start_time,
            end_time: shift.end_time,
            color: shift.color || '#3b82f6'
        });
        setIsCreating(false);
    };

    const handleCreate = () => {
        setEditingShift(null);
        setFormData({
            label: '',
            start_time: '09:00',
            end_time: '17:00',
            color: '#3b82f6'
        });
        setIsCreating(true);
    };

    const handleSave = async () => {
        if (!formData.label || !formData.start_time || !formData.end_time) return alert('Please fill all fields');

        const payload = { ...formData };
        if (editingShift) {
            // Update
            const res = await fetch('/api/admin/schedule/shifts', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: editingShift.id, ...payload })
            });
            if (res.ok) {
                setEditingShift(null);
                fetchShifts();
            } else {
                alert('Failed to update shift');
            }
        } else {
            // Create
            const res = await fetch('/api/admin/schedule/shifts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                setIsCreating(false);
                fetchShifts();
            } else {
                alert('Failed to create shift');
            }
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this shift? This may affect existing schedules.')) return;

        const res = await fetch('/api/admin/schedule/shifts', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });

        if (res.ok) fetchShifts();
        else alert('Failed to delete shift');
    };

    const handleCancel = () => {
        setEditingShift(null);
        setIsCreating(false);
    };

    if (loading) return <div className="text-white">Loading shifts...</div>;

    return (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-xl font-bold text-white">Shift Definitions</h2>
                    <p className="text-gray-400 text-sm">Define standand shifts to use in the scheduler.</p>
                </div>
                {!isCreating && !editingShift && (
                    <button
                        onClick={handleCreate}
                        className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded font-bold flex items-center gap-2"
                    >
                        <Plus size={18} /> New Shift
                    </button>
                )}
            </div>

            {(isCreating || editingShift) && (
                <div className="bg-gray-900/50 p-4 rounded border border-gray-600 mb-6">
                    <h3 className="text-white font-bold mb-4">{isCreating ? 'Create New Shift' : 'Edit Shift'}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-gray-400 text-sm mb-1">Label</label>
                            <input
                                type="text"
                                value={formData.label}
                                onChange={e => setFormData({ ...formData, label: e.target.value })}
                                className="w-full bg-gray-800 border border-gray-600 rounded p-2 text-white"
                                placeholder="e.g. Morning Shift"
                            />
                        </div>
                        <div>
                            <label className="block text-gray-400 text-sm mb-1">Color</label>
                            <div className="flex gap-2 items-center">
                                <input
                                    type="color"
                                    value={formData.color}
                                    onChange={e => setFormData({ ...formData, color: e.target.value })}
                                    className="h-10 w-20 bg-gray-800 border border-gray-600 rounded"
                                />
                                <span className="text-gray-400 text-sm">{formData.color}</span>
                            </div>
                        </div>
                        <div>
                            <label className="block text-gray-400 text-sm mb-1">Start Time</label>
                            <input
                                type="time"
                                value={formData.start_time}
                                onChange={e => setFormData({ ...formData, start_time: e.target.value })}
                                className="w-full bg-gray-800 border border-gray-600 rounded p-2 text-white"
                            />
                        </div>
                        <div>
                            <label className="block text-gray-400 text-sm mb-1">End Time</label>
                            <input
                                type="time"
                                value={formData.end_time}
                                onChange={e => setFormData({ ...formData, end_time: e.target.value })}
                                className="w-full bg-gray-800 border border-gray-600 rounded p-2 text-white"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3">
                        <button onClick={handleCancel} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
                        <button onClick={handleSave} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded font-bold flex items-center gap-2">
                            <Save size={18} /> Save Shift
                        </button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {shifts.map(shift => (
                    <div key={shift.id} className="bg-gray-900 border border-gray-700 rounded p-4 relative group hover:border-blue-500/50 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-3">
                                <div
                                    className="w-4 h-4 rounded-full"
                                    style={{ backgroundColor: shift.color || '#3b82f6' }}
                                />
                                <h3 className="font-bold text-white text-lg">{shift.label}</h3>
                            </div>
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => handleEdit(shift)} className="text-blue-400 hover:text-blue-300"><Edit size={16} /></button>
                                <button onClick={() => handleDelete(shift.id)} className="text-red-400 hover:text-red-300"><Trash2 size={16} /></button>
                            </div>
                        </div>
                        <div className="text-gray-400 text-sm flex items-center gap-2">
                            <Clock size={14} />
                            {shift.start_time} - {shift.end_time}
                        </div>
                    </div>
                ))}
                {shifts.length === 0 && !isCreating && (
                    <div className="col-span-full text-center py-8 text-gray-500 border-2 border-dashed border-gray-700 rounded">
                        No shifts defined. Create one to get started.
                    </div>
                )}
            </div>
        </div>
    );
}
