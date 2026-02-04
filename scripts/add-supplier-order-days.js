const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

try {
    console.log('Adding order_days_json to suppliers...');

    // Check if column exists
    const tableInfo = db.prepare('PRAGMA table_info(suppliers)').all();
    const hasColumn = tableInfo.some(col => col.name === 'order_days_json');

    if (!hasColumn) {
        db.exec('ALTER TABLE suppliers ADD COLUMN order_days_json TEXT DEFAULT "[]"');
        console.log('Column added successfully.');
    } else {
        console.log('Column already exists.');
    }

} catch (error) {
    console.error('Migration failed:', error);
}
