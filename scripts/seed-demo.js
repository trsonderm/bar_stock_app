const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, '../inventory.db');
const db = new Database(dbPath);

async function hashPassword(plain) {
    return await bcrypt.hash(plain, 10);
}

async function seed() {
    console.log('🌱 Seeding Demo Data...');

    // Ensure Schema & Disable FK for seeding
    db.pragma('foreign_keys = OFF');
    db.exec(`
        CREATE TABLE IF NOT EXISTS organizations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            billing_status TEXT DEFAULT 'active'
        );
        CREATE TABLE IF NOT EXISTS locations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            organization_id INTEGER
        );
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            organization_id INTEGER
        );
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name TEXT,
            last_name TEXT,
            email TEXT UNIQUE,
            role TEXT,
            password_hash TEXT,
            pin_hash TEXT,
            organization_id INTEGER,
            permissions TEXT
        );
    `);

    // 1. Create Organizations
    const orgs = [
        { id: 1, name: 'Downtown Bar' },
        { id: 2, name: 'Uptown Club' }
    ];

    const insertOrg = db.prepare('INSERT OR IGNORE INTO organizations (id, name, billing_status) VALUES (?, ?, ?)');
    orgs.forEach(o => {
        insertOrg.run(o.id, o.name, 'active');
        // Ensure default location exists
        db.prepare('INSERT OR IGNORE INTO locations (name, organization_id) VALUES (?, ?)').run('Main Bar', o.id);
        // Seed Categories if missing (simplified)
        const cats = ['Liquor', 'Wine', 'Beer', 'Mixers'];
        cats.forEach(c => {
            db.prepare('INSERT OR IGNORE INTO categories (name, organization_id) VALUES (?, ?)').run(c, o.id);
        });
    });

    // 2. Create Users
    const passwordHash = await hashPassword('password'); // Default password for all

    const users = [
        {
            email: 'admin@fosters.com',
            firstName: 'Super',
            lastName: 'Admin',
            role: 'admin',
            orgId: 1, // Super admin lives in Org 1 usually or doesn't matter, but needs an org for constraints
            isSuper: 1 // If we had a super admin flag column on users? 
            // Our schema migration didn't seemingly add is_super_admin column to users, 
            // but the Auth check relies on specific email or role?
            // Checking logic: session.isSuperAdmin is derived.
            // In migrate-multitenancy.js: "Logic to determine super admin... usually via config or specific email"
            // Let's rely on the dashboard check.
        },
        {
            email: 'manager@downtown.com',
            firstName: 'Downtown',
            lastName: 'Manager',
            role: 'admin',
            orgId: 1,
            isSuper: 0
        },
        {
            email: 'manager@uptown.com',
            firstName: 'Uptown',
            lastName: 'Manager',
            role: 'admin',
            orgId: 2,
            isSuper: 0
        }
    ];

    // Helper: We need to make sure 'admin@fosters.com' is recognized as super admin.
    // If the app uses a specific user ID or Email for super admin checks, we ensure it matches.
    // For now, let's upsert these users.

    const insertUser = db.prepare(`
        INSERT OR REPLACE INTO users (email, first_name, last_name, role, password_hash, pin_hash, organization_id, permissions)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Using dummy permissions for admins (all)
    const allPerms = JSON.stringify(['all']);

    for (const u of users) {
        // Use a dummy pin hash for email-only users or hash '0000'
        const dummyPinHash = u.pinHash || 'dummy_hash_for_email_user';
        insertUser.run(u.email, u.firstName, u.lastName, u.role, passwordHash, dummyPinHash, u.orgId, allPerms);
        console.log(`✅ Upserted user: ${u.email} (Org: ${u.orgId})`);
    }

    // Special: Ensure super admin user has pin/other fields if needed?
    // Pin is optional for email users in our new schema update.

    console.log('🎉 Demo Seeding Complete!');
    console.log('Login credentials:');
    console.log('  Admin (Super): admin@fosters.com / password');
    console.log('  Downtown Org:  manager@downtown.com / password');
    console.log('  Uptown Org:    manager@uptown.com / password');
    db.close();
}

seed().catch(console.error);
