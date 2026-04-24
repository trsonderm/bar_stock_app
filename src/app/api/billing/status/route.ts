import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { getBillingConfig, ensureBillingTables } from '@/lib/stripe';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureBillingTables();

    const orgId = session.organizationId;
    const [org, stripeData, invoices] = await Promise.all([
        db.one(
            `SELECT name, billing_status, subscription_plan, trial_ends_at FROM organizations WHERE id=$1`,
            [orgId]
        ),
        db.one(
            `SELECT stripe_customer_id, stripe_subscription_id, current_period_end, cancel_at_period_end, payment_method_last4, payment_method_brand
             FROM stripe_customers WHERE organization_id=$1`,
            [orgId]
        ),
        db.query(
            `SELECT id, amount, status, due_date, paid_at, stripe_hosted_url, stripe_pdf_url, created_at
             FROM invoices WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 24`,
            [orgId]
        ),
    ]);

    const cfg = await getBillingConfig();

    return NextResponse.json({
        plan: org?.subscription_plan || 'free_trial',
        billingStatus: org?.billing_status || 'active',
        trialEndsAt: org?.trial_ends_at || null,
        stripeCustomerId: stripeData?.stripe_customer_id || null,
        subscriptionId: stripeData?.stripe_subscription_id || null,
        currentPeriodEnd: stripeData?.current_period_end || null,
        cancelAtPeriodEnd: stripeData?.cancel_at_period_end || false,
        paymentLast4: stripeData?.payment_method_last4 || null,
        paymentBrand: stripeData?.payment_method_brand || null,
        invoices: invoices || [],
        billingProvider: cfg.billing_provider || 'manual',
        stripeConfigured: !!cfg.stripe_secret_key,
        monthlyPrice: parseFloat(cfg.pro_monthly_price || '49'),
        yearlyPrice: parseFloat(cfg.pro_yearly_price || '490'),
    });
}
