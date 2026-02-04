const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath, { verbose: console.log });

console.log('Adding attachments column to support_messages...');

try {
    const columns = db.prepare('PRAGMA table_info(support_messages)').all();
    if (!columns.some(c => c.name === 'attachments')) {
        db.prepare('ALTER TABLE support_messages ADD COLUMN attachments TEXT DEFAULT "[]"').run();
        console.log('Column added.');
    } else {
        console.log('Column already exists.');
    }
} catch (e) {
    console.error('Error:', e.message);
}
