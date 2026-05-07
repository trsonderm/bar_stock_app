import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';

interface User {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
}

interface RecipientSelectorProps {
    users: User[];
    value: { to: string[], cc: string[], bcc: string[] };
    onChange: (val: { to: string[], cc: string[], bcc: string[] }) => void;
}

export default function RecipientSelector({ users, value, onChange }: RecipientSelectorProps) {
    const [inputValue, setInputValue] = useState<Record<string, string>>({ to: '', cc: '', bcc: '' });
    const [openField, setOpenField] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpenField(null);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const nameFor = (email: string) => {
        const u = users.find(u => u.email.toLowerCase() === email.toLowerCase());
        return u ? `${u.first_name} ${u.last_name}` : email;
    };

    const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

    const addEntry = (field: 'to' | 'cc' | 'bcc', email: string) => {
        const v = email.trim().toLowerCase();
        if (!v) return;
        const current = value[field] || [];
        if (!current.map(e => e.toLowerCase()).includes(v)) {
            onChange({ ...value, [field]: [...current, v] });
        }
        setInputValue(prev => ({ ...prev, [field]: '' }));
        setOpenField(null);
    };

    const addUser = (field: 'to' | 'cc' | 'bcc', user: User) => {
        addEntry(field, user.email);
    };

    const removeRecipient = (field: 'to' | 'cc' | 'bcc', index: number) => {
        const newList = [...value[field]];
        newList.splice(index, 1);
        onChange({ ...value, [field]: newList });
    };

    const renderField = (field: 'to' | 'cc' | 'bcc', label: string) => {
        const q = inputValue[field].toLowerCase();
        const existing = (value[field] || []).map(e => e.toLowerCase());
        const suggestions = q
            ? users.filter(u =>
                !existing.includes(u.email.toLowerCase()) && (
                    `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) ||
                    u.email.toLowerCase().includes(q)
                )
            ).slice(0, 8)
            : [];
        const showDropdown = openField === field && (suggestions.length > 0 || (q.length > 0 && isValidEmail(inputValue[field])));

        return (
            <div className="mb-3">
                <label className="block text-sm font-medium text-gray-400 mb-1">{label}</label>
                <div className="bg-gray-800 border border-gray-700 rounded p-2 flex flex-wrap gap-2 relative">
                    {(value[field] || []).map((r, i) => (
                        <span key={i} className="bg-gray-700 text-white text-xs px-2 py-1 rounded flex items-center gap-1" title={r}>
                            {nameFor(r)}
                            <button type="button" onClick={() => removeRecipient(field, i)} className="hover:text-red-400 ml-0.5">
                                <X size={12} />
                            </button>
                        </span>
                    ))}
                    <input
                        type="text"
                        value={inputValue[field]}
                        onChange={e => { setInputValue(prev => ({ ...prev, [field]: e.target.value })); setOpenField(field); }}
                        onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addEntry(field, inputValue[field]); }
                            if (e.key === 'Escape') setOpenField(null);
                        }}
                        onFocus={() => { if (inputValue[field]) setOpenField(field); }}
                        className="bg-transparent text-white outline-none text-sm p-1 flex-1 min-w-[180px]"
                        placeholder="Search by name or enter email…"
                    />
                    {showDropdown && (
                        <div className="absolute top-full left-0 right-0 bg-gray-900 border border-gray-700 rounded shadow-xl z-50 max-h-48 overflow-auto" style={{ marginTop: 2 }}>
                            {suggestions.map(u => (
                                <div
                                    key={u.id}
                                    className="px-3 py-2 hover:bg-gray-800 cursor-pointer"
                                    onMouseDown={e => { e.preventDefault(); addUser(field, u); }}
                                >
                                    <div className="text-sm text-white">{u.first_name} {u.last_name}</div>
                                    <div className="text-xs text-gray-400">{u.email}</div>
                                </div>
                            ))}
                            {isValidEmail(inputValue[field]) && !users.find(u => u.email.toLowerCase() === inputValue[field].trim().toLowerCase()) && (
                                <div
                                    className="px-3 py-2 hover:bg-gray-800 cursor-pointer text-blue-400 text-sm"
                                    onMouseDown={e => { e.preventDefault(); addEntry(field, inputValue[field]); }}
                                >
                                    Add "{inputValue[field].trim()}"
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div ref={containerRef} className="bg-gray-900/50 p-4 rounded border border-gray-700">
            {renderField('to', 'To')}
            {renderField('cc', 'CC')}
            {renderField('bcc', 'BCC')}
        </div>
    );
}
