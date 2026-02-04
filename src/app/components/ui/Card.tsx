import React from 'react';

interface CardProps {
    children: React.ReactNode;
    className?: string;
    title?: string;
    subtitle?: string;
    action?: React.ReactNode;
}

export function Card({ children, className = '', title, subtitle, action }: CardProps) {
    return (
        <div className={`bg-gray-800/40 backdrop-blur-md border border-gray-700/50 rounded-xl overflow-hidden shadow-xl ${className}`}>
            {(title || action) && (
                <div className="px-6 py-4 border-b border-gray-700/50 flex justify-between items-center bg-gray-900/20">
                    <div>
                        {title && <h3 className="text-lg font-bold text-white tracking-tight">{title}</h3>}
                        {subtitle && <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>}
                    </div>
                    {action && <div>{action}</div>}
                </div>
            )}
            <div className="p-6">
                {children}
            </div>
        </div>
    );
}
