const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
console.log(`Fixing items schema at ${dbPath}...`);

const db = new Database(dbPath);

try {
    // Disable FKs to allow table swapping
    db.pragma('foreign_keys = OFF');

    db.transaction(() => {
        // Cleanup potential leftovers from failed runs
        db.prepare("DROP TABLE IF EXISTS items_legacy").run();
        db.prepare("DROP TABLE IF EXISTS inventory_temp_fix").run();

        // 1. Rename existing items table
        console.log('Renaming items to items_legacy...');
        const itemsExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='items'").get();

        if (itemsExists) {
            db.prepare('ALTER TABLE items RENAME TO items_legacy').run();
        } else {
            console.log('No items table found, creating new one...');
        }

        // 2. Create new items table (Clean Schema, no CHECK constraint)
        console.log('Creating new items table...');
        db.prepare(`
            CREATE TABLE items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                description TEXT,
                unit_cost REAL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (type) REFERENCES categories(name) ON UPDATE CASCADE
            )
        `).run();

        // 3. Copy Data
        if (itemsExists) {
            console.log('Copying items data...');
            // We copy columns that exist. older schema might have slightly different cols but we assume base compatibility.
            db.prepare(`
                INSERT INTO items (id, name, type, description, unit_cost, created_at)
                SELECT id, name, type, description, unit_cost, created_at FROM items_legacy
             `).run();
        }

        // 4. Handle Inventory Table (Re-bind FKs to new table)
        // Since we renamed 'items', the FK in 'inventory' might still be pointing to 'items_legacy' (depending on sqlite version) or needs refresh.
        console.log('Rebinding inventory table...');
        const inventoryExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='inventory'").get();

        if (inventoryExists) {
            db.prepare('ALTER TABLE inventory RENAME TO inventory_temp_fix').run();

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

            console.log('Copying inventory data...');
            db.prepare(`
                INSERT INTO inventory (id, item_id, location_id, quantity)
                SELECT id, item_id, location_id, quantity FROM inventory_temp_fix
             `).run();

            db.prepare('DROP TABLE inventory_temp_fix').run();
        }

        // 5. Cleanup
        if (itemsExists) {
            console.log('Dropping items_legacy...');
            db.prepare('DROP TABLE items_legacy').run();
        }

    })();

    db.pragma('foreign_keys = ON');
    console.log('Items schema fixed successfully. CHECK constraints removed.');

} catch (e) {
    console.error('Error fixing items schema:', e);
    process.exit(1);
}
