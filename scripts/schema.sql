-- Postgres Schema

CREATE TABLE IF NOT EXISTS organizations (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    subdomain TEXT UNIQUE,
    billing_status TEXT DEFAULT 'active',
    subscription_plan TEXT DEFAULT 'free_trial',
    trial_ends_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ai_ordering_config JSONB,
    sms_enabled BOOLEAN DEFAULT FALSE
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    stock_options JSONB, -- storing as JSONB for better querying if needed, or keeping TEXT if legacy code expects it. Let's use JSONB.
    sub_categories JSONB,
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
    supplier TEXT,
    track_quantity INTEGER DEFAULT 1, -- Could be Boolean, but keeping Integer 0/1 for easier migration if code relies on 1
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
