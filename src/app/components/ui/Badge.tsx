import React from 'react';

interface BadgeProps {
    children: React.ReactNode;
    variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
    className?: string;
}

export function Badge({ children, variant = 'neutral', className = '' }: BadgeProps) {
    const variants = {
        success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-emerald-500/10",
        warning: "bg-amber-500/10 text-amber-400 border-amber-500/20 shadow-amber-500/10",
        error: "bg-red-500/10 text-red-400 border-red-500/20 shadow-red-500/10",
        info: "bg-blue-500/10 text-blue-400 border-blue-500/20 shadow-blue-500/10",
        neutral: "bg-gray-500/10 text-gray-400 border-gray-500/20"
    };

    return (
        <span className={`
            inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border shadow-[0_0_10px_rgba(0,0,0,0)] 
            uppercase tracking-wide
            ${variants[variant]} 
            ${className}
        `}>
            {variant === 'success' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse"></span>}
            {children}
        </span>
    );
}
