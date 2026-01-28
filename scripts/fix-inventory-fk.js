const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

try {
  console.log('Starting migration to fix inventory table FK...');

  // 1. Rename existing inventory table
  db.exec('ALTER TABLE inventory RENAME TO inventory_temp');
  console.log('Renamed inventory to inventory_temp');

  // 2. Create new inventory table with correct FK
  // Original schema: 
  // CREATE TABLE inventory (
  //     id INTEGER PRIMARY KEY AUTOINCREMENT,
  //     item_id INTEGER NOT NULL,
  //     location_id INTEGER NOT NULL,
  //     quantity INTEGER DEFAULT 0, organization_id INTEGER,
  //     FOREIGN KEY (item_id) REFERENCES "items_temp"(id) ON DELETE CASCADE, <--- BAD
  //     FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
  //     UNIQUE(item_id, location_id)
  // )

  db.exec(`
        CREATE TABLE inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id INTEGER NOT NULL,
            location_id INTEGER NOT NULL,
            quantity INTEGER DEFAULT 0,
            organization_id INTEGER,
            FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
            FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
            UNIQUE(item_id, location_id)
        )
    `);
  console.log('Created new inventory table');

  // 3. Copy data
  db.exec(`
        INSERT INTO inventory (id, item_id, location_id, quantity, organization_id)
        SELECT id, item_id, location_id, quantity, organization_id
        FROM inventory_temp
    `);
  console.log('Copied data from inventory_temp');

  // 4. Drop temp table
  db.exec('DROP TABLE inventory_temp');
  console.log('Dropped inventory_temp');

  console.log('Migration successful: Inventory table fixed.');

} catch (error) {
  console.error('Migration failed:', error);
}
