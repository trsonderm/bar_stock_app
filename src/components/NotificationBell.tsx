'use client';

import { useState, useEffect, useRef } from 'react';
import { Bell, X, Check } from 'lucide-react';

interface Notification {
    id: number;
    title: string;
    message: string;
    type: string;
    created_at: string;
    is_read: boolean;
}

export default function NotificationBell() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    const fetchNotifications = async () => {
        try {
            const res = await fetch('/api/notifications');
            if (res.ok) {
                const data = await res.json();
                setNotifications(data.notifications || []);
            }
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 60000); // 1 min poll
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [wrapperRef]);

    const handleClear = async (id?: number) => {
        // Optimistic update
        if (id) {
            setNotifications(prev => prev.filter(n => n.id !== id));
            await fetch('/api/notifications', {
                method: 'PUT',
                body: JSON.stringify({ id })
            });
        } else {
            setNotifications([]);
            await fetch('/api/notifications', {
                method: 'PUT',
                body: JSON.stringify({ all: true })
            });
        }
    };

    const unreadCount = notifications.length;

    return (
        <div className="relative" ref={wrapperRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 rounded-full hover:bg-gray-800 text-gray-300 hover:text-white transition-colors"
                title="Notifications"
            >
                <Bell className="w-6 h-6" />
                {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-gray-900"></span>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                    <div className="p-3 border-b border-gray-800 flex justify-between items-center bg-gray-800/50">
                        <h3 className="text-sm font-bold text-white">Notifications ({unreadCount})</h3>
                        {unreadCount > 0 && (
                            <button
                                onClick={() => handleClear()}
                                className="text-xs text-blue-400 hover:text-blue-300 font-medium"
                            >
                                Clear All
                            </button>
                        )}
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="p-6 text-center text-gray-500 text-sm">
                                No new notifications
                            </div>
                        ) : (
                            notifications.map(n => (
                                <div key={n.id} className="p-4 border-b border-gray-800 hover:bg-gray-800 transition-colors relative group">
                                    <div className="flex gap-3">
                                        <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${n.type === 'price_change' ? 'bg-amber-500' : 'bg-blue-500'}`}></div>
                                        <div>
                                            <p className="text-sm font-medium text-white">{n.title}</p>
                                            <p className="text-xs text-gray-400 mt-1 leading-relaxed">{n.message}</p>
                                            <p className="text-[10px] text-gray-600 mt-2">
                                                {new Date(n.created_at).toLocaleTimeString()}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleClear(n.id)}
                                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-white transition-all bg-gray-800 rounded"
                                    >
                                        <Check className="w-4 h-4" />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
