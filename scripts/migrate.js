const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

// 1. Create migrations table
db.prepare(`
    CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        run_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`).run();

// List of migrations in order
// We use the filenames relative to project root
const MIGRATIONS = [
    'scripts/fix-schema.js',
    'scripts/fix-items.js',
    'scripts/migration-secondary-cats.js',
    'scripts/seed-liquor.js',
    'scripts/seed-liquor-batch2.js',
    'scripts/seed-liquor-subcats.js'
];

console.log('Checking migrations...');

const checkStmt = db.prepare('SELECT id FROM migrations WHERE name = ?');
const insertStmt = db.prepare('INSERT INTO migrations (name) VALUES (?)');

for (const script of MIGRATIONS) {
    const exists = checkStmt.get(script);
    if (exists) {
        // Already run
        continue;
    }

    console.log(`Running migration: ${script}`);
    try {
        // Run the script using node
        execSync(`node ${script}`, { stdio: 'inherit' });

        // Record success
        insertStmt.run(script);
        console.log(`Recorded migration: ${script}`);
    } catch (e) {
        console.error(`Failed to run ${script}`);
        console.error(e);
        process.exit(1); // Stop deployment on failure
    }
}

console.log('All migrations are up for date.');
