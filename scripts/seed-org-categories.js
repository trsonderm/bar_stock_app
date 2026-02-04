const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

console.log('Seeding Default Categories for ALL Organizations that lack them...');

// Default Templates
const defaults = [
    {
        name: 'Liquor',
        stock_options: JSON.stringify([1]),
        sub_categories: JSON.stringify(["Whiskey", "Bourbon", "Vodka", "Tequila", "Schnapps", "Cognac", "Gin", "Rum", "Scotch", "Cordials"])
    },
    {
        name: 'Beer',
        stock_options: JSON.stringify([1, 6, 24]),
        sub_categories: JSON.stringify([])
    }
];

const organizations = db.prepare('SELECT id, name FROM organizations').all();

const check = db.prepare('SELECT id FROM categories WHERE name = ? AND organization_id = ?');
const insert = db.prepare('INSERT INTO categories (name, stock_options, sub_categories, organization_id) VALUES (?, ?, ?, ?)');

let addedCount = 0;

for (const org of organizations) {
    console.log(`Checking Org: ${org.name} (ID: ${org.id})`);

    for (const def of defaults) {
        const existing = check.get(def.name, org.id);
        if (!existing) {
            insert.run(def.name, def.stock_options, def.sub_categories, org.id);
            console.log(`  + Added ${def.name}`);
            addedCount++;
        } else {
            // Optional: If you want to force reset them, you could update. 
            // For now, we respect existing if present.
            // But wait! We just made them global (NULL). 
            // If we are moving AWAY from global, we should probably ignore standard rows if they are NULL (global).
            // But the query `WHERE name = ? AND organization_id = ?` won't match NULL org_id.
            // So this will correctly insert a LOCAL copy for the org.
        }
    }
}

// Optional: Clean up Global 'Liquor' and 'Beer' if we want to enforce local only?
// Or keep them as backup? The user wants "organization level" defaults.
// If we keep globals, we need to make sure the API logic prefers local.
// My API update `WHERE organization_id = $1` STRICTLY filters to local. 
// So Global categories are now INVISIBLE to the Admin API. 
// This means creating local copies is MANDATORY for them to appear in the Admin Panel.

console.log(`Done. Added ${addedCount} organization-specific category rows.`);
