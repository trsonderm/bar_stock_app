const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/topshelf',
});

async function seedSmartOrderData() {
    const client = await pool.connect();
    try {
        console.log('Starting Smart Order Data Seeder...');

        // 1. Get Organization (Downtown Bar = ID 3 usually, but let's fetch name)
        const orgRes = await client.query("SELECT id FROM organizations WHERE name = 'Downtown Bar' LIMIT 1");
        if (orgRes.rows.length === 0) {
            console.log('Downtown Bar not found. Using first org.');
        }
        const orgId = orgRes.rows.length > 0 ? orgRes.rows[0].id : (await client.query('SELECT id FROM organizations LIMIT 1')).rows[0].id;
        console.log(`Targeting Organization ID: ${orgId}`);

        // 2. Ensure Suppliers
        const suppliers = [
            { name: "Southern Glazer's", email: 'orders@sgws.com' },
            { name: "Breakthru Beverage", email: 'orders@breakthru.com' }
        ];

        for (const s of suppliers) {
            await client.query(`
                INSERT INTO suppliers (organization_id, name, contact_email)
                VALUES ($1, $2, $3)
                ON CONFLICT (id) DO NOTHING -- No unique constraint on name/org usually, but let's check duplicates manually
            `, [orgId, s.name, s.email]);
            // check if exists to get ID if needed, but we can just update names for items
        }

        // Simple helper to get supplier name
        const sgws = "Southern Glazer's";
        const breakthru = "Breakthru Beverage";

        // 3. Ensure High Velocity Items
        const items = [
            { name: "Tito's Vodka", type: 'Liquor', supplier: sgws, cost: 18.50, burn: 2 }, // burn = bottles per day
            { name: "Jameson", type: 'Liquor', supplier: sgws, cost: 24.00, burn: 1.5 },
            { name: "Casamigos Blanco", type: 'Liquor', supplier: breakthru, cost: 38.00, burn: 1 },
            { name: "Bud Light", type: 'Beer', supplier: breakthru, cost: 1.10, burn: 24 },
            { name: "Miller Lite", type: 'Beer', supplier: breakthru, cost: 1.10, burn: 20 },
            { name: "House Cabernet", type: 'Wine', supplier: sgws, cost: 8.00, burn: 3 }
        ];

        const itemIds = [];

        for (const i of items) {
            // Upsert Item
            // We need to check if it exists by name to avoid duplicates if unique constraint missing
            let res = await client.query('SELECT id FROM items WHERE organization_id = $1 AND name = $2', [orgId, i.name]);
            let itemId;

            if (res.rows.length === 0) {
                res = await client.query(`
                    INSERT INTO items (organization_id, name, type, supplier, unit_cost, track_quantity)
                    VALUES ($1, $2, $3, $4, $5, 1)
                    RETURNING id
                `, [orgId, i.name, i.type, i.supplier, i.cost]);
                itemId = res.rows[0].id;
                console.log(`Created Item: ${i.name}`);
            } else {
                itemId = res.rows[0].id;
                // Update supplier/cost to ensure data quality
                await client.query('UPDATE items SET supplier = $1, unit_cost = $2 WHERE id = $3', [i.supplier, i.cost, itemId]);
                console.log(`Updated Item: ${i.name}`);
            }

            itemIds.push({ id: itemId, ...i });

            // 3a. Link to Supplier (New Table)
            // Get Supplier ID first
            const supRes = await client.query('SELECT id FROM suppliers WHERE name = $1 AND organization_id = $2', [i.supplier, orgId]);
            if (supRes.rows.length > 0) {
                const supplierId = supRes.rows[0].id;
                await client.query(`
                    INSERT INTO item_suppliers (item_id, supplier_id, is_preferred)
                    VALUES ($1, $2, true)
                    ON CONFLICT (item_id, supplier_id) DO UPDATE SET is_preferred = true
                `, [itemId, supplierId]);
                console.log(`Linked ${i.name} to ${i.supplier}`);
            }

            // Ensure Inventory Entry exists
            await client.query(`
                INSERT INTO inventory (organization_id, item_id, quantity, location_id)
                VALUES ($1, $2, 10, NULL) -- Assuming NULL location allowed or handle conflicts
                ON CONFLICT (item_id, location_id) DO NOTHING
            `, [orgId, itemId]);
        }

        // 4. Generate 30 Days of Logs
        console.log('Generating 30 days of logs...');
        const now = new Date();
        const userRes = await client.query('SELECT id FROM users WHERE organization_id = $1 LIMIT 1', [orgId]);
        const userId = userRes.rows[0]?.id;

        for (let d = 30; d >= 0; d--) {
            const date = new Date(now);
            date.setDate(date.getDate() - d);

            // Random time 2pm - 2am
            date.setHours(14 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 60));

            for (const item of itemIds) {
                // Daily Usage (SUBTRACT)
                const usage = Math.max(1, Math.round(item.burn * (0.8 + Math.random() * 0.4))); // burn +/- 20%

                await client.query(`
                    INSERT INTO activity_logs (organization_id, user_id, action, details, timestamp)
                    VALUES ($1, $2, 'SUBTRACT_STOCK', $3, $4)
                `, [orgId, userId, JSON.stringify({
                    itemId: item.id,
                    itemName: item.name,
                    quantity: usage,
                    change: usage,
                    reason: 'Sale',
                    unitCost: item.cost
                }), date]);

                // Weekly Restock (ADD) - every 7th day
                if (d % 7 === 0) {
                    const restockQty = Math.round(item.burn * 7 * 1.1); // Cover weekly burn + buffer
                    const restockDate = new Date(date);
                    restockDate.setHours(10, 0); // Delivered in morning

                    await client.query(`
                        INSERT INTO activity_logs (organization_id, user_id, action, details, timestamp)
                        VALUES ($1, $2, 'ADD_STOCK', $3, $4)
                    `, [orgId, userId, JSON.stringify({
                        itemId: item.id,
                        itemName: item.name,
                        quantity: restockQty,
                        change: restockQty,
                        reason: 'Delivery',
                        unitCost: item.cost
                    }), restockDate]);
                }
            }
        }

        // 5. Update Current Inventory to realistic levels
        // (Usage simulation ended, let's set current stock to something reasonable so it doesn't look broken)
        for (const item of itemIds) {
            await client.query(`
                UPDATE inventory SET quantity = $1 WHERE item_id = $2
            `, [Math.round(item.burn * 4), item.id]); // 4 days of stock left
        }

        console.log('Seeding Complete.');

    } catch (e) {
        console.error('Seeding Failed:', e);
    } finally {
        client.release();
        pool.end();
    }
}

seedSmartOrderData();
