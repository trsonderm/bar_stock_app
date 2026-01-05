const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(process.cwd(), 'inventory.db');
const backupPath = path.join(process.cwd(), 'backups', `inventory_pre_migration_${Date.now()}.db`);

// Ensure backups dir
if (!fs.existsSync(path.join(process.cwd(), 'backups'))) {
    fs.mkdirSync(path.join(process.cwd(), 'backups'));
}

console.log('Creating backup at ' + backupPath);
fs.copyFileSync(dbPath, backupPath);

const db = new Database(dbPath);

console.log('Starting Migration: Dynamic Categories');

/*
    1. Create 'categories' table
    2. Seed initial categories
    3. Recreate 'items' table without CHECK constraint
    4. Migrate data
*/

try {
    // 1. Create Categories Table
    db.prepare(`
    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
    )
    `).run();

    // 2. Seed Initial Categories
    const initialTypes = ['Liquor', 'Beer', 'Seltzer', 'THC', 'Wine'];
    const insertCat = db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)');
    initialTypes.forEach(type => insertCat.run(type));
    console.log('Categories seeded.');

    // 3. Recreate Items Table
    // Rename old table
    db.prepare('ALTER TABLE items RENAME TO items_old').run();

    // Create new table (same structure, NO check constraint on type)
    // We keep 'type' column as a string for now related to category name, or should we link to Id?
    // Plan said: "Recreate table to remove CHECK(type IN (...)) constraint." keeping type textual is easiest for existing code compabitility
    // But ideally we should migrate to category_id.
    // HOWEVER, to minimize code breakage in this step, we will keep `type` column but remove the constraint.
    // The UI will validate against categories table.
    // Long term refactor: change type string to category_id FK.
    // For this task: Keep `type` string, just remove CHECK.

    db.prepare(`
    CREATE TABLE items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL, -- No CHECK constraint
        description TEXT,
        unit_cost REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (type) REFERENCES categories(name) ON UPDATE CASCADE -- Optional: enforce referential integrity if we want
    )
    `).run();

    // 4. Migrate Data
    const items = db.prepare('SELECT * FROM items_old').all();
    const insertItem = db.prepare(`
        INSERT INTO items (id, name, type, description, unit_cost, created_at)
        VALUES (@id, @name, @type, @description, @unit_cost, @created_at)
    `);

    for (const item of items) {
        insertItem.run(item);
    }
    console.log(`Migrated ${items.length} items.`);

    // Drop old table
    db.prepare('DROP TABLE items_old').run();

    console.log('Migration Complete.');

} catch (e) {
    console.error('Migration Failed:', e);
    console.log('Restoring from backup...');
    fs.copyFileSync(backupPath, dbPath);
    console.log('Restored.');
    process.exit(1);
}
