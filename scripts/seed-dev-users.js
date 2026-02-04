const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

console.log('Seeding Dev Users for ALL Organizations...');

const organizations = db.prepare('SELECT id, name, subdomain FROM organizations').all();
const salt = bcrypt.genSaltSync(10);
const hash = bcrypt.hashSync('1234', salt); // Default password '1234'

const insertUser = db.prepare(`
    INSERT INTO users (first_name, last_name, email, password_hash, role, pin_hash, permissions, organization_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const checkUser = db.prepare('SELECT id FROM users WHERE email = ?');

let count = 0;

for (const org of organizations) {
    console.log(`Processing Org: ${org.name} (ID: ${org.id})`);

    // 1. Dev Admin
    const adminEmail = `admin_dev_${org.id}@test.com`;
    if (!checkUser.get(adminEmail)) {
        insertUser.run(
            'Dev', 'Admin',
            adminEmail,
            hash,
            'admin',
            '1234', // Simple PIN 
            JSON.stringify(['all']),
            org.id
        );
        console.log(`  + Created Admin: ${adminEmail} (Pass/PIN: 1234)`);
        count++;
    } else {
        console.log(`  - Admin already exists: ${adminEmail}`);
    }

    // 2. Dev User
    const userEmail = `user_dev_${org.id}@test.com`;
    if (!checkUser.get(userEmail)) {
        insertUser.run(
            'Dev', 'User',
            userEmail,
            hash,
            'user',
            '1234',
            JSON.stringify(['add_stock']),
            org.id
        );
        console.log(`  + Created User: ${userEmail} (Pass/PIN: 1234)`);
        count++;
    } else {
        console.log(`  - User already exists: ${userEmail}`);
    }
}

console.log(`Done. Created ${count} new dev users.`);
