const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(process.cwd(), 'inventory.db'));

const items = [
    "SKyy 80",
    "Titos",
    "Belvedere",
    "Vodka Well",
    "Grey Goose",
    "Bacardi",
    "Ketal One",
    "Malibu",
    "Sailor Jerry",
    "Jose Cuervo",
    "Rum Haven",
    "Rumchata",
    "Meyers Dark",
    "Myers",
    "Captain Morgan",
    "151",
    "Mount Gay",
    "Rum Well",
    "Patron Coffee",
    "Milagro Silver",
    "Casamigos",
    "Camarena",
    "Ciroc",
    "Cabo Wabo",
    "1800 Silver",
    "1800 Gold",
    "Well Tequila",
    "Don Julio",
    "Patron Silver",
    "Patron Gold",
    "Couvosier",
    "E & J",
    "Remy Martin",
    "Brandy Well"
];

console.log(`Seeding ${items.length} items...`);

const insertItem = db.prepare(`
    INSERT INTO items (name, type, secondary_type, unit_cost) 
    VALUES (?, 'Liquor', NULL, 0)
`);

const checkItem = db.prepare('SELECT id FROM items WHERE name = ?');
const initInventory = db.prepare('INSERT INTO inventory (item_id, location_id, quantity) VALUES (?, 1, 0)');

db.transaction(() => {
    for (const name of items) {
        const existing = checkItem.get(name);
        if (!existing) {
            const res = insertItem.run(name);
            initInventory.run(res.lastInsertRowid);
            console.log(`Added: ${name}`);
        } else {
            console.log(`Skipped (Exists): ${name}`);
        }
    }
})();

console.log('Seeding complete.');
