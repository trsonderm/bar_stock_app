const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

console.log('Verifying Quick Login Passwords...');

// Hashes from DB (or fetched fresh)
const users = db.prepare('SELECT email, password_hash FROM users WHERE email IN (\'manager@downtown.com\', \'manager@uptown.com\')').all();

for (const user of users) {
    if (user.password_hash) {
        const isMatch = bcrypt.compareSync('password', user.password_hash);
        console.log(`User: ${user.email} - Password "password" match: ${isMatch}`);
    } else {
        console.log(`User: ${user.email} - No password hash!`);
    }
}
