-- Create saved_reports table if not exists
CREATE TABLE IF NOT EXISTS saved_reports (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id),
    name TEXT NOT NULL,
    description TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create report_sections table if not exists
CREATE TABLE IF NOT EXISTS report_sections (
    id SERIAL PRIMARY KEY,
    report_id INTEGER NOT NULL REFERENCES saved_reports(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT,
    data_source TEXT,
    config JSONB DEFAULT '{}',
    sort_order INTEGER DEFAULT 0
);
