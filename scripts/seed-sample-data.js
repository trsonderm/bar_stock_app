const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

console.log('Seeding Sample Items (Global)...');

const items = [
    // Liquor - Vodka
    { name: 'Titos', type: 'Liquor', secondary_type: 'Vodka', unit_cost: 20.00 },
    { name: 'Grey Goose', type: 'Liquor', secondary_type: 'Vodka', unit_cost: 30.00 },
    { name: 'Ketel One', type: 'Liquor', secondary_type: 'Vodka', unit_cost: 25.00 },

    // Liquor - Whiskey/Bourbon
    { name: 'Jack Daniels', type: 'Liquor', secondary_type: 'Whiskey', unit_cost: 22.00 },
    { name: 'Jameson', type: 'Liquor', secondary_type: 'Whiskey', unit_cost: 24.00 },
    { name: 'Makers Mark', type: 'Liquor', secondary_type: 'Bourbon', unit_cost: 28.00 },
    { name: 'Bulleit', type: 'Liquor', secondary_type: 'Bourbon', unit_cost: 26.00 },

    // Liquor - Tequila
    { name: 'Patron Silver', type: 'Liquor', secondary_type: 'Tequila', unit_cost: 40.00 },
    { name: 'Casamigos Blanco', type: 'Liquor', secondary_type: 'Tequila', unit_cost: 45.00 },
    { name: 'Don Julio 1942', type: 'Liquor', secondary_type: 'Tequila', unit_cost: 120.00 },

    // Liquor - Gin
    { name: 'Hendricks', type: 'Liquor', secondary_type: 'Gin', unit_cost: 32.00 },
    { name: 'Tanqueray', type: 'Liquor', secondary_type: 'Gin', unit_cost: 20.00 },

    // Liquor - Rum
    { name: 'Bacardi Superior', type: 'Liquor', secondary_type: 'Rum', unit_cost: 15.00 },
    { name: 'Captain Morgan', type: 'Liquor', secondary_type: 'Rum', unit_cost: 16.00 },

    // Beer
    { name: 'Bud Light', type: 'Beer', unit_cost: 1.00 },
    { name: 'Coors Light', type: 'Beer', unit_cost: 1.00 },
    { name: 'Miller Lite', type: 'Beer', unit_cost: 1.00 },
    { name: 'Michelob Ultra', type: 'Beer', unit_cost: 1.20 },
    { name: 'Corona Extra', type: 'Beer', unit_cost: 1.50 },
    { name: 'Guinness', type: 'Beer', unit_cost: 1.80 },
    { name: 'Stella Artois', type: 'Beer', unit_cost: 1.60 },

    // Wine
    { name: 'Josh Cabernet', type: 'Wine', unit_cost: 12.00 },
    { name: 'Meiomi Pinot Noir', type: 'Wine', unit_cost: 18.00 },
    { name: 'Kim Crawford Sauvignon Blanc', type: 'Wine', unit_cost: 14.00 },
    { name: 'La Marca Prosecco', type: 'Wine', unit_cost: 13.00 },

    // Seltzer (assuming category exists)
    { name: 'White Claw Variety', type: 'Seltzer', unit_cost: 15.00 },
    { name: 'High Noon Variety', type: 'Seltzer', unit_cost: 20.00 },
];

const check = db.prepare('SELECT id FROM items WHERE name = ?');
const insert = db.prepare(`
    INSERT INTO items (name, type, secondary_type, unit_cost, organization_id)
    VALUES (@name, @type, @secondary_type, @unit_cost, NULL)
`);

const insertMany = db.transaction((items) => {
    for (const item of items) {
        const existing = check.get(item.name);
        if (!existing) {
            insert.run({
                ...item,
                secondary_type: item.secondary_type || null
            });
        } else {
            // Optional: Update if needed, or just skip
            // db.prepare('UPDATE items SET organization_id = NULL WHERE id = ?').run(existing.id);
        }
    }
});

insertMany(items);

console.log(`Seeded ${items.length} global sample items.`);
