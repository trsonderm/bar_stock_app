-- Safe migration script: adds new columns and tables without breaking existing data
-- All statements use IF NOT EXISTS or DO $$ EXCEPTION WHEN duplicate_column THEN NULL END $$

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
