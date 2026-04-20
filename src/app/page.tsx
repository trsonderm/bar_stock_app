'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, BarChart3, ShieldCheck, Smartphone, Users, TrendingUp, Check, X, Sparkles, DollarSign, Receipt, Brain, Activity, PieChart } from 'lucide-react';

const FEATURES = [
    { label: 'Unlimited Items & Users', base: true, pro: true },
    { label: 'Multi-Location Support', base: true, pro: true },
    { label: 'Stock View & Adjustments', base: true, pro: true },
    { label: 'Manual Ordering', base: true, pro: true },
    { label: 'Order Tracking & Receiving', base: true, pro: true },
    { label: 'Inventory Audit', base: true, pro: true },
    { label: 'Employee Scheduling', base: true, pro: true },
    { label: 'Shift Close & Cash Reconciliation', base: true, pro: true },
    { label: 'Standard Reports', base: true, pro: true },
    { label: 'Bottle Level Tracking', base: true, pro: true },
    { label: 'Standard Support (48h)', base: true, pro: true },
    { label: 'AI Smart Ordering', base: false, pro: true },
    { label: 'AI-Powered Inventory Insights', base: false, pro: true },
    { label: 'Financial Dashboard & Analytics', base: false, pro: true },
    { label: 'Custom Report Builder', base: false, pro: true },
    { label: 'Report Scheduler & Auto-Delivery', base: false, pro: true },
    { label: 'Advanced Analytics & Profit Reports', base: false, pro: true },
    { label: 'Same-Day Priority Support', base: false, pro: true },
    { label: 'Free Setup Assistance', base: false, pro: true },
];

export default function LandingPage() {
    const router = useRouter();
    const [slugInput, setSlugInput] = useState('');

    const handleGoToOrg = () => {
        const slug = slugInput.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
        if (slug) router.push(`/o/${slug}`);
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white font-sans selection:bg-amber-500 selection:text-white">
            {/* Navigation */}
            <nav className="fixed w-full z-50 bg-gray-900/80 backdrop-blur-md border-b border-gray-800">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-20">
                        <div className="flex-shrink-0 font-bold text-2xl tracking-tighter text-amber-500">
                            TOPSHELF <span className="text-white font-light">INVENTORY</span>
                        </div>
                        <div className="hidden md:block">
                            <div className="ml-10 flex items-baseline space-x-8">
                                <a href="#features" className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors">Features</a>
                                <a href="#pricing" className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors">Pricing</a>
                                <Link href="/login" className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors">Login</Link>
                                <Link href="/register" className="bg-amber-600 hover:bg-amber-500 text-white px-6 py-2 rounded-full text-sm font-bold transition-all shadow-lg hover:shadow-amber-500/20">Get Started</Link>
                            </div>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <header className="relative pt-32 pb-16 md:pt-48 md:pb-32 overflow-hidden">
                <div className="absolute inset-0 z-0">
                    <img src="/hero-bg.png" alt="Bar Background" className="w-full h-full object-cover opacity-40" />
                    <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/80 to-transparent"></div>
                </div>

                <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6">
                        Master Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-600">Bar Inventory</span>
                    </h1>
                    <p className="mt-4 max-w-2xl mx-auto text-xl text-gray-300">
                        The ultimate multi-tenant solution for managing liquor, beer, and wine stock.
                        Real-time tracking, accurate pours, and effortless organization management.
                    </p>
                    <div className="mt-10 flex justify-center gap-4">
                        <Link href="/register" className="flex items-center px-8 py-4 border border-transparent text-lg font-bold rounded-full text-white bg-amber-600 hover:bg-amber-500 md:text-xl transition-all shadow-xl hover:shadow-amber-500/30">
                            Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
                        </Link>
                        <a href="#features" className="flex items-center px-8 py-4 border border-gray-600 text-lg font-medium rounded-full text-gray-300 hover:bg-gray-800 transition-all">
                            Learn More
                        </a>
                    </div>
                </div>
            </header>

            {/* Organization Shortcut */}
            <section className="relative z-20 -mt-16 max-w-4xl mx-auto px-4">
                <div className="bg-gray-800/90 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-gray-700">
                    <div className="flex flex-col md:flex-row items-center gap-6">
                        <div className="flex-1">
                            <h3 className="text-xl font-semibold text-white mb-2">Find Your Organization</h3>
                            <p className="text-gray-400">Enter your organization slug to access your dedicated portal.</p>
                        </div>
                        <div className="w-full md:w-auto flex-1">
                            <div className="flex gap-2">
                                <div className="relative flex-grow">
                                    <span className="absolute left-3 top-3 text-gray-500">/o/</span>
                                    <input
                                        type="text"
                                        placeholder="club-name"
                                        value={slugInput}
                                        onChange={e => setSlugInput(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleGoToOrg()}
                                        className="w-full bg-gray-900 border border-gray-600 rounded-lg py-3 pl-10 pr-4 text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all placeholder-gray-600"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={handleGoToOrg}
                                    className="bg-amber-600 hover:bg-amber-500 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                                >
                                    Go
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Visual Showcase */}
            <section className="py-20 relative overflow-hidden">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                    <div className="flex flex-col md:flex-row items-center gap-12">
                        <div className="flex-1 space-y-8">
                            <div className="relative group">
                                <div className="absolute -inset-1 bg-gradient-to-r from-amber-600 to-amber-400 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
                                <div className="relative rounded-2xl overflow-hidden border border-gray-700 shadow-2xl h-[400px]">
                                    <img src="/dashboard-mockup.png" alt="TopShelf Dashboard" className="w-full h-full object-cover transform group-hover:scale-105 transition duration-700" />
                                </div>
                                <p className="mt-4 text-center text-sm text-gray-400 font-medium tracking-wide uppercase">Powerful Desktop Command Center</p>
                            </div>
                        </div>
                        <div className="flex-1 space-y-8">
                            <div className="relative group max-w-sm mx-auto">
                                <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-cyan-400 rounded-3xl blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
                                <div className="relative rounded-3xl overflow-hidden border border-gray-700 shadow-2xl h-[400px]">
                                    <img src="/mobile-app.png" alt="Mobile App" className="w-full h-full object-cover transform group-hover:scale-105 transition duration-700" />
                                </div>
                                <p className="mt-4 text-center text-sm text-gray-400 font-medium tracking-wide uppercase">Fast Mobile Barcode Scanning</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* New Features Spotlight */}
            <section className="py-20 bg-gradient-to-b from-gray-900 to-gray-900/50 relative overflow-hidden">
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-700/10 rounded-full blur-3xl"></div>
                    <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-amber-600/8 rounded-full blur-3xl"></div>
                </div>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                    <div className="text-center mb-14">
                        <span className="inline-flex items-center gap-2 py-1.5 px-4 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-sm font-semibold mb-5">
                            <Sparkles className="w-4 h-4" /> New Pro Features
                        </span>
                        <h2 className="text-4xl font-extrabold text-white mb-4">Intelligence Built In</h2>
                        <p className="text-gray-400 max-w-2xl mx-auto">Three powerful upgrades that transform how you understand and manage your bar&apos;s performance — automatically.</p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                        {/* AI-Powered Insights */}
                        <div className="relative group rounded-3xl overflow-hidden bg-gradient-to-br from-purple-900/40 to-gray-800 border border-purple-700/40 hover:border-purple-500/60 transition-all duration-300 p-8 flex flex-col">
                            <div className="absolute top-0 right-0 w-48 h-48 bg-purple-600/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl pointer-events-none"></div>
                            <div className="w-14 h-14 bg-purple-500/15 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-purple-500/25 transition-colors border border-purple-600/20">
                                <Brain className="text-purple-400 h-7 w-7" />
                            </div>
                            <div className="mb-3">
                                <span className="text-xs bg-purple-900/50 text-purple-300 px-2 py-0.5 rounded-full font-semibold border border-purple-700/40">Pro</span>
                            </div>
                            <h3 className="text-2xl font-bold text-white mb-3">AI-Powered Insights</h3>
                            <p className="text-gray-300 text-sm leading-relaxed flex-1">
                                Your inventory, ranked by urgency. The AI surfaces what needs attention first — sorting by burn rate, days-until-empty, and usage patterns so your highest-velocity items are always at the top.
                            </p>
                            <ul className="mt-6 space-y-2 text-sm">
                                <li className="flex items-start gap-2 text-gray-300"><span className="text-purple-400 mt-0.5">▸</span> CRITICAL / HIGH / HEALTHY priority tiers</li>
                                <li className="flex items-start gap-2 text-gray-300"><span className="text-purple-400 mt-0.5">▸</span> Sorted by most-used items first</li>
                                <li className="flex items-start gap-2 text-gray-300"><span className="text-purple-400 mt-0.5">▸</span> Burn rate & days remaining per item</li>
                                <li className="flex items-start gap-2 text-gray-300"><span className="text-purple-400 mt-0.5">▸</span> One-click add to smart order</li>
                            </ul>
                        </div>

                        {/* Shift Close & Cash Reconciliation */}
                        <div className="relative group rounded-3xl overflow-hidden bg-gradient-to-br from-emerald-900/40 to-gray-800 border border-emerald-700/40 hover:border-emerald-500/60 transition-all duration-300 p-8 flex flex-col">
                            <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-600/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl pointer-events-none"></div>
                            <div className="w-14 h-14 bg-emerald-500/15 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-emerald-500/25 transition-colors border border-emerald-600/20">
                                <Receipt className="text-emerald-400 h-7 w-7" />
                            </div>
                            <div className="mb-3">
                                <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full font-semibold border border-gray-600">Base + Pro</span>
                            </div>
                            <h3 className="text-2xl font-bold text-white mb-3">Shift Close & Cash Reconciliation</h3>
                            <p className="text-gray-300 text-sm leading-relaxed flex-1">
                                Every shift close is a complete financial snapshot. Bartenders submit their cash, tips, and payouts — the system automatically calculates over/short and flags discrepancies. Admins can create entries on behalf of any employee for any date.
                            </p>
                            <ul className="mt-6 space-y-2 text-sm">
                                <li className="flex items-start gap-2 text-gray-300"><span className="text-emerald-400 mt-0.5">▸</span> Cash + credit card split tracking</li>
                                <li className="flex items-start gap-2 text-gray-300"><span className="text-emerald-400 mt-0.5">▸</span> Auto over/short calculation</li>
                                <li className="flex items-start gap-2 text-gray-300"><span className="text-emerald-400 mt-0.5">▸</span> Itemized payout types (tips, comps, etc.)</li>
                                <li className="flex items-start gap-2 text-gray-300"><span className="text-emerald-400 mt-0.5">▸</span> Admin backdated entry creation</li>
                            </ul>
                        </div>

                        {/* Financial Dashboard */}
                        <div className="relative group rounded-3xl overflow-hidden bg-gradient-to-br from-amber-900/40 to-gray-800 border border-amber-700/40 hover:border-amber-500/60 transition-all duration-300 p-8 flex flex-col">
                            <div className="absolute top-0 right-0 w-48 h-48 bg-amber-600/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl pointer-events-none"></div>
                            <div className="w-14 h-14 bg-amber-500/15 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-amber-500/25 transition-colors border border-amber-600/20">
                                <PieChart className="text-amber-400 h-7 w-7" />
                            </div>
                            <div className="mb-3">
                                <span className="text-xs bg-purple-900/50 text-purple-300 px-2 py-0.5 rounded-full font-semibold border border-purple-700/40">Pro</span>
                            </div>
                            <h3 className="text-2xl font-bold text-white mb-3">Financial Dashboard</h3>
                            <p className="text-gray-300 text-sm leading-relaxed flex-1">
                                A live command center for your bar&apos;s money. Drill into revenue trends, tip patterns, payout breakdowns, and cash accuracy — by day, week, or month. See your best performers and catch accuracy issues before they compound.
                            </p>
                            <ul className="mt-6 space-y-2 text-sm">
                                <li className="flex items-start gap-2 text-gray-300"><span className="text-amber-400 mt-0.5">▸</span> Revenue area chart (cash vs. credit)</li>
                                <li className="flex items-start gap-2 text-gray-300"><span className="text-amber-400 mt-0.5">▸</span> Over/short bar chart by day</li>
                                <li className="flex items-start gap-2 text-gray-300"><span className="text-amber-400 mt-0.5">▸</span> Per-employee performance table</li>
                                <li className="flex items-start gap-2 text-gray-300"><span className="text-amber-400 mt-0.5">▸</span> 7-day, monthly, and yearly views</li>
                            </ul>
                        </div>
                    </div>

                    {/* Stats Row */}
                    <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-6">
                        {[
                            { value: 'Real-Time', label: 'Inventory Tracking', icon: <Activity className="w-5 h-5 text-amber-400" /> },
                            { value: 'Auto', label: 'Over/Short Calculation', icon: <DollarSign className="w-5 h-5 text-emerald-400" /> },
                            { value: 'AI-Ranked', label: 'Reorder Suggestions', icon: <Brain className="w-5 h-5 text-purple-400" /> },
                            { value: '3 Views', label: '7D / Monthly / Yearly', icon: <BarChart3 className="w-5 h-5 text-blue-400" /> },
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

            {/* Features */}
            <section id="features" className="py-24 bg-gray-900/50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-bold text-white mb-4">Why Choose TopShelf?</h2>
                        <p className="text-gray-400">Everything you need to run a profitable bar program.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        <div className="p-8 bg-gray-800 rounded-2xl border border-gray-700 hover:border-amber-500/50 transition-colors group">
                            <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-amber-500/20 transition-colors">
                                <BarChart3 className="text-amber-500 h-6 w-6" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">AI Smart Ordering <span className="text-xs bg-purple-900/40 text-purple-400 px-2 py-0.5 rounded-full ml-1 font-normal">Pro</span></h3>
                            <p className="text-gray-400 text-sm">Predictive algorithms analyze stock movement to generate automatic smart orders, preventing over-ordering and stockouts.</p>
                        </div>

                        <div className="p-8 bg-gray-800 rounded-2xl border border-gray-700 hover:border-amber-500/50 transition-colors group">
                            <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-amber-500/20 transition-colors">
                                <BarChart3 className="text-amber-500 h-6 w-6" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">Custom Report Builder <span className="text-xs bg-purple-900/40 text-purple-400 px-2 py-0.5 rounded-full ml-1 font-normal">Pro</span></h3>
                            <p className="text-gray-400 text-sm">Drag-and-drop report builder with live previews. Schedule reports to auto-deliver to any recipients — daily, weekly, or monthly.</p>
                        </div>

                        <div className="p-8 bg-gray-800 rounded-2xl border border-gray-700 hover:border-amber-500/50 transition-colors group">
                            <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-amber-500/20 transition-colors">
                                <ShieldCheck className="text-amber-500 h-6 w-6" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">Order Tracking & Receiving</h3>
                            <p className="text-gray-400 text-sm">Place orders and track them from submission to delivery. Confirm received quantities item by item — inventory updates automatically.</p>
                        </div>

                        <div className="p-8 bg-gray-800 rounded-2xl border border-gray-700 hover:border-amber-500/50 transition-colors group">
                            <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-amber-500/20 transition-colors">
                                <Users className="text-amber-500 h-6 w-6" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">Interactive Scheduling</h3>
                            <p className="text-gray-400 text-sm">A best-in-class drag-and-drop employee scheduler built right in. Manage repeating shifts and track your weekly roster.</p>
                        </div>

                        <div className="p-8 bg-gray-800 rounded-2xl border border-gray-700 hover:border-amber-500/50 transition-colors group">
                            <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-amber-500/20 transition-colors">
                                <TrendingUp className="text-amber-500 h-6 w-6" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">Auditing & Variance</h3>
                            <p className="text-gray-400 text-sm">Perform physical inventory audits and automatically generate variance reports. Catch over-pours, theft, and waste with pinpoint accuracy.</p>
                        </div>

                        <div className="p-8 bg-gray-800 rounded-2xl border border-gray-700 hover:border-amber-500/50 transition-colors group">
                            <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-amber-500/20 transition-colors">
                                <Smartphone className="text-amber-500 h-6 w-6" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">Station Mode & Multi-Venue</h3>
                            <p className="text-gray-400 text-sm">Manage multiple bars from one dashboard. Secure PIN-based login for bar terminals allows fast bartender access.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Pricing */}
            <section id="pricing" className="py-24 bg-gray-900 border-t border-gray-800">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <span className="inline-block py-1 px-3 rounded-full bg-amber-500/10 text-amber-500 text-sm font-bold mb-4">
                        14-Day Free Trial
                    </span>
                    <h2 className="text-3xl font-bold text-white mb-4">Simple, Transparent Pricing</h2>
                    <p className="text-gray-400 mb-12">No hidden fees. Cancel anytime.</p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto mb-16">
                        {/* Base Edition */}
                        <div className="flex flex-col p-8 bg-gray-800 rounded-3xl border border-gray-700 hover:border-gray-600 transition-colors">
                            <h3 className="text-xl font-medium text-gray-300 mb-2">Base Edition</h3>
                            <div className="text-4xl font-bold text-white mb-1">
                                $19.99<span className="text-lg text-gray-500 font-normal">/mo</span>
                            </div>
                            <div className="text-sm text-gray-400 mb-6 font-medium">Or $200/yr (Save 15%)</div>
                            <ul className="space-y-3 mb-8 text-left flex-1 text-sm">
                                {FEATURES.filter(f => f.base).map(f => (
                                    <li key={f.label} className="flex items-center text-gray-300">
                                        <Check className="w-4 h-4 text-amber-500 mr-3 flex-shrink-0" /> {f.label}
                                    </li>
                                ))}
                            </ul>
                            <Link href="/register?plan=base" className="block w-full py-4 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-bold transition-colors">
                                Start Base Plan
                            </Link>
                        </div>

                        {/* Pro Edition */}
                        <div className="flex flex-col p-8 bg-gray-800 rounded-3xl border border-amber-500/30 hover:border-amber-500 transition-colors transform scale-105 shadow-2xl z-10">
                            <div className="text-amber-500 text-xs font-bold uppercase tracking-wide mb-2">Recommended</div>
                            <h3 className="text-xl font-medium text-white mb-2">Pro Edition</h3>
                            <div className="text-4xl font-bold text-white mb-1">
                                $29.99<span className="text-lg text-gray-500 font-normal">/mo</span>
                            </div>
                            <div className="text-sm text-amber-500/80 mb-6 font-medium">Or $300/yr (Save 15%)</div>
                            <ul className="space-y-3 mb-8 text-left flex-1 text-sm">
                                {FEATURES.map(f => (
                                    <li key={f.label} className="flex items-center text-white">
                                        <Check className="w-4 h-4 text-amber-500 mr-3 flex-shrink-0" />
                                        {f.label}
                                        {!f.base && <span className="ml-2 text-xs bg-purple-900/40 text-purple-400 px-1.5 py-0.5 rounded-full">Pro</span>}
                                    </li>
                                ))}
                            </ul>
                            <Link href="/register?plan=pro" className="block w-full py-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold transition-colors shadow-lg">
                                Start Pro Plan
                            </Link>
                        </div>

                        {/* Enterprise */}
                        <div className="flex flex-col p-8 bg-gray-800 rounded-3xl border border-gray-700 hover:border-gray-600 transition-colors">
                            <h3 className="text-xl font-medium text-gray-300 mb-2">Enterprise</h3>
                            <div className="text-4xl font-bold text-white mb-6">Custom</div>
                            <p className="text-gray-400 text-sm mb-6 flex-1">
                                Need custom integrations, white-labeling, or dedicated account management? Let&apos;s talk.
                            </p>
                            <Link href="mailto:sales@topshelf.com" className="block w-full py-4 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-bold transition-colors">
                                Contact Sales
                            </Link>
                        </div>
                    </div>

                    {/* Feature comparison table */}
                    <div className="max-w-3xl mx-auto bg-gray-800/50 rounded-2xl border border-gray-700 overflow-hidden">
                        <div className="grid grid-cols-3 px-6 py-4 border-b border-gray-700 bg-gray-800">
                            <div className="text-left text-gray-400 text-sm font-semibold">Feature</div>
                            <div className="text-center text-gray-300 text-sm font-semibold">Base</div>
                            <div className="text-center text-amber-400 text-sm font-semibold">Pro</div>
                        </div>
                        {FEATURES.map((f, i) => (
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
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-gray-950 py-12 border-t border-gray-800">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <div className="font-bold text-2xl tracking-tighter text-gray-600 mb-6">
                        TOPSHELF <span className="font-light">INVENTORY</span>
                    </div>
                    <p className="text-gray-500">&copy; {new Date().getFullYear()} TopShelf Inventory. All rights reserved.</p>
                </div>
            </footer>
        </div>
    );
}
