const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

console.log('--- Triggers ---');
const triggers = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger'").all();
console.log(triggers);
