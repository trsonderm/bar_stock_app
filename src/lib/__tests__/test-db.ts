import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// Helper to create an in-memory DB with schema
export function createTestDb() {
    const db = new Database(':memory:');

    // Read schema
    // We assume migration logic is in scripts/init-db.js or we can just apply a schema string here.
    // For simplicity, let's replicate the core schema creation here or read a sql file if we had one.
    // Since our init-db.js is a script, we can't easily import it without refactoring.
    // We will define the schema here for tests to match production.

    db.exec(`
        CREATE TABLE IF NOT EXISTS organizations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            subdomain TEXT UNIQUE, -- optional, for future
            billing_status TEXT DEFAULT 'active', -- active, past_due, canceled
            subscription_plan TEXT DEFAULT 'free', -- free, pro, enterprise
            trial_ends_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS locations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            address TEXT,
            organization_id INTEGER,
            FOREIGN KEY(organization_id) REFERENCES organizations(id)
        );

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            pin_hash TEXT, -- Can be null for email-only admins
            role TEXT NOT NULL DEFAULT 'user', -- 'admin' or 'user'
            permissions TEXT DEFAULT '[]', -- JSON string of permissions e.g. ["add_stock", "view_reports"]
            email TEXT,
            password_hash TEXT,
            organization_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(organization_id) REFERENCES organizations(id)
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;

        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            stock_options TEXT DEFAULT '[]', -- JSON array of allowed bottle sizes/types
            organization_id INTEGER,
            FOREIGN KEY(organization_id) REFERENCES organizations(id)
        );

        CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT,
            secondary_type TEXT,
            unit_cost REAL DEFAULT 0, 
            organization_id INTEGER,
            FOREIGN KEY(organization_id) REFERENCES organizations(id)
        );

        CREATE TABLE IF NOT EXISTS inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id INTEGER NOT NULL,
            location_id INTEGER NOT NULL,
            quantity REAL DEFAULT 0,
            organization_id INTEGER,
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(item_id) REFERENCES items(id),
            FOREIGN KEY(location_id) REFERENCES locations(id),
            FOREIGN KEY(organization_id) REFERENCES organizations(id)
        );

        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action TEXT NOT NULL,
            details TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            organization_id INTEGER,
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(organization_id) REFERENCES organizations(id)
        );
    `);

    return db;
}
