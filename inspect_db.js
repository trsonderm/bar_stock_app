const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
console.log('Opening DB at:', dbPath);

try {
    const db = new Database(dbPath, { verbose: console.log });

    // Get table info
    const tableInfo = db.prepare("PRAGMA table_info(users)").all();
    console.log('Users table schema:', tableInfo);

    // Get a sample user (or all)
    const users = db.prepare("SELECT * FROM users LIMIT 1").all();
    console.log('Sample user:', users);

} catch (error) {
    console.error('Error opening DB:', error);
}
