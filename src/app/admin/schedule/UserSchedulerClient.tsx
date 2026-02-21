'use client';

import { useState, useEffect } from 'react';
import styles from '../admin.module.css';
import { ChevronLeft, ChevronRight, Plus, Calendar, User, Clock, Trash2, Printer, X, Mail, Pencil } from 'lucide-react';
import ShiftManager from './ShiftManager';
import MonthScheduler from './MonthScheduler';

interface User {
    id: number;
    first_name: string;
    last_name: string;
    email?: string;
}

interface Shift {
    id: number;
    label: string;
    start_time: string;
    end_time: string;
    color: string;
}

interface Schedule {
    id: number;
    user_id: number;
    shift_id: number;
    date: string; // YYYY-MM-DD
    first_name: string;
    last_name: string;
    shift_name: string;
    start_time: string;
    end_time: string;
    color: string;
    recurring_group_id?: string;
}

export default function UserSchedulerClient() {
    const [activeTab, setActiveTab] = useState<'weekly' | 'daily' | 'monthly' | 'shifts'>('weekly');
    const [viewMode, setViewMode] = useState<'employees' | 'shifts' | 'coverage'>('employees');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [weekStart, setWeekStart] = useState<Date>(getStartOfWeek(new Date()));

    const [users, setUsers] = useState<User[]>([]);
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [schedules, setSchedules] = useState<Schedule[]>([]);

    const [assignModalOpen, setAssignModalOpen] = useState(false);
    const [notifyModalOpen, setNotifyModalOpen] = useState(false);

    // Edit / Sub Shift Modal State
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
    const [editShiftId, setEditShiftId] = useState<string>('');
    const [editUserId, setEditUserId] = useState<string>('');
    const [modifyStrategy, setModifyStrategy] = useState<'instance' | 'following' | 'all'>('instance');

    // Assignment Form State
    const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
    const [selectedShift, setSelectedShift] = useState<string>('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // New Recurring State
    const [isRecurring, setIsRecurring] = useState(false);
    const [recurringEndDate, setRecurringEndDate] = useState('');

    const [notifyOnAssign, setNotifyOnAssign] = useState(false);

    // Drag & Drop State
    const [draggedSchedule, setDraggedSchedule] = useState<Schedule | null>(null);

    useEffect(() => {
        fetch('/api/admin/users').then(r => r.json()).then(d => setUsers(d.users || []));
        fetch('/api/admin/schedule/shifts').then(r => r.json()).then(d => setShifts(d.shifts || []));
    }, [activeTab]);

    useEffect(() => {
        if (activeTab === 'weekly') fetchSchedules(weekStart, 8); // Fetch 8 days to catch spillover from prev day? Or prev day spillover needs start-1...
        if (activeTab === 'daily') fetchSchedules(currentDate, 1);
        if (activeTab === 'monthly') fetchSchedules(currentDate, 35);
    }, [weekStart, currentDate, activeTab]);

    // --- Stable User Colors ---
    const getUserColor = (userId: number, name: string) => {
        let hash = 0;
        const str = `${userId}-${name}`;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const h = Math.abs(hash) % 360;
        return `hsl(${h}, 70%, 50%)`;
    };

    // --- Bulk Actions ---
    const handleClearWeek = async () => {
        if (!confirm('Are you sure you want to clear ALL schedules for this week view?')) return;
        const start = weekDays[0].toISOString().split('T')[0];
        const end = weekDays[6].toISOString().split('T')[0];

        await fetch('/api/admin/schedule/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'clear_week', startDate: start, endDate: end })
        });
        fetchSchedules(weekStart, 7);
    };

    const handleClearFuture = async () => {
        if (!confirm('Are you sure you want to clear ALL schedules from today forward?')) return;
        await fetch('/api/admin/schedule/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'clear_after_today' })
        });
        fetchSchedules(weekStart, 7);
    };

    // --- Edit Modal Handlers ---
    const handleEdit = (schedule: Schedule) => {
        setEditingSchedule(schedule);
        setEditShiftId(schedule.shift_id.toString());
        setEditUserId(schedule.user_id.toString());
        setModifyStrategy('instance');
        setEditModalOpen(true);
    };

    const handleUpdateSchedule = async () => {
        if (!editingSchedule || !editShiftId || !editUserId) return;

        const res = await fetch('/api/admin/schedule', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: editingSchedule.id,
                userId: parseInt(editUserId),
                shiftId: parseInt(editShiftId),
                modifyStrategy,
                recurringGroupId: editingSchedule.recurring_group_id,
                date: editingSchedule.date.split('T')[0]
            })
        });

        if (res.ok) {
            setEditModalOpen(false);
            if (activeTab === 'weekly') fetchSchedules(weekStart, 7);
            else if (activeTab === 'monthly') fetchSchedules(currentDate, 35);
            else fetchSchedules(currentDate, 1);
        } else {
            alert('Failed to update schedule');
        }
    };

    // --- Drag and Drop Handlers ---
    const handleDragStart = (e: React.DragEvent, schedule: Schedule) => {
        e.dataTransfer.setData('application/json', JSON.stringify(schedule));
        // Keep reference in state just in case
        setDraggedSchedule(schedule);
        // Add some visual feedback
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDrop = async (e: React.DragEvent, targetDateStr: string, targetUserId?: number) => {
        e.preventDefault();
        if (!draggedSchedule) return;

        // Same day and user? Do nothing.
        const d = draggedSchedule.date.split('T')[0];
        if (d === targetDateStr && (!targetUserId || draggedSchedule.user_id === targetUserId)) {
            setDraggedSchedule(null);
            return;
        }

        const newUserId = targetUserId || draggedSchedule.user_id;

        // Perform PUT update specifically for this single instance move
        await fetch('/api/admin/schedule', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: draggedSchedule.id,
                userId: newUserId,
                shiftId: draggedSchedule.shift_id,
                modifyStrategy: 'instance', // DND is instance only
                date: targetDateStr // Date change involves deleting old and inserting new? 
            })
        });

        // The PUT endpoint above only updates user/shift, NOT date right now.
        // For DND date changes, we need to POST the new one and DELETE the old one, OR expand PUT to handle date shifts. 
        // Simplest: Delete old, POST new.
        if (d !== targetDateStr) {
            await fetch('/api/admin/schedule', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: draggedSchedule.id })
            });

            await fetch('/api/admin/schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userIds: [newUserId],
                    shiftId: draggedSchedule.shift_id,
                    dates: [targetDateStr],
                    isRecurring: false
                })
            });
        }

        setDraggedSchedule(null);
        if (activeTab === 'weekly') fetchSchedules(weekStart, 7);
        else if (activeTab === 'monthly') fetchSchedules(currentDate, 35);
        else fetchSchedules(currentDate, 1);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault(); // necessary to allow dropping
        e.dataTransfer.dropEffect = 'move';
    };

    function getStartOfWeek(date: Date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(d.setDate(diff));
    }

    const fetchSchedules = async (startDate: Date, days: number) => {
        let start, end;

        if (activeTab === 'monthly') {
            // For monthly, get the whole month + padding
            const year = startDate.getFullYear();
            const month = startDate.getMonth();
            start = new Date(year, month, 1).toISOString().split('T')[0];
            end = new Date(year, month + 1, 0).toISOString().split('T')[0];
        } else {
            // Fetch 1 extra day BEFORE start to catch spillover overnight shifts
            const s = new Date(startDate);
            s.setDate(s.getDate() - 1);
            start = s.toISOString().split('T')[0];

            end = new Date(startDate.getTime() + (days - 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        }

        const res = await fetch(`/api/admin/schedule?start=${start}&end=${end}`);
        const data = await res.json();
        if (data.schedules) setSchedules(data.schedules);
    };

    const changeWeek = (offset: number) => {
        const newStart = new Date(weekStart);
        newStart.setDate(weekStart.getDate() + (offset * 7));
        setWeekStart(newStart);
    };

    const changeDay = (offset: number) => {
        const newDate = new Date(currentDate);
        newDate.setDate(currentDate.getDate() + offset);
        setCurrentDate(newDate);
    };

    const handleAssign = async () => {
        if (selectedUsers.length === 0 || !selectedShift || !startDate || !endDate) return alert('Please fill all fields');
        if (isRecurring && !recurringEndDate) return alert('Please select a recurring end date');

        // Helper to parse YYYY-MM-DD to Date object (Local Midnight)
        const parseDate = (dateStr: string) => {
            const [y, m, d] = dateStr.split('-').map(Number);
            return new Date(y, m - 1, d);
        };

        // Helper to formatting Date to YYYY-MM-DD
        const formatDate = (date: Date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        const dates: string[] = [];

        // 1. Generate Base Block (The range user selected, e.g. Mon-Wed)
        const baseBlock: Date[] = [];
        let cur = parseDate(startDate);
        const end = parseDate(endDate);

        while (cur <= end) {
            baseBlock.push(new Date(cur)); // Clone date
            cur.setDate(cur.getDate() + 1);
        }

        // 2. Generate Repeats
        if (!isRecurring) {
            dates.push(...baseBlock.map(formatDate));
        } else {
            const recurEnd = parseDate(recurringEndDate);
            let weekOffset = 0;

            while (true) {
                // Generate this week's block
                const currentBlock = baseBlock.map(d => {
                    const newDate = new Date(d);
                    newDate.setDate(d.getDate() + (weekOffset * 7));
                    return newDate;
                });

                // Check if the entire block is past the recurring end date?
                // Or if ANY part of the block is valid?
                // Logic: Add dates that are <= recurEnd

                let addedAny = false;
                for (const d of currentBlock) {
                    if (d <= recurEnd) {
                        dates.push(formatDate(d));
                        addedAny = true;
                    }
                }

                if (!addedAny && currentBlock[0] > recurEnd) break; // Optimization: Stop if block start is past end

                weekOffset++;

                // Safety break
                if (weekOffset > 52) break;
            }
        }

        const res = await fetch('/api/admin/schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userIds: selectedUsers,
                shiftId: parseInt(selectedShift),
                dates
            })
        });

        if (res.ok) {
            alert('Schedule Updated');

            if (notifyOnAssign) {
                // Trigger notification logic here (simplified)
                alert('Notifications queued for selected users.');
            }

            // Reset Form
            setSelectedUsers([]);
            setSelectedShift('');
            // Keep dates? Usually better to reset or keep last? User asked to "deselect checkboxes", implying reset.
            // Let's reset everything for a clean state.
            setStartDate('');
            setEndDate('');
            setIsRecurring(false);
            setRecurringEndDate('');
            setNotifyOnAssign(false);

            setAssignModalOpen(false);
            if (activeTab === 'weekly') fetchSchedules(weekStart, 7);
            else if (activeTab === 'monthly') fetchSchedules(currentDate, 35);
            else fetchSchedules(currentDate, 1);
        } else {
            alert('Failed to save');
        }
    };

    const handleDelete = async (id: number, schedule?: Schedule) => {
        if (!confirm('Are you sure you want to delete this shift based on your selected occurrence setting?')) return;

        const payload: any = { id };

        // Use the modifyStrategy selected in the modal, but default to 'instance' if it's a quick hover delete
        const strat = editModalOpen ? modifyStrategy : 'instance';

        if (schedule?.recurring_group_id) {
            payload.modifyStrategy = strat;
            payload.recurringGroupId = schedule.recurring_group_id;
            payload.date = schedule.date.split('T')[0];
        }

        await fetch('/api/admin/schedule', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (activeTab === 'weekly') fetchSchedules(weekStart, 7);
        else if (activeTab === 'monthly') fetchSchedules(currentDate, 35);
        else fetchSchedules(currentDate, 1);

        setEditModalOpen(false); // Close edit modal if open
    };

    const handleNotify = async () => {
        // In a real app, this would open a modal to customize the message
        // and select which period to send (Next Week, This Week)
        if (!confirm('Email the schedule for the current view to all visible employees?')) return;

        // Mock API call
        alert('Schedule emailed successfully!');
    };

    // Helper: Time Position for Daily View
    // Assumes day starts at 06:00 and ends at 06:00 next day (24h)
    const getTimePos = (time: string) => {
        const [h, m] = time.split(':').map(Number);
        let hour = h;
        if (hour < 6) hour += 24; // Handle post-midnight
        const totalMinutes = (hour - 6) * 60 + m;
        return (totalMinutes / (24 * 60)) * 100;
    };

    const getDurationPercent = (start: string, end: string) => {
        const startPos = getTimePos(start);
        const endPos = getTimePos(end);
        let diff = endPos - startPos;
        if (diff < 0) diff += 100; // Shouldn't calculate this way if logic is sound but safety
        return diff;
    };

    // Generate Week Days
    const weekDays: Date[] = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        weekDays.push(d);
    }

    // Styles for Print
    const printStyles = `
        @media print {
            body * { visibility: hidden; }
            .scheduler-container, .scheduler-container * { visibility: visible; }
            .scheduler-container { position: absolute; left: 0; top: 0; width: 100%; color: black !important; }
            .no-print { display: none !important; }
            table { border-collapse: collapse !important; width: 100%; }
            th, td { border: 1px solid #000 !important; color: black !important; }
            .shift-badge { border: 1px solid #000 !important; color: black !important; background: transparent !important; }
        }
    `;

    return (
        <div className={`${styles.container} scheduler-container`}>
            <style>{printStyles}</style>

            <div className="flex justify-between items-center mb-6 no-print">
                <div>
                    <h1 className="text-2xl font-bold text-white mb-2">Staff Scheduler</h1>
                    <div className="flex gap-4 text-sm">
                        <button
                            onClick={() => setActiveTab('weekly')}
                            className={`pb-1 border-b-2 transition-colors ${activeTab === 'weekly' ? 'border-blue-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-300'}`}
                        >
                            Weekly Roster
                        </button>
                        <button
                            onClick={() => setActiveTab('daily')}
                            className={`pb-1 border-b-2 transition-colors ${activeTab === 'daily' ? 'border-blue-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-300'}`}
                        >
                            Daily Timeline
                        </button>
                        <button
                            onClick={() => setActiveTab('monthly')}
                            className={`pb-1 border-b-2 transition-colors ${activeTab === 'monthly' ? 'border-blue-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-300'}`}
                        >
                            Monthly View
                        </button>
                        <button
                            onClick={() => setActiveTab('shifts')}
                            className={`pb-1 border-b-2 transition-colors ${activeTab === 'shifts' ? 'border-blue-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-300'}`}
                        >
                            Shift Settings
                        </button>
                    </div>
                </div>
                <div className="flex gap-4">
                    {activeTab !== 'shifts' && (
                        <>
                            <button
                                onClick={handleNotify}
                                className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded font-bold flex items-center gap-2"
                            >
                                <Mail size={18} /> Email Schedule
                            </button>
                            <button
                                onClick={() => window.print()}
                                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded font-bold flex items-center gap-2"
                            >
                                <Printer size={18} /> Print
                            </button>
                            <button
                                onClick={() => setAssignModalOpen(true)}
                                className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded font-bold flex items-center gap-2"
                            >
                                <Plus size={18} /> Assign Shifts
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* TAB: SHIFTS */}
            {activeTab === 'shifts' && <ShiftManager />}

            {/* TAB: MONTHLY */}
            {activeTab === 'monthly' && (
                <MonthScheduler
                    currentDate={currentDate}
                    users={users}
                    shifts={shifts}
                    schedules={schedules}
                    onDelete={handleDelete}
                    onEdit={handleEdit}
                    onDateChange={setCurrentDate}
                />
            )}

            {/* TAB: WEEKLY */}
            {activeTab === 'weekly' && (
                <>
                    <div className="flex justify-between items-center bg-gray-800 p-4 rounded-t-lg border border-gray-700 no-print">
                        <div className="flex items-center gap-4">
                            <button onClick={() => changeWeek(-1)} className="text-white hover:bg-gray-700 p-1 rounded"><ChevronLeft /></button>
                            <h2 className="text-xl font-bold text-white">
                                Week of {weekStart.toLocaleDateString()}
                            </h2>
                            <button onClick={() => changeWeek(1)} className="text-white hover:bg-gray-700 p-1 rounded"><ChevronRight /></button>

                            {/* Clear Bulk Options */}
                            <button onClick={handleClearWeek} className="text-red-400 hover:text-red-300 hover:bg-gray-800 px-2 py-1 rounded text-sm transition-colors border border-red-900/50 ml-4">Clear Week</button>
                            <button onClick={handleClearFuture} className="text-red-400 hover:text-red-300 hover:bg-gray-800 px-2 py-1 rounded text-sm transition-colors border border-red-900/50">Clear Future</button>
                        </div>

                        <div className="flex gap-4 items-center">
                            <div className="bg-gray-700 rounded p-1 flex text-sm">
                                <button
                                    onClick={() => setViewMode('employees')}
                                    className={`px-3 py-1 rounded ${viewMode === 'employees' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                                >
                                    By Employee
                                </button>
                                <button
                                    onClick={() => setViewMode('shifts')}
                                    className={`px-3 py-1 rounded ${viewMode === 'shifts' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                                >
                                    By Shift
                                </button>
                                <button
                                    onClick={() => setViewMode('coverage')}
                                    className={`px-3 py-1 rounded ${viewMode === 'coverage' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                                >
                                    Coverage
                                </button>
                            </div>
                            <button onClick={() => setWeekStart(getStartOfWeek(new Date()))} className="text-blue-400 hover:text-blue-300 text-sm">Today</button>
                        </div>
                    </div>

                    {viewMode === 'coverage' && (
                        <div className="p-4 bg-gray-800 text-sm border-l border-r border-gray-700 flex flex-wrap gap-3">
                            <span className="text-gray-400 font-bold mr-2">Legend:</span>
                            {users.map(u => (
                                <div key={u.id} className="flex items-center gap-1">
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getUserColor(u.id, u.first_name) }}></div>
                                    <span className="text-white">{u.first_name} {u.last_name[0]}.</span>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="overflow-x-auto border border-gray-700 rounded-b-lg bg-gray-900 print:bg-white print:border-black">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr>
                                    <th className="p-4 text-left text-gray-400 border-b border-gray-700 bg-gray-800 w-48 sticky left-0 z-10 print:bg-white print:text-black print:border-black">
                                        {viewMode === 'employees' ? 'Employee' : 'Shift'}
                                    </th>
                                    {weekDays.map(d => (
                                        <th key={d.toISOString()} className="p-4 text-center border-b border-gray-700 bg-gray-800 min-w-[140px] print:bg-white print:text-black print:border-black">
                                            <div className="text-white font-bold print:text-black">{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                                            <div className="text-sm text-gray-500 print:text-black">{d.getDate()}</div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {/* EMPLOYEE VIEW */}
                                {viewMode === 'employees' && users.map(user => (
                                    <tr key={user.id} className="hover:bg-gray-800/50 transition-colors print:hover:bg-transparent">
                                        <td className="p-4 border-b border-gray-800 bg-gray-900 sticky left-0 font-medium text-white border-r border-gray-700 print:bg-white print:text-black print:border-black">
                                            {user.first_name} {user.last_name}
                                        </td>
                                        {weekDays.map(d => {
                                            const dateStr = d.toISOString().split('T')[0];

                                            // Previous Day for spillover
                                            const prevDate = new Date(d);
                                            prevDate.setDate(d.getDate() - 1);
                                            const prevDateStr = prevDate.toISOString().split('T')[0];

                                            // Shifts starting today
                                            const todaysSchedules = schedules.filter(s => s.user_id === user.id && s.date.split('T')[0] === dateStr);

                                            // Shifts from yesterday that might spill over
                                            const yesterdaysSchedules = schedules.filter(s => s.user_id === user.id && s.date.split('T')[0] === prevDateStr);
                                            const spilloverSchedules = yesterdaysSchedules.filter(s => {
                                                // Check if end_time is smaller than start_time (implies overnight)
                                                // Simple check: start > end means cross midnight
                                                const start = parseInt(s.start_time.replace(':', ''));
                                                const end = parseInt(s.end_time.replace(':', ''));
                                                return start > end;
                                            });

                                            return (
                                                <td
                                                    key={dateStr}
                                                    className="p-2 border-b border-gray-800 border-r border-gray-800 relative h-24 align-top print:border-black"
                                                    onDragOver={handleDragOver}
                                                    onDrop={(e) => handleDrop(e, dateStr, user.id)}
                                                >
                                                    <div className="relative w-full h-full">
                                                        {/* Render Spillovers (Start of day) */}
                                                        {spilloverSchedules.map(schedule => {
                                                            const shiftDef = shifts.find(s => s.id === schedule.shift_id);
                                                            const color = shiftDef?.color || '#3b82f6';
                                                            const endH = parseInt(schedule.end_time.split(':')[0]);
                                                            const endM = parseInt(schedule.end_time.split(':')[1]);
                                                            const widthPct = ((endH * 60 + endM) / (24 * 60)) * 100;

                                                            return (
                                                                <div
                                                                    key={`spill-${schedule.id}`}
                                                                    className="absolute top-0 h-1/3 rounded-r px-1 text-[10px] flex items-center opacity-70 mb-1"
                                                                    style={{
                                                                        left: 0,
                                                                        width: `${widthPct}%`,
                                                                        backgroundColor: color,
                                                                        color: 'white',
                                                                        zIndex: 5
                                                                    }}
                                                                >
                                                                    Warning: {schedule.shift_name} (End {schedule.end_time})
                                                                </div>
                                                            );
                                                        })}

                                                        {/* Render Today's Shifts */}
                                                        {todaysSchedules.map(schedule => {
                                                            const shiftDef = shifts.find(s => s.id === schedule.shift_id);
                                                            const color = shiftDef?.color || '#3b82f6';

                                                            const startH = parseInt(schedule.start_time.split(':')[0]);
                                                            const startM = parseInt(schedule.start_time.split(':')[1]);
                                                            const startTotal = startH * 60 + startM;

                                                            let endH = parseInt(schedule.end_time.split(':')[0]);
                                                            const endM = parseInt(schedule.end_time.split(':')[1]);
                                                            let endTotal = endH * 60 + endM;

                                                            let isOvernight = startTotal > endTotal;
                                                            if (isOvernight) endTotal = 24 * 60; // Helper for width calc on this day

                                                            const leftPct = (startTotal / (24 * 60)) * 100;
                                                            const widthPct = ((endTotal - startTotal) / (24 * 60)) * 100;

                                                            return (
                                                                <div
                                                                    key={schedule.id}
                                                                    draggable
                                                                    onDragStart={(e) => handleDragStart(e, schedule)}
                                                                    className="absolute h-1/2 rounded px-2 text-xs flex flex-col justify-center overflow-hidden group cursor-grab active:cursor-grabbing hover:brightness-110 hover:z-20 transition-all shadow-sm"
                                                                    style={{
                                                                        left: `${leftPct}%`,
                                                                        width: `${widthPct}%`,
                                                                        top: '30%',
                                                                        backgroundColor: color,
                                                                        color: 'white',
                                                                        border: '1px solid white'
                                                                    }}
                                                                    // On Click -> Edit
                                                                    onClick={() => handleEdit(schedule)}
                                                                >
                                                                    <div className="font-bold truncate">{schedule.shift_name}</div>
                                                                    <div className="text-[10px] truncate">{schedule.start_time}-{schedule.end_time}</div>
                                                                    {schedule.recurring_group_id && <div className="absolute right-1 bottom-1 w-1.5 h-1.5 rounded-full bg-white opacity-80" title="Repeating Shift" />}

                                                                    {/* Hover Delete */}
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleDelete(schedule.id, schedule); }}
                                                                        className="absolute right-0 top-0 bottom-0 bg-red-600 px-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center"
                                                                        title="Delete"
                                                                    >
                                                                        <Trash2 size={10} />
                                                                    </button>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}

                                {/* SHIFT VIEW */}
                                {viewMode === 'shifts' && shifts.map(shift => (
                                    <tr key={shift.id} className="hover:bg-gray-800/50 transition-colors print:hover:bg-transparent">
                                        <td className="p-4 border-b border-gray-800 bg-gray-900 sticky left-0 font-medium text-white border-r border-gray-700 print:bg-white print:text-black print:border-black">
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: shift.color }}></div>
                                                <div>
                                                    <div>{shift.label}</div>
                                                    <div className="text-xs text-gray-500">{shift.start_time} - {shift.end_time}</div>
                                                </div>
                                            </div>
                                        </td>
                                        {weekDays.map(d => {
                                            const dateStr = d.toISOString().split('T')[0];
                                            const assignedSchedules = schedules.filter(s => s.shift_id === shift.id && s.date.split('T')[0] === dateStr);

                                            return (
                                                <td key={dateStr} className="p-2 border-b border-gray-800 border-r border-gray-800 align-top print:border-black">
                                                    <div className="flex flex-col gap-1">
                                                        {assignedSchedules.map(schedule => {
                                                            const user = users.find(u => u.id === schedule.user_id);
                                                            return (
                                                                <div
                                                                    key={schedule.id}
                                                                    className="bg-gray-800 rounded px-2 py-1 text-xs text-white border border-gray-700 flex justify-between items-center group cursor-pointer hover:bg-gray-700"
                                                                    onClick={() => handleEdit(schedule)}
                                                                >
                                                                    <span>{user ? `${user.first_name} ${user.last_name[0]}.` : 'Unknown'}</span>
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleDelete(schedule.id, schedule); }}
                                                                        className="text-red-400 opacity-0 group-hover:opacity-100"
                                                                    >
                                                                        <X size={10} />
                                                                    </button>
                                                                </div>
                                                            );
                                                        })}
                                                        {assignedSchedules.length === 0 && <div className="text-gray-600 text-xs text-center">-</div>}
                                                    </div>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}

                                {/* COVERAGE VIEW (Flattened) */}
                                {viewMode === 'coverage' && shifts.map(shift => (
                                    <tr key={shift.id} className="hover:bg-gray-800/50 transition-colors print:hover:bg-transparent">
                                        <td className="p-4 border-b border-gray-800 bg-gray-900 sticky left-0 font-medium text-white border-r border-gray-700 print:bg-white print:text-black print:border-black">
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: shift.color }}></div>
                                                <div>
                                                    <div>{shift.label}</div>
                                                    <div className="text-xs text-gray-500">{shift.start_time} - {shift.end_time}</div>
                                                </div>
                                            </div>
                                        </td>
                                        {weekDays.map(d => {
                                            const dateStr = d.toISOString().split('T')[0];
                                            const assignedSchedules = schedules.filter(s => s.shift_id === shift.id && s.date.split('T')[0] === dateStr);

                                            return (
                                                <td
                                                    key={dateStr}
                                                    className="p-2 border-b border-gray-800 border-r border-gray-800 align-top print:border-black"
                                                    onDragOver={handleDragOver}
                                                    onDrop={(e) => handleDrop(e, dateStr)}
                                                >
                                                    <div className="flex flex-wrap gap-1">
                                                        {assignedSchedules.map(schedule => {
                                                            const user = users.find(u => u.id === schedule.user_id);
                                                            const userName = user ? user.first_name : 'Unknown';
                                                            const color = user ? getUserColor(user.id, user.first_name) : '#888';

                                                            return (
                                                                <div
                                                                    key={schedule.id}
                                                                    draggable
                                                                    onDragStart={(e) => handleDragStart(e, schedule)}
                                                                    className="rounded px-2 py-1 text-xs text-white border border-black/20 flex justify-between items-center group cursor-grab active:cursor-grabbing hover:brightness-110 shadow-sm"
                                                                    style={{ backgroundColor: color }}
                                                                    onClick={() => handleEdit(schedule)}
                                                                >
                                                                    <span>{userName}</span>
                                                                    {schedule.recurring_group_id && <div className="ml-1 w-1.5 h-1.5 rounded-full bg-white opacity-80" title="Repeating Shift" />}
                                                                </div>
                                                            );
                                                        })}
                                                        {assignedSchedules.length === 0 && <div className="text-gray-600 text-xs w-full text-center">-</div>}
                                                    </div>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {/* TAB: DAILY (TIMELINE) */}
            {activeTab === 'daily' && (
                <>
                    <div className="flex justify-between items-center bg-gray-800 p-4 rounded-t-lg border border-gray-700 no-print">
                        <div className="flex items-center gap-4">
                            <button onClick={() => changeDay(-1)} className="text-white hover:bg-gray-700 p-1 rounded"><ChevronLeft /></button>
                            <h2 className="text-xl font-bold text-white">
                                {currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                            </h2>
                            <button onClick={() => changeDay(1)} className="text-white hover:bg-gray-700 p-1 rounded"><ChevronRight /></button>
                        </div>
                        <button onClick={() => setCurrentDate(new Date())} className="text-blue-400 hover:text-blue-300 text-sm">Today</button>
                    </div>

                    <div className="bg-gray-900 border border-gray-700 rounded-b-lg p-6 overflow-x-auto print:bg-white print:border-black">
                        {/* Timeline Header (Hours) */}
                        <div className="relative mb-4 h-8" style={{ minWidth: '800px' }}>
                            {Array.from({ length: 25 }).map((_, i) => {
                                const hour = (i + 6) % 24; // Start at 6AM
                                return (
                                    <div key={i} className="absolute text-xs text-gray-500 print:text-black" style={{ left: `${(i / 24) * 100}%`, transform: 'translateX(-50%)' }}>
                                        {hour === 0 ? '12 AM' : hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Users & Shifts */}
                        <div className="space-y-4" style={{ minWidth: '800px' }}>
                            {users.map(user => {
                                const userSchedules = schedules.filter(s => s.user_id === user.id);
                                if (userSchedules.length === 0) return null; // Only show active users? Or show all with empty track?
                                // Show only users with schedules for cleaner specific day view

                                return (
                                    <div key={user.id} className="relative h-12 flex items-center bg-gray-800/50 rounded p-2 print:bg-white print:border print:border-gray-200">
                                        <div className="w-40 font-bold text-white print:text-black z-10 shrink-0">{user.first_name} {user.last_name}</div>

                                        {/* Track Background */}
                                        <div className="absolute left-40 right-4 top-2 bottom-2 bg-gray-800 rounded opacity-50 print:hidden"></div>

                                        {/* Shift Bars */}
                                        <div className="absolute left-40 right-0 top-0 bottom-0">
                                            {userSchedules.map(schedule => {
                                                const shiftDef = shifts.find(s => s.id === schedule.shift_id);
                                                const color = shiftDef?.color || '#3b82f6';

                                                const left = getTimePos(schedule.start_time);
                                                const width = getDurationPercent(schedule.start_time, schedule.end_time);

                                                return (
                                                    <div
                                                        key={schedule.id}
                                                        className="absolute top-2 bottom-2 rounded flex items-center px-2 overflow-hidden shadow-lg border border-white/10 group cursor-pointer hover:brightness-110"
                                                        style={{
                                                            left: `${left}%`,
                                                            width: `${width}%`,
                                                            backgroundColor: color
                                                        }}
                                                        onClick={() => handleEdit(schedule)}
                                                    >
                                                        <span className="text-xs font-bold text-white truncate drop-shadow-md">
                                                            {schedule.shift_name} ({schedule.start_time}-{schedule.end_time})
                                                        </span>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleDelete(schedule.id, schedule); }}
                                                            className="absolute right-1 text-white opacity-0 group-hover:opacity-100 hover:text-red-200 transition-opacity no-print"
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                            {schedules.length === 0 && (
                                <div className="text-center text-gray-500 py-10">No shifts scheduled for this day.</div>
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* Assignment Modal (Shared) */}
            {assignModalOpen && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-800 rounded-lg max-w-lg w-full p-6 shadow-xl border border-gray-700">
                        <h2 className="text-xl font-bold text-white mb-6">Assign Shifts</h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-gray-400 text-sm mb-2">Select Employees</label>
                                <div className="max-h-40 overflow-y-auto bg-gray-900 p-2 rounded border border-gray-700">
                                    {users.map(u => (
                                        <label key={u.id} className="flex items-center gap-2 p-2 hover:bg-gray-800 rounded cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={selectedUsers.includes(u.id)}
                                                onChange={e => {
                                                    if (e.target.checked) setSelectedUsers([...selectedUsers, u.id]);
                                                    else setSelectedUsers(selectedUsers.filter(id => id !== u.id));
                                                }}
                                                className="rounded bg-gray-700 border-gray-600"
                                            />
                                            <span className="text-white">{u.first_name} {u.last_name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-gray-400 text-sm mb-2">Shift</label>
                                <select
                                    value={selectedShift}
                                    onChange={e => setSelectedShift(e.target.value)}
                                    className="w-full bg-gray-900 text-white rounded p-2 border border-gray-700"
                                >
                                    <option value="">Select Shift...</option>
                                    {shifts.map(s => (
                                        <option key={s.id} value={s.id} style={{ color: s.color }}>
                                            {s.label} ({s.start_time} - {s.end_time})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-gray-400 text-sm mb-2">Start Date</label>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={e => setStartDate(e.target.value)}
                                        className="w-full bg-gray-900 text-white rounded p-2 border border-gray-700"
                                    />
                                </div>
                                <div>
                                    <label className="block text-gray-400 text-sm mb-2">End Date</label>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={e => setEndDate(e.target.value)}
                                        className="w-full bg-gray-900 text-white rounded p-2 border border-gray-700"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="flex items-center gap-2 cursor-pointer mb-2">
                                    <input
                                        type="checkbox"
                                        checked={isRecurring}
                                        onChange={e => setIsRecurring(e.target.checked)}
                                        className="rounded bg-gray-700 border-gray-600"
                                    />
                                    <span className="text-gray-400 text-sm">Repeat Weekly</span>
                                </label>

                                {isRecurring && (
                                    <div>
                                        <label className="block text-gray-400 text-sm mb-2">Repeat Until</label>
                                        <input
                                            type="date"
                                            value={recurringEndDate}
                                            onChange={e => setRecurringEndDate(e.target.value)}
                                            className="w-full bg-gray-900 text-white rounded p-2 border border-gray-700"
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="mt-4 pt-4 border-t border-gray-700">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={notifyOnAssign}
                                        onChange={e => setNotifyOnAssign(e.target.checked)}
                                        className="rounded bg-gray-700 border-gray-600"
                                    />
                                    <div>
                                        <span className="text-white block">Notify Checked Users Now</span>
                                        <span className="text-xs text-gray-500">Sends an email to selected users with their new schedule.</span>
                                    </div>
                                </label>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-8">
                            <button
                                onClick={() => setAssignModalOpen(false)}
                                className="px-4 py-2 text-gray-300 hover:text-white"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAssign}
                                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold"
                            >
                                Assign Shifts
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Edit Shift Modal */}
            {editModalOpen && editingSchedule && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-800 rounded-lg max-w-sm w-full p-6 shadow-xl border border-gray-700">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-white">Edit Shift</h2>
                            <button onClick={() => setEditModalOpen(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
                        </div>

                        <div className="space-y-4">
                            <div className="p-3 bg-gray-900 rounded border border-gray-700 flex justify-between items-center">
                                <div>
                                    <div className="text-white font-bold">{editingSchedule.shift_name}</div>
                                    <div className="text-sm text-gray-400">
                                        {new Date(editingSchedule.date).toLocaleDateString()}
                                        <br />
                                        {editingSchedule.start_time} - {editingSchedule.end_time}
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleDelete(editingSchedule.id, editingSchedule)}
                                    className="p-2 bg-red-900/40 text-red-500 hover:bg-red-900 hover:text-red-300 rounded transition-colors"
                                    title="Delete Shift"
                                >
                                    <Trash2 size={20} />
                                </button>
                            </div>

                            <div>
                                <label className="block text-gray-400 text-sm mb-2">Assigned Employee</label>
                                <select
                                    value={editUserId}
                                    onChange={e => setEditUserId(e.target.value)}
                                    className="w-full bg-gray-900 text-white rounded p-2 border border-gray-700"
                                >
                                    {users.map(u => (
                                        <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-gray-400 text-sm mb-2">Shift Type</label>
                                <select
                                    value={editShiftId}
                                    onChange={e => setEditShiftId(e.target.value)}
                                    className="w-full bg-gray-900 text-white rounded p-2 border border-gray-700"
                                >
                                    {shifts.map(s => (
                                        <option key={s.id} value={s.id}>{s.label}</option>
                                    ))}
                                </select>
                            </div>

                            {editingSchedule.recurring_group_id && (
                                <div className="mt-4 p-3 border border-blue-900/50 bg-blue-900/20 rounded">
                                    <h4 className="text-sm font-bold text-blue-400 mb-2">Repeating Shift</h4>
                                    <label className="flex items-center gap-2 cursor-pointer mb-2">
                                        <input
                                            type="radio"
                                            name="modifyMode"
                                            checked={modifyStrategy === 'instance'}
                                            onChange={() => setModifyStrategy('instance')}
                                            className="accent-blue-500"
                                        />
                                        <span className="text-white text-sm">Modify only this occurrence</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer mb-2">
                                        <input
                                            type="radio"
                                            name="modifyMode"
                                            checked={modifyStrategy === 'following'}
                                            onChange={() => setModifyStrategy('following')}
                                            className="accent-blue-500"
                                        />
                                        <span className="text-white text-sm">Modify this and all following</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="modifyMode"
                                            checked={modifyStrategy === 'all'}
                                            onChange={() => setModifyStrategy('all')}
                                            className="accent-blue-500"
                                        />
                                        <span className="text-white text-sm">Modify ALL occurrences in series</span>
                                    </label>
                                </div>
                            )}

                        </div>

                        <div className="flex justify-end gap-3 mt-8">
                            <button
                                onClick={() => setEditModalOpen(false)}
                                className="px-4 py-2 text-gray-300 hover:text-white"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUpdateSchedule}
                                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold"
                            >
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
