'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
    LayoutDashboard,
    Building2,
    Ticket,
    Users,
    Database,
    Settings,
    FileBarChart,
    LogOut
} from 'lucide-react';

export default function SuperAdminNav() {
    const pathname = usePathname();

    const links = [
        { name: 'Mission Control', href: '/super-admin', icon: LayoutDashboard },
        { name: 'Organizations', href: '/super-admin/organizations', icon: Building2 },
        { name: 'Support Tickets', href: '/super-admin/support', icon: Ticket },
        { name: 'Global Users', href: '/super-admin/users', icon: Users },
        { name: 'Audit Logs', href: '/super-admin/logs', icon: FileBarChart }, // Added this line
        { name: 'Database', href: '/super-admin/database', icon: Database },
        { name: 'Site Settings', href: '/super-admin/settings', icon: Settings },
        { name: 'Report Builder', href: '/super-admin/reports/custom', icon: FileBarChart },
    ];

    return (
        <nav className="hidden md:flex flex-col w-64 bg-slate-950 border-r border-slate-800 h-screen sticky top-0">
            {/* Header */}
            <div className="p-6 border-b border-slate-800">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                        <Settings className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-sm font-bold text-white tracking-wide uppercase">Super Admin</h1>
                        <p className="text-xs text-slate-500">System Controls</p>
                    </div>
                </div>
            </div>

            {/* Navigation Links */}
            <div className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
                {links.map((link) => {
                    const isActive = pathname === link.href;
                    const Icon = link.icon;
                    return (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${isActive
                                ? 'bg-blue-600/10 text-blue-400 shadow-sm shadow-blue-500/5'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                                }`}
                        >
                            <Icon className={`w-4 h-4 transition-colors ${isActive ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
                            {link.name}
                        </Link>
                    );
                })}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-800 space-y-1">
                <Link
                    href="/inventory"
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-900 transition-colors"
                >
                    <LayoutDashboard className="w-4 h-4" />
                    Return to App
                </Link>
                <button
                    onClick={async () => {
                        await fetch('/api/auth/logout', { method: 'POST' });
                        window.location.href = '/login';
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                </button>
            </div>
        </nav>
    );
}
