const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

try {
    console.log('Creating suppliers table...');
    db.exec(`
        CREATE TABLE IF NOT EXISTS suppliers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            organization_id INTEGER,
            name TEXT NOT NULL,
            contact_email TEXT,
            contact_phone TEXT,
            delivery_days_json TEXT, -- JSON array of strings
            lead_time_days INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('Suppliers table created successfully.');
} catch (error) {
    console.error('Migration failed:', error);
}
