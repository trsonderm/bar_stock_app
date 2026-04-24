-- Billing tables migration

CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING','PAID','FAILED','VOIDED','REFUNDED')),
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
);

CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_stripe ON invoices(stripe_invoice_id);

CREATE TABLE IF NOT EXISTS stripe_customers (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    stripe_customer_id TEXT NOT NULL UNIQUE,
    stripe_subscription_id TEXT,
    stripe_price_id TEXT,
    stripe_product_id TEXT,
    payment_method_last4 TEXT,
    payment_method_brand TEXT,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add stripe_customer_id column to organizations if not present
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS per_location_pricing BOOLEAN DEFAULT FALSE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS smart_order_per_location BOOLEAN DEFAULT FALSE;
