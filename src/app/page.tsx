import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, BarChart3, ShieldCheck, Smartphone, Users } from 'lucide-react';

export default function LandingPage() {
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
                        <Link href="#features" className="flex items-center px-8 py-4 border border-gray-600 text-lg font-medium rounded-full text-gray-300 hover:bg-gray-800 transition-all">
                            Learn More
                        </Link>
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
                            <form action="/api/organizations/check-slug" method="GET" className="flex gap-2"> {/* Placeholder action, will be handled by client/JS later or direct navigation */}
                                <div className="relative flex-grow">
                                    <span className="absolute left-3 top-3 text-gray-500">/o/</span>
                                    <input type="text" placeholder="club-name" className="w-full bg-gray-900 border border-gray-600 rounded-lg py-3 pl-10 pr-4 text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all placeholder-gray-600" />
                                </div>
                                <button type="button" className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-3 rounded-lg font-medium transition-colors">Go</button>
                            </form>
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
                                <div className="relative rounded-2xl overflow-hidden border border-gray-700 shadow-2xl">
                                    <Image
                                        src="/dashboard-mockup.png"
                                        alt="TopShelf Dashboard"
                                        width={1200}
                                        height={675}
                                        className="w-full h-auto transform group-hover:scale-105 transition duration-700"
                                    />
                                </div>
                                <p className="mt-4 text-center text-sm text-gray-400 font-medium tracking-wide uppercase">Powerful Desktop Command Center</p>
                            </div>
                        </div>
                        <div className="flex-1 space-y-8">
                            <div className="relative group max-w-sm mx-auto">
                                <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-cyan-400 rounded-3xl blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
                                <div className="relative rounded-3xl overflow-hidden border border-gray-700 shadow-2xl">
                                    <Image
                                        src="/mobile-app.png"
                                        alt="Mobile Scanning App"
                                        width={360}
                                        height={640}
                                        className="w-full h-auto transform group-hover:scale-105 transition duration-700"
                                    />
                                </div>
                                <p className="mt-4 text-center text-sm text-gray-400 font-medium tracking-wide uppercase">Fast Mobile Barcode Scanning</p>
                            </div>
                        </div>
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="p-8 bg-gray-800 rounded-2xl border border-gray-700 hover:border-amber-500/50 transition-colors group">
                            <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-amber-500/20 transition-colors">
                                <BarChart3 className="text-amber-500 h-6 w-6" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">AI Smart Ordering</h3>
                            <p className="text-gray-400">Predictive algorithms analyze your stock movement to generate smart orders. Never over-order or run dry again.</p>
                        </div>

                        <div className="p-8 bg-gray-800 rounded-2xl border border-gray-700 hover:border-amber-500/50 transition-colors group">
                            <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-amber-500/20 transition-colors">
                                <ShieldCheck className="text-amber-500 h-6 w-6" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">POS Independent</h3>
                            <p className="text-gray-400">Completely separated from your POS system. No expensive integration fees, no "per terminal" charges. pure inventory control.</p>
                        </div>

                        <div className="p-8 bg-gray-800 rounded-2xl border border-gray-700 hover:border-amber-500/50 transition-colors group">
                            <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-amber-500/20 transition-colors">
                                <Users className="text-amber-500 h-6 w-6" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">Multi-Location</h3>
                            <p className="text-gray-400">Manage multiple bars, clubs, or venues from a single powerful admin dashboard with granular permissions.</p>
                        </div>

                        <div className="p-8 bg-gray-800 rounded-2xl border border-gray-700 hover:border-amber-500/50 transition-colors group">
                            <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-amber-500/20 transition-colors">
                                <Smartphone className="text-amber-500 h-6 w-6" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">Station Mode</h3>
                            <p className="text-gray-400">Secure, persistent PIN-based login for bar terminals. Enable 90-day station sessions for rapid access.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Pricing w/ Yearly & Callout */}
            <section className="py-24 bg-gray-900 border-t border-gray-800">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <span className="inline-block py-1 px-3 rounded-full bg-amber-500/10 text-amber-500 text-sm font-bold mb-4">
                        14-Day Free Trial
                    </span>
                    <h2 className="text-3xl font-bold text-white mb-12">Simple, Transparent Pricing</h2>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-7xl mx-auto">
                        {/* Monthly Starter */}
                        <div className="flex flex-col p-8 bg-gray-800 rounded-3xl border border-gray-700 hover:border-gray-600 transition-colors">
                            <h3 className="text-xl font-medium text-gray-300 mb-2">Starter</h3>
                            <div className="text-4xl font-bold text-white mb-6">$19.99<span className="text-lg text-gray-500 font-normal">/mo</span></div>
                            <ul className="space-y-4 mb-8 text-left flex-1 text-sm">
                                <li className="flex items-center text-gray-300"><ShieldCheck className="w-5 h-5 text-amber-500 mr-3" /> Up to 3 Users</li>
                                <li className="flex items-center text-gray-300"><ShieldCheck className="w-5 h-5 text-amber-500 mr-3" /> Unlimited Items</li>
                                <li className="flex items-center text-gray-300"><ShieldCheck className="w-5 h-5 text-amber-500 mr-3" /> Smart Reports</li>
                            </ul>
                            <Link href="/register?plan=starter" className="block w-full py-4 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-bold transition-colors">
                                Start Monthly
                            </Link>
                        </div>

                        {/* Monthly Pro */}
                        <div className="flex flex-col p-8 bg-gray-800 rounded-3xl border border-amber-500/30 hover:border-amber-500 transition-colors transform scale-105 shadow-2xl z-10">
                            <div className="text-amber-500 text-xs font-bold uppercase tracking-wide mb-2">Most Popular</div>
                            <h3 className="text-xl font-medium text-white mb-2">Pro</h3>
                            <div className="text-4xl font-bold text-white mb-6">$29.00<span className="text-lg text-gray-500 font-normal">/mo</span></div>
                            <ul className="space-y-4 mb-8 text-left flex-1 text-sm">
                                <li className="flex items-center text-white"><ShieldCheck className="w-5 h-5 text-amber-500 mr-3" /> Unlimited Users</li>
                                <li className="flex items-center text-white"><ShieldCheck className="w-5 h-5 text-amber-500 mr-3" /> Priority Support</li>
                                <li className="flex items-center text-white"><ShieldCheck className="w-5 h-5 text-amber-500 mr-3" /> All Advanced Features</li>
                            </ul>
                            <Link href="/register?plan=pro" className="block w-full py-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold transition-colors shadow-lg">
                                Start Pro
                            </Link>
                        </div>

                        {/* Yearly */}
                        <div className="flex flex-col p-8 bg-gray-800 rounded-3xl border border-gray-700 hover:border-gray-600 transition-colors">
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="text-xl font-medium text-gray-300">Yearly</h3>
                                <span className="bg-amber-500/10 text-amber-500 text-xs font-bold px-2 py-1 rounded">SAVE 70%</span>
                            </div>
                            <div className="text-4xl font-bold text-white mb-6">$99.99<span className="text-lg text-gray-500 font-normal">/yr</span></div>
                            <ul className="space-y-4 mb-8 text-left flex-1 text-sm">
                                <li className="flex items-center text-gray-300"><ShieldCheck className="w-5 h-5 text-amber-500 mr-3" /> All Pro Features</li>
                                <li className="flex items-center text-gray-300"><ShieldCheck className="w-5 h-5 text-amber-500 mr-3" /> Unlimited Users</li>
                                <li className="flex items-center text-gray-300"><ShieldCheck className="w-5 h-5 text-amber-500 mr-3" /> Station Mode Included</li>
                            </ul>
                            <Link href="/register?plan=yearly" className="block w-full py-4 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-bold transition-colors">
                                Start Yearly
                            </Link>
                            <p className="mt-3 text-center text-xs text-gray-500">Includes 14-day free trial</p>
                        </div>
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
