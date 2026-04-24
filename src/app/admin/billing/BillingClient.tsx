'use client';

import { useState, useEffect } from 'react';
import { CreditCard, ExternalLink, Download, CheckCircle, Clock, AlertCircle, RefreshCw, Zap, Star, Building2 } from 'lucide-react';

interface BillingStatus {
    plan: string;
    billingStatus: string;
    trialEndsAt: string | null;
    stripeCustomerId: string | null;
    subscriptionId: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    paymentLast4: string | null;
    paymentBrand: string | null;
    invoices: any[];
    billingProvider: string;
    stripeConfigured: boolean;
    monthlyPrice: number;
    yearlyPrice: number;
    basicMonthlyPrice: number;
    basicYearlyPrice: number;
    enterpriseMonthlyPrice: number;
    enterpriseYearlyPrice: number;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
    active:     { bg: 'bg-green-500/20',  text: 'text-green-400',  label: 'Active'      },
    past_due:   { bg: 'bg-red-500/20',    text: 'text-red-400',    label: 'Past Due'    },
    canceled:   { bg: 'bg-gray-500/20',   text: 'text-gray-400',   label: 'Canceled'   },
    free_trial: { bg: 'bg-blue-500/20',   text: 'text-blue-400',   label: 'Free Trial'  },
    inactive:   { bg: 'bg-gray-500/20',   text: 'text-gray-400',   label: 'Inactive'    },
};

const INVOICE_COLORS: Record<string, string> = {
    PAID: 'text-green-400', PENDING: 'text-yellow-400', FAILED: 'text-red-400',
    VOIDED: 'text-gray-400', REFUNDED: 'text-blue-400',
};

type Interval = 'monthly' | 'yearly';

export default function BillingClient() {
    const [data, setData] = useState<BillingStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [interval, setIntervalMode] = useState<Interval>('monthly');
    const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
    const [portalLoading, setPortalLoading] = useState(false);
    const [error, setError] = useState('');

    const load = async () => {
        try {
            const res = await fetch('/api/billing/status');
            if (!res.ok) throw new Error('Failed to load billing status');
            const d = await res.json();
            setData(d);
        } catch (e: any) { setError(e.message); } finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const startCheckout = async (planKey: string) => {
        setCheckoutLoading(planKey);
        setError('');
        try {
            const res = await fetch('/api/billing/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    plan: `${planKey}_${interval}`,
                    successUrl: `${window.location.origin}/admin/billing?success=1`,
                    cancelUrl: `${window.location.origin}/admin/billing?canceled=1`,
                }),
            });
            const d = await res.json();
            if (d.url) { window.location.href = d.url; }
            else setError(d.error || 'Checkout failed');
        } catch (e: any) { setError(e.message); } finally { setCheckoutLoading(null); }
    };

    const openPortal = async () => {
        setPortalLoading(true); setError('');
        try {
            const res = await fetch('/api/billing/portal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ returnUrl: window.location.href }),
            });
            const d = await res.json();
            if (d.url) window.open(d.url, '_blank');
            else setError(d.error || 'Portal unavailable');
        } catch (e: any) { setError(e.message); } finally { setPortalLoading(false); }
    };

    if (loading) return (
        <div className="p-8 space-y-4">
            {[...Array(3)].map((_, i) => <div key={i} className="bg-gray-800 rounded-xl h-40 animate-pulse border border-gray-700" />)}
        </div>
    );

    const statusInfo = STATUS_COLORS[data?.billingStatus || 'inactive'] || STATUS_COLORS.inactive;
    const isActive = data?.billingStatus === 'active';
    const hasSub = !!data?.subscriptionId || isActive;
    const canUpgrade = !isActive && data?.billingProvider === 'stripe' && data?.stripeConfigured;

    const basicM  = data?.basicMonthlyPrice ?? 19;
    const basicY  = data?.basicYearlyPrice ?? 190;
    const proM    = data?.monthlyPrice ?? 49;
    const proY    = data?.yearlyPrice ?? 490;
    const entM    = data?.enterpriseMonthlyPrice ?? 0;
    const entY    = data?.enterpriseYearlyPrice ?? 0;

    const TIERS = [
        {
            key: 'basic',
            name: 'Basic',
            icon: Zap,
            iconColor: 'text-blue-400',
            borderColor: 'border-gray-700',
            badgeText: '',
            monthlyPrice: basicM,
            yearlyPrice: basicY,
            features: ['Inventory tracking', 'Unlimited products', 'Low stock alerts', 'Email reports', 'Order management', 'Up to 5 users'],
        },
        {
            key: 'pro',
            name: 'Pro',
            icon: Star,
            iconColor: 'text-purple-400',
            borderColor: 'border-purple-500/40',
            badgeText: 'Most Popular',
            monthlyPrice: proM,
            yearlyPrice: proY,
            features: ['Everything in Basic', 'Unlimited users', 'Multiple locations', 'Smart orders', 'Audit log', 'Custom reports', 'Shift close reports'],
        },
        {
            key: 'enterprise',
            name: 'Enterprise',
            icon: Building2,
            iconColor: 'text-emerald-400',
            borderColor: 'border-emerald-500/30',
            badgeText: 'Custom',
            monthlyPrice: entM,
            yearlyPrice: entY,
            features: ['Everything in Pro', 'API access', 'Custom integrations', 'SSO', 'Priority support', 'Dedicated account manager', 'Custom pricing'],
        },
    ];

    const currentPlanKey = (data?.plan || '').replace('_monthly', '').replace('_yearly', '');

    return (
        <div className="p-8 max-w-6xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold text-white">Billing & Subscription</h1>
                <button onClick={load} className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
                    <RefreshCw className="w-4 h-4" /> Refresh
                </button>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </div>
            )}

            {/* Current plan card */}
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
                <div className="flex items-start justify-between flex-wrap gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-white mb-1">Current Subscription</h2>
                        <p className="text-gray-400 text-sm capitalize">{data?.plan?.replace(/_/g, ' ') || 'No active plan'}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-bold ${statusInfo.bg} ${statusInfo.text}`}>{statusInfo.label}</span>
                </div>

                {data?.trialEndsAt && data.billingStatus === 'free_trial' && (
                    <div className="mt-4 bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-blue-300 text-sm flex items-center gap-2">
                        <Clock className="w-4 h-4 shrink-0" />
                        Trial ends {new Date(data.trialEndsAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </div>
                )}

                {data?.currentPeriodEnd && isActive && (
                    <p className="text-gray-400 text-sm mt-3">
                        Next billing: <span className="text-white">{new Date(data.currentPeriodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                        {data.cancelAtPeriodEnd && <span className="ml-2 text-red-400">(Cancels at period end)</span>}
                    </p>
                )}

                {data?.paymentLast4 && (
                    <p className="text-gray-400 text-sm mt-1">Payment: <span className="text-white capitalize">{data.paymentBrand} ••••{data.paymentLast4}</span></p>
                )}

                {hasSub && data?.billingProvider === 'stripe' && data.stripeConfigured && (
                    <div className="mt-5">
                        <button onClick={openPortal} disabled={portalLoading}
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors">
                            <CreditCard className="w-4 h-4" />
                            {portalLoading ? 'Opening…' : 'Manage Billing'}
                            <ExternalLink className="w-3 h-3" />
                        </button>
                    </div>
                )}
            </div>

            {/* Plan selection */}
            {(canUpgrade || !isActive) && data?.billingProvider !== 'manual' && (
                <div>
                    {/* Interval toggle */}
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold text-white">{isActive ? 'Change Plan' : 'Choose a Plan'}</h2>
                        <div className="flex items-center gap-1 bg-gray-800 border border-gray-700 rounded-lg p-1">
                            {(['monthly', 'yearly'] as Interval[]).map(i => (
                                <button key={i} onClick={() => setIntervalMode(i)}
                                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${interval === i ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                                    {i === 'monthly' ? 'Monthly' : 'Yearly'}
                                    {i === 'yearly' && <span className="ml-1.5 text-xs text-green-400 font-semibold">Save ~17%</span>}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        {TIERS.map(tier => {
                            const Icon = tier.icon;
                            const price = interval === 'monthly' ? tier.monthlyPrice : tier.yearlyPrice;
                            const perMonth = interval === 'yearly' && tier.yearlyPrice > 0 ? (tier.yearlyPrice / 12).toFixed(2) : null;
                            const isCurrentPlan = currentPlanKey === tier.key && isActive;
                            const isEnterprise = tier.key === 'enterprise';
                            const hasPrice = price > 0;

                            return (
                                <div key={tier.key}
                                    className={`border rounded-xl p-6 flex flex-col relative ${tier.key === 'pro' ? 'bg-purple-500/5' : 'bg-gray-800/50'} ${tier.borderColor} ${isCurrentPlan ? 'ring-2 ring-blue-500' : ''}`}>
                                    {tier.badgeText && (
                                        <span className={`absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold px-3 py-0.5 rounded-full ${tier.key === 'pro' ? 'bg-purple-600 text-white' : 'bg-emerald-700 text-emerald-200'}`}>
                                            {tier.badgeText}
                                        </span>
                                    )}
                                    {isCurrentPlan && (
                                        <span className="absolute -top-3 right-4 text-xs font-bold px-3 py-0.5 rounded-full bg-blue-600 text-white">Current Plan</span>
                                    )}

                                    <div className="flex items-center gap-2 mb-4">
                                        <Icon className={`w-5 h-5 ${tier.iconColor}`} />
                                        <h3 className="text-lg font-bold text-white">{tier.name}</h3>
                                    </div>

                                    <div className="mb-5">
                                        {isEnterprise && !hasPrice ? (
                                            <p className="text-3xl font-bold text-white">Custom</p>
                                        ) : (
                                            <>
                                                <p className="text-3xl font-bold text-white">
                                                    ${perMonth ?? price}
                                                    <span className="text-lg text-gray-400 font-normal">/mo</span>
                                                </p>
                                                {perMonth && (
                                                    <p className="text-sm text-gray-500">${price} billed annually</p>
                                                )}
                                            </>
                                        )}
                                    </div>

                                    <ul className="space-y-2 mb-6 flex-1">
                                        {tier.features.map(f => (
                                            <li key={f} className="flex items-start gap-2 text-sm text-gray-300">
                                                <CheckCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                                                {f}
                                            </li>
                                        ))}
                                    </ul>

                                    {isCurrentPlan ? (
                                        <div className="text-center text-sm text-blue-400 font-medium py-2">Active plan</div>
                                    ) : isEnterprise ? (
                                        <a href="mailto:sales@topshelfinventory.com"
                                            className="w-full text-center bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg font-medium text-sm transition-colors block">
                                            Contact Sales
                                        </a>
                                    ) : canUpgrade && hasPrice ? (
                                        <button onClick={() => startCheckout(tier.key)} disabled={!!checkoutLoading}
                                            className={`w-full py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-60 text-white ${tier.key === 'pro' ? 'bg-purple-600 hover:bg-purple-500' : 'bg-blue-600 hover:bg-blue-500'}`}>
                                            {checkoutLoading === tier.key ? 'Redirecting…' : `Subscribe — ${tier.name}`}
                                        </button>
                                    ) : !data?.stripeConfigured ? (
                                        <div className="text-center text-xs text-gray-500 py-2">Contact admin to subscribe</div>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {data?.billingProvider === 'manual' && (
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 text-center">
                    <CreditCard className="w-10 h-10 text-gray-500 mx-auto mb-3" />
                    <p className="text-gray-300 font-medium">Manual Billing</p>
                    <p className="text-gray-500 text-sm mt-1">Your subscription is managed manually. Contact your administrator for billing questions.</p>
                </div>
            )}

            {/* Invoice history */}
            {(data?.invoices?.length || 0) > 0 && (
                <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
                    <div className="p-5 border-b border-gray-700">
                        <h2 className="text-lg font-bold text-white">Invoice History</h2>
                    </div>
                    <table className="w-full text-left text-sm text-gray-400">
                        <thead className="bg-gray-900/50 uppercase text-xs">
                            <tr>
                                <th className="py-3 px-5">Date</th>
                                <th className="py-3 px-5">Period</th>
                                <th className="py-3 px-5">Amount</th>
                                <th className="py-3 px-5">Status</th>
                                <th className="py-3 px-5 text-right">Invoice</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {data!.invoices.map((inv: any) => (
                                <tr key={inv.id} className="hover:bg-gray-700/30">
                                    <td className="py-3 px-5">{new Date(inv.created_at).toLocaleDateString()}</td>
                                    <td className="py-3 px-5 text-xs">
                                        {inv.period_start && inv.period_end
                                            ? `${new Date(inv.period_start).toLocaleDateString()} – ${new Date(inv.period_end).toLocaleDateString()}`
                                            : '—'}
                                    </td>
                                    <td className="py-3 px-5 text-white font-medium">${Number(inv.amount).toFixed(2)}</td>
                                    <td className="py-3 px-5">
                                        <span className={`font-medium ${INVOICE_COLORS[inv.status] || 'text-gray-400'}`}>{inv.status}</span>
                                    </td>
                                    <td className="py-3 px-5 text-right">
                                        {inv.stripe_hosted_url ? (
                                            <a href={inv.stripe_hosted_url} target="_blank" rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300">
                                                View <ExternalLink className="w-3 h-3" />
                                            </a>
                                        ) : inv.stripe_pdf_url ? (
                                            <a href={inv.stripe_pdf_url} target="_blank" rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300">
                                                PDF <Download className="w-3 h-3" />
                                            </a>
                                        ) : <span className="text-gray-600">—</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
