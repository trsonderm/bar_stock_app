const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

const email = 'user@uptown.com';
const password = 'password';
const hash = bcrypt.hashSync(password, 10);

db.prepare("UPDATE users SET password_hash = ? WHERE email = ?").run(hash, email);
console.log(`Password reset for ${email}`);
