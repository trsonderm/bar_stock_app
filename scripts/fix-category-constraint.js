const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

console.log('Fixing Category Unique Constraint...');

// 1. Drop existing unique index on name if it exists.
// Logic: It might be a constraint on the table creation or a separate index. 
// "sqlite_autoindex_categories_1" suggests a PRIMARY KEY or UNIQUE constraint in table definition.

// We need to check if we can simply drop index or if we need to recreate table.
const indices = db.prepare("PRAGMA index_list(categories)").all();
console.log('Current Indices:', indices);

// If it's a unique constraint created inline (UNIQUE(name)), we might have to recreate the table.
// But first, let's try to drop the index if it is a named index.
// If it's an autoindex, we can't drop it directly without migration.

// For safety in this quick fixes, let's try:
// 1. Rename table
// 2. Create NEW table with correct constraints (UNIQUE(name, organization_id))
// 3. Copy data
// 4. Drop old table

// Disable FKs for this operation
db.pragma('foreign_keys = OFF');

db.transaction(() => {
    // 1. Rename
    db.prepare('ALTER TABLE categories RENAME TO categories_old').run();

    // 2. Create New Table
    // Schema based on existing (inferred)
    db.prepare(`
        CREATE TABLE categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            stock_options TEXT,
            sub_categories TEXT,
            organization_id INTEGER,
            UNIQUE(name, organization_id)
        )
    `).run();

    // 3. Copy Data
    db.prepare(`
        INSERT INTO categories (id, name, stock_options, sub_categories, organization_id)
        SELECT id, name, stock_options, sub_categories, organization_id FROM categories_old
    `).run();

    // 4. Drop Old
    db.prepare('DROP TABLE categories_old').run();
})();

console.log('Categories table migrated to allow per-organization duplicates.');
