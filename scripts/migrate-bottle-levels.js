const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

console.log('Migrating Bottle Levels tables...');

// 1. Create Options Table
db.prepare(`
  CREATE TABLE IF NOT EXISTS bottle_level_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    display_order INTEGER DEFAULT 0
  )
`).run();

// Seed Default Options if empty
const count = db.prepare('SELECT count(*) as c FROM bottle_level_options').get().c;
if (count === 0) {
    const insert = db.prepare('INSERT INTO bottle_level_options (label, display_order) VALUES (?, ?)');
    insert.run('Empty Bottle', 1);
    insert.run('Less than 1 shot', 2);
    insert.run('Less than 2 shots', 3);
    console.log('Seeded default options.');
}

// 2. Create Logs Table
db.prepare(`
  CREATE TABLE IF NOT EXISTS bottle_level_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_log_id INTEGER,
    option_label TEXT NOT NULL,
    user_id INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (activity_log_id) REFERENCES activity_logs(id) ON DELETE CASCADE
  )
`).run();

// 3. Ensure Settings exist
const settingsCheck = db.prepare("SELECT value FROM settings WHERE key = 'track_bottle_levels'").get();
if (!settingsCheck) {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run('track_bottle_levels', 'true');
    console.log('Initialized track_bottle_levels setting to true.');
}

console.log('Migration complete.');
