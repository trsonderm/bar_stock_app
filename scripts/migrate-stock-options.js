const sqlite3 = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = sqlite3(dbPath);

console.log('Migrating Categories Table for Dynamic Buttons...');

// 1. Add column if not exists
try {
    db.prepare('ALTER TABLE categories ADD COLUMN stock_options TEXT').run();
    console.log('Added stock_options column.');
} catch (e) {
    if (e.message.includes('duplicate column')) {
        console.log('stock_options column already exists.');
    } else {
        console.error('Error adding column:', e);
    }
}

// 2. Seed Defaults
const defaults = {
    'Liquor': JSON.stringify([1]),
    'Beer': JSON.stringify([1, 6, 24]),
    'Seltzer': JSON.stringify([1, 4, 8]),
    'Wine': JSON.stringify([1]),
    'THC': JSON.stringify([1]),
};

const update = db.prepare('UPDATE categories SET stock_options = ? WHERE name = ?');

for (const [name, options] of Object.entries(defaults)) {
    const res = update.run(options, name);
    console.log(`Updated ${name}: ${res.changes} rows.`);
}

// 3. Set default for others (e.g. recently created ones) to [1]
db.prepare("UPDATE categories SET stock_options = '[1]' WHERE stock_options IS NULL").run();

console.log('Migration Complete.');
