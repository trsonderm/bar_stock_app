const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(process.cwd(), 'inventory.db'));

const categoryName = 'Liquor';
const newSubCats = [
    "Whiskey",
    "Bourbon",
    "Vodka",
    "Tequila",
    "Schnapps",
    "Cognac",
    "Gin",
    "Rum",
    "Scotch",
    "Cordials"
];

console.log(`Updating '${categoryName}' with sub-categories:`, newSubCats);

const cat = db.prepare('SELECT * FROM categories WHERE name = ?').get(categoryName);

if (!cat) {
    console.error(`Category '${categoryName}' not found!`);
    process.exit(1);
}

// Merge with existing if any, avoiding duplicates
let currentSubCats = [];
if (cat.sub_categories) {
    try {
        currentSubCats = JSON.parse(cat.sub_categories);
    } catch (e) {
        console.warn('Failed to parse existing sub-categories, overwriting.');
    }
}

const merged = Array.from(new Set([...currentSubCats, ...newSubCats]));

db.prepare('UPDATE categories SET sub_categories = ? WHERE id = ?')
    .run(JSON.stringify(merged), cat.id);

console.log('Update complete.');
