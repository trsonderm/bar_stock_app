
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/topshelf',
});

async function seedHistory() {
    const client = await pool.connect();
    try {
        console.log('Connecting to database...');

        // 1. Find Organization
        const orgRes = await client.query(`SELECT id, name FROM organizations WHERE name ILIKE '%foster%' LIMIT 1`);
        if (orgRes.rows.length === 0) {
            console.error('Organization "Fosters" not found.');
            return;
        }
        const orgId = orgRes.rows[0].id;
        console.log(`Found Organization: ${orgRes.rows[0].name} (ID: ${orgId})`);

        // 1.5 Cleanup Old Logs
        console.log('Cleaning up old activity logs...');
        await client.query('DELETE FROM activity_logs WHERE organization_id = $1', [orgId]);

        // 2. Find Users
        const usersRes = await client.query(`SELECT id, first_name, last_name, role FROM users WHERE organization_id = $1`, [orgId]);
        if (usersRes.rows.length === 0) {
            console.error('No users found for this organization.');
            return;
        }
        const users = usersRes.rows;
        const adminUser = users.find(u => u.role === 'admin') || users[0];
        console.log(`Found ${users.length} users.`);

        // 3. Find Category - Need valid category
        const catRes = await client.query('SELECT id FROM categories WHERE organization_id = $1 LIMIT 1', [orgId]);
        let categoryId = null;
        if (catRes.rows.length > 0) categoryId = catRes.rows[0].id;

        // 4. Find Suppliers & fix
        let suppliersRes = await client.query(`SELECT id, name, delivery_days_json FROM suppliers WHERE organization_id = $1`, [orgId]);
        let suppliers = suppliersRes.rows;

        if (suppliers.length === 0) {
            console.log('No suppliers found. Creating default suppliers...');
            const s1 = await client.query(`INSERT INTO suppliers (organization_id, name, lead_time_days, delivery_days_json) VALUES ($1, 'Southern Glazer''s', 2, '["Tuesday", "Friday"]') RETURNING id, name, delivery_days_json`, [orgId]);
            const s2 = await client.query(`INSERT INTO suppliers (organization_id, name, lead_time_days, delivery_days_json) VALUES ($1, 'Breakthru Beverage', 1, '["Monday", "Thursday"]') RETURNING id, name, delivery_days_json`, [orgId]);
            suppliers = [s1.rows[0], s2.rows[0]];
        }
        console.log(`Found ${suppliers.length} suppliers.`);

        // Fix missing delivery days
        for (const supplier of suppliers) {
            let deliveryDays = [];
            if (typeof supplier.delivery_days_json === 'string') {
                try { deliveryDays = JSON.parse(supplier.delivery_days_json); } catch (e) { }
            } else if (Array.isArray(supplier.delivery_days_json)) {
                deliveryDays = supplier.delivery_days_json;
            }

            if (deliveryDays.length === 0) {
                let newDays = [];
                if (supplier.name.toLowerCase().includes('southern')) newDays = ["Tuesday", "Friday"];
                else if (supplier.name.toLowerCase().includes('breakthru')) newDays = ["Monday", "Thursday"];
                else newDays = ["Wednesday"];

                await client.query(`UPDATE suppliers SET delivery_days_json = $1 WHERE id = $2`, [JSON.stringify(newDays), supplier.id]);
                // Update local object
                supplier.delivery_days_json = newDays;
            }
        }

        // 5. Ensure ITEMS >= 30
        let itemsRes = await client.query(`SELECT id, name, type, supplier FROM items WHERE organization_id = $1`, [orgId]);
        let items = itemsRes.rows;
        console.log(`Found ${items.length} items.`);

        if (items.length < 30) {
            console.log('Generating dummy items to reach 30...');
            const needed = 30 - items.length;
            const types = ['Beer', 'Liquor'];
            const liquorNames = ['Vodka', 'Whiskey', 'Rum', 'Tequila', 'Gin', 'Bourbon', 'Scotch', 'Brandy'];
            const beerNames = ['IPA', 'Lager', 'Stout', 'Pilsner', 'Ale', 'Porter'];

            for (let i = 0; i < needed; i++) {
                const type = types[Math.floor(Math.random() * types.length)];
                const baseName = type === 'Beer'
                    ? beerNames[Math.floor(Math.random() * beerNames.length)]
                    : liquorNames[Math.floor(Math.random() * liquorNames.length)];
                const name = `Simulated ${baseName} ${Math.floor(Math.random() * 1000)}`;
                const supplier = suppliers.length > 0 ? suppliers[Math.floor(Math.random() * suppliers.length)].name : null;

                await client.query(`
                    INSERT INTO items (organization_id, name, type, supplier, unit_cost)
                    VALUES ($1, $2, $3, $4, $5)
                `, [orgId, name, type, supplier, (Math.random() * 50).toFixed(2)]);
            }
            // Refresh items list
            itemsRes = await client.query(`SELECT id, name, type, supplier FROM items WHERE organization_id = $1`, [orgId]);
            items = itemsRes.rows;
            console.log(`Total items now: ${items.length}`);
        }

        // Map Suppliers to Items
        const itemSupplierMap = {};
        for (const item of items) {
            const linkRes = await client.query(`SELECT supplier_id FROM item_suppliers WHERE item_id = $1 AND is_preferred = TRUE LIMIT 1`, [item.id]);
            let supplierId = null;
            if (linkRes.rows.length > 0) {
                supplierId = linkRes.rows[0].supplier_id;
            } else {
                if (item.supplier) {
                    const s = suppliers.find(sup => sup.name === item.supplier);
                    if (s) supplierId = s.id;
                }
            }
            if (!supplierId && suppliers.length > 0) {
                supplierId = suppliers[Math.floor(Math.random() * suppliers.length)].id;
            }
            if (supplierId) {
                const supplier = suppliers.find(s => s.id === supplierId);
                itemSupplierMap[item.id] = supplier;
            }
        }


        console.log('Starting simulation...');
        const DAYS_BACK = 30;
        const usageAccumulator = {}; // itemId -> quantity used since last delivery
        // Initialize accumulator
        for (const item of items) usageAccumulator[item.id] = 0;

        await client.query('BEGIN');

        // 5. Setup Suppliers & Costs (Crucial for Smart Order)

        // 6. Setup Location Context
        // Find a valid location for this org (First one)
        const locationRes = await client.query('SELECT id FROM locations WHERE organization_id = $1 LIMIT 1', [orgId]);
        let targetLocationId = null;
        if (locationRes.rows.length > 0) {
            targetLocationId = locationRes.rows[0].id;
            console.log(`Using Location ID: ${targetLocationId}`);
        } else {
            console.error('No locations found for this organization! Creating default...');
            const newLoc = await client.query(`INSERT INTO locations (organization_id, name) VALUES ($1, 'Main Bar') RETURNING id`, [orgId]);
            targetLocationId = newLoc.rows[0].id;
        }

        // 6. Initial Stock (-31 Days)
        const initialDate = new Date();
        initialDate.setDate(initialDate.getDate() - (DAYS_BACK + 1));
        initialDate.setHours(8, 0, 0); // 8 AM

        for (const item of items) {
            const isBeer = (item.type && item.type.toLowerCase().includes('beer')) ||
                (item.name && item.name.toLowerCase().includes('beer'));
            const quantity = isBeer ? 128 : 10;

            const logDetails = {
                itemId: item.id,
                itemName: item.name,
                change: quantity,
                quantity: quantity,
                quantityAfter: quantity, // Assuming starting from 0? we don't track inventory strictly here
                locationId: targetLocationId
            };

            await client.query(`
                 INSERT INTO activity_logs (organization_id, user_id, action, details, timestamp)
                 VALUES ($1, $2, 'ADD_STOCK', $3, $4)
             `, [orgId, adminUser.id, JSON.stringify(logDetails), initialDate]);
        }
        console.log('Initial stock generated.');


        // 7. Daily Loop
        for (let d = DAYS_BACK; d >= 0; d--) {
            const date = new Date();
            date.setDate(date.getDate() - d);
            const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });

            // Simulating Usage
            // "Most liquors and beers" -> Subtractions every day
            // "Reasonable restock numbers"
            // "Daily activity on at least 25 items"

            // Usage on ALL items or at least 25?
            // Let's create a shuffled list of items to ensure at least 25 distinct items
            let dailyItems = [...items];
            // Shuffle
            for (let i = dailyItems.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [dailyItems[i], dailyItems[j]] = [dailyItems[j], dailyItems[i]];
            }

            // If items count > 25, we can pick a subset, but user said "most".
            // Let's just iterate over ALL items and have a high probability (e.g. 80%) of usage.
            // But ensure at least 25 are used.

            let usedCount = 0;
            for (const item of dailyItems) {
                // Determine usage probability
                // Ensure at least 25 get used
                let shouldUse = false;
                if (usedCount < 25) {
                    shouldUse = true;
                } else {
                    shouldUse = Math.random() > 0.2; // 80% change for others
                }

                if (!shouldUse) continue;

                usedCount++;
                const user = users[Math.floor(Math.random() * users.length)];

                let quantity = 0;
                const isBeer = (item.type && item.type.toLowerCase().includes('beer')) ||
                    (item.name && item.name.toLowerCase().includes('beer'));

                if (isBeer) {
                    quantity = Math.random() > 0.5 ? 12 : 24;
                } else {
                    quantity = Math.floor(Math.random() * 4) + 1; // 1 to 4
                }

                const bottleLevels = ['0-25%', '25-50%', '50-75%', '75-100%'];
                const bottleLevel = (Math.random() < 0.3) ? bottleLevels[Math.floor(Math.random() * bottleLevels.length)] : null; // 30% chance to log level

                const logDetails = {
                    itemId: item.id,
                    itemName: item.name,
                    change: quantity,
                    quantity: quantity,
                    quantityAfter: 0,
                    locationId: targetLocationId,
                    bottleLevel: bottleLevel
                };

                const logTime = new Date(date);
                logTime.setHours(18 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60));

                const resLog = await client.query(`
                    INSERT INTO activity_logs (organization_id, user_id, action, details, timestamp)
                    VALUES ($1, $2, 'SUBTRACT_STOCK', $3, $4)
                    RETURNING id
                `, [orgId, user.id, JSON.stringify(logDetails), logTime]);

                if (bottleLevel) {
                    await client.query(`
                        INSERT INTO bottle_level_logs (activity_log_id, option_label, user_id, timestamp)
                        VALUES ($1, $2, $3, $4)
                    `, [resLog.rows[0].id, bottleLevel, user.id, logTime]);
                }

                usageAccumulator[item.id] += quantity;
            }

            // Simulating Restock (Deliveries)
            for (const supplier of suppliers) {
                let deliveryDays = [];
                if (typeof supplier.delivery_days_json === 'string') {
                    try { deliveryDays = JSON.parse(supplier.delivery_days_json); } catch (e) { }
                } else if (Array.isArray(supplier.delivery_days_json)) {
                    deliveryDays = supplier.delivery_days_json;
                }

                if (deliveryDays.includes(dayOfWeek)) {
                    for (const item of items) {
                        if (itemSupplierMap[item.id] && itemSupplierMap[item.id].id === supplier.id) {
                            const usedAmount = usageAccumulator[item.id];

                            if (usedAmount > 0) {
                                // Add some randomness to "restock numbers" -> maybe slightly more or less?
                                // "Reasonable restock numbers for the same items on the days of restocking"
                                // Matching usage exactly is reasonable. Maybe round up to nearest case/bottle size?
                                // Let's just match usage exactly for simplicity unless "reasonable" implies stocking up MORE than needed?
                                // Let's stock up 1.1x usage? Or just usage. Let's do usage for now.

                                const logDetails = {
                                    itemId: item.id,
                                    itemName: item.name,
                                    change: usedAmount,
                                    quantity: usedAmount,
                                    quantityAfter: 0,
                                    locationId: targetLocationId
                                };

                                const logTime = new Date(date);
                                logTime.setHours(10 + Math.floor(Math.random() * 4), Math.floor(Math.random() * 60));

                                await client.query(`
                                     INSERT INTO activity_logs (organization_id, user_id, action, details, timestamp)
                                     VALUES ($1, $2, 'ADD_STOCK', $3, $4)
                                 `, [orgId, adminUser.id, JSON.stringify(logDetails), logTime]);

                                usageAccumulator[item.id] = 0;
                            }
                        }
                    }
                }
            }
        }

        // Update Inventory Table with Final Stock
        console.log(`Updating inventory snapshot for location ${targetLocationId}...`);
        for (const item of items) {
            const isBeer = (item.type && item.type.toLowerCase().includes('beer')) ||
                (item.name && item.name.toLowerCase().includes('beer'));
            // Base quantity
            let finalQty = isBeer ? 128 : 10;

            // Adjust slightly for "today's" pending usage if we want? 
            // Or just assume restock kept it level.
            // Let's variance it slightly so it looks real
            finalQty = finalQty - (Math.floor(Math.random() * 3));

            // Upsert inventory
            // Check if exists
            const invRes = await client.query(`SELECT id FROM inventory WHERE organization_id = $1 AND item_id = $2 AND location_id = $3`, [orgId, item.id, targetLocationId]);

            if (invRes.rows.length > 0) {
                await client.query(`UPDATE inventory SET quantity = $1 WHERE id = $2`, [finalQty, invRes.rows[0].id]);
            } else {
                await client.query(`INSERT INTO inventory (organization_id, item_id, location_id, quantity) VALUES ($1, $2, $3, $4)`, [orgId, item.id, targetLocationId, finalQty]);
            }
        }

        // Update User Locations
        console.log(`Assigning users to Location ${targetLocationId}...`);
        const locRes = await client.query('SELECT id FROM locations WHERE organization_id = $1 AND id = $2', [orgId, targetLocationId]);
        if (locRes.rows.length > 0) {
            for (const user of users) {
                // Check if assigned
                const assignRes = await client.query('SELECT id FROM user_locations WHERE user_id = $1 AND location_id = $2', [user.id, targetLocationId]);
                if (assignRes.rows.length === 0) {
                    await client.query(`
                        INSERT INTO user_locations (organization_id, user_id, location_id, is_primary)
                        VALUES ($1, $2, $3, TRUE)
                     `, [orgId, user.id, targetLocationId]);
                }
            }
        }

        // Cleanup old inventory (bad locations)
        console.log('Cleaning up old inventory...');
        await client.query('DELETE FROM inventory WHERE organization_id = $1 AND location_id != $2', [orgId, targetLocationId]);

        await client.query('COMMIT');
        console.log('Seed completed successfully.');

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Error seeding history:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

seedHistory();
