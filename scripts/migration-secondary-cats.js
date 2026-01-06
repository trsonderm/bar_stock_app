const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
console.log(`Running migration for secondary categories at ${dbPath}...`);

const db = new Database(dbPath);

try {
    // 1. Add sub_categories to categories table
    console.log('Checking categories table...');
    const catCols = db.prepare("PRAGMA table_info(categories)").all();
    const subCatExists = catCols.some(c => c.name === 'sub_categories');

    if (!subCatExists) {
        console.log('Adding sub_categories column to categories table...');
        db.prepare("ALTER TABLE categories ADD COLUMN sub_categories TEXT").run();
    } else {
        console.log('categories.sub_categories already exists.');
    }

    // 2. Add secondary_type to items table
    console.log('Checking items table...');
    const itemCols = db.prepare("PRAGMA table_info(items)").all();
    const secTypeExists = itemCols.some(c => c.name === 'secondary_type');

    if (!secTypeExists) {
        console.log('Adding secondary_type column to items table...');
        db.prepare("ALTER TABLE items ADD COLUMN secondary_type TEXT").run();
    } else {
        console.log('items.secondary_type already exists.');
    }

    console.log('Migration complete!');

} catch (e) {
    console.error('Migration failed:', e);
    process.exit(1);
}
