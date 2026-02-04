const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

const orgs = [1, 2];

for (const ORG_ID of orgs) {
  console.log(`\n--- Simulating Inventory for Org ID: ${ORG_ID} ---`);

  const query = `
        SELECT 
            i.id, i.name, i.type, 
            COALESCE(inv.quantity, 0) as quantity
        FROM items i
        LEFT JOIN inventory inv ON i.id = inv.item_id AND inv.organization_id = ?
        WHERE (i.organization_id = ? OR i.organization_id IS NULL)
    `;

  const items = db.prepare(query).all(ORG_ID, ORG_ID);

  console.log(`Total Visible Items: ${items.length}`);
  const stocked = items.filter(i => i.quantity > 0);
  console.log(`Items with Stock (>0): ${stocked.length}`);
  if (stocked.length > 0) {
    console.log('Sample Stocked Item:', stocked[0]);
  }
}
