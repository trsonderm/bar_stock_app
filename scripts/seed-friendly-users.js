const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

console.log('Seeding Friendly Dev Users...');

const salt = bcrypt.genSaltSync(10);
const hash = bcrypt.hashSync('1234', salt);

const insertUser = db.prepare(`
    INSERT INTO users (first_name, last_name, email, password_hash, role, pin_hash, permissions, organization_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const checkUser = db.prepare('SELECT id FROM users WHERE email = ?');

// Default Org (ID 1)
const defaultUsers = [
    { email: 'admin@default.com', role: 'admin', first: 'Default', last: 'Admin', orgId: 1, perms: ['all'] },
    { email: 'user@default.com', role: 'user', first: 'Default', last: 'User', orgId: 1, perms: ['add_stock'] }
];

// Uptown Club (ID 2)
const uptownUsers = [
    { email: 'admin@uptown.com', role: 'admin', first: 'Uptown', last: 'Admin', orgId: 2, perms: ['all'] },
    { email: 'user@uptown.com', role: 'user', first: 'Uptown', last: 'User', orgId: 2, perms: ['add_stock'] }
];

const allUsers = [...defaultUsers, ...uptownUsers];

for (const u of allUsers) {
    if (!checkUser.get(u.email)) {
        insertUser.run(
            u.first, u.last,
            u.email,
            hash,
            u.role,
            '1234',
            JSON.stringify(u.perms),
            u.orgId
        );
        console.log(`+ Created ${u.email} (${u.role})`);
    } else {
        console.log(`- Exists: ${u.email}`);
    }
}

console.log('Done.');
