const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

console.log('Migrating Categories to Global (NULL org_id)...');

// List of standard categories to make global
const standardCats = ['Liquor', 'Beer', 'Wine', 'Seltzer', 'Mixers', 'THC'];

const update = db.prepare('UPDATE categories SET organization_id = NULL WHERE name = ? AND organization_id = 1');

let count = 0;
for (const cat of standardCats) {
    const res = update.run(cat);
    count += res.changes;
}

console.log(`Updated ${count} categories to be global.`);
