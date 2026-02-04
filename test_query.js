const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

const orgId = 2; // Test for "Uptown Club"

const query = `
      SELECT 
        i.id, i.name, i.type, i.secondary_type, i.unit_cost,
        COALESCE(inv.quantity, 0) as quantity
      FROM items i
      LEFT JOIN inventory inv ON i.id = inv.item_id AND inv.organization_id = ?
      WHERE (i.organization_id = ? OR i.organization_id IS NULL)
    `;

try {
    const items = db.prepare(query).all(orgId, orgId);
    console.log(`Found ${items.length} items for Org ${orgId}`);
    if (items.length > 0) {
        console.log('Sample items:', items.slice(0, 3));
    }
} catch (e) {
    console.error('Query Failed:', e);
}
