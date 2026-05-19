'use client';

import { useState, useEffect } from 'react';
import styles from '../admin.module.css';
import { ChevronLeft, ChevronRight, Plus, Calendar, User, Clock, Trash2, Printer, X, Mail, Pencil, ArrowLeftRight, Replace, Check, Palette } from 'lucide-react';
import ShiftManager from './ShiftManager';
import MonthScheduler from './MonthScheduler';

interface User {
    id: number;
    first_name: string;
    last_name: string;
    email?: string;
    position?: string;
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

import DateRangePicker from '@/components/DateRangePicker';

export default function UserSchedulerClient() {
    const formatLocalDate = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const [activeTab, setActiveTab] = useState<'weekly' | 'daily' | 'monthly' | 'shifts' | 'swaps'>('weekly');
    const [viewMode, setViewMode] = useState<'employees' | 'shifts' | 'coverage' | 'timeline'>('timeline');
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

    // Swap Requests State
    const [swapRequests, setSwapRequests] = useState<any[]>([]);
    const [swapLoading, setSwapLoading] = useState(false);
    const [swapDeclineId, setSwapDeclineId] = useState<number | null>(null);
    const [swapDeclineReason, setSwapDeclineReason] = useState('');
    const [swapStatusFilter, setSwapStatusFilter] = useState('pending_manager');

    // Edit Modal specific Make Repeating state
    const [isEditRecurring, setIsEditRecurring] = useState(false);
    const [editRecurringEndDate, setEditRecurringEndDate] = useState('');

    const [notifyOnAssign, setNotifyOnAssign] = useState(false);
    const [notifyOnEdit, setNotifyOnEdit] = useState(false);
    const [notifyMessage, setNotifyMessage] = useState('');

    // Drag & Drop State
    const [draggedSchedule, setDraggedSchedule] = useState<Schedule | null>(null);
    const [dragOverCell, setDragOverCell] = useState<{ userId: number; dateStr: string; snapShiftId: number | null } | null>(null);
    const [dropModal, setDropModal] = useState<{
        dragged: Schedule;
        targetUserId: number;
        targetDateStr: string;
        snapShiftId: number;
        occupying: Schedule | null;
    } | null>(null);

    // Delete confirmation modal
    const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; schedule: Schedule } | null>(null);

    // User schedule colors (custom per-employee colors, persisted to localStorage)
    const [userColors, setUserColors] = useState<Record<number, string>>({});
    const [colorPickerUserId, setColorPickerUserId] = useState<number | null>(null);

    // Location state
    const [myLocations, setMyLocations] = useState<{ id: number, name: string }[]>([]);
    const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);

    // Schedule settings (global vs per-location mode)
    const [scheduleSettings, setScheduleSettings] = useState<{
        globalMode: boolean;
        locationHours: Record<number, { workdayStart: string; workdayEnd: string }>;
        locations: { id: number; name: string }[];
    }>({ globalMode: true, locationHours: {}, locations: [] });

    useEffect(() => {
        fetch('/api/admin/schedule/settings').then(r => r.json()).then(d => {
            if (d && !d.error) setScheduleSettings(d);
        });
    }, []);

    useEffect(() => {
        fetch('/api/user/locations').then(r => r.json()).then(d => {
            const locs: { id: number; name: string }[] = d.locations || [];
            setMyLocations(locs);
            if (locs.length > 0) {
                const match = typeof document !== 'undefined'
                    ? document.cookie.match(/(^| )current_location_id=([^;]+)/)
                    : null;
                const cookieLocId = match ? parseInt(match[2]) : null;
                const found = cookieLocId ? locs.find(l => l.id === cookieLocId) : null;
                setSelectedLocationId(found ? found.id : locs[0].id);
            }
        });
    }, []);

    useEffect(() => {
        const locParam = !scheduleSettings.globalMode && selectedLocationId ? `?locationId=${selectedLocationId}` : '';
        fetch(`/api/admin/schedule/shifts${locParam}`).then(r => r.json()).then(d => setShifts(d.shifts || []));
    }, [activeTab, scheduleSettings.globalMode, selectedLocationId]);

    // Re-fetch users scoped to the selected location whenever it changes
    useEffect(() => {
        const locParam = selectedLocationId ? `?locationId=${selectedLocationId}` : '';
        fetch(`/api/admin/users${locParam}`).then(r => r.json()).then(d => setUsers(d.users || []));
    }, [selectedLocationId]);

    useEffect(() => {
        if (activeTab === 'weekly') fetchSchedules(weekStart, 8);
        if (activeTab === 'daily') fetchSchedules(currentDate, 1);
        if (activeTab === 'monthly') fetchSchedules(currentDate, 35);
        if (activeTab === 'swaps') fetchSwaps(swapStatusFilter);
    }, [weekStart, currentDate, activeTab, selectedLocationId]);

    useEffect(() => {
        if (activeTab === 'swaps') fetchSwaps(swapStatusFilter);
    }, [swapStatusFilter]);

    // Derived: selected location name — users are already fetched scoped to this location
    const selectedLocationName = myLocations.find(l => l.id === selectedLocationId)?.name || '';

    useEffect(() => {
        try {
            const stored = localStorage.getItem('schedule_user_colors');
            if (stored) setUserColors(JSON.parse(stored));
        } catch {}
    }, []);

    // --- Stable User Colors ---
    const getUserColor = (userId: number, name: string) => {
        if (userColors[userId]) return userColors[userId];
        let hash = 0;
        const str = `${userId}-${name}`;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const h = Math.abs(hash) % 360;
        return `hsl(${h}, 70%, 50%)`;
    };

    const setUserColor = (userId: number, color: string | null) => {
        setUserColors(prev => {
            const next = { ...prev };
            if (color === null) delete next[userId];
            else next[userId] = color;
            try { localStorage.setItem('schedule_user_colors', JSON.stringify(next)); } catch {}
            return next;
        });
    };

    // --- Bulk Actions ---
    const handleClearWeek = async () => {
        if (!confirm('Are you sure you want to clear ALL schedules for this week view?')) return;
        const start = formatLocalDate(weekDays[0]);
        const end = formatLocalDate(weekDays[6]);

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
        setIsEditRecurring(false);
        setEditRecurringEndDate('');
        setNotifyOnEdit(false);
        setNotifyMessage('');
        setEditModalOpen(true);
    };

    const handleUpdateSchedule = async () => {
        if (!editingSchedule || !editShiftId || !editUserId) return;

        if (!editingSchedule.recurring_group_id && isEditRecurring && editRecurringEndDate) {
            // Converting a single shift into a repeating series

            // 1. Delete the old single shift
            await fetch('/api/admin/schedule', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: editingSchedule.id })
            });

            // 2. Format dates for the API generator
            const dates: string[] = [];
            let curObj = new Date(editingSchedule.date + 'T12:00:00'); // Force midday to avoid timezone issues 
            const endObj = new Date(editRecurringEndDate + 'T12:00:00');

            // Push dates roughly 7 days apart
            while (curObj <= endObj) {
                dates.push(formatLocalDate(curObj));
                curObj.setDate(curObj.getDate() + 7);
            }

            // 3. Create the new repeating group via POST
            const res = await fetch('/api/admin/schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userIds: [parseInt(editUserId)],
                    shiftId: parseInt(editShiftId),
                    dates,
                    isRecurring: true
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
            return;
        }

        // Standard logic for single updates or existing recurring series
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
            if (notifyOnEdit) {
                const shiftDef = shifts.find(s => s.id === parseInt(editShiftId));
                const scheduleEntries = [{
                    date: editingSchedule.date.split('T')[0],
                    shiftName: shiftDef?.label || editingSchedule.shift_name,
                    startTime: shiftDef?.start_time || editingSchedule.start_time,
                    endTime: shiftDef?.end_time || editingSchedule.end_time,
                    color: shiftDef?.color || '#3b82f6',
                }];
                await fetch('/api/admin/schedule/notify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userIds: [parseInt(editUserId)], scheduleEntries, message: notifyMessage }),
                });
            }
            setNotifyOnEdit(false);
            setNotifyMessage('');
            setEditModalOpen(false);
            if (activeTab === 'weekly') fetchSchedules(weekStart, 7);
            else if (activeTab === 'monthly') fetchSchedules(currentDate, 35);
            else fetchSchedules(currentDate, 1);
        } else {
            alert('Failed to update schedule');
        }
    };

    // --- Drag and Drop Handlers ---
    const findNearestShift = (timeMinutes: number): Shift | null => {
        if (shifts.length === 0) return null;
        return shifts.reduce((best, s) => {
            const [sh, sm] = s.start_time.split(':').map(Number);
            const [bh, bm] = best.start_time.split(':').map(Number);
            return Math.abs(sh * 60 + sm - timeMinutes) < Math.abs(bh * 60 + bm - timeMinutes) ? s : best;
        });
    };

    const handleDragStart = (e: React.DragEvent, schedule: Schedule) => {
        e.dataTransfer.setData('application/json', JSON.stringify(schedule));
        setDraggedSchedule(schedule);
        setDragOverCell(null);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent, dateStr?: string, userId?: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (viewMode === 'timeline' && dateStr && userId !== undefined) {
            const rect = e.currentTarget.getBoundingClientRect();
            const xPct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const cursorMin = xPct * 24 * 60;

            // Snap to an existing occupied bar if cursor is within it
            const cellSchedules = schedules.filter(s =>
                s.user_id === userId &&
                s.date.split('T')[0] === dateStr &&
                (!draggedSchedule || s.id !== draggedSchedule.id)
            );
            let occupiedSnap: Shift | null = null;
            for (const sched of cellSchedules) {
                const [sh, sm] = sched.start_time.split(':').map(Number);
                const [eh, em] = sched.end_time.split(':').map(Number);
                const startMin = sh * 60 + sm;
                const endMin = (eh * 60 + em) > startMin ? (eh * 60 + em) : 24 * 60;
                if (cursorMin >= startMin && cursorMin <= endMin) {
                    occupiedSnap = shifts.find(s => s.id === sched.shift_id) ?? null;
                    break;
                }
            }

            const snap = occupiedSnap ?? findNearestShift(cursorMin);
            setDragOverCell({ userId, dateStr, snapShiftId: snap?.id ?? null });
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        const related = e.relatedTarget as Node | null;
        if (!related || !e.currentTarget.contains(related)) setDragOverCell(null);
    };

    const handleDrop = (e: React.DragEvent, targetDateStr: string, targetUserId?: number) => {
        e.preventDefault();
        if (!draggedSchedule) return;

        const resolvedUserId = targetUserId ?? draggedSchedule.user_id;
        const snapShiftId = dragOverCell?.snapShiftId ?? draggedSchedule.shift_id;
        const sourceDateStr = draggedSchedule.date.split('T')[0];

        // Same position — no-op
        if (sourceDateStr === targetDateStr && draggedSchedule.user_id === resolvedUserId && draggedSchedule.shift_id === snapShiftId) {
            setDraggedSchedule(null);
            setDragOverCell(null);
            return;
        }

        const occupying = schedules.find(s =>
            s.id !== draggedSchedule.id &&
            s.user_id === resolvedUserId &&
            s.date.split('T')[0] === targetDateStr &&
            s.shift_id === snapShiftId
        ) ?? null;

        setDropModal({ dragged: draggedSchedule, targetUserId: resolvedUserId, targetDateStr, snapShiftId, occupying });
        setDraggedSchedule(null);
        setDragOverCell(null);
    };

    const executeDropMove = async (action: 'move' | 'swap' | 'replace') => {
        if (!dropModal) return;
        const { dragged, targetUserId, targetDateStr, snapShiftId, occupying } = dropModal;
        const sourceDateStr = dragged.date.split('T')[0];
        const locParam = !scheduleSettings.globalMode && selectedLocationId ? { locationId: selectedLocationId } : {};

        const deleteBody = (s: Schedule) => JSON.stringify({
            id: s.id,
            ...(s.recurring_group_id ? { modifyStrategy: 'instance', recurringGroupId: s.recurring_group_id, date: s.date.split('T')[0] } : {})
        });

        if (action === 'move') {
            await fetch('/api/admin/schedule', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: deleteBody(dragged) });
            await fetch('/api/admin/schedule', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userIds: [targetUserId], shiftId: snapShiftId, dates: [targetDateStr], isRecurring: false, ...locParam })
            });
        } else if (action === 'swap' && occupying) {
            await Promise.all([
                fetch('/api/admin/schedule', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: deleteBody(dragged) }),
                fetch('/api/admin/schedule', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: deleteBody(occupying) }),
            ]);
            await Promise.all([
                fetch('/api/admin/schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userIds: [targetUserId], shiftId: dragged.shift_id, dates: [targetDateStr], isRecurring: false, ...locParam }) }),
                fetch('/api/admin/schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userIds: [dragged.user_id], shiftId: snapShiftId, dates: [sourceDateStr], isRecurring: false, ...locParam }) }),
            ]);
        } else if (action === 'replace' && occupying) {
            await Promise.all([
                fetch('/api/admin/schedule', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: deleteBody(dragged) }),
                fetch('/api/admin/schedule', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: deleteBody(occupying) }),
            ]);
            await fetch('/api/admin/schedule', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userIds: [targetUserId], shiftId: snapShiftId, dates: [targetDateStr], isRecurring: false, ...locParam })
            });
        }

        setDropModal(null);
        if (activeTab === 'weekly') fetchSchedules(weekStart, 7);
        else if (activeTab === 'monthly') fetchSchedules(currentDate, 35);
        else fetchSchedules(currentDate, 1);
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
            start = formatLocalDate(new Date(year, month, 1));
            end = formatLocalDate(new Date(year, month + 1, 0));
        } else {
            const s = new Date(startDate);
            s.setDate(s.getDate() - 1);
            start = formatLocalDate(s);
            end = formatLocalDate(new Date(startDate.getTime() + (days - 1) * 24 * 60 * 60 * 1000));
        }

        const locParam = selectedLocationId ? `&locationId=${selectedLocationId}` : '';
        const res = await fetch(`/api/admin/schedule?start=${start}&end=${end}${locParam}`);
        const data = await res.json();
        if (data.schedules) setSchedules(data.schedules);
    };

    const fetchSwaps = async (status: string) => {
        setSwapLoading(true);
        try {
            const res = await fetch(`/api/admin/schedule/swap?status=${status}`);
            const data = await res.json();
            setSwapRequests(data.swaps || []);
        } finally {
            setSwapLoading(false);
        }
    };

    const handleSwapAction = async (swapId: number, action: 'approve' | 'decline') => {
        const body: any = { swap_id: swapId, action };
        if (action === 'decline') body.decline_reason = swapDeclineReason || undefined;
        await fetch('/api/admin/schedule/swap', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        setSwapDeclineId(null);
        setSwapDeclineReason('');
        fetchSwaps(swapStatusFilter);
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
        if (selectedUsers.length === 0 || !selectedShift || !startDate) return alert('Please fill all fields');
        if (isRecurring && !recurringEndDate) return alert('Please select a recurring end date');

        const finalEndDate = endDate || startDate; // Use start date if end date is not explicitly set (single day)

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
        const end = parseDate(finalEndDate);

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
                dates,
                isRecurring,
                ...(!scheduleSettings.globalMode && selectedLocationId ? { locationId: selectedLocationId } : {})
            })
        });

        if (res.ok) {
            if (notifyOnAssign && selectedUsers.length > 0) {
                const shiftDef = shifts.find(s => s.id === parseInt(selectedShift));
                const scheduleEntries = dates.map(d => ({
                    date: d,
                    shiftName: shiftDef?.label || '',
                    startTime: shiftDef?.start_time || '',
                    endTime: shiftDef?.end_time || '',
                    color: shiftDef?.color || '#3b82f6',
                }));
                await fetch('/api/admin/schedule/notify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userIds: selectedUsers, scheduleEntries, message: notifyMessage }),
                });
            }

            alert('Schedule Updated');

            // Reset Form
            setSelectedUsers([]);
            setSelectedShift('');
            setStartDate('');
            setEndDate('');
            setIsRecurring(false);
            setRecurringEndDate('');
            setNotifyOnAssign(false);
            setNotifyMessage('');

            setAssignModalOpen(false);
            if (activeTab === 'weekly') fetchSchedules(weekStart, 7);
            else if (activeTab === 'monthly') fetchSchedules(currentDate, 35);
            else fetchSchedules(currentDate, 1);
        } else {
            alert('Failed to save');
        }
    };

    const handleDelete = (id: number, schedule?: Schedule) => {
        // If called from edit modal, use the already-chosen modifyStrategy
        if (editModalOpen && schedule) {
            executeDelete(id, schedule, modifyStrategy);
            return;
        }
        // For non-recurring: simple confirm
        if (!schedule?.recurring_group_id) {
            if (!confirm('Delete this shift?')) return;
            executeDelete(id, schedule, 'instance');
            return;
        }
        // Recurring: show proper modal
        setDeleteConfirm({ id, schedule });
    };

    const executeDelete = async (id: number, schedule: Schedule | undefined, strat: 'instance' | 'following' | 'all') => {
        const payload: any = { id };
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

        setDeleteConfirm(null);
        setEditModalOpen(false);
        if (activeTab === 'weekly') fetchSchedules(weekStart, 7);
        else if (activeTab === 'monthly') fetchSchedules(currentDate, 35);
        else fetchSchedules(currentDate, 1);
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
            .print-only { display: block !important; }
            table { border-collapse: collapse !important; width: 100%; }
            th, td { border: 1px solid #000 !important; color: black !important; }
            .shift-badge { border: 1px solid #000 !important; color: black !important; background: transparent !important; }
            .print-location-header { display: block !important; font-size: 18px; font-weight: bold; margin-bottom: 8px; }
        }
        .print-only { display: none; }
    `;

    return (
        <div className={`${styles.container} scheduler-container`}>
            <style>{printStyles}</style>

            <div className="flex justify-between items-center mb-6 no-print">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <h1 className="text-2xl font-bold text-white">Staff Scheduler</h1>
                        {myLocations.length > 1 && (
                            <div className="flex items-center gap-2">
                                {!scheduleSettings.globalMode && (
                                    <span className="text-xs text-blue-400 font-semibold uppercase tracking-wide">Location:</span>
                                )}
                                <select
                                    value={selectedLocationId ?? ''}
                                    onChange={e => setSelectedLocationId(parseInt(e.target.value))}
                                    className={`border text-white text-sm rounded px-3 py-1.5 focus:outline-none focus:border-blue-500 ${!scheduleSettings.globalMode ? 'bg-blue-900/40 border-blue-600 font-semibold' : 'bg-gray-800 border-gray-600'}`}
                                >
                                    {myLocations.map(l => (
                                        <option key={l.id} value={l.id}>{l.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        {!scheduleSettings.globalMode && (
                            <span className="text-xs bg-blue-900/40 border border-blue-700 text-blue-300 rounded px-2 py-0.5">Per-Location Mode</span>
                        )}
                    </div>
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
                        <button
                            onClick={() => setActiveTab('swaps')}
                            className={`pb-1 border-b-2 transition-colors ${activeTab === 'swaps' ? 'border-amber-400 text-white' : 'border-transparent text-gray-400 hover:text-gray-300'}`}
                        >
                            Swap Requests
                        </button>
                    </div>
                </div>
                <div className="flex gap-4">
                    {activeTab !== 'shifts' && activeTab !== 'swaps' && (
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
                    {activeTab === 'swaps' && (
                        <button
                            type="button"
                            onClick={() => fetchSwaps(swapStatusFilter)}
                            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded font-bold flex items-center gap-2"
                        >
                            Refresh
                        </button>
                    )}
                </div>
            </div>

            {/* TAB: SHIFTS */}
            {activeTab === 'shifts' && (
                <ShiftManager
                    scheduleSettings={scheduleSettings}
                    onSettingsChange={setScheduleSettings}
                />
            )}

            {/* TAB: SWAP REQUESTS */}
            {activeTab === 'swaps' && (
                <div className="bg-gray-900 rounded-lg border border-gray-700 p-4">
                    {/* Filter */}
                    <div className="flex items-center gap-3 mb-5">
                        <span className="text-sm text-gray-400">Show:</span>
                        {(['pending_manager', 'approved', 'declined', 'open'] as const).map(s => (
                            <button
                                key={s}
                                type="button"
                                onClick={() => setSwapStatusFilter(s)}
                                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${swapStatusFilter === s
                                    ? 'bg-amber-500 text-black'
                                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                                }`}
                            >
                                {s === 'pending_manager' ? 'Needs Approval' : s === 'open' ? 'Open Requests' : s.charAt(0).toUpperCase() + s.slice(1)}
                            </button>
                        ))}
                    </div>

                    {swapLoading && <p className="text-gray-400 text-sm py-8 text-center">Loading…</p>}

                    {!swapLoading && swapRequests.length === 0 && (
                        <p className="text-gray-500 text-sm py-8 text-center">No swap requests with status "{swapStatusFilter}".</p>
                    )}

                    {!swapLoading && swapRequests.map((s: any) => {
                        const isGiveaway = s.is_giveaway;
                        const isOpen = s.request_type === 'open';
                        return (
                            <div key={s.id} className="mb-4 bg-gray-800 rounded-lg border border-gray-700 p-4">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        {/* Badge */}
                                        <div className="flex items-center gap-2 mb-2">
                                            {isGiveaway
                                                ? <span className="text-xs bg-purple-900/50 text-purple-300 border border-purple-700 px-2 py-0.5 rounded-full">Give Away</span>
                                                : <span className="text-xs bg-blue-900/50 text-blue-300 border border-blue-700 px-2 py-0.5 rounded-full">Swap</span>
                                            }
                                            {isOpen && s.status === 'open' && (
                                                <span className="text-xs bg-amber-900/50 text-amber-300 border border-amber-700 px-2 py-0.5 rounded-full">Open — Unclaimed</span>
                                            )}
                                            {isOpen && s.status === 'pending_manager' && (
                                                <span className="text-xs bg-amber-900/50 text-amber-300 border border-amber-700 px-2 py-0.5 rounded-full">Claimed</span>
                                            )}
                                        </div>

                                        {/* Requester shift */}
                                        <div className="flex items-center gap-2 text-sm">
                                            <span className="text-gray-300 font-medium">{s.requester_name}</span>
                                            <span className="text-gray-500">→</span>
                                            <span className="text-white">{s.requester_shift}</span>
                                            <span className="text-gray-400">{s.requester_date}</span>
                                            <span className="text-gray-500 text-xs">{s.requester_start?.slice(0,5)}–{s.requester_end?.slice(0,5)}</span>
                                        </div>

                                        {/* Target shift (if applicable) */}
                                        {s.target_name && (
                                            <div className="flex items-center gap-2 text-sm mt-1">
                                                <span className="text-gray-300 font-medium">{s.target_name}</span>
                                                {!isGiveaway && s.target_shift && (
                                                    <>
                                                        <span className="text-gray-500">→</span>
                                                        <span className="text-white">{s.target_shift}</span>
                                                        <span className="text-gray-400">{s.target_date}</span>
                                                        <span className="text-gray-500 text-xs">{s.target_start?.slice(0,5)}–{s.target_end?.slice(0,5)}</span>
                                                    </>
                                                )}
                                                {isGiveaway && <span className="text-green-400 text-xs">will cover</span>}
                                            </div>
                                        )}

                                        {s.message && (
                                            <p className="text-gray-400 text-xs mt-1 italic">"{s.message}"</p>
                                        )}
                                        {s.decline_reason && (
                                            <p className="text-red-400 text-xs mt-1">Declined: {s.decline_reason}</p>
                                        )}
                                        <p className="text-gray-600 text-xs mt-1">Submitted {new Date(s.created_at).toLocaleDateString()}</p>
                                    </div>

                                    {/* Actions */}
                                    {swapStatusFilter === 'pending_manager' && (
                                        <div className="flex flex-col items-end gap-2">
                                            {swapDeclineId === s.id ? (
                                                <div className="flex flex-col gap-2 items-end">
                                                    <input
                                                        type="text"
                                                        value={swapDeclineReason}
                                                        onChange={e => setSwapDeclineReason(e.target.value)}
                                                        placeholder="Reason (optional)"
                                                        className="bg-gray-900 border border-gray-600 text-white text-xs rounded px-2 py-1 w-48"
                                                    />
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => { setSwapDeclineId(null); setSwapDeclineReason(''); }}
                                                            className="text-xs text-gray-400 hover:text-white px-2 py-1"
                                                        >
                                                            Cancel
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSwapAction(s.id, 'decline')}
                                                            className="text-xs bg-red-700 hover:bg-red-600 text-white px-3 py-1 rounded"
                                                        >
                                                            Confirm Decline
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSwapDeclineId(s.id)}
                                                        className="text-xs bg-gray-700 hover:bg-red-800 text-red-400 hover:text-red-300 px-3 py-1.5 rounded border border-gray-600"
                                                    >
                                                        Decline
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSwapAction(s.id, 'approve')}
                                                        className="text-xs bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded"
                                                    >
                                                        {isGiveaway ? 'Approve Giveaway' : 'Approve Swap'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

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
                    {/* Print-only location + week header */}
                    <div className="print-only" style={{ marginBottom: '12px' }}>
                        {selectedLocationName && <div className="print-location-header">{selectedLocationName} — Staff Schedule</div>}
                        <div style={{ fontSize: '14px', color: '#555' }}>Week of {weekStart.toLocaleDateString()}</div>
                    </div>
                    <div className="flex justify-between items-center bg-gray-800 p-4 rounded-t-lg border border-gray-700 no-print">
                        <div className="flex items-center gap-4">
                            <button onClick={() => changeWeek(-1)} className="text-white hover:bg-gray-700 p-1 rounded"><ChevronLeft /></button>
                            <h2 className="text-xl font-bold text-white">
                                {selectedLocationName && <span className="text-blue-400 mr-2">{selectedLocationName} —</span>}Week of {weekStart.toLocaleDateString()}
                            </h2>
                            <button onClick={() => changeWeek(1)} className="text-white hover:bg-gray-700 p-1 rounded"><ChevronRight /></button>

                            {/* Clear Bulk Options */}
                            <button onClick={handleClearWeek} className="text-red-400 hover:text-red-300 hover:bg-gray-800 px-2 py-1 rounded text-sm transition-colors border border-red-900/50 ml-4">Clear Week</button>
                            <button onClick={handleClearFuture} className="text-red-400 hover:text-red-300 hover:bg-gray-800 px-2 py-1 rounded text-sm transition-colors border border-red-900/50">Clear Future</button>
                        </div>

                        <div className="flex gap-4 items-center">
                            <div className="bg-gray-700 rounded p-1 flex text-sm">
                                <button
                                    onClick={() => setViewMode('timeline')}
                                    className={`px-3 py-1 rounded ${viewMode === 'timeline' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                                >
                                    Timeline
                                </button>
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

                    {viewMode !== 'timeline' && (
                    <>
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
                                        <td className="p-4 border-b border-gray-800 bg-gray-900 sticky left-0 border-r border-gray-700 print:bg-white print:border-black">
                                            <div className="font-medium text-white print:text-black">{user.first_name} {user.last_name}</div>
                                            {user.position && <div style={{ color: '#60a5fa', fontSize: '0.75rem' }}>{user.position}</div>}
                                        </td>
                                        {weekDays.map((d, di) => {
                                            const dateStr = formatLocalDate(d);
                                            const isLastDay = di === weekDays.length - 1;
                                            const todaysSchedules = schedules.filter(s => s.user_id === user.id && s.date.split('T')[0] === dateStr);

                                            return (
                                                <td
                                                    key={dateStr}
                                                    className="border-b border-gray-800 border-r border-gray-800 relative h-24 print:border-black"
                                                    style={{ overflow: 'visible', padding: 0 }}
                                                    onDragOver={(e) => handleDragOver(e, dateStr, user.id)}
                                                    onDragLeave={handleDragLeave}
                                                    onDrop={(e) => handleDrop(e, dateStr, user.id)}
                                                >
                                                    <div className="relative w-full h-full" style={{ overflow: 'visible' }}>
                                                        {/* Subtle hour grid lines */}
                                                        {[6, 12, 18].map(h => (
                                                            <div key={h} className="absolute inset-y-0 border-l border-gray-700/30" style={{ left: `${(h / 24) * 100}%` }} />
                                                        ))}

                                                        {todaysSchedules.map(schedule => {
                                                            const shiftDef = shifts.find(s => s.id === schedule.shift_id);
                                                            const color = shiftDef?.color || '#3b82f6';
                                                            const [startH, startM] = schedule.start_time.split(':').map(Number);
                                                            const [endH, endM] = schedule.end_time.split(':').map(Number);
                                                            const startTotal = startH * 60 + startM;
                                                            const endTotal = endH * 60 + endM;
                                                            const isOvernight = startTotal > endTotal;
                                                            const leftPct = (startTotal / (24 * 60)) * 100;
                                                            const widthPct = isOvernight && !isLastDay
                                                                ? Math.max(((24 * 60 - startTotal + endTotal) / (24 * 60)) * 100, 3.5)
                                                                : Math.max(((isOvernight ? 24 * 60 : endTotal) - startTotal) / (24 * 60) * 100, 3.5);
                                                            const fmtShort = (h: number, m: number) =>
                                                                `${h % 12 || 12}:${String(m).padStart(2, '0')}${h >= 12 ? 'p' : 'a'}`;

                                                            return (
                                                                <div
                                                                    key={schedule.id}
                                                                    draggable
                                                                    onDragStart={(e) => handleDragStart(e, schedule)}
                                                                    onDragEnd={() => { setDraggedSchedule(null); setDragOverCell(null); }}
                                                                    className="absolute rounded px-2 flex flex-col justify-center overflow-hidden group cursor-grab active:cursor-grabbing hover:brightness-110 transition-all"
                                                                    style={{
                                                                        left: `${leftPct}%`,
                                                                        width: `${widthPct}%`,
                                                                        top: '12%',
                                                                        height: '76%',
                                                                        backgroundColor: color,
                                                                        border: '1px solid rgba(255,255,255,0.14)',
                                                                        backgroundImage: 'linear-gradient(to bottom, rgba(255,255,255,0.15) 0%, rgba(0,0,0,0.06) 100%)',
                                                                        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                                                                        zIndex: isOvernight && !isLastDay ? 20 : 3,
                                                                    }}
                                                                    onClick={() => handleEdit(schedule)}
                                                                    title={`${schedule.shift_name} · ${schedule.start_time}–${schedule.end_time}`}
                                                                >
                                                                    <div className="text-white text-xs font-bold truncate leading-tight drop-shadow-sm">{schedule.shift_name}</div>
                                                                    <div className="text-white/90 text-[11px] truncate leading-tight drop-shadow-sm">{fmtShort(startH, startM)}–{fmtShort(endH, endM)}</div>
                                                                    {schedule.recurring_group_id && <div className="absolute left-1.5 top-1.5 w-1.5 h-1.5 rounded-full bg-white/60" title="Recurring" />}
                                                                    <button
                                                                        title="Delete"
                                                                        onClick={(e) => { e.stopPropagation(); handleDelete(schedule.id, schedule); }}
                                                                        className="absolute right-0 top-0 bottom-0 bg-black/40 px-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center rounded-r-[4px] backdrop-blur-sm"
                                                                    >
                                                                        <Trash2 size={9} className="text-white" />
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
                                                    <div className="text-xs text-gray-500">{(() => { const fT = (t: string) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2,'0')}${h >= 12 ? 'p' : 'a'}`; }; return `${fT(shift.start_time)}–${fT(shift.end_time)}`; })()}</div>
                                                </div>
                                            </div>
                                        </td>
                                        {weekDays.map(d => {
                                            const dateStr = formatLocalDate(d);
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
                                                    <div className="text-xs text-gray-500">{(() => { const fT = (t: string) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2,'0')}${h >= 12 ? 'p' : 'a'}`; }; return `${fT(shift.start_time)}–${fT(shift.end_time)}`; })()}</div>
                                                </div>
                                            </div>
                                        </td>
                                        {weekDays.map(d => {
                                            const dateStr = formatLocalDate(d);
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

                    {/* TIMELINE VIEW */}
                    {viewMode === 'timeline' && (
                        <div className="overflow-x-auto border border-gray-700 rounded-b-lg bg-gray-900">
                            {/* Day header row */}
                            <div className="flex" style={{ minWidth: '1000px' }}>
                                <div className="flex-shrink-0 bg-gray-800 border-r border-b border-gray-700" style={{ width: '180px' }} />
                                {weekDays.map((day, i) => {
                                    const isToday = formatLocalDate(day) === formatLocalDate(new Date());
                                    return (
                                        <div
                                            key={i}
                                            className={`flex-1 border-r border-b border-gray-700 px-2 py-2 text-center ${isToday ? 'bg-blue-900/30' : 'bg-gray-800'}`}
                                        >
                                            <div className={`font-bold text-sm ${isToday ? 'text-blue-300' : 'text-white'}`}>
                                                {day.toLocaleDateString('en-US', { weekday: 'short' })}
                                            </div>
                                            <div className={`text-xs ${isToday ? 'text-blue-400 font-bold' : 'text-gray-500'}`}>
                                                {day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                            </div>
                                            {/* Hour tick marks */}
                                            <div className="relative mt-1 h-3">
                                                {[6, 12, 18].map(h => (
                                                    <div
                                                        key={h}
                                                        className="absolute text-[9px] text-gray-600 -translate-x-1/2"
                                                        style={{ left: `${(h / 24) * 100}%` }}
                                                    >
                                                        {h === 12 ? '12p' : h > 12 ? `${h - 12}p` : `${h}a`}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Employee rows */}
                            {users.length === 0 ? (
                                <div className="text-center text-gray-500 py-10 text-sm">No employees found for this location.</div>
                            ) : (
                                users.map(user => (
                                    <div key={user.id} className="flex border-b border-gray-800/80 hover:bg-white/[0.02] transition-colors" style={{ minWidth: '1000px', height: '76px' }}>
                                        {/* Name column — fixed, vertically centred, click to change color */}
                                        <div
                                            className="flex-shrink-0 border-r border-gray-800 flex items-center group cursor-pointer hover:bg-white/5 transition-colors relative overflow-hidden"
                                            style={{ width: '180px', height: '76px' }}
                                            onClick={() => setColorPickerUserId(colorPickerUserId === user.id ? null : user.id)}
                                            title="Click to change employee color"
                                        >
                                            <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: getUserColor(user.id, user.first_name) }} />
                                            <div className="min-w-0 pl-3 flex-1 pr-1">
                                                <div className="text-white text-sm font-semibold leading-tight truncate">{user.first_name} {user.last_name}</div>
                                                {user.position && <div className="text-blue-400 text-xs leading-tight truncate mt-0.5">{user.position}</div>}
                                            </div>
                                            <Palette size={11} className="text-gray-700 group-hover:text-gray-400 flex-shrink-0 mr-2 transition-colors" />
                                        </div>

                                        {/* Day columns */}
                                        {weekDays.map((day, di) => {
                                            const dateStr = formatLocalDate(day);
                                            const isToday = dateStr === formatLocalDate(new Date());
                                            const daySchedules = schedules.filter(s => s.user_id === user.id && s.date.split('T')[0] === dateStr);

                                            const prevDay = new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1);
                                            const prevDateStr = formatLocalDate(prevDay);
                                            const overnightSpillovers = schedules.filter(s => {
                                                if (s.user_id !== user.id || s.date.split('T')[0] !== prevDateStr) return false;
                                                const [sh, sm] = s.start_time.split(':').map(Number);
                                                const [eh, em] = s.end_time.split(':').map(Number);
                                                return (sh * 60 + sm) > (eh * 60 + em);
                                            });

                                            // Fixed bar geometry — all bars are the same height regardless of row content
                                            const BAR_TOP = 12;   // px from top of 76px row
                                            const BAR_H   = 52;   // px — leaves 12px bottom gap

                                            return (
                                                <div
                                                    key={di}
                                                    className={`flex-1 border-r border-gray-800/60 relative ${isToday ? 'bg-blue-950/20' : ''}`}
                                                    style={{ height: '76px', overflow: 'visible' }}
                                                    onDragOver={(e) => handleDragOver(e, dateStr, user.id)}
                                                    onDragLeave={handleDragLeave}
                                                    onDrop={(e) => handleDrop(e, dateStr, user.id)}
                                                >
                                                    {/* Snap target highlight while dragging */}
                                                    {dragOverCell?.userId === user.id && dragOverCell?.dateStr === dateStr && (() => {
                                                        const snap = shifts.find(s => s.id === dragOverCell.snapShiftId);
                                                        if (!snap) return null;
                                                        const isOccupied = schedules.some(s =>
                                                            s.id !== draggedSchedule?.id &&
                                                            s.user_id === user.id &&
                                                            s.date.split('T')[0] === dateStr &&
                                                            s.shift_id === dragOverCell.snapShiftId
                                                        );
                                                        const [sh, sm] = snap.start_time.split(':').map(Number);
                                                        const [eh, em] = snap.end_time.split(':').map(Number);
                                                        const startTotal = sh * 60 + sm;
                                                        const endTotal = eh * 60 + em > startTotal ? eh * 60 + em : 24 * 60;
                                                        const snapLeft = (startTotal / (24 * 60)) * 100;
                                                        const snapWidth = ((endTotal - startTotal) / (24 * 60)) * 100;
                                                        return (
                                                            <div
                                                                className="absolute rounded pointer-events-none"
                                                                style={{
                                                                    top: BAR_TOP, height: BAR_H,
                                                                    left: `${snapLeft}%`, width: `${snapWidth}%`,
                                                                    backgroundColor: isOccupied ? 'rgba(239,68,68,0.4)' : snap.color,
                                                                    opacity: isOccupied ? 1 : 0.38,
                                                                    border: isOccupied
                                                                        ? '2px dashed rgba(239,68,68,0.95)'
                                                                        : '2px dashed rgba(255,255,255,0.85)',
                                                                    zIndex: 15,
                                                                    boxShadow: isOccupied ? '0 0 0 1px rgba(239,68,68,0.3)' : undefined,
                                                                }}
                                                            />
                                                        );
                                                    })()}

                                                    {/* Subtle hour grid lines */}
                                                    {[6, 12, 18].map(h => (
                                                        <div
                                                            key={h}
                                                            className="absolute inset-y-0 border-l border-gray-700/30"
                                                            style={{ left: `${(h / 24) * 100}%` }}
                                                        />
                                                    ))}

                                                    {/* Empty-row hint */}
                                                    {daySchedules.length === 0 && overnightSpillovers.length === 0 && (
                                                        <div
                                                            className="absolute left-0 right-0 border-t border-dashed border-gray-800/50"
                                                            style={{ top: BAR_TOP + BAR_H / 2 }}
                                                        />
                                                    )}


                                                    {/* Shift bars — width = time span, height = fixed BAR_H */}
                                                    {daySchedules.map(schedule => {
                                                        const shiftDef = shifts.find(s => s.id === schedule.shift_id);
                                                        const color = shiftDef?.color || '#3b82f6';
                                                        const [startH, startM] = schedule.start_time.split(':').map(Number);
                                                        const [endH, endM] = schedule.end_time.split(':').map(Number);
                                                        const startTotal = startH * 60 + startM;
                                                        const endTotal = endH * 60 + endM;
                                                        const isOvernight = startTotal > endTotal;
                                                        const leftPct = (startTotal / (24 * 60)) * 100;
                                                        // Overnight bars span into the next column as one box.
                                                        // For the last day of the view there is no next column, so cap at midnight.
                                                        const isLastDay = di === weekDays.length - 1;
                                                        const widthPct = isOvernight && !isLastDay
                                                            ? Math.max(((24 * 60 - startTotal + endTotal) / (24 * 60)) * 100, 3.5)
                                                            : Math.max(((isOvernight ? 24 * 60 : endTotal) - startTotal) / (24 * 60) * 100, 3.5);

                                                        // Text tier based on bar width:
                                                        //  < 3%  → no text
                                                        //  3–8%  → start time only (short format)
                                                        //  8–15% → "start–end" on one line
                                                        //  ≥ 15% → shift name + time on two lines
                                                        const fmtShort = (h: number, m: number) =>
                                                            `${h % 12 || 12}:${String(m).padStart(2,'0')}${h >= 12 ? 'p' : 'a'}`;
                                                        const startShort = fmtShort(startH, startM);
                                                        const endShort   = fmtShort(endH, endM);
                                                        const tier = widthPct < 3 ? 0 : widthPct < 8 ? 1 : widthPct < 15 ? 2 : 3;

                                                        return (
                                                            <div
                                                                key={schedule.id}
                                                                draggable
                                                                onDragStart={(e) => handleDragStart(e, schedule)}
                                                                onDragEnd={() => { setDraggedSchedule(null); setDragOverCell(null); }}
                                                                className="absolute overflow-hidden group cursor-grab active:cursor-grabbing hover:brightness-110 hover:z-10 transition-all"
                                                                style={{
                                                                    top: BAR_TOP,
                                                                    height: BAR_H,
                                                                    left: `${leftPct}%`,
                                                                    width: `${widthPct}%`,
                                                                    backgroundColor: color,
                                                                    borderRadius: '5px',
                                                                    border: '1px solid rgba(255,255,255,0.14)',
                                                                    backgroundImage: 'linear-gradient(to bottom, rgba(255,255,255,0.15) 0%, rgba(0,0,0,0.06) 100%)',
                                                                    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                                                                    zIndex: isOvernight && !isLastDay ? 20 : 3,
                                                                }}
                                                                onClick={() => handleEdit(schedule)}
                                                                title={`${schedule.shift_name} · ${schedule.start_time}–${schedule.end_time}`}
                                                            >
                                                                {/* Text content — tiered by bar width */}
                                                                <div className="h-full flex flex-col justify-center px-2 min-w-0 pr-4">
                                                                    {tier >= 3 && (
                                                                        <div className="text-white text-xs font-bold truncate leading-tight drop-shadow-sm">
                                                                            {schedule.shift_name}
                                                                        </div>
                                                                    )}
                                                                    {tier >= 2 && (
                                                                        <div className="text-white/90 text-[11px] truncate leading-tight drop-shadow-sm">
                                                                            {startShort}–{endShort}
                                                                        </div>
                                                                    )}
                                                                    {tier === 1 && (
                                                                        <div className="text-white text-[10px] font-semibold truncate leading-tight drop-shadow-sm">
                                                                            {startShort}
                                                                        </div>
                                                                    )}
                                                                    {/* tier 0: no text, just color */}
                                                                </div>

                                                                {/* Recurring dot — top-left so it doesn't clash with delete button */}
                                                                {schedule.recurring_group_id && (
                                                                    <div className="absolute left-1.5 top-1.5 w-1.5 h-1.5 rounded-full bg-white/60" title="Recurring" />
                                                                )}

                                                                {/* Delete on hover */}
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleDelete(schedule.id, schedule); }}
                                                                    className="absolute right-0 top-0 bottom-0 bg-black/40 px-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center rounded-r-[4px] backdrop-blur-sm"
                                                                >
                                                                    <Trash2 size={9} className="text-white" />
                                                                </button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))
                            )}

                            {/* Time scale footer */}
                            <div className="flex border-t border-gray-700" style={{ minWidth: '1000px' }}>
                                <div className="flex-shrink-0" style={{ width: '180px' }} />
                                {weekDays.map((_, i) => (
                                    <div key={i} className="flex-1 relative" style={{ height: '22px', overflow: 'visible' }}>
                                        {[0, 6, 12, 18].map(h => (
                                            <div
                                                key={h}
                                                className="absolute text-[9px] text-gray-500 -translate-x-1/2"
                                                style={{ left: `${(h / 24) * 100}%`, top: '4px', whiteSpace: 'nowrap' }}
                                            >
                                                {h === 0 ? '12a' : h === 12 ? '12p' : h > 12 ? `${h - 12}p` : `${h}a`}
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* TAB: DAILY (TIMELINE) */}
            {activeTab === 'daily' && (
                <>
                    <div className="flex justify-between items-center bg-gray-800 p-4 rounded-t-lg border border-gray-700 no-print">
                        <div className="flex items-center gap-4">
                            <button onClick={() => changeDay(-1)} className="text-white hover:bg-gray-700 p-1 rounded"><ChevronLeft /></button>
                            <h2 className="text-xl font-bold text-white">
                                {selectedLocationName && <span className="text-blue-400 mr-2">{selectedLocationName} —</span>}{currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
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
                                const dayStr = formatLocalDate(currentDate);
                                const userSchedules = schedules.filter(s => s.user_id === user.id && s.date.split('T')[0] === dayStr);
                                if (userSchedules.length === 0) return null;

                                return (
                                    <div key={user.id} className="relative h-14 flex items-center bg-gray-800/50 rounded p-2 print:bg-white print:border print:border-gray-200">
                                        <div
                                            className="w-40 z-10 shrink-0 group cursor-pointer flex items-center gap-2"
                                            onClick={() => setColorPickerUserId(colorPickerUserId === user.id ? null : user.id)}
                                            title="Click to change employee color"
                                        >
                                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: getUserColor(user.id, user.first_name) }} />
                                            <div>
                                                <div className="font-bold text-white print:text-black text-sm leading-tight">{user.first_name} {user.last_name}</div>
                                                {user.position && <div className="text-blue-400 text-xs">{user.position}</div>}
                                            </div>
                                            <Palette size={10} className="text-gray-700 group-hover:text-gray-400 transition-colors flex-shrink-0" />
                                        </div>

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
                                                            {schedule.shift_name} ({(() => { const fT = (t: string) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2,'0')}${h >= 12 ? 'p' : 'a'}`; }; return `${fT(schedule.start_time)}–${fT(schedule.end_time)}`; })()})
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
                    <div className="bg-gray-800 rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-xl border border-gray-700">
                        <h2 className="text-xl font-bold text-white mb-6">Assign Shifts</h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-gray-400 text-sm mb-2">Select Employees</label>
                                <div className="max-h-40 overflow-y-auto bg-gray-900 p-2 rounded border border-gray-700">
                                    {users.length === 0 && (
                                        <p className="text-gray-500 text-sm p-2">No employees assigned to this location.</p>
                                    )}
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

                            <div className="bg-gray-900 border border-gray-700 p-4 rounded mb-2">
                                <label className="block text-gray-400 text-sm font-bold mb-4">Select Date(s)</label>
                                <DateRangePicker
                                    startDate={startDate}
                                    endDate={endDate}
                                    setStartDate={setStartDate}
                                    setEndDate={setEndDate}
                                />
                                <p className="text-xs text-gray-500 mt-2">Click a date to select a single day. Click a second date to highlight a range. Click a third time to restart.</p>
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
                                    <div className="bg-gray-900 border border-gray-700 p-4 rounded mt-4">
                                        <label className="block text-gray-400 text-sm mb-2">Repeat Until</label>
                                        <div className="flex gap-2 mb-4">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const d = new Date(startDate ? startDate + "T12:00:00" : new Date());
                                                    d.setFullYear(d.getFullYear() + 1);
                                                    setRecurringEndDate(formatLocalDate(d));
                                                }}
                                                className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-white rounded text-sm border border-gray-600 transition-colors"
                                            >
                                                1 Year
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const d = new Date(startDate ? startDate + "T12:00:00" : new Date());
                                                    d.setFullYear(d.getFullYear() + 2);
                                                    setRecurringEndDate(formatLocalDate(d));
                                                }}
                                                className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-white rounded text-sm border border-gray-600 transition-colors"
                                            >
                                                2 Years
                                            </button>
                                        </div>
                                        <DateRangePicker
                                            startDate={recurringEndDate}
                                            endDate={recurringEndDate}
                                            setStartDate={setRecurringEndDate}
                                            setEndDate={() => { }}
                                            singleDayOnly={true}
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="mt-4 pt-4 border-t border-gray-700">
                                <label className="flex items-center gap-2 cursor-pointer mb-2">
                                    <input
                                        type="checkbox"
                                        checked={notifyOnAssign}
                                        onChange={e => setNotifyOnAssign(e.target.checked)}
                                        className="rounded bg-gray-700 border-gray-600"
                                    />
                                    <div>
                                        <span className="text-white block">Notify Selected Employees</span>
                                        <span className="text-xs text-gray-500">Sends an email to selected users with their new schedule.</span>
                                    </div>
                                </label>
                                {notifyOnAssign && (
                                    <input
                                        type="text"
                                        value={notifyMessage}
                                        onChange={e => setNotifyMessage(e.target.value)}
                                        placeholder="Optional message to include in email..."
                                        className="w-full bg-gray-900 text-white rounded p-2 border border-gray-700 text-sm"
                                    />
                                )}
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
            {/* Delete Recurring Confirmation Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
                    <div className="bg-gray-800 rounded-xl max-w-sm w-full p-6 shadow-2xl border border-gray-600">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-red-900/50 flex items-center justify-center flex-shrink-0">
                                <Trash2 size={18} className="text-red-400" />
                            </div>
                            <div>
                                <h3 className="text-white font-bold text-lg">Delete Repeating Shift</h3>
                                <p className="text-gray-400 text-sm">
                                    {deleteConfirm.schedule.first_name} {deleteConfirm.schedule.last_name} &mdash; {deleteConfirm.schedule.shift_name}
                                </p>
                            </div>
                        </div>
                        <p className="text-gray-300 text-sm mb-5">
                            This shift repeats. How would you like to delete it?
                        </p>
                        <div className="flex flex-col gap-2 mb-5">
                            <button
                                onClick={() => executeDelete(deleteConfirm.id, deleteConfirm.schedule, 'instance')}
                                className="w-full text-left px-4 py-3 rounded-lg bg-gray-700 hover:bg-gray-600 border border-gray-600 transition-colors"
                            >
                                <div className="font-semibold text-white text-sm">This shift only</div>
                                <div className="text-gray-400 text-xs mt-0.5">Remove just this single occurrence</div>
                            </button>
                            <button
                                onClick={() => executeDelete(deleteConfirm.id, deleteConfirm.schedule, 'following')}
                                className="w-full text-left px-4 py-3 rounded-lg bg-gray-700 hover:bg-gray-600 border border-gray-600 transition-colors"
                            >
                                <div className="font-semibold text-white text-sm">This and all following shifts</div>
                                <div className="text-gray-400 text-xs mt-0.5">
                                    Remove from {new Date(deleteConfirm.schedule.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} onwards
                                </div>
                            </button>
                            <button
                                onClick={() => executeDelete(deleteConfirm.id, deleteConfirm.schedule, 'all')}
                                className="w-full text-left px-4 py-3 rounded-lg bg-red-900/30 hover:bg-red-900/50 border border-red-800/50 transition-colors"
                            >
                                <div className="font-semibold text-red-300 text-sm">All shifts in this series</div>
                                <div className="text-gray-400 text-xs mt-0.5">Remove every occurrence of this repeating shift</div>
                            </button>
                        </div>
                        <button
                            onClick={() => setDeleteConfirm(null)}
                            className="w-full py-2 text-sm text-gray-400 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Edit Shift Modal */}
            {editModalOpen && editingSchedule && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-800 rounded-lg max-w-sm w-full max-h-[90vh] overflow-y-auto p-6 shadow-xl border border-gray-700">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-white">Edit Shift</h2>
                            <button onClick={() => setEditModalOpen(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
                        </div>

                        <div className="p-3 bg-gray-900 rounded border border-gray-700 mb-5">
                            <div className="text-white font-bold">{editingSchedule.shift_name}</div>
                            <div className="text-sm text-gray-400">
                                {new Date(editingSchedule.date).toLocaleDateString()} &bull; {editingSchedule.start_time}–{editingSchedule.end_time}
                            </div>
                        </div>

                        <div className="space-y-4">
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

                            {editingSchedule.recurring_group_id ? (
                                <div className="p-3 border border-blue-900/50 bg-blue-900/20 rounded">
                                    <h4 className="text-sm font-bold text-blue-400 mb-2">Apply changes to:</h4>
                                    <label className="flex items-center gap-2 cursor-pointer mb-2">
                                        <input
                                            type="radio"
                                            name="modifyMode"
                                            checked={modifyStrategy === 'instance'}
                                            onChange={() => setModifyStrategy('instance')}
                                            className="accent-blue-500"
                                        />
                                        <span className="text-white text-sm">This occurrence only</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer mb-2">
                                        <input
                                            type="radio"
                                            name="modifyMode"
                                            checked={modifyStrategy === 'following'}
                                            onChange={() => setModifyStrategy('following')}
                                            className="accent-blue-500"
                                        />
                                        <span className="text-white text-sm">This and all following</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="modifyMode"
                                            checked={modifyStrategy === 'all'}
                                            onChange={() => setModifyStrategy('all')}
                                            className="accent-blue-500"
                                        />
                                        <span className="text-white text-sm">All occurrences in series</span>
                                    </label>
                                </div>
                            ) : (
                                <div className="p-3 border border-gray-700 bg-gray-900 rounded">
                                    <label className="flex items-center gap-2 cursor-pointer mb-2">
                                        <input
                                            type="checkbox"
                                            checked={isEditRecurring}
                                            onChange={e => setIsEditRecurring(e.target.checked)}
                                            className="rounded bg-gray-800 border-gray-600"
                                        />
                                        <span className="text-white font-bold text-sm">Make this a repeating shift</span>
                                    </label>

                                    {isEditRecurring && (
                                        <div className="mt-4 pl-6">
                                            <label className="block text-gray-400 text-sm mb-2">Repeat Weekly Until:</label>
                                            <div className="flex gap-2 mb-4">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const d = new Date(editingSchedule.date + "T12:00:00");
                                                        d.setFullYear(d.getFullYear() + 1);
                                                        setEditRecurringEndDate(formatLocalDate(d));
                                                    }}
                                                    className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-white rounded text-sm border border-gray-600 transition-colors"
                                                >
                                                    1 Year
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const d = new Date(editingSchedule.date + "T12:00:00");
                                                        d.setFullYear(d.getFullYear() + 2);
                                                        setEditRecurringEndDate(formatLocalDate(d));
                                                    }}
                                                    className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-white rounded text-sm border border-gray-600 transition-colors"
                                                >
                                                    2 Years
                                                </button>
                                            </div>
                                            <DateRangePicker
                                                startDate={editRecurringEndDate}
                                                endDate={editRecurringEndDate}
                                                setStartDate={setEditRecurringEndDate}
                                                setEndDate={() => { }}
                                                singleDayOnly={true}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="mt-4 pt-4 border-t border-gray-700">
                            <label className="flex items-center gap-2 cursor-pointer mb-2">
                                <input
                                    type="checkbox"
                                    checked={notifyOnEdit}
                                    onChange={e => setNotifyOnEdit(e.target.checked)}
                                    className="rounded bg-gray-700 border-gray-600"
                                />
                                <div>
                                    <span className="text-white block text-sm">Notify Employee of Change</span>
                                    <span className="text-xs text-gray-500">Sends an email to the assigned employee with their updated shift.</span>
                                </div>
                            </label>
                            {notifyOnEdit && (
                                <input
                                    type="text"
                                    value={notifyMessage}
                                    onChange={e => setNotifyMessage(e.target.value)}
                                    placeholder="Optional message to include..."
                                    className="w-full bg-gray-900 text-white rounded p-2 border border-gray-700 text-sm mt-1"
                                />
                            )}
                        </div>

                        <div className="flex justify-between items-center mt-6">
                            <button
                                onClick={() => handleDelete(editingSchedule.id, editingSchedule)}
                                className="text-red-500 hover:text-red-400 text-sm flex items-center gap-1"
                            >
                                <Trash2 size={14} /> Delete shift
                            </button>
                            <div className="flex gap-3">
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
                </div>
            )}

            {/* Drop Confirmation Modal */}
            {dropModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[70] p-4">
                    <div className="bg-gray-800 rounded-xl max-w-sm w-full p-6 shadow-2xl border border-gray-600">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-blue-900/50 flex items-center justify-center flex-shrink-0">
                                <ArrowLeftRight size={18} className="text-blue-400" />
                            </div>
                            <div>
                                <h3 className="text-white font-bold text-lg">Move Shift</h3>
                                <p className="text-gray-400 text-sm">
                                    {dropModal.dragged.first_name} {dropModal.dragged.last_name} &mdash; {dropModal.dragged.shift_name}
                                </p>
                            </div>
                        </div>

                        <div className="bg-gray-900 rounded-lg p-3 mb-4 text-sm space-y-1">
                            <div className="flex items-center gap-2 text-gray-300">
                                <span className="text-gray-500 w-8">From</span>
                                <span>{dropModal.dragged.first_name} {dropModal.dragged.last_name}</span>
                                <span className="text-gray-600">·</span>
                                <span>{new Date(dropModal.dragged.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-300">
                                <span className="text-gray-500 w-8">To</span>
                                <span>{users.find(u => u.id === dropModal.targetUserId)?.first_name} {users.find(u => u.id === dropModal.targetUserId)?.last_name}</span>
                                <span className="text-gray-600">·</span>
                                <span>{new Date(dropModal.targetDateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                <span className="text-gray-600">·</span>
                                <span className="font-semibold" style={{ color: shifts.find(s => s.id === dropModal.snapShiftId)?.color }}>
                                    {shifts.find(s => s.id === dropModal.snapShiftId)?.label}
                                </span>
                            </div>
                        </div>

                        {dropModal.dragged.recurring_group_id && (
                            <div className="bg-blue-900/30 border border-blue-800/50 rounded-lg p-3 mb-4 text-xs text-blue-300">
                                ↻ Repeating shift — only this occurrence will be moved.
                            </div>
                        )}

                        {!dropModal.occupying ? (
                            <button
                                onClick={() => executeDropMove('move')}
                                className="w-full py-3 bg-green-700 hover:bg-green-600 text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-colors"
                            >
                                <Check size={16} /> Confirm Move
                            </button>
                        ) : (
                            <div className="flex flex-col gap-2">
                                <p className="text-amber-400 text-xs mb-1">
                                    ⚠ {users.find(u => u.id === dropModal.occupying!.user_id)?.first_name} already has a shift in this slot.
                                </p>
                                <button
                                    onClick={() => executeDropMove('swap')}
                                    className="w-full text-left px-4 py-3 rounded-lg bg-blue-900/40 hover:bg-blue-900/60 border border-blue-700 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <ArrowLeftRight size={18} className="text-blue-400 flex-shrink-0" />
                                        <div>
                                            <div className="font-semibold text-white text-sm">Swap Shifts</div>
                                            <div className="text-gray-400 text-xs mt-0.5">Exchange positions — each takes the other's slot</div>
                                        </div>
                                    </div>
                                </button>
                                <button
                                    onClick={() => executeDropMove('replace')}
                                    className="w-full text-left px-4 py-3 rounded-lg bg-amber-900/30 hover:bg-amber-900/50 border border-amber-700/50 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <Replace size={18} className="text-amber-400 flex-shrink-0" />
                                        <div>
                                            <div className="font-semibold text-white text-sm">Replace — Remove {users.find(u => u.id === dropModal.occupying!.user_id)?.first_name ?? 'existing'}'s shift</div>
                                            <div className="text-amber-400/80 text-xs mt-0.5">⚠ {users.find(u => u.id === dropModal.occupying!.user_id)?.first_name ?? 'Their'}'s shift will be deleted</div>
                                        </div>
                                    </div>
                                </button>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={() => setDropModal(null)}
                            className="w-full py-2 mt-3 text-sm text-gray-400 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* User Color Picker */}
            {colorPickerUserId !== null && (() => {
                const colorUser = users.find(u => u.id === colorPickerUserId);
                if (!colorUser) return null;
                const currentColor = getUserColor(colorPickerUserId, colorUser.first_name);
                const hasCustomColor = !!userColors[colorPickerUserId];
                const PALETTE = [
                    '#ef4444','#f97316','#eab308','#22c55e',
                    '#06b6d4','#3b82f6','#8b5cf6','#ec4899',
                    '#14b8a6','#84cc16','#6366f1','#a855f7',
                    '#f43f5e','#64748b','#0ea5e9','#10b981',
                ];
                return (
                    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setColorPickerUserId(null)}>
                        <div className="bg-gray-800 border border-gray-600 rounded-xl shadow-2xl p-5 w-64" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: currentColor }} />
                                    <span className="text-white font-semibold text-sm">{colorUser.first_name} {colorUser.last_name}</span>
                                </div>
                                <button type="button" aria-label="Close" onClick={() => setColorPickerUserId(null)} className="text-gray-400 hover:text-white">
                                    <X size={16} />
                                </button>
                            </div>
                            <p className="text-gray-500 text-xs mb-3">Schedule color for this employee</p>

                            <div className="grid grid-cols-8 gap-1.5 mb-3">
                                {PALETTE.map(c => (
                                    <button
                                        type="button"
                                        key={c}
                                        onClick={() => { setUserColor(colorPickerUserId, c); setColorPickerUserId(null); }}
                                        className="w-6 h-6 rounded-full hover:scale-125 transition-transform relative flex items-center justify-center"
                                        style={{ backgroundColor: c }}
                                        title={c}
                                        aria-label={`Set color to ${c}`}
                                    >
                                        {currentColor === c && <Check size={12} className="text-white drop-shadow" />}
                                    </button>
                                ))}
                            </div>

                            <div className="flex items-center gap-2 pt-3 border-t border-gray-700">
                                <label className="flex items-center gap-2 cursor-pointer flex-1">
                                    <input
                                        type="color"
                                        value={hasCustomColor ? currentColor : '#4f46e5'}
                                        onChange={e => setUserColor(colorPickerUserId, e.target.value)}
                                        className="w-8 h-8 rounded cursor-pointer border-0 p-0.5 bg-gray-700"
                                    />
                                    <span className="text-gray-400 text-xs">Custom</span>
                                </label>
                                {hasCustomColor && (
                                    <button
                                        type="button"
                                        onClick={() => { setUserColor(colorPickerUserId, null); setColorPickerUserId(null); }}
                                        className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                                    >
                                        Reset
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
