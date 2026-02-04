const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

console.log('Migrating Items to Global (NULL org_id)...');

const result = db.prepare('UPDATE items SET organization_id = NULL WHERE organization_id = 1').run();
console.log(`Updated ${result.changes} items to be global.`);

const count = db.prepare('SELECT count(*) as c FROM items WHERE organization_id IS NULL').get();
console.log(`Total Global Items: ${count.c}`);
