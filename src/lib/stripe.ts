import Stripe from 'stripe';
import { db } from './db';

export interface BillingConfig {
    billing_provider: string;
    stripe_secret_key: string;
    stripe_publishable_key: string;
    stripe_webhook_secret: string;
    stripe_mode: string;
    stripe_pro_monthly_price_id: string;
    stripe_pro_yearly_price_id: string;
    pro_monthly_price: string;
    pro_yearly_price: string;
}

export async function getBillingConfig(): Promise<BillingConfig> {
    const rows = await db.query(`
        SELECT key, value FROM system_settings
        WHERE key IN (
            'billing_provider','stripe_secret_key','stripe_publishable_key',
            'stripe_webhook_secret','stripe_mode',
            'stripe_pro_monthly_price_id','stripe_pro_yearly_price_id',
            'pro_monthly_price','pro_yearly_price'
        )
    `);
    const cfg: any = {
        billing_provider: 'manual',
        stripe_secret_key: '',
        stripe_publishable_key: '',
        stripe_webhook_secret: '',
        stripe_mode: 'test',
        stripe_pro_monthly_price_id: '',
        stripe_pro_yearly_price_id: '',
        pro_monthly_price: '49',
        pro_yearly_price: '490',
    };
    rows.forEach((r: any) => { cfg[r.key] = r.value; });
    return cfg;
}

export async function saveBillingConfig(updates: Partial<BillingConfig>): Promise<void> {
    for (const [key, value] of Object.entries(updates)) {
        if (value === undefined) continue;
        await db.execute(
            `INSERT INTO system_settings (key, value) VALUES ($1, $2)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
            [key, String(value)]
        );
    }
}

export async function getStripeClient(): Promise<Stripe | null> {
    const cfg = await getBillingConfig();
    if (!cfg.stripe_secret_key) return null;
    return new Stripe(cfg.stripe_secret_key, { apiVersion: '2026-04-22.dahlia' as any });
}

export async function ensureBillingTables(): Promise<void> {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS invoices (
            id SERIAL PRIMARY KEY,
            organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
            amount NUMERIC(10,2) NOT NULL DEFAULT 0,
            status TEXT DEFAULT 'PENDING',
            due_date DATE,
            paid_at TIMESTAMPTZ,
            period_start DATE,
            period_end DATE,
            stripe_invoice_id TEXT,
            stripe_payment_intent_id TEXT,
            stripe_hosted_url TEXT,
            stripe_pdf_url TEXT,
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);
    await db.execute(`
        CREATE TABLE IF NOT EXISTS stripe_customers (
            id SERIAL PRIMARY KEY,
            organization_id INTEGER UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
            stripe_customer_id TEXT NOT NULL UNIQUE,
            stripe_subscription_id TEXT,
            stripe_price_id TEXT,
            payment_method_last4 TEXT,
            payment_method_brand TEXT,
            current_period_end TIMESTAMPTZ,
            cancel_at_period_end BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);
}
