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
