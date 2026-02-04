const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

async function ensureUsers() {
    console.log('--- Ensuring Dev Users ---');

    const passwordHash = await bcrypt.hash('password', 10);
    const pinHash = await bcrypt.hash('1234', 10);

    const usersToEnsure = [
        {
            email: 'manager@downtown.com',
            role: 'admin',
            orgId: 1,
            firstName: 'Downtown',
            lastName: 'Manager'
        },
        {
            email: 'user@downtown.com',
            role: 'user',
            orgId: 1,
            firstName: 'Downtown',
            lastName: 'Staff'
        },
        {
            email: 'manager@uptown.com',
            role: 'admin',
            orgId: 2,
            firstName: 'Uptown',
            lastName: 'Manager'
        },
        {
            email: 'user@uptown.com',
            role: 'user',
            orgId: 2,
            firstName: 'Uptown',
            lastName: 'Staff'
        }
    ];

    for (const u of usersToEnsure) {
        const existing = db.prepare("SELECT * FROM users WHERE email = ?").get(u.email);

        if (existing) {
            console.log(`User ${u.email} exists.`);
            // Update org if null
            if (!existing.organization_id) {
                db.prepare("UPDATE users SET organization_id = ? WHERE id = ?").run(u.orgId, existing.id);
                console.log(`Updated Org ID for ${u.email}`);
            }
        } else {
            console.log(`Creating user ${u.email}...`);
            db.prepare(`
                INSERT INTO users (first_name, last_name, email, password_hash, pin_hash, role, organization_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
            `).run(u.firstName, u.lastName, u.email, passwordHash, pinHash, u.role, u.orgId);
            console.log(`Created ${u.email}`);
        }
    }
}

ensureUsers().catch(console.error);
