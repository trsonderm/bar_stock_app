import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { getStripeClient, getBillingConfig, ensureBillingTables } from '@/lib/stripe';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { plan = 'monthly', successUrl, cancelUrl } = await req.json();
    const orgId = session.organizationId;

    const stripe = await getStripeClient();
    if (!stripe) {
        return NextResponse.json({ error: 'Stripe is not configured. Contact support.' }, { status: 503 });
    }

    const cfg = await getBillingConfig();
    const priceId = plan === 'yearly'
        ? cfg.stripe_pro_yearly_price_id
        : cfg.stripe_pro_monthly_price_id;

    if (!priceId) {
        return NextResponse.json({ error: 'Stripe price not configured. Contact support.' }, { status: 503 });
    }

    await ensureBillingTables();

    const org = await db.one('SELECT name, stripe_customer_id FROM organizations WHERE id=$1', [orgId]);
    const adminUser = await db.one('SELECT email, first_name, last_name FROM users WHERE id=$1', [session.id]);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.topshelfinventory.com';

    // Find or create Stripe customer
    let customerId: string | undefined = org?.stripe_customer_id || undefined;

    if (!customerId) {
        const existing = await db.one(
            `SELECT stripe_customer_id FROM stripe_customers WHERE organization_id=$1`,
            [orgId]
        );
        customerId = existing?.stripe_customer_id;
    }

    if (!customerId) {
        const customer = await stripe.customers.create({
            name: org?.name || 'Unknown Org',
            email: adminUser?.email || undefined,
            metadata: { organization_id: String(orgId) },
        });
        customerId = customer.id;
        await db.execute(
            `INSERT INTO stripe_customers (organization_id, stripe_customer_id, created_at, updated_at)
             VALUES ($1,$2,NOW(),NOW()) ON CONFLICT (organization_id) DO UPDATE SET stripe_customer_id=EXCLUDED.stripe_customer_id, updated_at=NOW()`,
            [orgId, customerId]
        );
        await db.execute(`UPDATE organizations SET stripe_customer_id=$1 WHERE id=$2`, [customerId, orgId]);
    }

    const checkoutSession = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: { organization_id: String(orgId) },
        success_url: successUrl || `${appUrl}/admin/billing?success=1`,
        cancel_url: cancelUrl || `${appUrl}/admin/billing?canceled=1`,
        subscription_data: {
            metadata: { organization_id: String(orgId) },
        },
        allow_promotion_codes: true,
    });

    return NextResponse.json({ url: checkoutSession.url });
}
