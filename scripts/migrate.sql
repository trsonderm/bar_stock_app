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
