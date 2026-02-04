const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

async function testAddProduct() {
    try {
        console.log('Testing Add Product...');

        // Mock Session Data (We need a valid user ID and Org ID)
        const orgId = 1;
        const userId = 1; // Assuming ID 1 exists

        // Mock Item Data
        const body = {
            name: `Test Item ${Date.now()}`,
            type: 'Liquor',
            supplier: 'Test Supplier'
        };

        console.log('Simulating Request Body:', body);

        // 1. Check Duplicates logic
        const existing = db.prepare('SELECT id FROM items WHERE name = ? AND organization_id = ?').get(body.name, orgId);
        if (existing) {
            console.log('FAIL: Item already exists (Simulated Check)');
            return;
        }

        // 2. Simulate Insert
        console.log('Simulating Insert...');
        const stmt = db.prepare('INSERT INTO items (name, type, secondary_type, supplier, organization_id) VALUES (?, ?, ?, ?, ?)');
        const info = stmt.run(body.name, body.type, null, body.supplier, orgId);

        console.log('Insert Result:', info);
        console.log('New Item ID:', info.lastInsertRowid);

        // 3. Simulate Inventory Init
        const loc = db.prepare('SELECT id FROM locations WHERE organization_id = ? LIMIT 1').get(orgId);
        if (loc) {
            console.log('Simulating Inventory Init for Location:', loc.id);
            const invStmt = db.prepare('INSERT INTO inventory (item_id, location_id, quantity, organization_id) VALUES (?, ?, 0, ?)');
            const invInfo = invStmt.run(info.lastInsertRowid, loc.id, orgId);
            console.log('Inventory Result:', invInfo);
        } else {
            console.warn('No location found for inventory init');
        }

        console.log('SUCCESS: Simulation complete without error.');

    } catch (e) {
        console.error('TEST FAILED:', e);
    }
}

testAddProduct();
