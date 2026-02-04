const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath, { verbose: console.log });

console.log('Fixing Settings Table Schema...');

// 1. Rename existing settings table
db.exec('ALTER TABLE settings RENAME TO settings_old');

// 2. Create new settings table with composite PK or ID
db.exec(`
  CREATE TABLE settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(organization_id, key),
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
  )
`);

// 3. Migrate Data
// Assume existing settings belong to Default Org (1) if organization_id is missing or was default
// In migration we added organization_id and updated it to defaultOrgId.
// So we can just select from settings_old.
// settings_old has: key, value, [organization_id - added by migrate script]
const rows = db.prepare('SELECT * FROM settings_old').all();

const insert = db.prepare('INSERT INTO settings (organization_id, key, value) VALUES (?, ?, ?)');

db.transaction(() => {
    for (const row of rows) {
        // If organization_id is null (shouldn't be if migration ran), default to 1
        const orgId = row.organization_id || 1;
        try {
            insert.run(orgId, row.key, row.value);
        } catch (e) {
            console.error(`Failed to migrate setting ${row.key}:`, e.message);
        }
    }
})();

// 4. Drop old table
db.exec('DROP TABLE settings_old');

console.log('Settings Table Fixed.');
