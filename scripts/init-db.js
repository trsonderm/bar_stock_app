const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

console.log('Initializing database at ' + dbPath);

// Create Users Table
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    role TEXT CHECK(role IN ('admin', 'user')) NOT NULL DEFAULT 'user',
    permissions TEXT DEFAULT '[]', -- JSON string of permissions e.g. ["add_inventory", "manage_users"]
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

// Create Locations Table
db.prepare(`
  CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT
  )
`).run();

// Create Inventory Items Table
// Note: Quantity is per location. For now assuming simple model: Item is defined, and stock is tracked per location? 
// Or Item is unique per location? 
// Requirement: "main app after login is liquor and beer inventory... subtract icon available to all... add icon require permission"
// "The name of the liquor bottle is there... sort by name... sort by most used"
// Implementation: We will have an 'items' table for definitions, and 'inventory' table for stock at locations.
// Actually, simple apps often just have one table if items are unique.
// Let's do: Items (global definitions) -> Inventory (stock at location).
// But user said "separate table for liquor inventory currently, a separate table for location id".
// So `inventory` table linking item and location.
db.prepare(`
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT CHECK(type IN ('Liquor', 'Beer')) NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    location_id INTEGER NOT NULL,
    quantity INTEGER DEFAULT 0,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
    UNIQUE(item_id, location_id)
  )
`).run();

// Create Activity Log Table
db.prepare(`
  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL, -- 'LOGIN', 'ADD_STOCK', 'REMOVE_STOCK', 'CREATE_USER', etc.
    details TEXT, -- JSON details or description
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`).run();

// Create Settings Table (for email config, report config)
db.prepare(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`).run();

// Seed Master Admin
const seedAdmin = () => {
  const adminExists = db.prepare('SELECT * FROM users WHERE role = ?').get('admin');
  if (!adminExists) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync('4365', salt);
    db.prepare(`
      INSERT INTO users (first_name, last_name, pin_hash, role, permissions)
      VALUES (@firstName, @lastName, @pinHash, @role, @permissions)
    `).run({
      firstName: 'Master',
      lastName: 'Admin',
      pinHash: hash,
      role: 'admin',
      permissions: JSON.stringify(['all'])
    });
    console.log('Master Admin created with PIN 4365');
  } else {
    console.log('Master Admin already exists');
  }
};

// Seed Locations
const seedLocations = () => {
    const loc = db.prepare('SELECT * FROM locations').get();
    if (!loc) {
        db.prepare('INSERT INTO locations (name, address) VALUES (?, ?)').run('Main Bar', '123 Main St');
        console.log('Default Location created');
    }
}

seedAdmin();
seedLocations();

console.log('Database initialization complete.');
