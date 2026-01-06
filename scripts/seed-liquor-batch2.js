const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(process.cwd(), 'inventory.db'));

const items = [
    "Tullamore Dew",
    "Dewars",
    "Well Whiskey",
    "Lophraigs",
    "JW Red",
    "JW Black",
    "Glen Livet",
    "Macallan",
    "Chivas",
    "Buchanas",
    "Crown Royal",
    "Seagrams VO",
    "Canadian Club",
    "Seagrams 7",
    "SoCo",
    "Jack Daniels",
    "LTD",
    "Bullet",
    "Makers Mark",
    "Jameson",
    "Tuaca",
    "Nowadays 10mg",
    "Apricot Brandy",
    "De Saronno",
    "Root Beer Schnapps",
    "Goldslager",
    "Moon Shine",
    "Midori",
    "Hot Damn",
    "Galliano",
    "Contreau",
    "Nowadays 5mg",
    "Campari",
    "Rumplemintz",
    "Tia Maria",
    "Baileys",
    "B & B",
    "Jager",
    "Screwball",
    "Romana Black",
    "Kamora",
    "Frangelico",
    "Chambord",
    "Yukon",
    "McCormick Irish",
    "Kahlua",
    "Bubba",
    "Romana Sambuca",
    "Amaretto",
    "Grand Marnier",
    "Fireball",
    "Jim Beam",
    "Jack Honey",
    "Knob Creek",
    "Jack Fire",
    "Wild Turkey",
    "Gentlemans Jack"
];

console.log(`Seeding batch 2 with ${items.length} items...`);

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

console.log('Batch 2 seeding complete.');
