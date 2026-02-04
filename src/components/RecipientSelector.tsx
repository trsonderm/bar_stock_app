import React, { useState } from 'react';
import { X } from 'lucide-react';

interface RecipientSelectorProps {
    users: any[];
    value: { to: string[], cc: string[], bcc: string[] };
    onChange: (val: { to: string[], cc: string[], bcc: string[] }) => void;
}

export default function RecipientSelector({ users, value, onChange }: RecipientSelectorProps) {
    const [inputValue, setInputValue] = useState<{ [key: string]: string }>({ to: '', cc: '', bcc: '' });

    const handleKeyDown = (e: React.KeyboardEvent, field: 'to' | 'cc' | 'bcc') => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const val = inputValue[field].trim();
            if (val) {
                // If it looks like an email or a user name, just add it for now.
                // We could match against users list too.
                onChange({
                    ...value,
                    [field]: [...(value[field] || []), val]
                });
                setInputValue({ ...inputValue, [field]: '' });
            }
        }
    };

    const removeRecipient = (field: 'to' | 'cc' | 'bcc', index: number) => {
        const newList = [...value[field]];
        newList.splice(index, 1);
        onChange({ ...value, [field]: newList });
    };

    const renderInput = (field: 'to' | 'cc' | 'bcc', label: string) => (
        <div className="mb-4">
            <label className="block text-sm font-medium text-gray-400 mb-1">{label}</label>
            <div className="bg-gray-800 border border-gray-700 rounded p-2 flex flex-wrap gap-2">
                {(value[field] || []).map((r, i) => (
                    <span key={i} className="bg-gray-700 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                        {r}
                        <button type="button" onClick={() => removeRecipient(field, i)} className="hover:text-red-400"><X size={12} /></button>
                    </span>
                ))}
                <div className="relative flex-1 min-w-[200px]">
                    <input
                        type="text"
                        value={inputValue[field]}
                        onChange={e => setInputValue({ ...inputValue, [field]: e.target.value })}
                        onKeyDown={e => handleKeyDown(e, field)}
                        className="bg-transparent text-white w-full outline-none text-sm p-1"
                        placeholder="Type name or email and hit Enter..."
                    />
                    {/* Autocomplete suggestions could go here */}
                    {inputValue[field] && (
                        <div className="absolute top-full left-0 w-full bg-gray-900 border border-gray-700 rounded shadow-lg z-10 max-h-40 overflow-auto hidden group-focus-within:block">
                            {users.filter(u =>
                                (u.first_name + ' ' + u.last_name).toLowerCase().includes(inputValue[field].toLowerCase()) ||
                                (u.email).toLowerCase().includes(inputValue[field].toLowerCase())
                            ).map(u => (
                                <div
                                    key={u.id}
                                    className="p-2 hover:bg-gray-800 cursor-pointer text-sm text-gray-300"
                                    onClick={() => {
                                        onChange({ ...value, [field]: [...(value[field] || []), u.email] });
                                        setInputValue({ ...inputValue, [field]: '' });
                                    }}
                                >
                                    {u.first_name} {u.last_name} ({u.email})
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <div className="bg-gray-900/50 p-4 rounded border border-gray-700">
            {renderInput('to', 'To')}
            {renderInput('cc', 'CC')}
            {renderInput('bcc', 'BCC')}
        </div>
    );
}
