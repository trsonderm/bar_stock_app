const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

console.log('Migrating DB...');

try {
    db.prepare('ALTER TABLE items ADD COLUMN unit_cost REAL DEFAULT 0').run();
    console.log('Added unit_cost column.');
} catch (e) {
    if (e.message.includes('duplicate column name')) {
        console.log('Column unit_cost already exists.');
    } else {
        console.error('Migration failed:', e);
        process.exit(1);
    }
}
