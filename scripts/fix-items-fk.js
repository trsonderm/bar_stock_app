const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

try {
    console.log('Starting migration to fix items table...');

    // 1. Rename existing items table
    db.exec('ALTER TABLE items RENAME TO items_temp');
    console.log('Renamed items to items_temp');

    // 2. Create new items table without the bad FK
    // We keep the logic but remove the broken REFERENCES categories_old
    // We could reference 'categories' if we wanted, but let's be safe and flexible for the upcoming refactor.
    db.exec(`
        CREATE TABLE items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            description TEXT,
            unit_cost REAL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            secondary_type TEXT,
            organization_id INTEGER,
            supplier TEXT
        )
    `);
    console.log('Created new items table');

    // 3. Copy data
    db.exec(`
        INSERT INTO items (id, name, type, description, unit_cost, created_at, secondary_type, organization_id, supplier)
        SELECT id, name, type, description, unit_cost, created_at, secondary_type, organization_id, supplier
        FROM items_temp
    `);
    console.log('Copied data from items_temp');

    // 4. Drop temp table
    db.exec('DROP TABLE items_temp');
    console.log('Dropped items_temp');

    console.log('Migration successful: Bad Foreign Key removed behavior.');

} catch (error) {
    console.error('Migration failed:', error);
}
