const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

console.log('Running migration: Add organization_tokens table...');

try {
    db.prepare(`
    CREATE TABLE IF NOT EXISTS organization_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      device_name TEXT,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_used_at DATETIME,
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
    )
  `).run();

    console.log('Migration successful: organization_tokens table created.');
} catch (error) {
    console.error('Migration failed:', error);
} finally {
    db.close();
}
