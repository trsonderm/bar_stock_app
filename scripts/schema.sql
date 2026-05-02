-- Postgres Schema
-- Wrapped in a transaction so a fresh-install failure rolls back cleanly.

BEGIN;

CREATE TABLE IF NOT EXISTS organizations (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    subdomain TEXT UNIQUE,
    billing_status TEXT DEFAULT 'active',
    subscription_plan TEXT DEFAULT 'free_trial',
    trial_ends_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ai_ordering_config JSONB,
    sms_enabled BOOLEAN DEFAULT FALSE,
    settings JSONB DEFAULT '{}',
    disabled_at TIMESTAMPTZ,
    disable_reason TEXT,
    pre_disable_billing_status TEXT
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    password_hash TEXT,
    pin_hash TEXT NOT NULL,
    role TEXT CHECK(role IN ('admin', 'user')) NOT NULL DEFAULT 'user',
    permissions JSONB DEFAULT '[]',
    phone TEXT,
    bio TEXT,
    notes TEXT,
    notification_preferences JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    profile_picture TEXT,
    display_name TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS locations (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id),
    name TEXT NOT NULL,
    address TEXT
);

CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id),
    name TEXT NOT NULL,
    stock_options JSONB,
    sub_categories JSONB,
    enable_low_stock_reporting BOOLEAN DEFAULT TRUE,
    -- Default quantity unit templates for items in this category
    default_stock_unit_label VARCHAR(50) DEFAULT 'unit',
    default_stock_unit_size INT DEFAULT 1,
    default_order_unit_label VARCHAR(50) DEFAULT 'case',
    default_order_unit_size INT DEFAULT 1,
    UNIQUE(name, organization_id)
);

CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id),
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    secondary_type TEXT,
    description TEXT,
    unit_cost DECIMAL(10,2) DEFAULT 0,
    sale_price DECIMAL(10,2),
    supplier TEXT,
    track_quantity INTEGER DEFAULT 1,
    order_size JSONB DEFAULT '[{"label":"Unit","amount":1}]',
    low_stock_threshold INTEGER DEFAULT 5,
    stock_options JSONB,
    include_in_audit BOOLEAN DEFAULT TRUE,
    include_in_low_stock_alerts BOOLEAN DEFAULT TRUE,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    -- Quantity unit config (per-product override)
    stock_unit_label VARCHAR(50) DEFAULT 'unit',
    stock_unit_size INT DEFAULT 1,
    order_unit_label VARCHAR(50) DEFAULT 'case',
    order_unit_size INT DEFAULT 1,
    use_category_qty_defaults BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id),
    item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
    location_id INTEGER REFERENCES locations(id) ON DELETE CASCADE,
    quantity DECIMAL(10,2) DEFAULT 0,
    UNIQUE(item_id, location_id)
);

CREATE TABLE IF NOT EXISTS suppliers (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id),
    name TEXT NOT NULL,
    contact_email TEXT,
    contact_phone TEXT,
    delivery_days_json JSONB DEFAULT '[]',
    order_days_json JSONB DEFAULT '[]',
    lead_time_days INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS item_suppliers (
    id SERIAL PRIMARY KEY,
    item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
    supplier_id INTEGER REFERENCES suppliers(id) ON DELETE CASCADE,
    supplier_sku TEXT,
    cost_per_unit NUMERIC(10,2),
    is_preferred BOOLEAN DEFAULT FALSE,
    UNIQUE(item_id, supplier_id)
);

CREATE TABLE IF NOT EXISTS purchase_orders (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id),
    supplier_id INTEGER REFERENCES suppliers(id),
    location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'PENDING',
    tracking_status VARCHAR(50) DEFAULT 'PENDING',
    expected_delivery_date TIMESTAMP,
    details JSONB,
    submitted_by INTEGER REFERENCES users(id),
    resubmit_of INTEGER REFERENCES purchase_orders(id),
    archived_at TIMESTAMPTZ,
    resubmit_note TEXT,
    confirmed_by INTEGER REFERENCES users(id),
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id SERIAL PRIMARY KEY,
    purchase_order_id INTEGER REFERENCES purchase_orders(id) ON DELETE CASCADE,
    item_id INTEGER REFERENCES items(id),
    quantity INTEGER,
    received_quantity INTEGER,
    confirmed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS saved_reports (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    config JSONB NOT NULL DEFAULT '{}',
    is_scheduled BOOLEAN DEFAULT FALSE,
    schedule_config JSONB,
    next_run_at TIMESTAMPTZ,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS report_runs (
    id SERIAL PRIMARY KEY,
    report_id INTEGER REFERENCES saved_reports(id) ON DELETE CASCADE,
    organization_id INTEGER NOT NULL,
    ran_at TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'success',
    recipients_json JSONB DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS signatures (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id),
    user_id INTEGER REFERENCES users(id),
    label TEXT,
    data TEXT,
    is_active BOOLEAN DEFAULT FALSE,
    is_shared BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS report_schedules (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id),
    report_id TEXT,
    frequency TEXT,
    recipients TEXT,
    active BOOLEAN DEFAULT TRUE,
    next_run_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activity_logs (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id),
    user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    details JSONB,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bottle_level_options (
    id SERIAL PRIMARY KEY,
    label TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bottle_level_logs (
    id SERIAL PRIMARY KEY,
    activity_log_id INTEGER REFERENCES activity_logs(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    option_label TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS support_tickets (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id),
    user_id INTEGER REFERENCES users(id),
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT DEFAULT 'open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS support_messages (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER REFERENCES support_tickets(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    message TEXT NOT NULL,
    attachments JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id),
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(organization_id, key)
);

CREATE TABLE IF NOT EXISTS organization_tokens (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    device_name TEXT,
    expires_at TIMESTAMP NOT NULL,
    last_used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_locations (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id),
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    location_id INTEGER REFERENCES locations(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT FALSE,
    receive_daily_report BOOLEAN DEFAULT FALSE,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, location_id)
);

CREATE TABLE IF NOT EXISTS pending_orders (
    id SERIAL PRIMARY KEY,
    token TEXT UNIQUE NOT NULL,
    organization_id INTEGER NOT NULL REFERENCES organizations(id),
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    items_json JSONB NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shifts (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id),
    label TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    color TEXT DEFAULT '#3b82f6',
    assigned_user_ids JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_schedules (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id),
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    shift_id INTEGER REFERENCES shifts(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    recurring_group_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(organization_id, user_id, date)
);

CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id),
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS global_categories (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS global_products (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    category_name TEXT,
    order_size JSONB DEFAULT '[{"label":"Unit","amount":1}]',
    barcodes JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(name)
);

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

COMMIT;
