const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

console.log('Fixing Dev Users...');

// Fix Super Admin (admin@topshelf.com)
const adminEmail = 'admin@topshelf.com';
const adminPass = 'password';
const salt = bcrypt.genSaltSync(10);
const hash = bcrypt.hashSync(adminPass, salt);

const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(adminEmail);

if (!existing) {
    // Check if we can just update the existing "Master Admin" (id 5 usually) or create new.
    // Let's try to update ID 5 if it has no email.
    const masterAdmin = db.prepare('SELECT * FROM users WHERE id = 5').get();
    if (masterAdmin && !masterAdmin.email) {
        console.log('Updating existing Master Admin (ID 5) with email/password...');
        db.prepare(`
            UPDATE users 
            SET email = ?, password_hash = ? 
            WHERE id = 5
        `).run(adminEmail, hash);
    } else {
        console.log('Creating new Super Admin user...');
        db.prepare(`
            INSERT INTO users (first_name, last_name, email, password_hash, role, permissions, pin_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run('Dev', 'SuperAdmin', adminEmail, hash, 'admin', JSON.stringify(['all', 'super_admin']), 'dummy');
    }
} else {
    console.log('Super Admin email user already exists. Updating password to "password"...');
    db.prepare('UPDATE users SET password_hash = ? WHERE email = ?').run(hash, adminEmail);
}

console.log('Done.');
