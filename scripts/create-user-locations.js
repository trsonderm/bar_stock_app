const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

try {
    console.log('Creating user_locations table...');
    db.exec(`
        CREATE TABLE IF NOT EXISTS user_locations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            location_id INTEGER NOT NULL,
            organization_id INTEGER NOT NULL,
            is_primary BOOLEAN DEFAULT 0,
            assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
            UNIQUE(user_id, location_id)
        )
    `);
    console.log('user_locations table created successfully.');
} catch (error) {
    console.error('Migration failed:', error);
}
