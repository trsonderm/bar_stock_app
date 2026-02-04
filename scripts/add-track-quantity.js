const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

try {
    console.log('Adding track_quantity column to items table...');
    // Add track_quantity column, default to 1 (true)
    db.exec(`ALTER TABLE items ADD COLUMN track_quantity INTEGER DEFAULT 1`);
    console.log('Column added successfully.');
} catch (error) {
    if (error.message.includes('duplicate column name')) {
        console.log('Column track_quantity already exists.');
    } else {
        console.error('Migration failed:', error);
    }
}
