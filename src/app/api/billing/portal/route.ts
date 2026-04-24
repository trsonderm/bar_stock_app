import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { getStripeClient } from '@/lib/stripe';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const stripe = await getStripeClient();
    if (!stripe) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });

    const orgId = session.organizationId;
    const custRow = await db.one(
        `SELECT stripe_customer_id FROM stripe_customers WHERE organization_id=$1`,
        [orgId]
    );
    const org = await db.one(`SELECT stripe_customer_id FROM organizations WHERE id=$1`, [orgId]);
    const customerId = custRow?.stripe_customer_id || org?.stripe_customer_id;

    if (!customerId) {
        return NextResponse.json({ error: 'No billing account found. Please subscribe first.' }, { status: 404 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.topshelfinventory.com';
    const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${appUrl}/admin/billing`,
    });

    return NextResponse.json({ url: portalSession.url });
}
