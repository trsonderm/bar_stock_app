const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

console.log('Creating system_settings table...');

db.prepare(`
  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`).run();

// Seed default settings if empty
const count = db.prepare('SELECT count(*) as c FROM system_settings').get();
if (count.c === 0) {
    console.log('Seeding default settings...');
    const insert = db.prepare('INSERT INTO system_settings (key, value) VALUES (?, ?)');
    insert.run('site_name', 'Topshelf Stock');
    insert.run('maintenance_mode', 'false');
    insert.run('allow_registration', 'true');
}

console.log('Done.');
