const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
console.log(`Fixing database schema at ${dbPath}...`);

const db = new Database(dbPath);

try {
    // 1. Rename existing inventory table
    console.log('Backing up existing inventory table...');
    // Check if inventory table exists
    const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='inventory'").get();
    if (exists) {
        db.prepare('ALTER TABLE inventory RENAME TO inventory_backup').run();
    } else {
        console.log('Inventory table does not exist, proceeding to create...');
    }

    // 2. Create new inventory table with correct FK
    console.log('Creating new inventory table with correct schema...');
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

    // 3. Restore data if backup exists
    if (exists) {
        console.log('Restoring data from backup...');
        // We only copy valid data (items that actually exist in 'items' table)
        // This implicitly filters out any orphaned records if they existed (unlikely if table was empty or broken)
        db.prepare(`
            INSERT INTO inventory (id, item_id, location_id, quantity)
            SELECT id, item_id, location_id, quantity FROM inventory_backup
            WHERE item_id IN (SELECT id FROM items)
        `).run();

        console.log('Dropping backup table...');
        db.prepare('DROP TABLE inventory_backup').run();
    }

    console.log('Schema fix complete! You can now add items.');

} catch (e) {
    console.error('Error fixing schema:', e);
    process.exit(1);
}
