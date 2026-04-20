'use client';

import { useState, useEffect } from 'react';
import styles from '../admin.module.css';
import { Plus, Trash2, Edit, Save, X, Clock, Settings, MapPin } from 'lucide-react';

interface Shift {
    id: number;
    label: string;
    start_time: string;
    end_time: string;
    color: string;
    organization_id: number;
    location_id?: number | null;
}

interface Location {
    id: number;
    name: string;
}

interface LocationHours {
    workdayStart: string;
    workdayEnd: string;
}

interface ScheduleSettings {
    globalMode: boolean;
    locationHours: Record<number, LocationHours>;
    locations: Location[];
}

interface Props {
    scheduleSettings: ScheduleSettings;
    onSettingsChange: (s: ScheduleSettings) => void;
}

export default function ShiftManager({ scheduleSettings, onSettingsChange }: Props) {
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingShift, setEditingShift] = useState<Shift | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [settingsTab, setSettingsTab] = useState<'shifts' | 'settings'>('shifts');
    const [savingSettings, setSavingSettings] = useState(false);
    const [settingsSaved, setSettingsSaved] = useState(false);

    const [formData, setFormData] = useState({
        label: '',
        start_time: '09:00',
        end_time: '17:00',
        color: '#3b82f6',
        location_id: '' as string,
    });

    const { globalMode, locationHours, locations } = scheduleSettings;

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
            color: shift.color || '#3b82f6',
            location_id: shift.location_id ? String(shift.location_id) : '',
        });
        setIsCreating(false);
    };

    const handleCreate = () => {
        setEditingShift(null);
        setFormData({ label: '', start_time: '09:00', end_time: '17:00', color: '#3b82f6', location_id: '' });
        setIsCreating(true);
    };

    const handleSave = async () => {
        if (!formData.label || !formData.start_time || !formData.end_time) return alert('Please fill all fields');

        const payload = {
            ...formData,
            location_id: (!globalMode && formData.location_id) ? parseInt(formData.location_id) : null,
        };

        if (editingShift) {
            const res = await fetch('/api/admin/schedule/shifts', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: editingShift.id, ...payload }),
            });
            if (res.ok) { setEditingShift(null); fetchShifts(); }
            else alert('Failed to update shift');
        } else {
            const res = await fetch('/api/admin/schedule/shifts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (res.ok) { setIsCreating(false); fetchShifts(); }
            else alert('Failed to create shift');
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this shift? Existing schedules may be affected.')) return;
        const res = await fetch('/api/admin/schedule/shifts', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
        });
        if (res.ok) fetchShifts();
        else alert('Failed to delete shift');
    };

    const handleSaveSettings = async () => {
        setSavingSettings(true);
        try {
            await fetch('/api/admin/schedule/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ globalMode, locationHours }),
            });
            setSettingsSaved(true);
            setTimeout(() => setSettingsSaved(false), 2000);
        } finally {
            setSavingSettings(false);
        }
    };

    const setLocHours = (locId: number, field: 'workdayStart' | 'workdayEnd', value: string) => {
        const updated = {
            ...locationHours,
            [locId]: { ...(locationHours[locId] || { workdayStart: '08:00', workdayEnd: '02:00' }), [field]: value },
        };
        onSettingsChange({ ...scheduleSettings, locationHours: updated });
    };

    const getLocationName = (locId: number | null | undefined) => {
        if (!locId) return null;
        return locations.find(l => l.id === locId)?.name || `Loc ${locId}`;
    };

    if (loading) return <div className="text-white">Loading shifts...</div>;

    return (
        <div className="space-y-4">
            {/* Sub-tabs */}
            <div className="flex gap-1 bg-gray-900 rounded-lg p-1 w-fit border border-gray-700">
                <button
                    onClick={() => setSettingsTab('shifts')}
                    className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${settingsTab === 'shifts' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                >
                    Shift Definitions
                </button>
                <button
                    onClick={() => setSettingsTab('settings')}
                    className={`px-4 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-1.5 ${settingsTab === 'settings' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                >
                    <Settings size={14} /> Schedule Settings
                </button>
            </div>

            {/* ── Shift Definitions ── */}
            {settingsTab === 'shifts' && (
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h2 className="text-xl font-bold text-white">Shift Definitions</h2>
                            <p className="text-gray-400 text-sm">
                                {globalMode
                                    ? 'Global mode — shifts are shared across all locations.'
                                    : 'Per-location mode — shifts can be global or location-specific.'}
                            </p>
                        </div>
                        {!isCreating && !editingShift && (
                            <button onClick={handleCreate} className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded font-bold flex items-center gap-2">
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
                                {/* Location selector — only shown in per-location mode */}
                                {!globalMode && locations.length > 0 && (
                                    <div className="md:col-span-2">
                                        <label className="block text-gray-400 text-sm mb-1">
                                            Location <span className="text-gray-500">(leave blank for all locations)</span>
                                        </label>
                                        <select
                                            value={formData.location_id}
                                            onChange={e => setFormData({ ...formData, location_id: e.target.value })}
                                            className="w-full bg-gray-800 border border-gray-600 rounded p-2 text-white"
                                        >
                                            <option value="">All Locations (Global)</option>
                                            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                        </select>
                                    </div>
                                )}
                            </div>
                            <div className="flex justify-end gap-3">
                                <button onClick={() => { setEditingShift(null); setIsCreating(false); }} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
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
                                        <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: shift.color || '#3b82f6' }} />
                                        <div>
                                            <h3 className="font-bold text-white text-lg leading-tight">{shift.label}</h3>
                                            {!globalMode && (
                                                <span className="text-xs flex items-center gap-1 mt-0.5" style={{ color: shift.location_id ? '#fb923c' : '#6b7280' }}>
                                                    <MapPin size={10} />
                                                    {shift.location_id ? getLocationName(shift.location_id) : 'All Locations'}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => handleEdit(shift)} className="text-blue-400 hover:text-blue-300"><Edit size={16} /></button>
                                        <button onClick={() => handleDelete(shift.id)} className="text-red-400 hover:text-red-300"><Trash2 size={16} /></button>
                                    </div>
                                </div>
                                <div className="text-gray-400 text-sm flex items-center gap-2">
                                    <Clock size={14} />
                                    {shift.start_time} – {shift.end_time}
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
            )}

            {/* ── Schedule Settings ── */}
            {settingsTab === 'settings' && (
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 space-y-6">
                    <div>
                        <h2 className="text-xl font-bold text-white mb-1">Schedule Settings</h2>
                        <p className="text-gray-400 text-sm">Configure how shifts and schedules behave across locations.</p>
                    </div>

                    {/* Global / Per-Location toggle */}
                    <div className="bg-gray-900 rounded-lg p-5 border border-gray-700">
                        <h3 className="text-white font-semibold mb-3">Schedule Mode</h3>
                        <div className="flex gap-3">
                            <button
                                onClick={() => onSettingsChange({ ...scheduleSettings, globalMode: true })}
                                className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-semibold transition-all ${globalMode ? 'border-blue-500 bg-blue-500/10 text-blue-300' : 'border-gray-600 text-gray-400 hover:border-gray-500'}`}
                            >
                                <div className="text-base mb-1">🌐 Global Schedule</div>
                                <div className="font-normal opacity-75">Same shifts and hours apply to all locations. Location selector is hidden in the scheduler.</div>
                            </button>
                            <button
                                onClick={() => onSettingsChange({ ...scheduleSettings, globalMode: false })}
                                className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-semibold transition-all ${!globalMode ? 'border-orange-500 bg-orange-500/10 text-orange-300' : 'border-gray-600 text-gray-400 hover:border-gray-500'}`}
                            >
                                <div className="text-base mb-1">📍 Per-Location Schedule</div>
                                <div className="font-normal opacity-75">Each location has its own shifts and schedule. Location selector is prominently shown.</div>
                            </button>
                        </div>
                    </div>

                    {/* Per-location workday hours */}
                    {locations.length > 0 && (
                        <div className="bg-gray-900 rounded-lg p-5 border border-gray-700">
                            <h3 className="text-white font-semibold mb-1">Workday Hours</h3>
                            <p className="text-gray-400 text-sm mb-4">
                                Set the visible time window for each location's daily schedule view.
                                {globalMode && ' (Applies to all locations in global mode.)'}
                            </p>
                            <div className="space-y-3">
                                {(globalMode ? [{ id: 0, name: 'All Locations (Global)' }] : locations).map(loc => {
                                    const hrs = locationHours[loc.id] || { workdayStart: '08:00', workdayEnd: '02:00' };
                                    return (
                                        <div key={loc.id} className="flex items-center gap-4 bg-gray-800 rounded p-3 border border-gray-700">
                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                                <MapPin size={14} className="text-gray-500 flex-shrink-0" />
                                                <span className="text-white text-sm font-medium truncate">{loc.name}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <label className="text-gray-400 text-xs">Start</label>
                                                <input
                                                    type="time"
                                                    value={hrs.workdayStart}
                                                    onChange={e => setLocHours(loc.id, 'workdayStart', e.target.value)}
                                                    className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm w-28"
                                                />
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <label className="text-gray-400 text-xs">End</label>
                                                <input
                                                    type="time"
                                                    value={hrs.workdayEnd}
                                                    onChange={e => setLocHours(loc.id, 'workdayEnd', e.target.value)}
                                                    className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm w-28"
                                                />
                                            </div>
                                            <span className="text-gray-500 text-xs hidden sm:block">
                                                {hrs.workdayStart} – {hrs.workdayEnd}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end">
                        <button
                            onClick={handleSaveSettings}
                            disabled={savingSettings}
                            className={`px-6 py-2.5 rounded-lg font-bold text-sm flex items-center gap-2 transition-all ${settingsSaved ? 'bg-green-600 text-white' : savingSettings ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
                        >
                            <Save size={16} />
                            {settingsSaved ? '✓ Saved' : savingSettings ? 'Saving…' : 'Save Settings'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
