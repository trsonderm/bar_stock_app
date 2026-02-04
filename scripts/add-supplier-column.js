const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

console.log('Adding supplier column to items table...');

try {
    const info = db.prepare("PRAGMA table_info(items)").all();
    const hasSupplier = info.some(c => c.name === 'supplier');

    if (!hasSupplier) {
        db.prepare("ALTER TABLE items ADD COLUMN supplier TEXT").run();
        console.log('Column added.');
    } else {
        console.log('Column already exists.');
    }
} catch (e) {
    console.error('Error adding column:', e);
}
