const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/topshelf',
});

// Configuration
const ORG_NAME = 'Downtown Bar';
const DAYS_HISTORY = 40;

// Hardcoded Suppliers & Products to ensure we have valid test data
const SEED_DATA = [
    { name: "Tito's Vodka", type: 'Liquor', supplier: "Southern Glazer's", order_size: 1, weight: 10, cost: 22.50 },
    { name: "Jack Daniel's", type: 'Liquor', supplier: "Southern Glazer's", order_size: 1, weight: 7, cost: 28.00 },
    { name: "Jameson", type: 'Liquor', supplier: "Southern Glazer's", order_size: 1, weight: 6, cost: 32.00 },
    { name: "Bud Light", type: 'Beer', supplier: "Breakthru Beverage", order_size: 24, weight: 15, cost: 24.00 },
    { name: "Miller Lite", type: 'Beer', supplier: "Breakthru Beverage", order_size: 24, weight: 12, cost: 24.00 },
    { name: "Corona", type: 'Beer', supplier: "Breakthru Beverage", order_size: 24, weight: 10, cost: 30.00 },
    { name: "Grey Goose", type: 'Liquor', supplier: "Southern Glazer's", order_size: 1, weight: 4, cost: 45.00 },
    { name: "Patron Silver", type: 'Liquor', supplier: "Southern Glazer's", order_size: 1, weight: 5, cost: 48.00 }
];

async function seed() {
    const client = await pool.connect();
    try {
        console.log(`Seeding ${DAYS_HISTORY} days of history for ${ORG_NAME} (REFINED)...`);

        // 1. Get Org ID
        const orgRes = await client.query("SELECT id FROM organizations WHERE name = $1", [ORG_NAME]);
        if (orgRes.rows.length === 0) {
            console.error('Organization not found');
            return;
        }
        const orgId = orgRes.rows[0].id;
        console.log(`Target Org ID: ${orgId}`);

        // 2. Clear EVERYTHING for this Org (Items, Logs, Inventory) to effectively "Start Fresh" for these demo items
        // User asked "remove the old 40 days of data added before". 
        // We will wipe activity logs. We will also ensure our SEED_DATA items exist and are updated.
        console.log('Clearing old activity logs and ensuring items...');
        await client.query("DELETE FROM activity_logs WHERE organization_id = $1", [orgId]);

        // 3. Ensure Suppliers Exist
        const suppliers = [...new Set(SEED_DATA.map(i => i.supplier))];
        const supplierMap = {};
        for (const sName of suppliers) {
            let sRes = await client.query("SELECT id FROM suppliers WHERE name = $1 AND organization_id = $2", [sName, orgId]);
            if (sRes.rows.length === 0) {
                sRes = await client.query("INSERT INTO suppliers (organization_id, name) VALUES ($1, $2) RETURNING id", [orgId, sName]);
            }
            supplierMap[sName] = sRes.rows[0].id;
        }

        // 4. Upsert Product Data
        const itemMap = []; // Store IDs and Metadata for simulation
        for (const item of SEED_DATA) {
            // Check if exists
            let iRes = await client.query("SELECT id FROM items WHERE name = $1 AND organization_id = $2", [item.name, orgId]);

            let itemId;
            if (iRes.rows.length === 0) {
                // Create
                const ins = await client.query(`
                    INSERT INTO items (organization_id, name, type, supplier, order_size, low_stock_threshold)
                    VALUES ($1, $2, $3, $4, $5, 5) RETURNING id
                `, [orgId, item.name, item.type, item.supplier, item.order_size]);
                itemId = ins.rows[0].id;
            } else {
                // Update properties
                itemId = iRes.rows[0].id;
                await client.query(`
                    UPDATE items SET supplier = $1, order_size = $2 
                    WHERE id = $3
                `, [item.supplier, item.order_size, itemId]);
            }

            // Link Supplier with Cost
            await client.query(`
                INSERT INTO item_suppliers (item_id, supplier_id, is_preferred, cost_per_unit)
                VALUES ($1, $2, true, $3)
                ON CONFLICT (item_id, supplier_id) DO UPDATE 
                SET is_preferred = true, cost_per_unit = $3
            `, [itemId, supplierMap[item.supplier], item.cost]);

            itemMap.push({ id: itemId, ...item });
        }

        // 5. Generate History
        // Start from 40 days ago
        const now = new Date();
        const start = new Date(now);
        start.setDate(now.getDate() - DAYS_HISTORY);

        // Get simulation users
        let userIds = [];
        const usersRes = await client.query("SELECT id FROM users WHERE organization_id = $1", [orgId]);
        userIds = usersRes.rows.map(r => r.id);
        if (userIds.length === 0) userIds = [0]; // Fallback

        // Initialize "Running Stock" for simulation
        // User requested starting at 10.
        const itemStock = {};
        for (const item of itemMap) {
            itemStock[item.id] = 10;
        }

        // Simulation Loop
        for (let d = 0; d <= DAYS_HISTORY; d++) {
            const currentDate = new Date(start);
            currentDate.setDate(start.getDate() + d);

            // Is it a weekend? (More busy)
            const day = currentDate.getDay();
            const isWeekend = (day === 5 || day === 6); // Fri/Sat
            const busyFactor = isWeekend ? 1.5 : 1.0; // Reduced factor

            console.log(`Simulating Day ${d}: ${currentDate.toDateString()} (Factor: ${busyFactor})`);

            // --- AUTO RESTOCK Logic (If Low) ---
            // Instead of fixed schedule, we order when low to maintain the "approx 10-20" range
            for (const item of itemMap) {
                if (itemStock[item.id] < 5) {
                    const restockQty = item.type === 'Beer' ? 24 : 12; // 1 case beer or 12 bottles
                    itemStock[item.id] += restockQty;

                    const logTime = new Date(currentDate);
                    logTime.setHours(9, 30);

                    await client.query(`
                        INSERT INTO activity_logs (organization_id, user_id, action, details, timestamp)
                        VALUES ($1, $2, 'ADD_STOCK', $3, $4)
                    `, [orgId, userIds[0], JSON.stringify({ itemId: item.id, itemName: item.name, quantity: restockQty }), logTime.toISOString()]);
                }
            }

            // --- USAGE (Burn) ---
            const transactions = Math.floor((Math.random() * 5 + 2) * busyFactor); // Reduced transactions

            for (let t = 0; t < transactions; t++) {
                // Pick random item based on weight
                const item = pickWeighted(itemMap);
                const userId = userIds[Math.floor(Math.random() * userIds.length)] || null;

                // Calculate Usage (Burn) - Reduced for lower volume
                let qty = 0;
                if (item.type === 'Beer') {
                    qty = Math.random() > 0.8 ? 6 : 1; // Mostly singles/small, rare 6-pack
                } else {
                    qty = 1; // Single pours/bottles
                }

                // CHECK STOCK - Prevent Negative
                if (itemStock[item.id] >= qty) {
                    itemStock[item.id] -= qty;

                    // Log Subtract
                    const logTime = new Date(currentDate);
                    logTime.setHours(18 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60));

                    await client.query(`
                        INSERT INTO activity_logs (organization_id, user_id, action, details, timestamp)
                        VALUES ($1, $2, 'SUBTRACT_STOCK', $3, $4)
                    `, [orgId, userId, JSON.stringify({ itemId: item.id, itemName: item.name, quantity: qty }), logTime.toISOString()]);
                }
            }
        }

        // 6. Set Final Stock Levels (Today) to match our simulation
        // Ensure Tito's is LOW for demo purposes (Manual adjustment log)
        const titos = itemMap.find(i => i.name.includes("Tito"));
        if (titos) {
            // Force to 3 (Critical < 5)
            const desired = 3;
            if (itemStock[titos.id] > desired) {
                const burnOff = itemStock[titos.id] - desired;
                itemStock[titos.id] = desired;

                await client.query(`
                    INSERT INTO activity_logs (organization_id, user_id, action, details, timestamp)
                    VALUES ($1, $2, 'SUBTRACT_STOCK', $3, NOW())
                `, [orgId, userIds[0], JSON.stringify({ itemId: titos.id, itemName: titos.name, quantity: burnOff, reason: 'End of Shift Adjustment' })]);
            }
        }

        for (const item of itemMap) {
            const finalQty = itemStock[item.id];

            await client.query(`
                INSERT INTO inventory (organization_id, item_id, location_id, quantity)
                VALUES ($1, $2, (SELECT id FROM locations WHERE organization_id = $1 LIMIT 1), $3)
                ON CONFLICT (item_id, location_id) DO UPDATE SET quantity = $3
             `, [orgId, item.id, finalQty]);
        }

        console.log('Seeding Complete.');

        // 7. FIX GLOBAL DATA (Prices/Suppliers for ALL Items)
        // User Request: "add prices to all products... make sure every product has a supplier"
        console.log('Running Global Data Hygiene Fixes...');

        // Ensure "Default Supplier" exists
        let defSupRes = await client.query("SELECT id FROM suppliers WHERE organization_id = $1 AND name = 'General Distributor'", [orgId]);
        let defSupId;
        if (defSupRes.rows.length === 0) {
            defSupRes = await client.query("INSERT INTO suppliers (organization_id, name) VALUES ($1, 'General Distributor') RETURNING id", [orgId]);
        }
        defSupId = defSupRes.rows[0].id;

        // Get all items for this org
        const allItems = await client.query("SELECT id, name, supplier FROM items WHERE organization_id = $1", [orgId]);

        for (const item of allItems.rows) {
            // A. Ensure Item has Supplier Link and Cost
            // Check existing link
            const linkCheck = await client.query("SELECT * FROM item_suppliers WHERE item_id = $1", [item.id]);

            if (linkCheck.rows.length === 0) {
                // Create Default Link
                await client.query(`
                    INSERT INTO item_suppliers (item_id, supplier_id, is_preferred, cost_per_unit)
                    VALUES ($1, $2, true, 10.00)
                `, [item.id, defSupId]);
                console.log(`- Fixed Missing Link for ${item.name} ($10.00)`);
            } else {
                // Ensure Cost is set (if 0, set to 15.00)
                const current = linkCheck.rows[0];
                if (!current.cost_per_unit || parseFloat(current.cost_per_unit) === 0) {
                    await client.query("UPDATE item_suppliers SET cost_per_unit = 15.00 WHERE item_id = $1 AND supplier_id = $2", [current.item_id, current.supplier_id]);
                    console.log(`- Updated Zero Cost for ${item.name} to $15.00`);
                }
            }
        }
        console.log('Global Fixes Applied.');

    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}

function pickWeighted(items) {
    const total = items.reduce((acc, i) => acc + i.weight, 0);
    let r = Math.random() * total;
    for (const item of items) {
        if (r < item.weight) return item;
        r -= item.weight;
    }
    return items[0];
}

seed();
