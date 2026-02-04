const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

console.log('Resetting Super Admin PIN to 0420...');

try {
    const info = db.prepare("UPDATE users SET pin_hash = '0420' WHERE id = 5").run();
    console.log(`Updated ${info.changes} rows.`);

    const user = db.prepare("SELECT * FROM users WHERE id = 5").get();
    console.log('Super Admin now:', user.first_name, user.last_name, user.pin_hash);

} catch (e) {
    console.error('Error updating PIN:', e);
}
db.close();
