import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface DateRangePickerProps {
    startDate: string;
    endDate: string;
    setStartDate: (d: string) => void;
    setEndDate: (d: string) => void;
    singleDayOnly?: boolean;
    onDateSelect?: () => void;
}

export default function DateRangePicker({
    startDate,
    endDate,
    setStartDate,
    setEndDate,
    singleDayOnly = false,
    onDateSelect
}: DateRangePickerProps) {
    const [viewDate, setViewDate] = useState(new Date());

    const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
    const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

    const currentYear = viewDate.getFullYear();
    const currentMonth = viewDate.getMonth();
    const daysInMonth = getDaysInMonth(currentYear, currentMonth);
    const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

    const prevMonth = () => setViewDate(new Date(currentYear, currentMonth - 1, 1));
    const nextMonth = () => setViewDate(new Date(currentYear, currentMonth + 1, 1));

    const handleDateClick = (day: number) => {
        const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        if (singleDayOnly) {
            setStartDate(dateStr);
            setEndDate(dateStr);
            if (onDateSelect) onDateSelect();
            return;
        }

        if (!startDate || (startDate && endDate)) {
            // Click 1 or Click 3 (Reset)
            setStartDate(dateStr);
            setEndDate('');
        } else {
            // Click 2
            if (dateStr < startDate) {
                setEndDate(startDate);
                setStartDate(dateStr);
            } else {
                setEndDate(dateStr);
            }
            if (onDateSelect) onDateSelect();
        }
    };

    const isSelected = (day: number) => {
        const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (startDate && !endDate && dateStr === startDate) return true;
        if (startDate && endDate && dateStr >= startDate && dateStr <= endDate) return true;
        return false;
    };

    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(<div key={`empty-${i}`} className="p-2"></div>);
    for (let i = 1; i <= daysInMonth; i++) {
        const selected = isSelected(i);
        days.push(
            <div
                key={i}
                onClick={() => handleDateClick(i)}
                className={`p-2 text-center text-sm cursor-pointer rounded transition-colors ${selected ? 'bg-blue-600 text-white font-bold' : 'text-gray-300 hover:bg-gray-700'}`}
            >
                {i}
            </div>
        );
    }

    return (
        <div className="bg-gray-900 border border-gray-700 rounded p-4 select-none w-full max-w-sm">
            <div className="flex justify-between items-center mb-4">
                <button onClick={(e) => { e.preventDefault(); prevMonth() }} className="text-gray-400 hover:text-white p-1"><ChevronLeft size={16} /></button>
                <div className="text-white font-bold">{viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
                <button onClick={(e) => { e.preventDefault(); nextMonth() }} className="text-gray-400 hover:text-white p-1"><ChevronRight size={16} /></button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-2">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <div key={d} className="text-center text-xs text-gray-500 font-bold">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
                {days}
            </div>
            {!singleDayOnly && (
                <div className="mt-4 flex justify-between text-xs text-gray-400 border-t border-gray-800 pt-2">
                    <div>Start: <span className="text-white">{startDate || 'Select'}</span></div>
                    <div>End: <span className="text-white">{endDate || 'Select'}</span></div>
                </div>
            )}
        </div>
    );
}
