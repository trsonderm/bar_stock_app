import React from 'react';
import { LucideIcon } from 'lucide-react';

interface ActionButton {
    label: string;
    onClick?: () => void;
    href?: string;
    icon?: LucideIcon;
    variant?: 'primary' | 'secondary' | 'danger';
}

interface AdminPageHeaderProps {
    title: string;
    subtitle?: string;
    icon?: LucideIcon;
    actions?: ActionButton[];
}

export function AdminPageHeader({ title, subtitle, icon: Icon, actions }: AdminPageHeaderProps) {
    return (
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-8">
            <div className="flex items-start gap-3">
                {Icon && (
                    <div className="p-2 bg-slate-800 rounded-lg border border-slate-700/50 shadow-sm">
                        <Icon className="w-6 h-6 text-blue-400" />
                    </div>
                )}
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">{title}</h1>
                    {subtitle && (
                        <p className="text-slate-400 text-sm mt-1">{subtitle}</p>
                    )}
                </div>
            </div>

            {actions && actions.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                    {actions.map((action, index) => {
                        const Icon = action.icon;
                        const baseClasses = "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 border";
                        const variantClasses = {
                            primary: "bg-blue-600 hover:bg-blue-500 text-white border-transparent shadow shadow-blue-500/20",
                            secondary: "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700",
                            danger: "bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20"
                        };
                        const className = `${baseClasses} ${variantClasses[action.variant || 'secondary']}`;

                        if (action.href) {
                            return (
                                <a key={index} href={action.href} className={className}>
                                    {Icon && <Icon className="w-4 h-4" />}
                                    {action.label}
                                </a>
                            );
                        }

                        return (
                            <button key={index} onClick={action.onClick} className={className}>
                                {Icon && <Icon className="w-4 h-4" />}
                                {action.label}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
