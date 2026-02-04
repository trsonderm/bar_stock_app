const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

console.log('--- Organizations ---');
const orgs = db.prepare("SELECT * FROM organizations").all();
console.log(orgs);

console.log('--- Products (Sample) ---');
try {
    const products = db.prepare("SELECT * FROM items LIMIT 5").all();
    console.log(products);

    // Check count per organization
    const counts = db.prepare("SELECT organization_id, COUNT(*) as count FROM items GROUP BY organization_id").all();
    console.log('--- Product Counts per Organization ---');
    console.log(counts);

} catch (e) {
    console.log("Error querying items:", e.message);
}

console.log('--- Stock Levels (Sample) ---');
try {
    const stocks = db.prepare("SELECT * FROM inventory LIMIT 5").all();
    console.log(stocks);
} catch (e) {
    console.log("Error querying inventory:", e.message);
}
