import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    fullWidth?: boolean;
}

export function Input({
    label,
    error,
    className = '',
    fullWidth = true,
    ...props
}: InputProps) {
    return (
        <div className={`${fullWidth ? 'w-full' : ''} mb-4`}>
            {label && (
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">
                    {label}
                </label>
            )}
            <input
                className={`
                    bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 
                    text-white placeholder-gray-600 
                    focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500
                    transition-all duration-200
                    disabled:opacity-50 disabled:bg-gray-800
                    ${error ? 'border-red-500 focus:ring-red-500/50 focus:border-red-500' : ''}
                    ${fullWidth ? 'w-full' : ''}
                    ${className}
                `}
                {...props}
            />
            {error && (
                <p className="mt-1 text-xs text-red-400 ml-1 font-medium">{error}</p>
            )}
        </div>
    );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    options: { value: string | number; label: string }[];
    fullWidth?: boolean;
}

export function Select({
    label,
    options,
    className = '',
    fullWidth = true,
    ...props
}: SelectProps) {
    return (
        <div className={`${fullWidth ? 'w-full' : ''} mb-4`}>
            {label && (
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">
                    {label}
                </label>
            )}
            <div className="relative">
                <select
                    className={`
                        appearance-none
                        bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 pr-8
                        text-white
                        focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500
                        transition-all duration-200
                        ${fullWidth ? 'w-full' : ''}
                        ${className}
                    `}
                    {...props}
                >
                    {options.map(opt => (
                        <option key={opt.value} value={opt.value} className="bg-gray-900 text-white py-2">
                            {opt.label}
                        </option>
                    ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </div>
        </div>
    );
}
