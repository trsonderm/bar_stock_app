import { useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

interface Props {
    currentDate: Date;
    users: any[];
    shifts: any[];
    schedules: any[];
    onDelete: (id: number) => void;
    onEdit: (schedule: any) => void;
    onDateChange: (date: Date) => void;
}

export default function MonthScheduler({ currentDate, users, shifts, schedules, onDelete, onEdit, onDateChange }: Props) {
    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const days = new Date(year, month + 1, 0).getDate();
        const firstDay = new Date(year, month, 1).getDay(); // 0 = Sunday
        return { days, firstDay };
    };

    const { days, firstDay } = getDaysInMonth(currentDate);
    const weeks = [];
    let day = 1;

    // Create chunks of weeks
    for (let i = 0; i < 6; i++) { // Max 6 weeks
        const week = [];
        for (let j = 0; j < 7; j++) {
            if (i === 0 && j < firstDay) {
                week.push(null);
            } else if (day > days) {
                week.push(null);
            } else {
                week.push(new Date(currentDate.getFullYear(), currentDate.getMonth(), day));
                day++;
            }
        }
        weeks.push(week);
        if (day > days) break;
    }

    const changeMonth = (offset: number) => {
        const newDate = new Date(currentDate);
        newDate.setMonth(newDate.getMonth() + offset);
        onDateChange(newDate);
    };

    return (
        <div className="bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
            <div className="flex justify-between items-center bg-gray-800 p-4 border-b border-gray-700">
                <div className="flex items-center gap-4">
                    <button onClick={() => changeMonth(-1)} className="text-white hover:bg-gray-700 p-1 rounded"><ChevronLeft /></button>
                    <h2 className="text-xl font-bold text-white">
                        {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </h2>
                    <button onClick={() => changeMonth(1)} className="text-white hover:bg-gray-700 p-1 rounded"><ChevronRight /></button>
                </div>
                <button onClick={() => onDateChange(new Date())} className="text-blue-400 hover:text-blue-300 text-sm">Today</button>
            </div>

            <div className="grid grid-cols-7 bg-gray-800 border-b border-gray-700">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                    <div key={d} className="p-2 text-center text-gray-400 font-bold text-sm">
                        {d}
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-7 bg-gray-900">
                {weeks.map((week, wIdx) => (
                    week.map((date, dIdx) => {
                        if (!date) return <div key={`${wIdx}-${dIdx}`} className="bg-gray-900/50 border border-gray-800 min-h-[120px]"></div>;

                        const dateStr = date.toISOString().split('T')[0];
                        const daySchedules = schedules.filter(s => s.date.startsWith(dateStr));

                        return (
                            <div key={dateStr} className="border border-gray-800 p-2 min-h-[120px] bg-gray-900 hover:bg-gray-800/30 transition-colors">
                                <div className="text-right text-gray-500 mb-2">{date.getDate()}</div>
                                <div className="space-y-1">
                                    {daySchedules.map(schedule => {
                                        const shiftDef = shifts.find(s => s.id === schedule.shift_id);
                                        const color = shiftDef?.color || '#3b82f6';

                                        return (
                                            <div
                                                key={schedule.id}
                                                className="text-xs p-1 rounded flex justify-between items-center group cursor-pointer"
                                                style={{ backgroundColor: `${color}33`, border: `1px solid ${color}66`, color: 'white' }}
                                                title={`${schedule.first_name} ${schedule.last_name} - ${schedule.shift_name}`}
                                                onClick={() => onEdit(schedule)}
                                            >
                                                <span className="truncate">{schedule.first_name}</span>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onDelete(schedule.id); }}
                                                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300"
                                                >
                                                    <X size={10} />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })
                ))}
            </div>
        </div>
    );
}
