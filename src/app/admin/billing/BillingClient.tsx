'use client';

import { useState, useEffect } from 'react';
import { CreditCard, ExternalLink, Download, CheckCircle, Clock, AlertCircle, RefreshCw } from 'lucide-react';

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
}

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
    active: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Active' },
    past_due: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Past Due' },
    canceled: { bg: 'bg-gray-500/20', text: 'text-gray-400', label: 'Canceled' },
    free_trial: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Free Trial' },
    inactive: { bg: 'bg-gray-500/20', text: 'text-gray-400', label: 'Inactive' },
};

const INVOICE_COLORS: Record<string, string> = {
    PAID: 'text-green-400',
    PENDING: 'text-yellow-400',
    FAILED: 'text-red-400',
    VOIDED: 'text-gray-400',
    REFUNDED: 'text-blue-400',
};

export default function BillingClient() {
    const [data, setData] = useState<BillingStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
    const [portalLoading, setPortalLoading] = useState(false);
    const [error, setError] = useState('');

    const load = async () => {
        try {
            const res = await fetch('/api/billing/status');
            if (!res.ok) throw new Error('Failed to load billing status');
            const d = await res.json();
            setData(d);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const startCheckout = async (plan: 'monthly' | 'yearly') => {
        setCheckoutLoading(plan);
        setError('');
        try {
            const res = await fetch('/api/billing/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    plan,
                    successUrl: `${window.location.origin}/admin/billing?success=1`,
                    cancelUrl: `${window.location.origin}/admin/billing?canceled=1`,
                }),
            });
            const d = await res.json();
            if (d.url) {
                window.location.href = d.url;
            } else {
                setError(d.error || 'Checkout failed');
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setCheckoutLoading(null);
        }
    };

    const openPortal = async () => {
        setPortalLoading(true);
        setError('');
        try {
            const res = await fetch('/api/billing/portal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ returnUrl: window.location.href }),
            });
            const d = await res.json();
            if (d.url) {
                window.open(d.url, '_blank');
            } else {
                setError(d.error || 'Portal unavailable');
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setPortalLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="p-8 space-y-6">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="bg-gray-800 rounded-xl h-40 animate-pulse border border-gray-700" />
                ))}
            </div>
        );
    }

    const statusInfo = STATUS_COLORS[data?.billingStatus || 'inactive'] || STATUS_COLORS.inactive;
    const isActive = data?.billingStatus === 'active';
    const hasSub = !!data?.subscriptionId || isActive;
    const monthlyPrice = data?.monthlyPrice ?? 49;
    const yearlyPrice = data?.yearlyPrice ?? 490;
    const yearlyMonthly = (yearlyPrice / 12).toFixed(2);

    return (
        <div className="p-8 max-w-5xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold text-white">Billing & Subscription</h1>
                <button onClick={load} className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                </button>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                </div>
            )}

            {/* Current Plan */}
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
                <div className="flex items-start justify-between flex-wrap gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-white mb-1">Current Subscription</h2>
                        <p className="text-gray-400 text-sm capitalize">
                            {data?.plan?.replace(/_/g, ' ') || 'No active plan'}
                        </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-bold ${statusInfo.bg} ${statusInfo.text}`}>
                        {statusInfo.label}
                    </span>
                </div>

                {data?.trialEndsAt && data.billingStatus === 'free_trial' && (
                    <div className="mt-4 bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-blue-300 text-sm flex items-center gap-2">
                        <Clock className="w-4 h-4 shrink-0" />
                        Trial ends {new Date(data.trialEndsAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </div>
                )}

                {data?.currentPeriodEnd && isActive && (
                    <p className="text-gray-400 text-sm mt-3">
                        Next billing date: <span className="text-white">{new Date(data.currentPeriodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                        {data.cancelAtPeriodEnd && <span className="ml-2 text-red-400">(Cancels at period end)</span>}
                    </p>
                )}

                {data?.paymentLast4 && (
                    <p className="text-gray-400 text-sm mt-1">
                        Payment: <span className="text-white capitalize">{data.paymentBrand} ••••{data.paymentLast4}</span>
                    </p>
                )}

                {hasSub && data?.billingProvider === 'stripe' && data.stripeConfigured && (
                    <div className="mt-6 flex flex-wrap gap-3">
                        <button
                            onClick={openPortal}
                            disabled={portalLoading}
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors"
                        >
                            <CreditCard className="w-4 h-4" />
                            {portalLoading ? 'Opening...' : 'Manage Billing'}
                            <ExternalLink className="w-3 h-3" />
                        </button>
                    </div>
                )}
            </div>

            {/* Upgrade / Plan Selection — show when not active */}
            {!isActive && data?.billingProvider === 'stripe' && data?.stripeConfigured && (
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
                    <h2 className="text-xl font-bold text-white mb-6">Upgrade to Pro</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Monthly */}
                        <div className="border border-gray-700 hover:border-blue-500/50 rounded-xl p-5 transition-colors">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-bold text-white">Monthly</h3>
                                <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">Flexible</span>
                            </div>
                            <p className="text-3xl font-bold text-white mb-1">${monthlyPrice}<span className="text-lg text-gray-400">/mo</span></p>
                            <p className="text-gray-400 text-sm mb-5">Cancel anytime</p>
                            <button
                                onClick={() => startCheckout('monthly')}
                                disabled={!!checkoutLoading}
                                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white py-2 rounded-lg font-medium text-sm transition-colors"
                            >
                                {checkoutLoading === 'monthly' ? 'Redirecting...' : 'Subscribe Monthly'}
                            </button>
                        </div>
                        {/* Yearly */}
                        <div className="border border-blue-500/40 bg-blue-500/5 rounded-xl p-5">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-bold text-white">Annual</h3>
                                <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded">Best Value</span>
                            </div>
                            <p className="text-3xl font-bold text-white mb-0.5">${yearlyMonthly}<span className="text-lg text-gray-400">/mo</span></p>
                            <p className="text-gray-400 text-sm mb-5">${yearlyPrice} billed annually</p>
                            <button
                                onClick={() => startCheckout('yearly')}
                                disabled={!!checkoutLoading}
                                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white py-2 rounded-lg font-medium text-sm transition-colors"
                            >
                                {checkoutLoading === 'yearly' ? 'Redirecting...' : 'Subscribe Annually'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Manual billing notice */}
            {data?.billingProvider === 'manual' && (
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 text-center">
                    <CreditCard className="w-10 h-10 text-gray-500 mx-auto mb-3" />
                    <p className="text-gray-300 font-medium">Manual Billing</p>
                    <p className="text-gray-500 text-sm mt-1">Your subscription is managed manually. Contact your administrator for billing questions.</p>
                </div>
            )}

            {/* Invoice History */}
            {(data?.invoices?.length || 0) > 0 && (
                <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
                    <div className="p-6 border-b border-gray-700">
                        <h2 className="text-xl font-bold text-white">Invoice History</h2>
                    </div>
                    <table className="w-full text-left text-sm text-gray-400">
                        <thead className="bg-gray-900/50 uppercase text-xs">
                            <tr>
                                <th className="py-3 px-6">Date</th>
                                <th className="py-3 px-6">Period</th>
                                <th className="py-3 px-6">Amount</th>
                                <th className="py-3 px-6">Status</th>
                                <th className="py-3 px-6 text-right">Invoice</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {data!.invoices.map((inv: any) => (
                                <tr key={inv.id} className="hover:bg-gray-700/30">
                                    <td className="py-3 px-6">{new Date(inv.created_at).toLocaleDateString()}</td>
                                    <td className="py-3 px-6 text-xs">
                                        {inv.period_start && inv.period_end
                                            ? `${new Date(inv.period_start).toLocaleDateString()} – ${new Date(inv.period_end).toLocaleDateString()}`
                                            : '—'}
                                    </td>
                                    <td className="py-3 px-6 text-white font-medium">${Number(inv.amount).toFixed(2)}</td>
                                    <td className="py-3 px-6">
                                        <span className={`font-medium ${INVOICE_COLORS[inv.status] || 'text-gray-400'}`}>
                                            {inv.status}
                                        </span>
                                    </td>
                                    <td className="py-3 px-6 text-right">
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
                                        ) : (
                                            <span className="text-gray-600">—</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {!loading && (data?.invoices?.length || 0) === 0 && isActive && (
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 text-center text-gray-500 text-sm">
                    <CheckCircle className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                    No invoices yet.
                </div>
            )}
        </div>
    );
}
