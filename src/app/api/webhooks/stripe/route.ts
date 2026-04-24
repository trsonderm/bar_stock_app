import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/lib/db';
import { getBillingConfig, ensureBillingTables } from '@/lib/stripe';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
    const cfg = await getBillingConfig();
    if (!cfg.stripe_secret_key || !cfg.stripe_webhook_secret) {
        return NextResponse.json({ error: 'Stripe not configured' }, { status: 400 });
    }

    const stripe = new Stripe(cfg.stripe_secret_key, { apiVersion: '2026-04-22.dahlia' as any });
    const body = await req.text();
    const sig = req.headers.get('stripe-signature') || '';

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(body, sig, cfg.stripe_webhook_secret);
    } catch (err: any) {
        console.error('[stripe webhook] signature error:', err.message);
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    await ensureBillingTables();

    try {
        switch (event.type) {
            case 'customer.subscription.created':
            case 'customer.subscription.updated': {
                const sub = event.data.object as Stripe.Subscription;
                const custId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

                const orgRow = await db.one(
                    `SELECT organization_id FROM stripe_customers WHERE stripe_customer_id = $1`,
                    [custId]
                );
                if (!orgRow) break;

                const orgId = orgRow.organization_id;
                const status = sub.status; // active, past_due, canceled, trialing, etc.
                const periodEnd = new Date(((sub as any).current_period_end ?? 0) * 1000);
                const priceId = sub.items.data[0]?.price.id || '';
                const cancelAtPeriodEnd = sub.cancel_at_period_end;

                // Map Stripe status → our billing_status
                const billingStatus =
                    status === 'active' ? 'active' :
                    status === 'trialing' ? 'active' :
                    status === 'past_due' ? 'past_due' :
                    status === 'canceled' ? 'canceled' : 'active';

                const plan = priceId ? 'pro' : 'free_trial';

                await db.execute(
                    `UPDATE organizations SET billing_status=$1, subscription_plan=$2 WHERE id=$3`,
                    [billingStatus, plan, orgId]
                );
                await db.execute(
                    `INSERT INTO stripe_customers (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, current_period_end, cancel_at_period_end, updated_at)
                     VALUES ($1,$2,$3,$4,$5,$6,NOW())
                     ON CONFLICT (organization_id) DO UPDATE SET
                       stripe_subscription_id=EXCLUDED.stripe_subscription_id,
                       stripe_price_id=EXCLUDED.stripe_price_id,
                       current_period_end=EXCLUDED.current_period_end,
                       cancel_at_period_end=EXCLUDED.cancel_at_period_end,
                       updated_at=NOW()`,
                    [orgId, custId, sub.id, priceId, periodEnd, cancelAtPeriodEnd]
                );
                break;
            }

            case 'customer.subscription.deleted': {
                const sub = event.data.object as Stripe.Subscription;
                const custId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
                const orgRow = await db.one(`SELECT organization_id FROM stripe_customers WHERE stripe_customer_id=$1`, [custId]);
                if (orgRow) {
                    await db.execute(
                        `UPDATE organizations SET billing_status='canceled', subscription_plan='free_trial' WHERE id=$1`,
                        [orgRow.organization_id]
                    );
                }
                break;
            }

            case 'invoice.payment_succeeded': {
                const inv = event.data.object as Stripe.Invoice;
                const custId = typeof inv.customer === 'string' ? inv.customer : (inv.customer as any)?.id;
                if (!custId) break;
                const orgRow = await db.one(`SELECT organization_id FROM stripe_customers WHERE stripe_customer_id=$1`, [custId]);
                if (!orgRow) break;

                await db.execute(
                    `INSERT INTO invoices (organization_id, amount, status, stripe_invoice_id, stripe_hosted_url, stripe_pdf_url, paid_at, created_at, updated_at)
                     VALUES ($1,$2,'PAID',$3,$4,$5,NOW(),NOW(),NOW())
                     ON CONFLICT (stripe_invoice_id) DO UPDATE SET status='PAID', paid_at=NOW(), updated_at=NOW()`,
                    [orgRow.organization_id, (inv.amount_paid / 100).toFixed(2), inv.id, inv.hosted_invoice_url, inv.invoice_pdf]
                );
                await db.execute(
                    `UPDATE organizations SET billing_status='active' WHERE id=$1`,
                    [orgRow.organization_id]
                );
                break;
            }

            case 'invoice.payment_failed': {
                const inv = event.data.object as Stripe.Invoice;
                const custId = typeof inv.customer === 'string' ? inv.customer : (inv.customer as any)?.id;
                if (!custId) break;
                const orgRow = await db.one(`SELECT organization_id FROM stripe_customers WHERE stripe_customer_id=$1`, [custId]);
                if (!orgRow) break;

                await db.execute(
                    `INSERT INTO invoices (organization_id, amount, status, stripe_invoice_id, created_at, updated_at)
                     VALUES ($1,$2,'FAILED',$3,NOW(),NOW())
                     ON CONFLICT (stripe_invoice_id) DO UPDATE SET status='FAILED', updated_at=NOW()`,
                    [orgRow.organization_id, ((inv.amount_due || 0) / 100).toFixed(2), inv.id]
                );
                await db.execute(
                    `UPDATE organizations SET billing_status='past_due' WHERE id=$1`,
                    [orgRow.organization_id]
                );
                break;
            }

            case 'checkout.session.completed': {
                const session = event.data.object as Stripe.Checkout.Session;
                const custId = typeof session.customer === 'string' ? session.customer : (session.customer as any)?.id;
                const subId = typeof session.subscription === 'string' ? session.subscription : (session.subscription as any)?.id;
                const orgId = session.metadata?.organization_id ? parseInt(session.metadata.organization_id) : null;
                if (!orgId || !custId) break;

                await db.execute(
                    `INSERT INTO stripe_customers (organization_id, stripe_customer_id, stripe_subscription_id, created_at, updated_at)
                     VALUES ($1,$2,$3,NOW(),NOW())
                     ON CONFLICT (organization_id) DO UPDATE SET
                       stripe_customer_id=EXCLUDED.stripe_customer_id,
                       stripe_subscription_id=EXCLUDED.stripe_subscription_id,
                       updated_at=NOW()`,
                    [orgId, custId, subId]
                );
                const planName = session.metadata?.plan || 'pro';
                await db.execute(
                    `UPDATE organizations SET billing_status='active', subscription_plan=$1, stripe_customer_id=$2 WHERE id=$3`,
                    [planName, custId, orgId]
                );
                break;
            }

            default:
                // Unhandled event type — log silently
                break;
        }
    } catch (err: any) {
        console.error(`[stripe webhook] handler error for ${event.type}:`, err);
        return NextResponse.json({ error: 'Handler error' }, { status: 500 });
    }

    return NextResponse.json({ received: true });
}
