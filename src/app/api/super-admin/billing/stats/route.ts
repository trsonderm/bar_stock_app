import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getBillingConfig, ensureBillingTables } from '@/lib/stripe';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    await ensureBillingTables();
    const cfg = await getBillingConfig();
    const monthlyPrice = parseFloat(cfg.pro_monthly_price || '49');
    const yearlyPrice = parseFloat(cfg.pro_yearly_price || '490');

    const [
        orgStats,
        pendingRow,
        paidThisMonthRow,
        recentInvoices,
        trialOrgs,
        revenueHistory,
        planBreakdown,
    ] = await Promise.all([
        db.query(`
            SELECT
                billing_status,
                subscription_plan,
                COUNT(*) AS count
            FROM organizations
            GROUP BY billing_status, subscription_plan
        `),
        db.one(`SELECT COALESCE(SUM(amount),0) AS total FROM invoices WHERE status='PENDING'`),
        db.one(`
            SELECT COALESCE(SUM(amount),0) AS total
            FROM invoices
            WHERE status='PAID'
              AND paid_at >= DATE_TRUNC('month', NOW())
        `),
        db.query(`
            SELECT i.*, o.name AS org_name
            FROM invoices i
            JOIN organizations o ON i.organization_id = o.id
            ORDER BY i.created_at DESC
            LIMIT 25
        `),
        db.query(`
            SELECT id, name, trial_ends_at, billing_status
            FROM organizations
            WHERE subscription_plan='free_trial'
              AND trial_ends_at IS NOT NULL
            ORDER BY trial_ends_at ASC
            LIMIT 20
        `),
        db.query(`
            SELECT
                TO_CHAR(DATE_TRUNC('month', paid_at), 'Mon YY') AS month,
                SUM(amount) AS revenue
            FROM invoices
            WHERE status='PAID' AND paid_at >= NOW() - INTERVAL '6 months'
            GROUP BY DATE_TRUNC('month', paid_at)
            ORDER BY DATE_TRUNC('month', paid_at) ASC
        `),
        db.query(`
            SELECT subscription_plan, billing_status, COUNT(*) AS count
            FROM organizations
            GROUP BY subscription_plan, billing_status
        `),
    ]);

    // Calculate MRR from active pro orgs
    let activePro = 0, activeMonthly = 0, activeYearly = 0;
    for (const r of orgStats) {
        if (r.billing_status === 'active' && (r.subscription_plan === 'pro' || r.subscription_plan === 'monthly')) {
            activePro += parseInt(r.count);
            activeMonthly += parseInt(r.count);
        }
        if (r.billing_status === 'active' && r.subscription_plan === 'yearly') {
            activeYearly += parseInt(r.count);
        }
    }

    const mrr = (activePro * monthlyPrice) + (activeYearly * yearlyPrice / 12);
    const arr = mrr * 12;

    let totalOrgs = 0, activeOrgs = 0, pastDueOrgs = 0, canceledOrgs = 0, trialOrgCount = 0;
    for (const r of orgStats) {
        const count = parseInt(r.count);
        totalOrgs += count;
        if (r.billing_status === 'active') activeOrgs += count;
        if (r.billing_status === 'past_due') pastDueOrgs += count;
        if (r.billing_status === 'canceled') canceledOrgs += count;
        if (r.subscription_plan === 'free_trial') trialOrgCount += count;
    }

    return NextResponse.json({
        stats: {
            mrr: mrr,
            arr: arr,
            revenue: mrr,
            pending: parseFloat(pendingRow?.total || '0'),
            collectedThisMonth: parseFloat(paidThisMonthRow?.total || '0'),
            activeSubs: activePro + activeYearly,
            totalOrgs,
            activeOrgs,
            pastDueOrgs,
            canceledOrgs,
            trialOrgs: trialOrgCount,
        },
        invoices: recentInvoices,
        trialOrgs,
        revenueHistory: revenueHistory.map((r: any) => ({ month: r.month, revenue: parseFloat(r.revenue || '0') })),
        planBreakdown,
        billingProvider: cfg.billing_provider || 'manual',
        stripeConfigured: !!cfg.stripe_secret_key,
        stripeMode: cfg.stripe_mode || 'test',
    });
}
