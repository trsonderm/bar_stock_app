const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

console.log('Fixing Inventory Foreign Key...');

const transaction = db.transaction(() => {
    // 1. Rename existing inventory
    db.prepare('ALTER TABLE inventory RENAME TO inventory_old').run();

    // 2. Create new inventory table with correct FK
    db.prepare(`
      CREATE TABLE inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER NOT NULL,
        location_id INTEGER NOT NULL,
        quantity INTEGER DEFAULT 0,
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
        FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
        UNIQUE(item_id, location_id)
      )
    `).run();

    // 3. Copy data
    db.prepare('INSERT INTO inventory (id, item_id, location_id, quantity) SELECT id, item_id, location_id, quantity FROM inventory_old').run();

    // 4. Drop old table
    db.prepare('DROP TABLE inventory_old').run();
});

try {
    transaction();
    console.log('Fix successful: inventory table references fixed');
} catch (e) {
    console.error('Fix failed:', e);
}
