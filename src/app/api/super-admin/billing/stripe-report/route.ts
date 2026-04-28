import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getStripeClient, ensureBillingTables } from '@/lib/stripe';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    await ensureBillingTables();

    const stripe = await getStripeClient();
    if (!stripe) {
        return NextResponse.json({ error: 'Stripe not configured', stripeConfigured: false });
    }

    try {
        // Fetch org → stripe_customer mapping
        const customers = await db.query(`
            SELECT sc.stripe_customer_id, sc.stripe_subscription_id,
                   sc.payment_method_last4, sc.payment_method_brand,
                   sc.current_period_end, sc.cancel_at_period_end,
                   o.id AS org_id, o.name AS org_name, o.billing_status
            FROM stripe_customers sc
            JOIN organizations o ON sc.organization_id = o.id
        `);

        const customerMap = new Map<string, typeof customers[0]>();
        for (const c of customers) customerMap.set(c.stripe_customer_id, c);

        // Fetch recent invoices from Stripe
        const stripeInvoices = await stripe.invoices.list({ limit: 100 });

        const rows: any[] = [];

        for (const inv of stripeInvoices.data) {
            const orgData = inv.customer ? customerMap.get(inv.customer as string) : null;

            const isPastDue = inv.status === 'open' && inv.due_date && inv.due_date < Math.floor(Date.now() / 1000);
            const isFailed = inv.status === 'uncollectible';

            rows.push({
                stripe_invoice_id: inv.id,
                org_id: orgData?.org_id || null,
                org_name: orgData?.org_name || inv.customer_email || inv.customer || 'Unknown',
                billing_status: orgData?.billing_status || null,
                amount_due: inv.amount_due / 100,
                amount_paid: inv.amount_paid / 100,
                currency: inv.currency,
                status: inv.status,
                is_past_due: isPastDue,
                is_failed: isFailed,
                due_date: inv.due_date ? new Date(inv.due_date * 1000).toISOString() : null,
                paid_at: inv.status_transitions?.paid_at
                    ? new Date(inv.status_transitions.paid_at * 1000).toISOString()
                    : null,
                created: new Date(inv.created * 1000).toISOString(),
                hosted_url: inv.hosted_invoice_url || null,
                pdf_url: inv.invoice_pdf || null,
                customer_email: inv.customer_email || null,
                payment_method: orgData?.payment_method_brand
                    ? `${orgData.payment_method_brand} ••••${orgData.payment_method_last4}`
                    : null,
            });
        }

        // Also pull recent failed payment intents not tied to invoices
        const failedIntents = await stripe.paymentIntents.list({ limit: 50 });
        const failedRows: any[] = [];
        for (const pi of failedIntents.data) {
            if (pi.status !== 'requires_payment_method' && pi.status !== 'canceled') continue;
            if ((pi as any).invoice) continue; // already captured via invoices

            const orgData = pi.customer ? customerMap.get(pi.customer as string) : null;
            failedRows.push({
                stripe_invoice_id: pi.id,
                org_id: orgData?.org_id || null,
                org_name: orgData?.org_name || pi.receipt_email || pi.customer || 'Unknown',
                billing_status: orgData?.billing_status || null,
                amount_due: pi.amount / 100,
                amount_paid: 0,
                currency: pi.currency,
                status: pi.status,
                is_past_due: false,
                is_failed: true,
                due_date: null,
                paid_at: null,
                created: new Date(pi.created * 1000).toISOString(),
                hosted_url: null,
                pdf_url: null,
                customer_email: pi.receipt_email || null,
                payment_method: null,
            });
        }

        // Summary stats
        const totalCollected = rows.filter(r => r.status === 'paid').reduce((s, r) => s + r.amount_paid, 0);
        const totalOutstanding = rows.filter(r => r.status === 'open').reduce((s, r) => s + r.amount_due, 0);
        const pastDueCount = rows.filter(r => r.is_past_due || r.is_failed).length + failedRows.length;
        const problemOrgs = new Set([
            ...rows.filter(r => r.is_past_due || r.is_failed).map(r => r.org_id).filter(Boolean),
            ...failedRows.map(r => r.org_id).filter(Boolean),
        ]).size;

        return NextResponse.json({
            stripeConfigured: true,
            invoices: [...rows, ...failedRows].sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime()),
            summary: { totalCollected, totalOutstanding, pastDueCount, problemOrgs },
        });

    } catch (e: any) {
        console.error('[stripe-report]', e);
        return NextResponse.json({ error: e.message || 'Stripe error', stripeConfigured: true }, { status: 500 });
    }
}
