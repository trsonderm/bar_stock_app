const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

console.log('--- Organizations Table ---');
const tableInfo = db.prepare("PRAGMA table_info(organizations)").all();
console.log(tableInfo);
