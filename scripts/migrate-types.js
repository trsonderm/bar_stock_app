const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

console.log('Migrating database for new categories...');

const transaction = db.transaction(() => {
    // 1. Rename existing table
    db.prepare('ALTER TABLE items RENAME TO items_old').run();

    // 2. Create new table without restrictive CHECK constraint (or with expanded one)
    db.prepare(`
      CREATE TABLE items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT CHECK(type IN ('Liquor', 'Beer', 'Seltzer', 'THC')) NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // 3. Copy data
    db.prepare('INSERT INTO items (id, name, type, description, created_at) SELECT id, name, type, description, created_at FROM items_old').run();

    // 4. Drop old table
    db.prepare('DROP TABLE items_old').run();
});

try {
    transaction();
    console.log('Migration successful: types updated to Liquor, Beer, Seltzer, THC');
} catch (e) {
    console.error('Migration failed:', e);
}
