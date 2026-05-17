'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    ArrowRight, BarChart3, ShieldCheck, Smartphone, Users, TrendingUp, Check, X,
    Sparkles, DollarSign, Receipt, Brain, Activity, PieChart, MessageSquare,
    Bell, Calendar, RefreshCw, Rss, Lock, Zap, Star, ChevronRight,
    BookOpen, Archive, Database, Code2, Building2, UserX,
} from 'lucide-react';

// ── Feature comparison table data ─────────────────────────────────────────────

const FEATURES = [
    // Inventory
    { label: 'Unlimited Items & Users', base: true, pro: true, section: 'Inventory' },
    { label: 'Multi-Location Support', base: true, pro: true, section: 'Inventory' },
    { label: 'Stock View & Adjustments', base: true, pro: true, section: 'Inventory' },
    { label: 'Bottle Level Tracking', base: true, pro: true, section: 'Inventory' },
    { label: 'Inventory Audit & Variance', base: true, pro: true, section: 'Inventory' },
    { label: 'Product Archiving', base: true, pro: true, section: 'Inventory' },
    // Orders
    { label: 'Manual Ordering', base: true, pro: true, section: 'Orders' },
    { label: 'Order Tracking & Receiving', base: true, pro: true, section: 'Orders' },
    { label: 'Supplier Management', base: true, pro: true, section: 'Orders' },
    { label: 'AI Smart Ordering', base: false, pro: true, section: 'Orders' },
    // Recipes
    { label: 'Local Recipe Library', base: true, pro: true, section: 'Recipes' },
    { label: 'Global Recipe Library', base: true, pro: true, section: 'Recipes' },
    { label: 'Mobile Recipe Browser', base: true, pro: true, section: 'Recipes' },
    // Scheduling
    { label: 'Employee Scheduling (Drag & Drop)', base: true, pro: true, section: 'Scheduling' },
    { label: 'Recurring Shifts', base: true, pro: true, section: 'Scheduling' },
    { label: 'Shift Request & Swap Workflow', base: true, pro: true, section: 'Scheduling' },
    { label: 'Staff Notifications on Schedule Change', base: true, pro: true, section: 'Scheduling' },
    // Mobile App
    { label: 'Free Mobile App (iOS & Android)', base: true, pro: true, section: 'Mobile App' },
    { label: 'Organization Feed & Posts', base: true, pro: true, section: 'Mobile App' },
    { label: 'Direct Messaging', base: true, pro: true, section: 'Mobile App' },
    { label: 'Push Notifications & Alerts', base: true, pro: true, section: 'Mobile App' },
    { label: 'Mobile Schedule View', base: true, pro: true, section: 'Mobile App' },
    { label: 'Mobile Low Stock View', base: true, pro: true, section: 'Mobile App' },
    // Reports
    { label: 'Standard Reports', base: true, pro: true, section: 'Reports' },
    { label: 'Shift Close & Cash Reconciliation', base: true, pro: true, section: 'Reports' },
    { label: 'AI-Powered Inventory Insights', base: false, pro: true, section: 'Reports' },
    { label: 'Financial Dashboard & Analytics', base: false, pro: true, section: 'Reports' },
    { label: 'Custom Report Builder', base: false, pro: true, section: 'Reports' },
    { label: 'Report Scheduler & Auto-Delivery', base: false, pro: true, section: 'Reports' },
    // Security
    { label: 'Barred Persons List', base: true, pro: true, section: 'Security' },
    { label: 'Data Backup & Restore', base: true, pro: true, section: 'Security' },
    { label: 'Per-Org Point-in-Time Restore', base: false, pro: true, section: 'Security' },
    // Developer
    { label: 'Developer API (v1)', base: false, pro: true, section: 'Developer' },
    { label: 'API Key Management', base: false, pro: true, section: 'Developer' },
    { label: 'POS & Third-Party Integration', base: false, pro: true, section: 'Developer' },
    // Support
    { label: 'Standard Support (48h)', base: true, pro: true, section: 'Support' },
    { label: 'Same-Day Priority Support', base: false, pro: true, section: 'Support' },
    { label: 'Free Setup Assistance', base: false, pro: true, section: 'Support' },
];

// ── Phone Mockup ──────────────────────────────────────────────────────────────

function PhoneMockup({ screen }: { screen: 'feed' | 'schedule' | 'messages' | 'alerts' | 'recipes' }) {
    const screens: Record<string, React.ReactNode> = {
        feed: (
            <div className="h-full overflow-hidden">
                <div className="bg-gray-900 px-3 pt-3 pb-2 border-b border-gray-800 flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
                        <span className="text-[7px] font-black text-black">T</span>
                    </div>
                    <span className="text-[10px] font-bold text-white">Organization Feed</span>
                </div>
                {[
                    { name: 'Sarah M.', time: '2m ago', msg: 'Low stock on Tito\'s — down to 2 bottles', color: 'bg-red-500', tag: 'ALERT' },
                    { name: 'James K.', time: '15m ago', msg: 'Weekend schedule is posted — check your shifts!', color: 'bg-blue-500', tag: null },
                    { name: 'Admin', time: '1h ago', msg: 'New ordering policy for craft beers starting Monday.', color: 'bg-amber-500', tag: null },
                ].map((p, i) => (
                    <div key={i} className="px-3 py-2.5 border-b border-gray-800/80">
                        <div className="flex items-center gap-2 mb-1">
                            <div className={`w-5 h-5 rounded-full ${p.color} flex items-center justify-center flex-shrink-0`}>
                                <span className="text-[7px] font-bold text-white">{p.name[0]}</span>
                            </div>
                            <span className="text-[9px] font-bold text-white">{p.name}</span>
                            {p.tag && <span className="text-[7px] bg-red-900/60 text-red-400 px-1 rounded font-bold">{p.tag}</span>}
                            <span className="text-[8px] text-gray-500 ml-auto">{p.time}</span>
                        </div>
                        <p className="text-[9px] text-gray-300 pl-7 leading-tight">{p.msg}</p>
                    </div>
                ))}
            </div>
        ),
        schedule: (
            <div className="h-full overflow-hidden">
                <div className="bg-gray-900 px-3 pt-3 pb-2 border-b border-gray-800 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-white">My Schedule</span>
                    <span className="text-[9px] text-blue-400">May 2026</span>
                </div>
                <div className="px-2 pt-2 space-y-1.5">
                    {[
                        { day: 'Mon 12', shift: 'Evening Shift', time: '4p – 11p', color: 'bg-blue-600' },
                        { day: 'Wed 14', shift: 'Day Shift', time: '10a – 5p', color: 'bg-emerald-600' },
                        { day: 'Fri 16', shift: 'Evening Shift', time: '4p – 11p', color: 'bg-blue-600' },
                        { day: 'Sat 17', shift: 'Close Shift', time: '7p – 2a', color: 'bg-purple-600' },
                    ].map((s, i) => (
                        <div key={i} className={`${s.color} rounded-lg px-3 py-2`}>
                            <div className="flex justify-between items-center">
                                <span className="text-[9px] text-white/70 font-medium">{s.day}</span>
                                <span className="text-[8px] text-white/60">{s.time}</span>
                            </div>
                            <div className="text-[10px] font-bold text-white">{s.shift}</div>
                        </div>
                    ))}
                    <div className="border border-dashed border-gray-700 rounded-lg px-3 py-2 flex items-center gap-2">
                        <RefreshCw className="w-3 h-3 text-amber-400" />
                        <span className="text-[9px] text-amber-400 font-medium">Request Shift Swap</span>
                    </div>
                </div>
            </div>
        ),
        messages: (
            <div className="h-full overflow-hidden">
                <div className="bg-gray-900 px-3 pt-3 pb-2 border-b border-gray-800">
                    <span className="text-[10px] font-bold text-white">Messages</span>
                </div>
                <div className="flex flex-col justify-end h-[calc(100%-32px)] pb-2">
                    <div className="flex-1 overflow-hidden px-2 pt-2 space-y-2">
                        <div className="flex gap-1.5">
                            <div className="w-4 h-4 rounded-full bg-blue-500 flex-shrink-0 mt-auto" />
                            <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-2 py-1.5 max-w-[80%]">
                                <p className="text-[9px] text-gray-300">Can anyone cover my Thursday shift?</p>
                            </div>
                        </div>
                        <div className="flex gap-1.5 justify-end">
                            <div className="bg-blue-600 rounded-2xl rounded-br-sm px-2 py-1.5 max-w-[80%]">
                                <p className="text-[9px] text-white">I can take it — what time?</p>
                            </div>
                        </div>
                        <div className="flex gap-1.5">
                            <div className="w-4 h-4 rounded-full bg-blue-500 flex-shrink-0 mt-auto" />
                            <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-2 py-1.5">
                                <p className="text-[9px] text-gray-300">4pm–11pm, I'll request the swap now</p>
                            </div>
                        </div>
                        <div className="mx-auto text-center">
                            <span className="text-[8px] bg-emerald-900/50 text-emerald-400 px-2 py-0.5 rounded-full">✓ Swap request sent to admin</span>
                        </div>
                    </div>
                    <div className="px-2 pt-1">
                        <div className="bg-gray-800 rounded-full px-3 py-1.5 flex items-center gap-2">
                            <span className="text-[9px] text-gray-500">Type a message…</span>
                        </div>
                    </div>
                </div>
            </div>
        ),
        alerts: (
            <div className="h-full overflow-hidden">
                <div className="bg-gray-900 px-3 pt-3 pb-2 border-b border-gray-800">
                    <span className="text-[10px] font-bold text-white">Alerts & Low Stock</span>
                </div>
                <div className="px-2 pt-2 space-y-1.5">
                    <div className="bg-red-950/60 border border-red-800/50 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-[9px] text-red-400 font-bold uppercase">CRITICAL</span>
                        </div>
                        <p className="text-[10px] font-bold text-white">Tito's Vodka — 1.5 left</p>
                        <p className="text-[8px] text-red-300">Below threshold of 3 bottles</p>
                    </div>
                    <div className="bg-amber-950/60 border border-amber-800/50 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            <span className="text-[9px] text-amber-400 font-bold uppercase">LOW</span>
                        </div>
                        <p className="text-[10px] font-bold text-white">Jameson Irish — 2.0 left</p>
                        <p className="text-[8px] text-amber-300">Reorder recommended</p>
                    </div>
                    <div className="bg-blue-950/60 border border-blue-800/50 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-1.5 mb-0.5">
                            <Bell className="w-2.5 h-2.5 text-blue-400" />
                            <span className="text-[9px] text-blue-400 font-bold uppercase">SCHEDULE</span>
                        </div>
                        <p className="text-[10px] font-bold text-white">New shift posted for Saturday</p>
                        <p className="text-[8px] text-blue-300">You've been assigned Close Shift 7p–2a</p>
                    </div>
                    <div className="bg-emerald-950/60 border border-emerald-800/50 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-1.5 mb-0.5">
                            <Check className="w-2.5 h-2.5 text-emerald-400" />
                            <span className="text-[9px] text-emerald-400 font-bold uppercase">APPROVED</span>
                        </div>
                        <p className="text-[10px] font-bold text-white">Shift swap approved by admin</p>
                        <p className="text-[8px] text-emerald-300">Thursday swap with James K. confirmed</p>
                    </div>
                </div>
            </div>
        ),
        recipes: (
            <div className="h-full overflow-hidden">
                <div className="bg-gray-900 px-3 pt-3 pb-2 border-b border-gray-800 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-white">Recipes</span>
                    <span className="text-[9px] text-amber-400">42 recipes</span>
                </div>
                <div className="px-2 pt-2 space-y-1.5">
                    <div className="bg-gray-800 rounded-lg px-2 py-1.5 flex items-center gap-1.5">
                        <span className="text-[8px] text-gray-500">🔍</span>
                        <span className="text-[9px] text-gray-500">Search recipes…</span>
                    </div>
                    {[
                        { name: 'Margarita', cat: 'Cocktail', src: 'local', color: 'bg-amber-600' },
                        { name: 'Old Fashioned', cat: 'Cocktail', src: 'global', color: 'bg-amber-800' },
                        { name: 'Moscow Mule', cat: 'Cocktail', src: 'local', color: 'bg-emerald-700' },
                        { name: 'Aperol Spritz', cat: 'Cocktail', src: 'global', color: 'bg-orange-700' },
                    ].map((r, i) => (
                        <div key={i} className="flex items-center gap-2 bg-gray-800 rounded-lg px-2 py-2">
                            <div className={`w-7 h-7 ${r.color} rounded-lg flex items-center justify-center flex-shrink-0`}>
                                <span className="text-[10px] font-bold text-white">{r.name[0]}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-[10px] font-bold text-white truncate">{r.name}</div>
                                <div className="text-[8px] text-gray-400">{r.cat}</div>
                            </div>
                            <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${r.src === 'local' ? 'bg-blue-900/60 text-blue-400' : 'bg-gray-700 text-gray-400'}`}>
                                {r.src}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        ),
    };

    return (
        <div className="relative mx-auto" style={{ width: 200, height: 400 }}>
            <div className="absolute inset-0 rounded-[36px] bg-gradient-to-b from-gray-600 to-gray-800 shadow-2xl" />
            <div className="absolute inset-[3px] rounded-[33px] bg-gray-950 overflow-hidden">
                <div className="bg-gray-950 px-4 pt-2 pb-1 flex justify-between items-center">
                    <span className="text-[8px] text-white font-semibold">9:41</span>
                    <div className="w-16 h-3 bg-gray-800 rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-1.5" />
                    <div className="flex gap-1 items-center">
                        <div className="w-3 h-2 border border-white/40 rounded-[2px] relative">
                            <div className="absolute inset-[1px] right-auto bg-white/80 rounded-[1px]" style={{ width: '70%' }} />
                        </div>
                    </div>
                </div>
                <div className="bg-gray-950 h-[calc(100%-24px)] overflow-hidden">
                    {screens[screen]}
                </div>
            </div>
            <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-16 h-1 bg-white/20 rounded-full" />
        </div>
    );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function LandingPage() {
    const router = useRouter();
    const [slugInput, setSlugInput] = useState('');
    const [activeScreen, setActiveScreen] = useState<'feed' | 'schedule' | 'messages' | 'alerts' | 'recipes'>('feed');

    const handleGoToOrg = () => {
        const slug = slugInput.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
        if (slug) router.push(`/o/${slug}`);
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white font-sans selection:bg-amber-500 selection:text-white">

            {/* ── Navigation ── */}
            <nav className="fixed w-full z-50 bg-gray-900/85 backdrop-blur-md border-b border-gray-800">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-20">
                        <div className="flex-shrink-0 font-bold text-2xl tracking-tighter text-amber-500">
                            TOPSHELF <span className="text-white font-light">INVENTORY</span>
                        </div>
                        <div className="hidden md:flex items-baseline space-x-6">
                            <a href="#features" className="text-gray-300 hover:text-white px-3 py-2 text-sm font-medium transition-colors">Features</a>
                            <a href="#mobile" className="text-gray-300 hover:text-white px-3 py-2 text-sm font-medium transition-colors flex items-center gap-1">
                                <Smartphone className="w-3.5 h-3.5 text-blue-400" /> Mobile App
                            </a>
                            <a href="#pricing" className="text-gray-300 hover:text-white px-3 py-2 text-sm font-medium transition-colors">Pricing</a>
                            <Link href="/login" className="text-gray-300 hover:text-white px-3 py-2 text-sm font-medium transition-colors">Login</Link>
                            <Link href="/register" className="bg-amber-600 hover:bg-amber-500 text-white px-6 py-2 rounded-full text-sm font-bold transition-all shadow-lg hover:shadow-amber-500/20">
                                Get Started Free
                            </Link>
                        </div>
                    </div>
                </div>
            </nav>

            {/* ── Hero ── */}
            <header className="relative pt-32 pb-16 md:pt-48 md:pb-28 overflow-hidden">
                <div className="absolute inset-0 z-0">
                    <img src="/hero-bg.png" alt="" className="w-full h-full object-cover opacity-30" />
                    <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/75 to-transparent" />
                </div>
                <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] bg-amber-600/5 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute top-1/2 right-1/4 w-[400px] h-[400px] bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />

                <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <div className="inline-flex items-center gap-2 py-1.5 px-4 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-400 text-sm font-semibold mb-8">
                        <Smartphone className="w-4 h-4" /> Free Mobile App · Recipes · Developer API — Now Live
                    </div>
                    <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 leading-[1.05]">
                        Master Your{' '}
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-600">Bar Inventory</span>
                        <br />
                        <span className="text-4xl md:text-5xl font-bold text-gray-300">and Connect Your Whole Team</span>
                    </h1>
                    <p className="mt-4 max-w-2xl mx-auto text-xl text-gray-300">
                        Real-time stock tracking, employee scheduling, recipe library, barred persons management,
                        and a free mobile app that keeps your entire team in sync — on and off the floor.
                    </p>
                    <div className="mt-10 flex flex-wrap justify-center gap-4">
                        <Link href="/register" className="flex items-center px-8 py-4 border border-transparent text-lg font-bold rounded-full text-white bg-amber-600 hover:bg-amber-500 transition-all shadow-xl hover:shadow-amber-500/30">
                            Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
                        </Link>
                        <a href="#mobile" className="flex items-center px-8 py-4 border border-blue-600/50 text-lg font-medium rounded-full text-blue-300 hover:bg-blue-600/10 transition-all">
                            <Smartphone className="mr-2 h-5 w-5" /> See the Mobile App
                        </a>
                    </div>

                    <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
                        {[
                            { value: 'Free', label: 'Mobile App', color: 'text-blue-400' },
                            { value: 'Real-Time', label: 'Inventory Sync', color: 'text-amber-400' },
                            { value: 'Recipe', label: 'Library Built In', color: 'text-emerald-400' },
                            { value: '14-Day', label: 'Free Trial', color: 'text-purple-400' },
                        ].map(s => (
                            <div key={s.label} className="bg-gray-800/50 backdrop-blur border border-gray-700/50 rounded-2xl p-4">
                                <div className={`text-2xl font-extrabold ${s.color}`}>{s.value}</div>
                                <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </header>

            {/* ── Organization Shortcut ── */}
            <section className="relative z-20 -mt-8 max-w-4xl mx-auto px-4">
                <div className="bg-gray-800/90 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-gray-700">
                    <div className="flex flex-col md:flex-row items-center gap-6">
                        <div className="flex-1">
                            <h3 className="text-xl font-semibold text-white mb-2">Find Your Organization</h3>
                            <p className="text-gray-400 text-sm">Enter your organization slug to access your dedicated portal.</p>
                        </div>
                        <div className="w-full md:w-auto flex-1">
                            <div className="flex gap-2">
                                <div className="relative flex-grow">
                                    <span className="absolute left-3 top-3 text-gray-500 text-sm">/o/</span>
                                    <input
                                        type="text"
                                        placeholder="club-name"
                                        value={slugInput}
                                        onChange={e => setSlugInput(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleGoToOrg()}
                                        className="w-full bg-gray-900 border border-gray-600 rounded-lg py-3 pl-10 pr-4 text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all placeholder-gray-600"
                                    />
                                </div>
                                <button type="button" onClick={handleGoToOrg} className="bg-amber-600 hover:bg-amber-500 text-white px-6 py-3 rounded-lg font-medium transition-colors">
                                    Go
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Mobile App Spotlight ── */}
            <section id="mobile" className="py-28 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-950/40 via-gray-900 to-gray-900 pointer-events-none" />
                <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
                <div className="absolute -top-20 -left-20 w-96 h-96 bg-blue-600/8 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-cyan-600/8 rounded-full blur-3xl pointer-events-none" />

                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                    <div className="text-center mb-16">
                        <span className="inline-flex items-center gap-2 py-1.5 px-5 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-400 text-sm font-bold mb-6">
                            <Smartphone className="w-4 h-4" /> FREE — Included with Every Plan
                        </span>
                        <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-4">
                            Your Team, Always Connected
                        </h2>
                        <p className="text-gray-400 max-w-2xl mx-auto text-lg">
                            The TopShelf mobile app is free for every user. It syncs live with your web dashboard —
                            schedule, stock, recipes, messages, and alerts always in your pocket.
                        </p>
                    </div>

                    <div className="grid lg:grid-cols-2 gap-16 items-center">
                        <div>
                            <div className="flex flex-wrap gap-2 mb-10">
                                {[
                                    { key: 'feed', icon: <Rss className="w-4 h-4" />, label: 'Org Feed' },
                                    { key: 'schedule', icon: <Calendar className="w-4 h-4" />, label: 'My Schedule' },
                                    { key: 'messages', icon: <MessageSquare className="w-4 h-4" />, label: 'Messages' },
                                    { key: 'alerts', icon: <Bell className="w-4 h-4" />, label: 'Alerts' },
                                    { key: 'recipes', icon: <BookOpen className="w-4 h-4" />, label: 'Recipes' },
                                ].map(t => (
                                    <button
                                        type="button"
                                        key={t.key}
                                        onClick={() => setActiveScreen(t.key as any)}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all ${activeScreen === t.key
                                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                                            : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                                            }`}
                                    >
                                        {t.icon} {t.label}
                                    </button>
                                ))}
                            </div>

                            <div className="space-y-5">
                                {[
                                    {
                                        icon: <Rss className="w-5 h-5 text-blue-400" />,
                                        title: 'Organization Feed',
                                        desc: 'A shared social feed for your whole team. Post updates, photos, announcements, and low-stock alerts. Staff stay informed without needing group texts.',
                                        screen: 'feed' as const,
                                    },
                                    {
                                        icon: <MessageSquare className="w-5 h-5 text-emerald-400" />,
                                        title: 'Instant Direct Messaging',
                                        desc: 'Real-time 1-on-1 and group messaging built in. Coordinate coverage, ask questions, and communicate shift changes without leaving the app.',
                                        screen: 'messages' as const,
                                    },
                                    {
                                        icon: <Calendar className="w-5 h-5 text-purple-400" />,
                                        title: 'Schedule View & Shift Requests',
                                        desc: 'Staff see their upcoming shifts at a glance. Request a shift swap directly from the app — routed through admin and coworker approval automatically.',
                                        screen: 'schedule' as const,
                                    },
                                    {
                                        icon: <Bell className="w-5 h-5 text-amber-400" />,
                                        title: 'Smart Alerts & Low Stock Notifications',
                                        desc: 'Push notifications for low stock, schedule changes, approved swaps, order arrivals, and any organization message. Critical alerts surface immediately.',
                                        screen: 'alerts' as const,
                                    },
                                    {
                                        icon: <BookOpen className="w-5 h-5 text-rose-400" />,
                                        title: 'Recipe Library',
                                        desc: 'Browse local and global drink recipes from the mobile app. Search by name or category — ingredients, instructions, glass type, and serving size all included.',
                                        screen: 'recipes' as const,
                                    },
                                ].map(f => (
                                    <div
                                        key={f.title}
                                        className={`flex gap-4 p-4 rounded-2xl border cursor-pointer transition-all ${activeScreen === f.screen
                                            ? 'bg-gray-800 border-blue-600/50 shadow-lg shadow-blue-900/20'
                                            : 'border-transparent hover:bg-gray-800/50 hover:border-gray-700'
                                            }`}
                                        onClick={() => setActiveScreen(f.screen)}
                                    >
                                        <div className="w-10 h-10 bg-gray-800 rounded-xl flex items-center justify-center flex-shrink-0 border border-gray-700">
                                            {f.icon}
                                        </div>
                                        <div>
                                            <h4 className="text-white font-bold text-sm mb-1">{f.title}</h4>
                                            <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-8 inline-flex items-center gap-3 bg-blue-950/50 border border-blue-700/40 rounded-2xl px-5 py-3">
                                <Star className="w-5 h-5 text-blue-400 fill-blue-400" />
                                <div>
                                    <div className="text-white font-bold text-sm">100% Free for all users</div>
                                    <div className="text-blue-400 text-xs">No extra charge — included with Base and Pro plans</div>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col items-center gap-8">
                            <div className="relative">
                                <div className="absolute inset-0 bg-blue-600/20 rounded-[40px] blur-2xl scale-110" />
                                <PhoneMockup screen={activeScreen} />
                            </div>
                            <div className="flex gap-3">
                                {['App Store', 'Google Play'].map(store => (
                                    <div key={store} className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5">
                                        <Smartphone className="w-4 h-4 text-gray-400" />
                                        <div>
                                            <div className="text-[9px] text-gray-500">Download on the</div>
                                            <div className="text-white font-bold text-xs">{store}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Scheduling Spotlight ── */}
            <section className="py-20 bg-gray-900/50 relative overflow-hidden border-t border-gray-800">
                <div className="absolute inset-0 bg-gradient-to-r from-purple-950/20 to-transparent pointer-events-none" />
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                    <div className="grid lg:grid-cols-2 gap-16 items-center">
                        <div className="order-2 lg:order-1">
                            <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden shadow-2xl">
                                <div className="bg-gray-850 px-5 py-3 border-b border-gray-700 flex items-center justify-between">
                                    <span className="text-white font-bold text-sm">Staff Schedule — Week of May 12</span>
                                    <div className="flex gap-1">
                                        {['Timeline', 'By Employee', 'By Shift'].map((v, i) => (
                                            <span key={v} className={`text-xs px-2 py-1 rounded font-medium ${i === 0 ? 'bg-blue-600 text-white' : 'text-gray-500'}`}>{v}</span>
                                        ))}
                                    </div>
                                </div>
                                <div className="p-4 space-y-2">
                                    {[
                                        { name: 'Sarah M.', shifts: [{ left: '20%', w: '35%', color: '#2563eb', label: 'Eve Shift', time: '4p–11p' }, { left: '72%', w: '28%', color: '#7c3aed', label: 'Close', time: '7p–2a' }] },
                                        { name: 'James K.', shifts: [{ left: '0%', w: '30%', color: '#059669', label: 'Day Shift', time: '10a–5p' }, { left: '55%', w: '35%', color: '#2563eb', label: 'Eve Shift', time: '4p–11p' }] },
                                        { name: 'Maria L.', shifts: [{ left: '20%', w: '35%', color: '#2563eb', label: 'Eve Shift', time: '4p–11p' }] },
                                        { name: 'Carlos R.', shifts: [{ left: '0%', w: '30%', color: '#059669', label: 'Day Shift', time: '10a–5p' }, { left: '72%', w: '28%', color: '#7c3aed', label: 'Close', time: '7p–2a' }] },
                                    ].map(row => (
                                        <div key={row.name} className="flex items-center gap-3" style={{ height: 36 }}>
                                            <div className="w-20 text-xs text-gray-400 text-right flex-shrink-0">{row.name}</div>
                                            <div className="flex-1 relative bg-gray-900 rounded h-8">
                                                {[6, 12, 18].map(h => (
                                                    <div key={h} className="absolute inset-y-0 border-l border-gray-800" style={{ left: `${(h / 24) * 100}%` }} />
                                                ))}
                                                {row.shifts.map((s, i) => (
                                                    <div
                                                        key={i}
                                                        className="absolute top-1 h-6 rounded flex items-center px-2 overflow-hidden"
                                                        style={{ left: s.left, width: s.w, backgroundColor: s.color }}
                                                    >
                                                        <span className="text-[9px] font-bold text-white truncate">{s.label} {s.time}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                    <div className="flex items-center gap-3 mt-1">
                                        <div className="w-20 flex-shrink-0" />
                                        <div className="flex-1 relative">
                                            {['12a', '6a', '12p', '6p', '12a'].map((l, i) => (
                                                <span key={l} className="absolute text-[9px] text-gray-600 -translate-x-1/2" style={{ left: `${i * 25}%` }}>{l}</span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="order-1 lg:order-2">
                            <span className="inline-flex items-center gap-2 py-1 px-3 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-bold mb-5">
                                <Calendar className="w-3.5 h-3.5" /> Smart Scheduling
                            </span>
                            <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-5">
                                Schedule Built for Hospitality
                            </h2>
                            <p className="text-gray-400 mb-8 leading-relaxed">
                                A drag-and-drop graphical timeline that shows your entire team's week at a glance.
                                Overnight shifts, recurring patterns, and real-time updates — with a full mobile view for staff.
                            </p>
                            <div className="space-y-4">
                                {[
                                    { icon: <Calendar className="w-5 h-5 text-blue-400" />, title: 'Visual Timeline', desc: 'See all shifts side-by-side across the week. Drag shifts to reassign — changes sync instantly.' },
                                    { icon: <RefreshCw className="w-5 h-5 text-emerald-400" />, title: 'Shift Swap Workflow', desc: 'Staff request swaps in the mobile app. Admin approves, coworker confirms. No group texts needed.' },
                                    { icon: <Bell className="w-5 h-5 text-amber-400" />, title: 'Instant Notifications', desc: 'Staff get push notifications the moment their schedule changes. No missed shifts.' },
                                    { icon: <Lock className="w-5 h-5 text-purple-400" />, title: 'Recurring Shifts', desc: 'Set repeating schedules for weeks or months at once. Edit one, following, or all in the series.' },
                                ].map(f => (
                                    <div key={f.title} className="flex gap-4">
                                        <div className="w-9 h-9 bg-gray-800 rounded-xl flex items-center justify-center flex-shrink-0 border border-gray-700 mt-0.5">
                                            {f.icon}
                                        </div>
                                        <div>
                                            <h4 className="text-white font-bold text-sm mb-0.5">{f.title}</h4>
                                            <p className="text-gray-400 text-sm">{f.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Pro Features Spotlight ── */}
            <section className="py-20 relative overflow-hidden border-t border-gray-800">
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-700/8 rounded-full blur-3xl" />
                    <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-amber-600/6 rounded-full blur-3xl" />
                </div>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                    <div className="text-center mb-14">
                        <span className="inline-flex items-center gap-2 py-1.5 px-4 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-sm font-semibold mb-5">
                            <Sparkles className="w-4 h-4" /> Pro Features
                        </span>
                        <h2 className="text-4xl font-extrabold text-white mb-4">Intelligence Built In</h2>
                        <p className="text-gray-400 max-w-2xl mx-auto">Three powerful upgrades that transform how you understand and manage your bar's performance.</p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="relative group rounded-3xl bg-gradient-to-br from-purple-900/40 to-gray-800 border border-purple-700/40 hover:border-purple-500/60 transition-all duration-300 p-8 flex flex-col overflow-hidden">
                            <div className="absolute top-0 right-0 w-48 h-48 bg-purple-600/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl pointer-events-none" />
                            <div className="w-14 h-14 bg-purple-500/15 rounded-2xl flex items-center justify-center mb-6 border border-purple-600/20">
                                <Brain className="text-purple-400 h-7 w-7" />
                            </div>
                            <span className="text-xs bg-purple-900/50 text-purple-300 px-2 py-0.5 rounded-full font-semibold border border-purple-700/40 w-fit mb-3">Pro</span>
                            <h3 className="text-2xl font-bold text-white mb-3">AI-Powered Insights</h3>
                            <p className="text-gray-300 text-sm leading-relaxed flex-1">Your inventory ranked by urgency. The AI surfaces what needs attention first — burn rate, days-until-empty, and usage patterns so your highest-velocity items are always visible.</p>
                            <ul className="mt-6 space-y-2 text-sm">
                                {['CRITICAL / HIGH / HEALTHY priority tiers', 'Burn rate & days remaining per item', 'Sorted by most-used items first', 'One-click add to smart order'].map(i => (
                                    <li key={i} className="flex items-start gap-2 text-gray-300"><span className="text-purple-400 mt-0.5">▸</span>{i}</li>
                                ))}
                            </ul>
                        </div>

                        <div className="relative group rounded-3xl bg-gradient-to-br from-emerald-900/40 to-gray-800 border border-emerald-700/40 hover:border-emerald-500/60 transition-all duration-300 p-8 flex flex-col overflow-hidden">
                            <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-600/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl pointer-events-none" />
                            <div className="w-14 h-14 bg-emerald-500/15 rounded-2xl flex items-center justify-center mb-6 border border-emerald-600/20">
                                <Receipt className="text-emerald-400 h-7 w-7" />
                            </div>
                            <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full font-semibold border border-gray-600 w-fit mb-3">Base + Pro</span>
                            <h3 className="text-2xl font-bold text-white mb-3">Shift Close & Cash Reconciliation</h3>
                            <p className="text-gray-300 text-sm leading-relaxed flex-1">Every shift close is a complete financial snapshot. Bartenders submit cash, tips, and payouts — the system auto-calculates over/short and flags discrepancies.</p>
                            <ul className="mt-6 space-y-2 text-sm">
                                {['Cash + credit card split tracking', 'Auto over/short calculation', 'Itemized payout types (tips, comps)', 'Admin backdated entry creation'].map(i => (
                                    <li key={i} className="flex items-start gap-2 text-gray-300"><span className="text-emerald-400 mt-0.5">▸</span>{i}</li>
                                ))}
                            </ul>
                        </div>

                        <div className="relative group rounded-3xl bg-gradient-to-br from-amber-900/40 to-gray-800 border border-amber-700/40 hover:border-amber-500/60 transition-all duration-300 p-8 flex flex-col overflow-hidden">
                            <div className="absolute top-0 right-0 w-48 h-48 bg-amber-600/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl pointer-events-none" />
                            <div className="w-14 h-14 bg-amber-500/15 rounded-2xl flex items-center justify-center mb-6 border border-amber-600/20">
                                <PieChart className="text-amber-400 h-7 w-7" />
                            </div>
                            <span className="text-xs bg-purple-900/50 text-purple-300 px-2 py-0.5 rounded-full font-semibold border border-purple-700/40 w-fit mb-3">Pro</span>
                            <h3 className="text-2xl font-bold text-white mb-3">Financial Dashboard</h3>
                            <p className="text-gray-300 text-sm leading-relaxed flex-1">A live command center for your bar's money. Drill into revenue trends, tip patterns, payout breakdowns, and cash accuracy — by day, week, or month.</p>
                            <ul className="mt-6 space-y-2 text-sm">
                                {['Revenue area chart (cash vs. credit)', 'Over/short bar chart by day', 'Per-employee performance table', '7-day, monthly, and yearly views'].map(i => (
                                    <li key={i} className="flex items-start gap-2 text-gray-300"><span className="text-amber-400 mt-0.5">▸</span>{i}</li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-5">
                        {[
                            { value: 'Real-Time', label: 'Inventory Sync', icon: <Activity className="w-5 h-5 text-amber-400" /> },
                            { value: 'Auto', label: 'Over/Short Calc', icon: <DollarSign className="w-5 h-5 text-emerald-400" /> },
                            { value: 'AI-Ranked', label: 'Reorder Queue', icon: <Brain className="w-5 h-5 text-purple-400" /> },
                            { value: 'Instant', label: 'Team Alerts', icon: <Bell className="w-5 h-5 text-blue-400" /> },
                        ].map(s => (
                            <div key={s.label} className="bg-gray-800/60 border border-gray-700 rounded-2xl p-5 flex items-center gap-4">
                                <div className="w-10 h-10 bg-gray-700 rounded-xl flex items-center justify-center flex-shrink-0">{s.icon}</div>
                                <div>
                                    <div className="text-white font-bold text-lg leading-tight">{s.value}</div>
                                    <div className="text-gray-400 text-xs">{s.label}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Features Grid ── */}
            <section id="features" className="py-24 bg-gray-900/60 border-t border-gray-800">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-bold text-white mb-4">Everything You Need to Run a Profitable Bar</h2>
                        <p className="text-gray-400">A complete platform — web dashboard, mobile app, and team tools all in one.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[
                            { icon: <BarChart3 className="h-6 w-6" />, title: 'AI Smart Ordering', badge: 'Pro', color: 'amber', desc: 'Predictive algorithms analyze stock movement to generate automatic reorder suggestions, preventing over-ordering and stockouts.' },
                            { icon: <BookOpen className="h-6 w-6" />, title: 'Recipe Library', badge: 'Free', color: 'blue', desc: 'Local and global drink recipes in one place. Browse ingredients, instructions, glass type, and serving size — available on desktop and the mobile app.' },
                            { icon: <Rss className="h-6 w-6" />, title: 'Organization Feed', badge: 'Free', color: 'blue', desc: 'A team-wide social feed for announcements, photos, and updates. Every member sees the same picture, whether on desktop or mobile.' },
                            { icon: <MessageSquare className="h-6 w-6" />, title: 'Direct Messaging', badge: 'Free', color: 'blue', desc: 'Built-in real-time chat for 1-on-1 and group conversations. Coordinate coverage and communicate shift changes without leaving TopShelf.' },
                            { icon: <Calendar className="h-6 w-6" />, title: 'Graphical Scheduling', badge: null, color: 'purple', desc: 'Drag-and-drop visual timeline scheduler. Overnight shifts, recurring patterns, and multi-view roster management built in.' },
                            { icon: <RefreshCw className="h-6 w-6" />, title: 'Shift Swap Workflow', badge: null, color: 'purple', desc: 'Staff request swaps in the mobile app. Routed through admin and coworker approval — fully automated, no back-and-forth texts.' },
                            { icon: <Bell className="h-6 w-6" />, title: 'Push Notifications', badge: 'Free', color: 'blue', desc: 'Real-time push alerts for low stock, schedule changes, swap approvals, order arrivals, and all org messages. Always in the loop.' },
                            { icon: <ShieldCheck className="h-6 w-6" />, title: 'Order Tracking & Receiving', badge: null, color: 'amber', desc: 'Place orders and track them from submission to delivery. Confirm received quantities item-by-item — inventory updates automatically.' },
                            { icon: <TrendingUp className="h-6 w-6" />, title: 'Inventory Auditing', badge: null, color: 'amber', desc: 'Physical inventory audits with automatic variance reporting. Catch over-pours, theft, and waste with pinpoint accuracy.' },
                            { icon: <Archive className="h-6 w-6" />, title: 'Product Archiving', badge: null, color: 'amber', desc: 'Archive discontinued or seasonal products with one click. Archived items are hidden from inventory, reporting, and ordering — and can be restored anytime.' },
                            { icon: <UserX className="h-6 w-6" />, title: 'Barred Persons List', badge: null, color: 'purple', desc: 'Maintain a searchable list of barred individuals with photos, aliases, and notes. Flag formal trespass orders to ensure front-of-house staff are always informed.' },
                            { icon: <Database className="h-6 w-6" />, title: 'Data Backup & Restore', badge: null, color: 'amber', desc: 'Automatic daily backups with point-in-time org restore. Recover from accidental changes without affecting other organizations.' },
                            { icon: <Code2 className="h-6 w-6" />, title: 'Developer API & POS Integration', badge: 'Pro', color: 'amber', desc: 'A full REST API with scoped API keys for POS systems, accounting software, and custom dashboards. Inventory, orders, audits, and recipes — all programmatically accessible.' },
                            { icon: <Users className="h-6 w-6" />, title: 'Multi-Location & Station Mode', badge: null, color: 'amber', desc: 'Manage multiple bars from one dashboard. Secure PIN-based login for bar terminals gives fast access on shared devices.' },
                        ].map(f => {
                            const colorMap: Record<string, { ring: string; icon: string; badge: string; badgeBg: string }> = {
                                amber: { ring: 'hover:border-amber-500/50', icon: 'text-amber-500', badge: 'Pro', badgeBg: 'bg-purple-900/40 text-purple-400' },
                                blue: { ring: 'hover:border-blue-500/50', icon: 'text-blue-400', badge: 'Free', badgeBg: 'bg-blue-900/40 text-blue-400' },
                                purple: { ring: 'hover:border-purple-500/50', icon: 'text-purple-400', badge: '', badgeBg: '' },
                            };
                            const c = colorMap[f.color];
                            return (
                                <div key={f.title} className={`p-8 bg-gray-800 rounded-2xl border border-gray-700 ${c.ring} transition-colors group`}>
                                    <div className={`w-12 h-12 bg-gray-700/50 rounded-xl flex items-center justify-center mb-5 group-hover:bg-gray-700 transition-colors ${c.icon}`}>
                                        {f.icon}
                                    </div>
                                    <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                                        {f.title}
                                        {f.badge && (
                                            <span className={`text-xs ${c.badgeBg} px-2 py-0.5 rounded-full font-semibold`}>{f.badge}</span>
                                        )}
                                    </h3>
                                    <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* ── Pricing ── */}
            <section id="pricing" className="py-24 bg-gray-900 border-t border-gray-800">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <span className="inline-block py-1 px-3 rounded-full bg-amber-500/10 text-amber-500 text-sm font-bold mb-4">
                        14-Day Free Trial — No Credit Card Required
                    </span>
                    <h2 className="text-3xl font-bold text-white mb-4">Simple, Transparent Pricing</h2>
                    <p className="text-gray-400 mb-12">No hidden fees. Free mobile app included. Cancel anytime.</p>

                    {/* ── Three equal-height pricing cards ── */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto mb-6 pt-6 overflow-visible">

                        {/* Base */}
                        <div className="flex flex-col p-8 bg-gray-800 rounded-3xl border border-gray-700 hover:border-gray-600 transition-colors">
                            <h3 className="text-xl font-medium text-gray-300 mb-2">Base Edition</h3>
                            <div className="text-4xl font-bold text-white mb-1">$19.99<span className="text-lg text-gray-500 font-normal">/mo</span></div>
                            <div className="text-sm text-gray-400 mb-2 font-medium">Or $200/yr (Save 15%)</div>
                            <div className="inline-flex items-center gap-1.5 bg-blue-900/30 border border-blue-700/40 rounded-full px-3 py-1 text-blue-400 text-xs font-bold mb-6 w-fit mx-auto">
                                <Smartphone className="w-3 h-3" /> Free Mobile App Included
                            </div>
                            <ul className="space-y-3 mb-8 text-left flex-1 text-sm">
                                {[
                                    'Unlimited Items & Users',
                                    'Multi-Location Support',
                                    'Employee Scheduling',
                                    'Recipe Library (Local & Global)',
                                    'Barred Persons List',
                                    'Data Backup & Restore',
                                    'Shift Close & Cash Reports',
                                    'Standard Support (48h)',
                                ].map(item => (
                                    <li key={item} className="flex items-start text-gray-300 gap-2">
                                        <Check className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                                        {item}
                                    </li>
                                ))}
                            </ul>
                            <Link href="/register?plan=base" className="block w-full py-4 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-bold transition-colors">
                                Start Base Plan
                            </Link>
                        </div>

                        {/* Pro — highlighted */}
                        <div className="flex flex-col p-8 bg-gray-800 rounded-3xl border border-amber-500/40 hover:border-amber-500 transition-colors transform scale-105 shadow-2xl shadow-amber-900/10 z-10 relative overflow-visible">
                            <div className="absolute -top-5 left-0 right-0 flex justify-center">
                                <span className="bg-amber-500 text-black text-xs font-black px-4 py-1.5 rounded-full uppercase tracking-wide whitespace-nowrap shadow-lg">Most Popular</span>
                            </div>
                            <h3 className="text-xl font-medium text-white mb-2 mt-2">Pro Edition</h3>
                            <div className="text-4xl font-bold text-white mb-1">$29.99<span className="text-lg text-gray-500 font-normal">/mo</span></div>
                            <div className="text-sm text-amber-500/80 mb-2 font-medium">Or $300/yr (Save 15%)</div>
                            <div className="inline-flex items-center gap-1.5 bg-blue-900/30 border border-blue-700/40 rounded-full px-3 py-1 text-blue-400 text-xs font-bold mb-6 w-fit mx-auto">
                                <Smartphone className="w-3 h-3" /> Free Mobile App Included
                            </div>
                            <ul className="space-y-3 mb-8 text-left flex-1 text-sm">
                                {[
                                    { label: 'Everything in Base', pro: false },
                                    { label: 'AI Smart Ordering', pro: true },
                                    { label: 'AI-Powered Inventory Insights', pro: true },
                                    { label: 'Financial Dashboard & Analytics', pro: true },
                                    { label: 'Custom Report Builder', pro: true },
                                    { label: 'Report Scheduler & Auto-Delivery', pro: true },
                                    { label: 'Developer API & POS Integration', pro: true },
                                    { label: 'Same-Day Priority Support', pro: true },
                                ].map(item => (
                                    <li key={item.label} className="flex items-start text-white gap-2">
                                        <Check className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                                        {item.label}
                                        {item.pro && <span className="text-[10px] bg-purple-900/40 text-purple-400 px-1.5 py-0.5 rounded-full ml-auto font-bold flex-shrink-0">Pro</span>}
                                    </li>
                                ))}
                            </ul>
                            <Link href="/register?plan=pro" className="block w-full py-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold transition-colors shadow-lg shadow-amber-600/20">
                                Start Pro Plan
                            </Link>
                        </div>

                        {/* Enterprise — compact, same height */}
                        <div className="flex flex-col p-8 bg-gray-800 rounded-3xl border border-gray-700 hover:border-gray-500 transition-colors">
                            <h3 className="text-xl font-medium text-gray-300 mb-2">Enterprise</h3>
                            <div className="text-4xl font-bold text-white mb-1">Custom</div>
                            <div className="text-sm text-gray-500 mb-2 font-medium">Volume & multi-venue pricing</div>
                            <div className="inline-flex items-center gap-1.5 bg-gray-700/50 border border-gray-600 rounded-full px-3 py-1 text-gray-400 text-xs font-bold mb-6 w-fit mx-auto">
                                <Building2 className="w-3 h-3" /> Built Around Your Operation
                            </div>
                            <ul className="space-y-3 mb-8 text-left flex-1 text-sm">
                                {[
                                    'Everything in Pro',
                                    'White-Label Branding',
                                    'SSO / Single Sign-On',
                                    'Custom POS Integrations',
                                    'Dedicated Account Manager',
                                    'SLA-Backed Support',
                                    'Volume Licensing',
                                    'Per-Org Point-in-Time Restore',
                                ].map(item => (
                                    <li key={item} className="flex items-start text-gray-300 gap-2">
                                        <Check className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                                        {item}
                                    </li>
                                ))}
                            </ul>
                            <a href="mailto:sales@topshelfinventory.com" className="block w-full py-4 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-bold transition-colors text-center">
                                Contact Sales
                            </a>
                        </div>
                    </div>

                    {/* ── Enterprise Additional Options ── */}
                    <div className="max-w-5xl mx-auto mb-16">
                        <div className="text-center mb-8 mt-10">
                            <div className="inline-flex items-center gap-2 py-1 px-3 rounded-full bg-gray-700/50 border border-gray-600 text-gray-400 text-xs font-bold mb-4">
                                <Building2 className="w-3.5 h-3.5" /> Enterprise Add-Ons
                            </div>
                            <h3 className="text-2xl font-bold text-white mb-2">Tailored to Your Operation</h3>
                            <p className="text-gray-400 text-sm max-w-xl mx-auto">Every enterprise contract is built around your specific needs. These capabilities are configured and supported by our team — not self-serve.</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[
                                {
                                    icon: <Zap className="w-5 h-5 text-amber-400" />,
                                    bg: 'bg-amber-500/10 border-amber-700/30',
                                    title: 'White-Label Branding',
                                    desc: 'Your logo, colors, and domain on every screen, email, and mobile app icon.',
                                    why: 'Makes the platform feel native to your brand — not a third-party tool your staff has to learn.',
                                },
                                {
                                    icon: <Lock className="w-5 h-5 text-blue-400" />,
                                    bg: 'bg-blue-500/10 border-blue-700/30',
                                    title: 'SSO / Single Sign-On',
                                    desc: 'Connect Google Workspace, Azure AD, or Okta. Staff log in with existing company credentials.',
                                    why: 'Eliminates password sprawl, tightens security posture, and slashes IT overhead across large teams.',
                                },
                                {
                                    icon: <Code2 className="w-5 h-5 text-emerald-400" />,
                                    bg: 'bg-emerald-500/10 border-emerald-700/30',
                                    title: 'Custom POS & Accounting Integration',
                                    desc: 'Purpose-built integrations with your POS, PMS, or accounting system of record.',
                                    why: 'Eliminates manual data re-entry between systems — cutting reconciliation errors and saving hours weekly.',
                                },
                                {
                                    icon: <Users className="w-5 h-5 text-purple-400" />,
                                    bg: 'bg-purple-500/10 border-purple-700/30',
                                    title: 'Dedicated Account Manager',
                                    desc: 'A named contact for onboarding, training, QBRs, and direct escalation.',
                                    why: 'Faster resolutions and proactive guidance so your team spends time operating, not troubleshooting.',
                                },
                                {
                                    icon: <ShieldCheck className="w-5 h-5 text-rose-400" />,
                                    bg: 'bg-rose-500/10 border-rose-700/30',
                                    title: 'SLA-Backed Support',
                                    desc: 'Guaranteed response and resolution times with 99.9% uptime SLA and priority escalation.',
                                    why: 'Service disruptions in a busy venue are costly. An SLA turns support into a contractual guarantee.',
                                },
                                {
                                    icon: <DollarSign className="w-5 h-5 text-emerald-400" />,
                                    bg: 'bg-emerald-500/10 border-emerald-700/30',
                                    title: 'Volume Licensing',
                                    desc: 'Flat-rate or per-venue pricing for groups and multi-location operators with 5+ properties.',
                                    why: 'Predictable costs that scale with your footprint — not per-user fees that penalize growth.',
                                },
                            ].map(opt => (
                                <div key={opt.title} className={`flex flex-col gap-3 p-5 rounded-2xl border ${opt.bg} text-left`}>
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 bg-gray-800 rounded-xl flex items-center justify-center flex-shrink-0 border border-gray-700">
                                            {opt.icon}
                                        </div>
                                        <h4 className="text-white font-bold text-sm">{opt.title}</h4>
                                    </div>
                                    <p className="text-gray-400 text-xs leading-relaxed">{opt.desc}</p>
                                    <div className="mt-auto pt-2 border-t border-gray-700/50">
                                        <p className="text-gray-500 text-xs"><span className="text-gray-300 font-semibold">Why it matters:</span> {opt.why}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Feature comparison table */}
                    <div className="max-w-3xl mx-auto bg-gray-800/50 rounded-2xl border border-gray-700 overflow-hidden">
                        <div className="grid grid-cols-3 px-6 py-4 border-b border-gray-700 bg-gray-800">
                            <div className="text-left text-gray-400 text-sm font-semibold">Feature</div>
                            <div className="text-center text-gray-300 text-sm font-semibold">Base</div>
                            <div className="text-center text-amber-400 text-sm font-semibold">Pro</div>
                        </div>
                        {(() => {
                            const sections = [...new Set(FEATURES.map(f => f.section))];
                            return sections.map(sec => (
                                <div key={sec}>
                                    <div className="grid grid-cols-3 px-6 py-2 bg-gray-900/60 border-b border-gray-700/40">
                                        <div className="text-left text-gray-500 text-xs font-bold uppercase tracking-wider col-span-3">{sec}</div>
                                    </div>
                                    {FEATURES.filter(f => f.section === sec).map((f, i) => (
                                        <div key={f.label} className={`grid grid-cols-3 px-6 py-3 border-b border-gray-700/50 ${i % 2 === 0 ? 'bg-gray-800/20' : ''}`}>
                                            <div className="text-left text-gray-300 text-sm">{f.label}</div>
                                            <div className="text-center">
                                                {f.base ? <Check className="w-4 h-4 text-amber-500 mx-auto" /> : <X className="w-4 h-4 text-gray-600 mx-auto" />}
                                            </div>
                                            <div className="text-center">
                                                <Check className="w-4 h-4 text-amber-500 mx-auto" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ));
                        })()}
                    </div>
                </div>
            </section>

            {/* ── CTA Banner ── */}
            <section className="py-20 bg-gradient-to-r from-amber-900/30 via-gray-900 to-blue-900/20 border-t border-gray-800">
                <div className="max-w-4xl mx-auto px-4 text-center">
                    <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
                        Ready to Modernize Your Bar?
                    </h2>
                    <p className="text-gray-400 mb-8 text-lg">
                        Start your 14-day free trial. No credit card required.
                        Your team gets the mobile app immediately — free, forever.
                    </p>
                    <div className="flex flex-wrap justify-center gap-4">
                        <Link href="/register" className="flex items-center px-8 py-4 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-full text-lg transition-all shadow-xl hover:shadow-amber-500/25">
                            Get Started Free <ArrowRight className="ml-2 h-5 w-5" />
                        </Link>
                        <Link href="/login" className="flex items-center px-8 py-4 border border-gray-600 hover:border-gray-500 text-gray-300 hover:text-white font-medium rounded-full text-lg transition-all">
                            Sign In <ChevronRight className="ml-1 h-4 w-4" />
                        </Link>
                    </div>
                </div>
            </section>

            {/* ── Footer ── */}
            <footer className="bg-gray-950 py-14 border-t border-gray-800">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-10">
                        <div className="col-span-1 md:col-span-2">
                            <div className="font-bold text-xl tracking-tighter text-amber-500 mb-3">
                                TOPSHELF <span className="font-light text-white">INVENTORY</span>
                            </div>
                            <p className="text-gray-500 text-sm leading-relaxed max-w-xs">
                                The complete bar management platform — real-time inventory, recipe library, employee scheduling, team messaging, and a free mobile app for every user.
                            </p>
                        </div>
                        <div>
                            <h4 className="text-gray-300 font-semibold text-sm mb-4">Product</h4>
                            <ul className="space-y-2 text-gray-500 text-sm">
                                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                                <li><a href="#mobile" className="hover:text-white transition-colors">Mobile App</a></li>
                                <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="text-gray-300 font-semibold text-sm mb-4">Account</h4>
                            <ul className="space-y-2 text-gray-500 text-sm">
                                <li><Link href="/login" className="hover:text-white transition-colors">Sign In</Link></li>
                                <li><Link href="/register" className="hover:text-white transition-colors">Create Account</Link></li>
                                <li><a href="mailto:support@topshelfinventory.com" className="hover:text-white transition-colors">Contact Support</a></li>
                                <li><a href="mailto:sales@topshelfinventory.com" className="hover:text-white transition-colors">Enterprise Sales</a></li>
                            </ul>
                        </div>
                    </div>
                    <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
                        <p className="text-gray-600 text-sm">&copy; {new Date().getFullYear()} TopShelf Inventory. All rights reserved.</p>
                        <div className="flex gap-6 text-gray-600 text-sm">
                            <a href="#" className="hover:text-gray-400 transition-colors">Privacy</a>
                            <a href="#" className="hover:text-gray-400 transition-colors">Terms</a>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}
