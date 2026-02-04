const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

const emailsToCheck = [
    'admin@topshelf.com',
    'manager@downtown.com',
    'manager@uptown.com'
];

console.log('--- Checking Specific Emails ---');
emailsToCheck.forEach(email => {
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    console.log(`${email}: ${user ? 'FOUND (ID: ' + user.id + ', Role: ' + user.role + ', Org: ' + user.organization_id + ')' : 'NOT FOUND'}`);
});

console.log('--- Finding Sample Users per Org ---');
const org1Users = db.prepare("SELECT * FROM users WHERE organization_id = 1 LIMIT 3").all();
console.log('Org 1 Users:', org1Users.map(u => ({ id: u.id, name: u.first_name + ' ' + u.last_name, role: u.role, email: u.email })));

const org2Users = db.prepare("SELECT * FROM users WHERE organization_id = 2 LIMIT 3").all();
console.log('Org 2 Users:', org2Users.map(u => ({ id: u.id, name: u.first_name + ' ' + u.last_name, role: u.role, email: u.email })));
