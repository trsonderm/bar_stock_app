const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

try {
    console.log('Adding ai_ordering_config to organizations...');

    // Check if column exists
    const tableInfo = db.prepare('PRAGMA table_info(organizations)').all();
    const hasColumn = tableInfo.some(col => col.name === 'ai_ordering_config');

    if (!hasColumn) {
        db.exec('ALTER TABLE organizations ADD COLUMN ai_ordering_config TEXT');
        console.log('Column added successfully.');
    } else {
        console.log('Column already exists.');
    }

} catch (error) {
    console.error('Migration failed:', error);
}
