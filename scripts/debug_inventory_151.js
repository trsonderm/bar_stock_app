const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/topshelf',
});

async function debugInventory() {
    try {
        console.log('--- Debugging Inventory for "151" ---');

        // 1. Find the item
        const items = await pool.query("SELECT * FROM items WHERE name ILIKE '%151%'");
        if (items.rows.length === 0) {
            console.log('No item found matching "151"');
            return;
        }

        for (const item of items.rows) {
            console.log(`Item: ${item.name} (ID: ${item.id}, Org: ${item.organization_id})`);

            // 2. Dump inventory for this item across ALL locations
            const inv = await pool.query(`
                SELECT i.location_id, l.name as location_name, i.quantity 
                FROM inventory i
                JOIN locations l ON i.location_id = l.id
                WHERE i.item_id = $1
            `, [item.id]);

            if (inv.rows.length === 0) {
                console.log('  No inventory records found.');
            } else {
                console.table(inv.rows);
            }
        }

    } catch (err) {
        console.error('Test Failed:', err);
    } finally {
        await pool.end();
    }
}

debugInventory();
