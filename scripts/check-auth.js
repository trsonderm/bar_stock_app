const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

console.log('Checking Users...');
const users = db.prepare('SELECT id, first_name, last_name, role, pin_hash FROM users').all();

users.forEach(u => {
    const is4365 = bcrypt.compareSync('4365', u.pin_hash);
    const is4354 = bcrypt.compareSync('4354', u.pin_hash);

    console.log(`User: ${u.first_name} ${u.last_name} (${u.role})`);
    console.log(`- Is 4365? ${is4365}`);
    console.log(`- Is 4354? ${is4354}`);
});
