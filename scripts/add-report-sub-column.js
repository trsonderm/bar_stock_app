const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

try {
    console.log('Adding receive_daily_report to user_locations...');

    // Check if column exists
    const tableInfo = db.prepare('PRAGMA table_info(user_locations)').all();
    const hasColumn = tableInfo.some(col => col.name === 'receive_daily_report');

    if (!hasColumn) {
        db.exec('ALTER TABLE user_locations ADD COLUMN receive_daily_report BOOLEAN DEFAULT 0');
        console.log('Column added successfully.');
    } else {
        console.log('Column already exists.');
    }

} catch (error) {
    console.error('Migration failed:', error);
}
