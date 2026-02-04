const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

console.log('--- Items Table Columns ---');
const cols = db.prepare("PRAGMA table_info(items)").all();
console.log(cols.map(c => c.name));

console.log('--- Checking Org 2 Staff User ---');
const user = db.prepare("SELECT * FROM users WHERE email = 'user@uptown.com'").get();
console.log(user);
