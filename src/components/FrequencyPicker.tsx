import React from 'react';

interface Schedule {
    frequency: 'hourly' | 'daily' | 'weekly' | 'bi-weekly' | 'monthly';
    time?: string;
    dayOfWeek?: number; // 0-6
    monthDay?: 'first' | 'last';
}

interface FrequencyPickerProps {
    value: Schedule;
    onChange: (val: Schedule) => void;
}

export default function FrequencyPicker({ value, onChange }: FrequencyPickerProps) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const update = (key: keyof Schedule, val: any) => {
        onChange({ ...value, [key]: val });
    };

    return (
        <div className="bg-gray-900/50 p-4 rounded border border-gray-700 space-y-4">
            <div>
                <label className="block text-sm text-gray-400 mb-1">Frequency</label>
                <select
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
                    value={value.frequency}
                    onChange={(e) => onChange({ frequency: e.target.value as any, time: value.time || '08:00' })}
                >
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="bi-weekly">Bi-Weekly</option>
                    <option value="monthly">Monthly</option>
                </select>
            </div>

            {value.frequency !== 'hourly' && (
                <div>
                    <label className="block text-sm text-gray-400 mb-1">Time</label>
                    <input
                        type="time"
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
                        value={value.time}
                        onChange={(e) => update('time', e.target.value)}
                    />
                </div>
            )}

            {(value.frequency === 'weekly' || value.frequency === 'bi-weekly') && (
                <div>
                    <label className="block text-sm text-gray-400 mb-1">Day of Week</label>
                    <select
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
                        value={value.dayOfWeek || 1}
                        onChange={(e) => update('dayOfWeek', parseInt(e.target.value))}
                    >
                        {days.map((d, i) => <option key={i} value={i}>{d}</option>)}
                    </select>
                </div>
            )}

            {value.frequency === 'monthly' && (
                <div>
                    <label className="block text-sm text-gray-400 mb-1">Send On</label>
                    <select
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
                        value={value.monthDay || 'first'}
                        onChange={(e) => update('monthDay', e.target.value)}
                    >
                        <option value="first">1st Day of Month</option>
                        <option value="last">Last Day of Month</option>
                    </select>
                </div>
            )}
        </div>
    );
}
