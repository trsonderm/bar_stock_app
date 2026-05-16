-- ============================================================
-- MIGRATION POLICY — READ BEFORE EDITING
-- ============================================================
-- ONLY additive changes are permitted in this file:
--   ✓  ALTER TABLE ... ADD COLUMN IF NOT EXISTS
--   ✓  CREATE TABLE IF NOT EXISTS
--   ✓  INSERT ... ON CONFLICT DO NOTHING
--   ✓  UPDATE ... WHERE (backfills only, never destructive)
--   ✗  DROP TABLE / DROP COLUMN / TRUNCATE / DELETE — FORBIDDEN
--   ✗  Any statement that removes or overwrites existing rows
--
-- All ALTER TABLE statements MUST be wrapped in:
--   DO $$ BEGIN ... EXCEPTION WHEN duplicate_column THEN NULL; END $$;
-- so that re-running this file on an existing database is safe.
--
-- New columns MUST declare a DEFAULT or be nullable so that existing
-- rows continue to work without any data being written or cleared.
-- ============================================================

BEGIN;

-- =========================================================
-- 1. Items table additions
-- =========================================================

-- Sale price (set from Prices page, used in profit reporting)
DO $$ BEGIN
  ALTER TABLE items ADD COLUMN sale_price DECIMAL(10,2);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Stock unit label/size (how inventory is counted/subtracted)
DO $$ BEGIN
  ALTER TABLE items ADD COLUMN stock_unit_label VARCHAR(50) DEFAULT 'unit';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE items ADD COLUMN stock_unit_size INT DEFAULT 1;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Order unit label/size (how the item is ordered from supplier)
DO $$ BEGIN
  ALTER TABLE items ADD COLUMN order_unit_label VARCHAR(50) DEFAULT 'case';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE items ADD COLUMN order_unit_size INT DEFAULT 1;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Use category defaults flag for qty units
DO $$ BEGIN
  ALTER TABLE items ADD COLUMN use_category_qty_defaults BOOLEAN DEFAULT TRUE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- =========================================================
-- 2. Categories table additions (default qty unit templates)
-- =========================================================

DO $$ BEGIN
  ALTER TABLE categories ADD COLUMN default_stock_unit_label VARCHAR(50) DEFAULT 'unit';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE categories ADD COLUMN default_stock_unit_size INT DEFAULT 1;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE categories ADD COLUMN default_order_unit_label VARCHAR(50) DEFAULT 'case';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE categories ADD COLUMN default_order_unit_size INT DEFAULT 1;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- =========================================================
-- 3. Purchase orders table additions (order tracking flow)
-- =========================================================

DO $$ BEGIN
  ALTER TABLE purchase_orders ADD COLUMN tracking_status VARCHAR(50) DEFAULT 'PENDING';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE purchase_orders ADD COLUMN submitted_by INT REFERENCES users(id);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE purchase_orders ADD COLUMN resubmit_of INT REFERENCES purchase_orders(id);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE purchase_orders ADD COLUMN archived_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE purchase_orders ADD COLUMN resubmit_note TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE purchase_orders ADD COLUMN confirmed_by INT REFERENCES users(id);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE purchase_orders ADD COLUMN confirmed_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- =========================================================
-- 4. Purchase order items table additions
-- =========================================================

DO $$ BEGIN
  ALTER TABLE purchase_order_items ADD COLUMN received_quantity INT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE purchase_order_items ADD COLUMN confirmed_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- =========================================================
-- 5. Saved reports table (report builder)
-- =========================================================

CREATE TABLE IF NOT EXISTS saved_reports (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  is_scheduled BOOLEAN DEFAULT FALSE,
  schedule_config JSONB,
  next_run_at TIMESTAMPTZ,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS report_runs (
  id SERIAL PRIMARY KEY,
  report_id INT REFERENCES saved_reports(id) ON DELETE CASCADE,
  organization_id INT NOT NULL,
  ran_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'success',
  recipients_json JSONB DEFAULT '[]'
);

-- =========================================================
-- 6. Back-fill tracking_status for existing orders
-- =========================================================

UPDATE purchase_orders
SET tracking_status = status
WHERE tracking_status IS NULL OR tracking_status = 'PENDING';

-- Set existing DELIVERED orders to RECEIVED tracking status
UPDATE purchase_orders
SET tracking_status = 'RECEIVED'
WHERE status = 'DELIVERED' AND (tracking_status = 'PENDING' OR tracking_status = 'DELIVERED');

-- =========================================================
-- 7. Convert items.order_size from INTEGER to JSONB
-- =========================================================
DO $$ BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'items' AND column_name = 'order_size') = 'integer' THEN
    -- Drop the integer default before changing the type
    ALTER TABLE items ALTER COLUMN order_size DROP DEFAULT;
    ALTER TABLE items ALTER COLUMN order_size TYPE JSONB
    USING CASE
      WHEN order_size IS NULL THEN NULL
      ELSE jsonb_build_array(
        jsonb_build_object(
          'label', CASE WHEN order_size = 1 THEN 'Unit' ELSE order_size::text END,
          'amount', order_size
        )
      )
    END;
  END IF;
END $$;

-- =========================================================
-- 7b. Item-supplier preferred mapping (global, not per-location)
-- =========================================================
CREATE TABLE IF NOT EXISTS item_suppliers (
  id SERIAL PRIMARY KEY,
  item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE CASCADE,
  supplier_sku TEXT,
  cost_per_unit NUMERIC(10,2),
  is_preferred BOOLEAN DEFAULT FALSE,
  UNIQUE(item_id, supplier_id)
);

-- =========================================================
-- 8. Per-location supplier assignments
-- =========================================================
CREATE TABLE IF NOT EXISTS item_location_suppliers (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
  location_id INTEGER REFERENCES locations(id) ON DELETE CASCADE,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  UNIQUE(item_id, location_id)
);

-- =========================================================
-- 9. Per-location item prices
-- =========================================================
CREATE TABLE IF NOT EXISTS item_location_prices (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
  location_id INTEGER REFERENCES locations(id) ON DELETE CASCADE,
  sale_price DECIMAL(10,2),
  UNIQUE(item_id, location_id)
);

-- =========================================================
-- 10. Per-location pricing flag on organizations
-- =========================================================
DO $$ BEGIN
  ALTER TABLE organizations ADD COLUMN per_location_pricing BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE organizations ADD COLUMN smart_order_per_location BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- =========================================================
-- 11. Users: is_active + is_archived columns
-- =========================================================
DO $$ BEGIN
  ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE users ADD COLUMN is_archived BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- =========================================================
-- 12. Include item in low stock alerts flag
-- =========================================================
DO $$ BEGIN
  ALTER TABLE items ADD COLUMN include_in_low_stock_alerts BOOLEAN DEFAULT TRUE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- =========================================================
-- 13. Purchase orders: location_id
-- =========================================================
DO $$ BEGIN
  ALTER TABLE purchase_orders ADD COLUMN location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- =========================================================
-- 14. Email verification
-- =========================================================
DO $$ BEGIN
  ALTER TABLE users ADD COLUMN is_email_verified BOOLEAN DEFAULT TRUE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- 15. Device / Station token security enhancements
-- =========================================================
DO $$ BEGIN
  ALTER TABLE organization_tokens ADD COLUMN fingerprint_hash TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE organization_tokens ADD COLUMN registered_ip VARCHAR(45);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE organization_tokens ADD COLUMN user_agent TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE organization_tokens ADD COLUMN revoked_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE organization_tokens ADD COLUMN revoked_by INTEGER;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- =========================================================
-- 16. Organization isolation cleanup & enforcement
-- =========================================================

-- Reassign any NULL organization_id items to org 1 rather than deleting
-- (they may have inventory records attached — reassign keeps data intact)
UPDATE items SET organization_id = 1 WHERE organization_id IS NULL;
UPDATE categories SET organization_id = 1 WHERE organization_id IS NULL;
UPDATE locations SET organization_id = 1 WHERE organization_id IS NULL;
UPDATE suppliers SET organization_id = 1 WHERE organization_id IS NULL;
UPDATE inventory SET organization_id = 1 WHERE organization_id IS NULL;
UPDATE activity_logs SET organization_id = 1 WHERE organization_id IS NULL;
UPDATE settings SET organization_id = 1 WHERE organization_id IS NULL;
UPDATE report_schedules SET organization_id = 1 WHERE organization_id IS NULL;
UPDATE saved_reports SET organization_id = 1 WHERE organization_id IS NULL;

-- Enforce NOT NULL going forward on the tables that must always be org-scoped
DO $$ BEGIN
  ALTER TABLE items ALTER COLUMN organization_id SET NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE categories ALTER COLUMN organization_id SET NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE locations ALTER COLUMN organization_id SET NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE suppliers ALTER COLUMN organization_id SET NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE inventory ALTER COLUMN organization_id SET NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- =========================================================
-- 17. System logs table for server-side event persistence
-- =========================================================
CREATE TABLE IF NOT EXISTS system_logs (
  id          BIGSERIAL PRIMARY KEY,
  level       VARCHAR(10)  NOT NULL DEFAULT 'info',   -- info | warn | error
  category    VARCHAR(50)  NOT NULL DEFAULT 'system', -- email | auth | scheduler | api | system | database
  message     TEXT         NOT NULL,
  details     JSONB,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_level      ON system_logs (level);
CREATE INDEX IF NOT EXISTS idx_system_logs_category   ON system_logs (category);

-- =========================================================
-- 18. Users: hide_from_scheduler flag
-- =========================================================

DO $$ BEGIN
  ALTER TABLE users ADD COLUMN hide_from_scheduler BOOLEAN NOT NULL DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- =========================================================
-- 19. Payout types for close shift
-- =========================================================
CREATE TABLE IF NOT EXISTS payout_types (
  id              SERIAL PRIMARY KEY,
  organization_id INT NOT NULL,
  name            VARCHAR(100) NOT NULL,
  sort_order      INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- 20. Shift close records
-- =========================================================
CREATE TABLE IF NOT EXISTS shift_closes (
  id                    SERIAL PRIMARY KEY,
  organization_id       INT NOT NULL,
  location_id           INT,
  user_id               INT NOT NULL,
  closed_at             TIMESTAMPTZ DEFAULT NOW(),
  bank_start            DECIMAL(10,2) DEFAULT 0,
  bank_end              DECIMAL(10,2) DEFAULT 0,
  cash_sales            DECIMAL(10,2) DEFAULT 0,
  cash_tips             DECIMAL(10,2) DEFAULT 0,
  cc_sales              DECIMAL(10,2) DEFAULT 0,
  cc_tips               DECIMAL(10,2) DEFAULT 0,
  payouts_json          JSONB DEFAULT '[]',
  cc_tips_cash_payout   BOOLEAN DEFAULT FALSE,
  bag_amount            DECIMAL(10,2) DEFAULT 0,
  over_short            DECIMAL(10,2) DEFAULT 0,
  notes                 TEXT,
  receipt_register_data JSONB,
  receipt_cc_data       JSONB
);

-- General settings key for receipt mode
-- No schema change needed — uses existing settings table

-- =========================================================
-- 21. Barcode column on items + enable_low_stock_reporting on categories
-- =========================================================
-- barcodes (JSONB array) — primary column used by all API queries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='items' AND column_name='barcodes'
  ) THEN
    ALTER TABLE items ADD COLUMN barcodes JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- barcode (TEXT, legacy singular) — kept for backward compatibility
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='items' AND column_name='barcode'
  ) THEN
    ALTER TABLE items ADD COLUMN barcode TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='categories' AND column_name='enable_low_stock_reporting'
  ) THEN
    ALTER TABLE categories ADD COLUMN enable_low_stock_reporting BOOLEAN DEFAULT TRUE;
  END IF;
END $$;

-- system_settings key for bottle_lookup_config is inserted at runtime (ON CONFLICT DO UPDATE)

-- =========================================================
-- 22. Help articles (knowledge base / FAQ / how-to)
-- =========================================================
CREATE TABLE IF NOT EXISTS help_articles (
  id          SERIAL PRIMARY KEY,
  category    TEXT NOT NULL DEFAULT 'faq',
  title       TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  blocks      JSONB DEFAULT '[]',
  sort_order  INT DEFAULT 0,
  published   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- 23. Security monitoring tables
-- =========================================================

-- Login attempt log (all successes + failures with IP/UA)
CREATE TABLE IF NOT EXISTS login_attempts (
  id              SERIAL PRIMARY KEY,
  ip_address      TEXT NOT NULL,
  user_agent      TEXT,
  email           TEXT,
  user_id         INT,
  organization_id INT,
  success         BOOLEAN NOT NULL DEFAULT FALSE,
  fail_reason     TEXT,
  attempted_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip       ON login_attempts (ip_address);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email    ON login_attempts (email);
CREATE INDEX IF NOT EXISTS idx_login_attempts_user_id  ON login_attempts (user_id);
CREATE INDEX IF NOT EXISTS idx_login_attempts_at       ON login_attempts (attempted_at DESC);

-- Security events audit log (blocks, locks, flags applied by super admin)
CREATE TABLE IF NOT EXISTS security_events (
  id           SERIAL PRIMARY KEY,
  event_type   TEXT NOT NULL,
  entity_id    TEXT,
  note         TEXT,
  reviewed_by  INT,
  reviewed_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Account lockout column on users (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='users' AND column_name='is_locked'
  ) THEN
    ALTER TABLE users ADD COLUMN is_locked BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='users' AND column_name='session_invalidated_at'
  ) THEN
    ALTER TABLE users ADD COLUMN session_invalidated_at TIMESTAMPTZ;
  END IF;
END $$;

-- =========================================================
-- 24. Site Bottle Lookup Database (central barcode registry)
-- =========================================================
CREATE TABLE IF NOT EXISTS site_bottle_db (
  id                    SERIAL PRIMARY KEY,
  barcode               TEXT NOT NULL UNIQUE,
  brand                 TEXT,
  name                  TEXT NOT NULL,
  size                  TEXT,
  abv                   DECIMAL(5,2),
  type                  TEXT,
  secondary_type        TEXT,
  image_data            TEXT,             -- base64 encoded bottle image
  added_by              INT REFERENCES users(id) ON DELETE SET NULL,
  imported_from_org_id  INT REFERENCES organizations(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_site_bottle_db_barcode ON site_bottle_db (barcode);
CREATE INDEX IF NOT EXISTS idx_site_bottle_db_name    ON site_bottle_db (lower(name));

-- =========================================================
-- 25. Items table — ABV and bottle size fields
-- =========================================================
DO $$ BEGIN
  ALTER TABLE items ADD COLUMN abv DECIMAL(5,2);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE items ADD COLUMN bottle_size TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- =========================================================
-- 26. Items table — Low stock threshold type and factor
-- =========================================================
-- Allows threshold to be expressed as fixed, order_qty multiple, or stock_options multiple
DO $$ BEGIN
  ALTER TABLE items ADD COLUMN low_stock_threshold_type TEXT DEFAULT 'fixed';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE items ADD COLUMN low_stock_threshold_factor NUMERIC(10,2);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- =========================================================
-- 27. Items table — Smart Order exclusion flag
-- =========================================================
DO $$ BEGIN
  ALTER TABLE items ADD COLUMN exclude_from_smart_order BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- =========================================================
-- 28. Email log — full history of every send attempt
-- =========================================================
CREATE TABLE IF NOT EXISTS email_log (
    id            BIGSERIAL PRIMARY KEY,
    organization_id INT REFERENCES organizations(id) ON DELETE SET NULL,
    org_name      VARCHAR(255),
    email_type    VARCHAR(50)  NOT NULL DEFAULT 'other',
    tier          VARCHAR(20)  NOT NULL DEFAULT 'reporting',
    subject       TEXT,
    recipients    JSONB,
    html_body     TEXT,
    text_body     TEXT,
    status        VARCHAR(20)  NOT NULL DEFAULT 'sent',
    error_message TEXT,
    scheduled     BOOLEAN      DEFAULT FALSE,
    sent_at       TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_log_org_idx     ON email_log(organization_id);
CREATE INDEX IF NOT EXISTS email_log_sent_at_idx ON email_log(sent_at DESC);
CREATE INDEX IF NOT EXISTS email_log_status_idx  ON email_log(status);
CREATE INDEX IF NOT EXISTS email_log_type_idx    ON email_log(email_type);

-- =========================================================
-- 29. Report schedules — separate schedule table for saved reports
-- =========================================================
CREATE TABLE IF NOT EXISTS report_schedules (
    id              SERIAL PRIMARY KEY,
    report_id       INT NOT NULL REFERENCES saved_reports(id) ON DELETE CASCADE,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    frequency       VARCHAR(20)  NOT NULL DEFAULT 'daily',
    recipients      TEXT,
    next_run_at     TIMESTAMPTZ,
    active          BOOLEAN      DEFAULT TRUE,
    created_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS report_schedules_org_idx      ON report_schedules(organization_id);
CREATE INDEX IF NOT EXISTS report_schedules_next_run_idx ON report_schedules(next_run_at) WHERE active = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS report_schedules_report_uniq ON report_schedules(report_id, organization_id);

-- =========================================================
-- 30. Schedule — per-location shifts and schedule entries
-- =========================================================

-- =========================================================
-- 31. Items — product aliases (alternative names for search)
-- =========================================================
DO $$ BEGIN
  ALTER TABLE items ADD COLUMN aliases JSONB DEFAULT '[]'::jsonb;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- =========================================================
-- 32. Sub-categories — relational table replacing categories.sub_categories JSONB
-- =========================================================
CREATE TABLE IF NOT EXISTS sub_categories (
    id               SERIAL PRIMARY KEY,
    category_id      INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    organization_id  INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    display_order    INTEGER NOT NULL DEFAULT 0,
    UNIQUE(category_id, name)
);

CREATE INDEX IF NOT EXISTS sub_categories_category_idx ON sub_categories(category_id);
CREATE INDEX IF NOT EXISTS sub_categories_org_idx      ON sub_categories(organization_id);

-- Migrate existing JSONB data into the new table (safe on re-runs: column may be gone)
DO $$
DECLARE
    col_exists BOOLEAN;
    cat        RECORD;
    sub_name   TEXT;
    ord        INTEGER;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'categories' AND column_name = 'sub_categories'
    ) INTO col_exists;

    IF col_exists THEN
        FOR cat IN
            SELECT id, organization_id, sub_categories
            FROM categories
            WHERE sub_categories IS NOT NULL
              AND jsonb_typeof(sub_categories) = 'array'
              AND jsonb_array_length(sub_categories) > 0
        LOOP
            ord := 0;
            FOR sub_name IN
                SELECT jsonb_array_elements_text(cat.sub_categories)
            LOOP
                INSERT INTO sub_categories (category_id, organization_id, name, display_order)
                VALUES (cat.id, cat.organization_id, sub_name, ord)
                ON CONFLICT (category_id, name) DO NOTHING;
                ord := ord + 1;
            END LOOP;
        END LOOP;
    END IF;
END $$;

-- NOTE: sub_categories JSONB column intentionally kept on categories table.
-- Data has been migrated to the sub_categories table above but the column
-- is preserved to ensure no data is ever lost. Policy: never DROP columns.
DO $$ BEGIN
  ALTER TABLE shifts ADD COLUMN location_id INTEGER REFERENCES locations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE user_schedules ADD COLUMN location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- =========================================================
-- 33. Shift closes — custom calculator data storage
-- =========================================================
DO $$ BEGIN
  ALTER TABLE shift_closes ADD COLUMN custom_data JSONB DEFAULT '{}'::jsonb;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- =========================================================
-- 34. Billing tables (invoices + stripe customers)
-- =========================================================
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
);

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
);

-- =========================================================
-- 35. Organizations — org disable / billing suspension columns
-- =========================================================
DO $$ BEGIN
  ALTER TABLE organizations ADD COLUMN disabled_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE organizations ADD COLUMN disable_reason TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE organizations ADD COLUMN pre_disable_billing_status TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- =========================================================
-- 36. Scheduler — user_schedules and shifts location_id
--     (idempotent; already in schema.sql for fresh DBs)
-- =========================================================
DO $$ BEGIN
  ALTER TABLE shifts ADD COLUMN location_id INTEGER REFERENCES locations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE user_schedules ADD COLUMN location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- =========================================================
-- 37. Global products and categories master tables
-- =========================================================
CREATE TABLE IF NOT EXISTS global_categories (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS global_products (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    category_name TEXT,
    order_size JSONB DEFAULT '[{"label":"Unit","amount":1}]',
    barcodes JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(name)
);

-- =========================================================
-- 38. Server alerts configuration
-- =========================================================
CREATE TABLE IF NOT EXISTS server_alert_configs (
    id SERIAL PRIMARY KEY,
    alert_type TEXT NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    threshold_value NUMERIC,
    threshold_unit TEXT,
    recipients_json JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(alert_type)
);

-- =========================================================
-- 39. User profile pictures, display names, org feed, messages
-- =========================================================
DO $$ BEGIN
  ALTER TABLE users ADD COLUMN profile_picture TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE users ADD COLUMN display_name TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS org_posts (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    content TEXT,
    images JSONB DEFAULT '[]',
    tagged_user_ids JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS org_posts_org_idx ON org_posts(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
    sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    recipient_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS messages_recipient_idx ON messages(recipient_id, is_read);
CREATE INDEX IF NOT EXISTS messages_org_idx ON messages(organization_id);

-- =========================================================
-- 40. Security: barred persons and incident reports
-- =========================================================
CREATE TABLE IF NOT EXISTS security_barred (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    aliases JSONB DEFAULT '[]',
    photo TEXT,
    description TEXT,
    barred_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    barred_by_name TEXT,
    trespassed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS security_barred_org_idx ON security_barred(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS security_incidents (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
    barred_person_id INTEGER REFERENCES security_barred(id) ON DELETE SET NULL,
    person_name TEXT,
    description TEXT NOT NULL,
    submitted_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    submitted_by_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS security_incidents_org_idx ON security_incidents(organization_id, created_at DESC);

-- =========================================================
-- 41. User invitation links
-- =========================================================
CREATE TABLE IF NOT EXISTS user_invitations (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    email TEXT,
    role TEXT DEFAULT 'user',
    permissions JSONB DEFAULT '[]',
    created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_by_name TEXT,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    used_at TIMESTAMPTZ,
    used_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS user_invitations_token_idx ON user_invitations(token);
CREATE INDEX IF NOT EXISTS user_invitations_org_idx ON user_invitations(organization_id);

-- =========================================================
-- 42. Barred persons — duration and archive support
-- =========================================================
DO $$ BEGIN
  ALTER TABLE security_barred ADD COLUMN barred_until TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE security_barred ADD COLUMN is_archived BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE security_barred ADD COLUMN archived_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- =========================================================
-- 43. Security incidents — media attachments (photos/video)
-- =========================================================
DO $$ BEGIN
  ALTER TABLE security_incidents ADD COLUMN media JSONB DEFAULT '[]';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- =========================================================
-- 44. User position / job title (shows on schedule)
-- =========================================================
DO $$ BEGIN
  ALTER TABLE users ADD COLUMN position TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- =========================================================
-- 45. Feed likes and comments
-- =========================================================
CREATE TABLE IF NOT EXISTS post_likes (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES org_posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(post_id, user_id)
);
CREATE INDEX IF NOT EXISTS post_likes_post_idx ON post_likes(post_id);

CREATE TABLE IF NOT EXISTS post_comments (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES org_posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS post_comments_post_idx ON post_comments(post_id);

-- =========================================================
-- 46. Mobile push notification device tokens
-- =========================================================
CREATE TABLE IF NOT EXISTS device_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    platform TEXT NOT NULL CHECK(platform IN ('ios', 'android')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, token)
);
CREATE INDEX IF NOT EXISTS device_tokens_user_idx ON device_tokens(user_id);

-- =========================================================
-- 47. Shift swap requests
-- =========================================================
-- Status flow:
--   pending_employee  — requester sent, waiting for target employee to accept/decline
--   pending_manager   — both employees agreed, waiting for manager approval
--   approved          — manager approved, schedules swapped
--   declined          — declined by target employee OR manager
CREATE TABLE IF NOT EXISTS shift_swap_requests (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requester_schedule_id INTEGER NOT NULL REFERENCES user_schedules(id) ON DELETE CASCADE,
    target_schedule_id INTEGER NOT NULL REFERENCES user_schedules(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending_employee'
        CHECK(status IN ('pending_employee','pending_manager','approved','declined')),
    employee_responded_at TIMESTAMPTZ,
    manager_responded_at TIMESTAMPTZ,
    manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    decline_reason TEXT,
    message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS swap_requests_org_idx ON shift_swap_requests(organization_id, status);
CREATE INDEX IF NOT EXISTS swap_requests_requester_idx ON shift_swap_requests(requester_id);
CREATE INDEX IF NOT EXISTS swap_requests_target_idx ON shift_swap_requests(target_id);

-- =========================================================
-- 48. Time off requests
-- =========================================================
CREATE TABLE IF NOT EXISTS time_off_requests (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending','approved','declined')),
    reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    decline_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS time_off_org_idx ON time_off_requests(organization_id, status);
CREATE INDEX IF NOT EXISTS time_off_user_idx ON time_off_requests(user_id);

-- =========================================================
-- 49. Notifications table + user notification preferences
-- =========================================================
CREATE TABLE IF NOT EXISTS notifications (
    id              SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id),
    user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type            TEXT NOT NULL,
    title           TEXT NOT NULL,
    message         TEXT NOT NULL,
    data            JSONB DEFAULT '{}',
    is_read         BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS notifications_org_idx  ON notifications(organization_id);

DO $$ BEGIN
  ALTER TABLE users ADD COLUMN notification_preferences JSONB DEFAULT '{}';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- =========================================================
-- 50. Items table — Bottle size amount and unit
-- =========================================================
DO $$ BEGIN
  ALTER TABLE items ADD COLUMN bottle_size_amount NUMERIC(10,2);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE items ADD COLUMN bottle_size_unit TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- =========================================================
-- 51. Users — OAuth provider links for SSO
-- =========================================================
DO $$ BEGIN
  ALTER TABLE users ADD COLUMN oauth_providers JSONB DEFAULT '[]';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- =========================================================
-- 52. Barred persons — additional media (photos/videos)
-- =========================================================
DO $$ BEGIN
  ALTER TABLE security_barred ADD COLUMN media JSONB DEFAULT '[]';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- =========================================================
-- 53. Items — archive support
-- =========================================================
DO $$ BEGIN
  ALTER TABLE items ADD COLUMN archived_at TIMESTAMPTZ DEFAULT NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

COMMIT;
