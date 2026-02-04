const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

try {
    console.log('Running Advanced Ordering Migration...');

    // 1. Create pending_orders table
    db.exec(`
        CREATE TABLE IF NOT EXISTS pending_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token TEXT UNIQUE NOT NULL,
            organization_id INTEGER NOT NULL,
            supplier_id INTEGER NOT NULL,
            items_json TEXT NOT NULL, -- JSON snapshot of items
            status TEXT DEFAULT 'pending', -- pending, approved, declined, sent
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('Created pending_orders table.');

    // 2. Create system_settings table (Global Key-Value)
    db.exec(`
        CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('Created system_settings table.');

    // 3. Add billing_status and sms_enabled to organizations if missing
    const orgCols = db.prepare('PRAGMA table_info(organizations)').all();

    if (!orgCols.some(c => c.name === 'billing_status')) {
        db.exec("ALTER TABLE organizations ADD COLUMN billing_status TEXT DEFAULT 'free'");
        console.log('Added billing_status to organizations.');
    }

    if (!orgCols.some(c => c.name === 'sms_enabled')) {
        db.exec("ALTER TABLE organizations ADD COLUMN sms_enabled BOOLEAN DEFAULT 0");
        console.log('Added sms_enabled to organizations.');
    }

    console.log('Migration Complete.');

} catch (error) {
    console.error('Migration failed:', error);
}
