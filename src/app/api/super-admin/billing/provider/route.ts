import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getBillingConfig, saveBillingConfig, ensureBillingTables } from '@/lib/stripe';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    await ensureBillingTables();
    const cfg = await getBillingConfig();

    // Mask secret key
    const masked = { ...cfg };
    if (masked.stripe_secret_key) {
        masked.stripe_secret_key = masked.stripe_secret_key.slice(0, 8) + '••••••••••••••••' + masked.stripe_secret_key.slice(-4);
    }
    if (masked.stripe_webhook_secret) {
        masked.stripe_webhook_secret = masked.stripe_webhook_secret.slice(0, 8) + '••••••••••••••••' + masked.stripe_webhook_secret.slice(-4);
    }

    return NextResponse.json({ config: masked });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const body = await req.json();
    const allowed = [
        'billing_provider', 'stripe_mode',
        'stripe_secret_key', 'stripe_publishable_key', 'stripe_webhook_secret',
        'stripe_pro_monthly_price_id', 'stripe_pro_yearly_price_id',
        'pro_monthly_price', 'pro_yearly_price',
    ];

    const updates: Record<string, string> = {};
    for (const key of allowed) {
        if (body[key] !== undefined && body[key] !== null) {
            // Don't overwrite secret if it's the masked placeholder
            if ((key === 'stripe_secret_key' || key === 'stripe_webhook_secret') && body[key].includes('••••')) continue;
            updates[key] = String(body[key]);
        }
    }

    await saveBillingConfig(updates);

    // After saving keys, optionally test Stripe connection
    if (updates.stripe_secret_key) {
        try {
            const Stripe = (await import('stripe')).default;
            const stripe = new Stripe(updates.stripe_secret_key, { apiVersion: '2026-04-22.dahlia' as any });
            await stripe.balance.retrieve();
            return NextResponse.json({ saved: true, stripeTest: 'connected' });
        } catch (e: any) {
            return NextResponse.json({ saved: true, stripeTest: 'failed', stripeError: e.message });
        }
    }

    return NextResponse.json({ saved: true });
}
