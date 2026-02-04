import React from 'react';
import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface StatCardProps {
    label: string;
    value: string | number;
    icon: LucideIcon;
    trend?: {
        value: number;
        label: string;
        positive?: boolean;
    };
    color?: 'blue' | 'purple' | 'emerald' | 'amber' | 'rose';
    loading?: boolean;
}

export function StatCard({ label, value, icon: Icon, trend, color = 'blue', loading }: StatCardProps) {
    const colorStyles = {
        blue: {
            bg: 'from-blue-500/10 to-blue-600/5',
            border: 'border-blue-500/20',
            text: 'text-blue-400',
            iconBg: 'bg-blue-500/20',
        },
        purple: {
            bg: 'from-purple-500/10 to-purple-600/5',
            border: 'border-purple-500/20',
            text: 'text-purple-400',
            iconBg: 'bg-purple-500/20',
        },
        emerald: {
            bg: 'from-emerald-500/10 to-emerald-600/5',
            border: 'border-emerald-500/20',
            text: 'text-emerald-400',
            iconBg: 'bg-emerald-500/20',
        },
        amber: {
            bg: 'from-amber-500/10 to-amber-600/5',
            border: 'border-amber-500/20',
            text: 'text-amber-400',
            iconBg: 'bg-amber-500/20',
        },
        rose: {
            bg: 'from-rose-500/10 to-rose-600/5',
            border: 'border-rose-500/20',
            text: 'text-rose-400',
            iconBg: 'bg-rose-500/20',
        },
    };

    const styles = colorStyles[color];

    if (loading) {
        return (
            <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6 animate-pulse">
                <div className="flex justify-between items-start mb-4">
                    <div className="h-8 w-8 bg-slate-800 rounded-lg" />
                    <div className="h-4 w-20 bg-slate-800 rounded" />
                </div>
                <div className="h-8 w-32 bg-slate-800 rounded mb-2" />
                <div className="h-4 w-24 bg-slate-800 rounded" />
            </div>
        );
    }

    return (
        <div className={`relative overflow-hidden bg-gradient-to-br ${styles.bg} rounded-xl border ${styles.border} p-6 transition-all duration-200 hover:shadow-lg hover:shadow-${color}-500/5 group`}>
            <div className="relative z-10 flex justify-between items-start">
                <div>
                    <p className="text-slate-400 text-sm font-medium mb-1">{label}</p>
                    <h3 className="text-3xl font-bold text-white tracking-tight">{value}</h3>
                </div>
                <div className={`p-2.5 rounded-lg ${styles.iconBg} ${styles.text} transition-transform group-hover:scale-110 duration-200`}>
                    <Icon className="w-5 h-5" />
                </div>
            </div>

            {trend && (
                <div className="relative z-10 mt-4 flex items-center gap-2">
                    <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${trend.positive === undefined
                            ? 'bg-slate-800 text-slate-400'
                            : trend.positive
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-rose-500/10 text-rose-400'
                        }`}>
                        {trend.positive === undefined ? (
                            <Minus className="w-3 h-3" />
                        ) : trend.positive ? (
                            <TrendingUp className="w-3 h-3" />
                        ) : (
                            <TrendingDown className="w-3 h-3" />
                        )}
                        <span>{Math.abs(trend.value)}%</span>
                    </div>
                    <span className="text-slate-500 text-xs">{trend.label}</span>
                </div>
            )}
        </div>
    );
}
