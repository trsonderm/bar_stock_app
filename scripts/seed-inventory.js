const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

console.log('Seeding Inventory Stock...');

// 1. Get all organizations
const organizations = db.prepare('SELECT id, name FROM organizations').all();

// 2. Prepare statements
// We need to ensure a location exists for each org first.
const checkLoc = db.prepare('SELECT id FROM locations WHERE organization_id = ? LIMIT 1');
const insertLoc = db.prepare('INSERT INTO locations (name, organization_id) VALUES (?, ?)');

// Upsert inventory
const upsertInv = db.prepare(`
    INSERT INTO inventory (item_id, location_id, quantity, organization_id)
    VALUES (@itemId, @locId, @qty, @orgId)
    ON CONFLICT(item_id, location_id) DO UPDATE SET quantity = @qty
`);

// Get items visible to org
const getItems = db.prepare('SELECT id FROM items WHERE organization_id = ? OR organization_id IS NULL');

let totalUpdates = 0;

db.transaction(() => {
    for (const org of organizations) {
        console.log(`Processing Org: ${org.name}`);

        // Ensure Location
        let loc = checkLoc.get(org.id);
        if (!loc) {
            console.log('  Creating default location...');
            const res = insertLoc.run('Main Bar', org.id);
            loc = { id: res.lastInsertRowid };
        }

        // Get Items
        const items = getItems.all(org.id);

        // Seed Stock
        for (const item of items) {
            // Random quantity 5 to 50
            const qty = Math.floor(Math.random() * 45) + 5;

            upsertInv.run({
                itemId: item.id,
                locId: loc.id,
                qty: qty,
                orgId: org.id
            });
            totalUpdates++;
        }
        console.log(`  Seeded stock for ${items.length} items.`);
    }
})();

console.log(`Done. Updated ${totalUpdates} inventory records.`);
