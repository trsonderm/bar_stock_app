const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/topshelf',
});

async function run() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        console.log('Seeding Floyds Organization...');

        // 1. Organization
        const orgName = `Floyds ${Date.now()}`;
        const subDomain = `floyds${Date.now()}`;
        const orgRes = await client.query(
            `INSERT INTO organizations (name, subdomain, trial_ends_at) VALUES ($1, $2, NOW() + INTERVAL '30 days') RETURNING id`,
            [orgName, subDomain]
        );
        const orgId = orgRes.rows[0].id;
        console.log(`Created Organization: ${orgName} (ID: ${orgId})`);

        // Enable bottle level tracking
        await client.query(`INSERT INTO settings (organization_id, key, value) VALUES ($1, 'bottle_level_tracking', 'true')`, [orgId]);

        // 2. Locations
        const locRes = await client.query(`INSERT INTO locations (organization_id, name) VALUES ($1, 'Main Bar') RETURNING id`, [orgId]);
        const locId = locRes.rows[0].id;

        // 3. Users
        const pinHash = await bcrypt.hash('1234', 10);
        const passHash = await bcrypt.hash('password', 10);

        const usersToCreate = [
            { first: 'Floyd', last: 'Manager', email: `manager${Date.now()}@floyds.test`, role: 'admin', perms: ['all'], locs: [locId] },
            { first: 'Floyd', last: 'Bartender', email: `bartender${Date.now()}@floyds.test`, role: 'user', perms: ['add_stock', 'subtract_stock'], locs: [locId] },
        ];

        const createdUsers = [];
        for (const u of usersToCreate) {
            const uRes = await client.query(`
                INSERT INTO users (organization_id, first_name, last_name, email, password_hash, pin_hash, role, permissions)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
            `, [orgId, u.first, u.last, u.email, passHash, pinHash, u.role, JSON.stringify(u.perms)]);
            const uId = uRes.rows[0].id;
            createdUsers.push(uId);

            for (const lId of u.locs) {
                await client.query(`INSERT INTO user_locations (organization_id, user_id, location_id, is_primary) VALUES ($1, $2, $3, TRUE)`, [orgId, uId, lId]);
            }
        }
        console.log(`Created 2 employees.`);

        // 4. Suppliers
        const sup1Res = await client.query(`
            INSERT INTO suppliers (organization_id, name, delivery_days_json, order_days_json) VALUES ($1, 'Distributor A', '["Monday"]', '["Thursday"]') RETURNING id
        `, [orgId]);
        const sup2Res = await client.query(`
            INSERT INTO suppliers (organization_id, name, delivery_days_json, order_days_json) VALUES ($1, 'Distributor B', '["Wednesday"]', '["Monday"]') RETURNING id
        `, [orgId]);
        const suppliers = [sup1Res.rows[0].id, sup2Res.rows[0].id];

        // 5. Categories
        const catBeerRes = await client.query(`INSERT INTO categories (organization_id, name, enable_low_stock_reporting) VALUES ($1, 'Beer', TRUE) RETURNING id`, [orgId]);
        const catLiquorRes = await client.query(`INSERT INTO categories (organization_id, name, enable_low_stock_reporting) VALUES ($1, 'Liquor', TRUE) RETURNING id`, [orgId]);
        const catBeerId = catBeerRes.rows[0].id;
        const catLiquorId = catLiquorRes.rows[0].id;

        // 6. Products
        const items = [];
        // Supplier A gets 10 items (8 Beers, 2 Special Beers with order size 6,12,24)
        for (let i = 0; i < 10; i++) {
            const isSpecialBeer = (i < 2);
            const price = (Math.random() * 20 + 10).toFixed(2); // 10 to 30 dollars
            const orderSize = isSpecialBeer ? JSON.stringify([6, 12, 24]) : JSON.stringify([1]);
            const itemName = isSpecialBeer ? `Floyds Special Beer ${i + 1}` : `Floyds Regular Beer ${i + 1}`;

            const res = await client.query(`
                INSERT INTO items (organization_id, name, type, unit_cost, order_size, track_quantity, category_id)
                VALUES ($1, $2, 'Beer', $3, $4::jsonb, 1, $5) RETURNING id, name, type
            `, [orgId, itemName, price, orderSize, catBeerId]);

            items.push(res.rows[0]);
            await client.query(`INSERT INTO item_suppliers (item_id, supplier_id, is_preferred) VALUES ($1, $2, TRUE)`, [res.rows[0].id, suppliers[0]]);
        }

        // Supplier B gets 10 items (Liquors)
        for (let i = 0; i < 10; i++) {
            const price = (Math.random() * 20 + 10).toFixed(2); // 10 to 30 dollars
            const itemName = `Floyds Liquor ${i + 1}`;
            const orderSize = JSON.stringify([1]);

            const res = await client.query(`
                INSERT INTO items (organization_id, name, type, unit_cost, order_size, track_quantity, category_id)
                VALUES ($1, $2, 'Liquor', $3, $4::jsonb, 1, $5) RETURNING id, name, type
            `, [orgId, itemName, price, orderSize, catLiquorId]);

            items.push(res.rows[0]);
            await client.query(`INSERT INTO item_suppliers (item_id, supplier_id, is_preferred) VALUES ($1, $2, TRUE)`, [res.rows[0].id, suppliers[1]]);
        }
        console.log(`Created 20 products.`);

        // 7. Initial Inventory + 60 days of logs
        const stockState = {};
        for (const it of items) {
            stockState[it.id] = it.type === 'Beer' ? 120 : 20; // safe arbitrary starting counts
        }

        const adminId = createdUsers[0];
        const barUser = createdUsers[1];
        const today = new Date();
        today.setHours(12, 0, 0, 0);

        console.log('Generating 60 days of data...');
        const DAYS = 60;
        const bottleLevels = ['1/2 shot', '1 shot'];

        for (let d = DAYS; d >= 0; d--) {
            const date = new Date(today);
            date.setDate(date.getDate() - d);
            const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });

            // SUBTRACT STOCK
            for (const it of items) {
                const isBeer = it.type === 'Beer';
                let maxUsage = isBeer ? 10 : 2;
                let usage = Math.floor(Math.random() * maxUsage);

                if (usage > stockState[it.id]) {
                    usage = stockState[it.id]; // cap to ensure NO negative amounts
                }

                if (usage > 0) {
                    stockState[it.id] -= usage;
                    const logTime = new Date(date);
                    logTime.setHours(18 + Math.floor(Math.random() * 5));

                    const logRes = await client.query(`
                        INSERT INTO activity_logs (organization_id, user_id, action, details, timestamp)
                        VALUES ($1, $2, 'SUBTRACT_STOCK', $3, $4) RETURNING id
                    `, [orgId, barUser, JSON.stringify({ itemId: it.id, itemName: it.name, quantity: usage, locationId: locId }), logTime]);

                    const logId = logRes.rows[0].id;

                    // Add Bottle Level randomly (only makes logical sense for liquor but randomly applying as requested)
                    // Request: "randomly select those"
                    if (Math.random() > 0.5) {
                        const level = bottleLevels[Math.floor(Math.random() * bottleLevels.length)];
                        await client.query(`
                            INSERT INTO bottle_level_logs (activity_log_id, user_id, option_label, timestamp)
                            VALUES ($1, $2, $3, $4)
                        `, [logId, barUser, level, logTime]);
                    }
                }
            }

            // ADD STOCK / DELIVERIES
            // Supplier A (Mon) - Beers
            // Supplier B (Wed) - Liquors
            const isDeliveryA = dayOfWeek === "Monday";
            const isDeliveryB = dayOfWeek === "Wednesday";

            for (const it of items) {
                const isBeer = it.type === 'Beer';
                const targetStock = isBeer ? 120 : 20;

                if ((isBeer && isDeliveryA) || (!isBeer && isDeliveryB)) {
                    if (stockState[it.id] < targetStock * 0.7) {
                        const amountToAdd = targetStock - stockState[it.id];
                        stockState[it.id] += amountToAdd;

                        const logTime = new Date(date);
                        logTime.setHours(10 + Math.floor(Math.random() * 4));

                        await client.query(`
                            INSERT INTO activity_logs (organization_id, user_id, action, details, timestamp)
                            VALUES ($1, $2, 'ADD_STOCK', $3, $4)
                        `, [orgId, adminId, JSON.stringify({ itemId: it.id, itemName: it.name, quantity: amountToAdd, locationId: locId }), logTime]);
                    }
                }
            }
        }

        // 8. Commit final inventory
        for (const it of items) {
            await client.query(`
                INSERT INTO inventory (organization_id, item_id, location_id, quantity)
                VALUES ($1, $2, $3, $4)
            `, [orgId, it.id, locId, stockState[it.id]]);
        }

        // 9. Shifts & Schedules
        const morningRes = await client.query(`INSERT INTO shifts (organization_id, label, start_time, end_time) VALUES ($1, 'Morning Shift', '09:00', '16:00') RETURNING id`, [orgId]);
        const eveningRes = await client.query(`INSERT INTO shifts (organization_id, label, start_time, end_time) VALUES ($1, 'Evening Shift', '16:00', '00:00') RETURNING id`, [orgId]);
        const morningId = morningRes.rows[0].id;
        const eveningId = eveningRes.rows[0].id;

        for (let d = 0; d < 7; d++) {
            const date = new Date(today);
            date.setDate(date.getDate() + d);
            // Manager morning
            await client.query(`INSERT INTO user_schedules (organization_id, user_id, shift_id, date) VALUES ($1, $2, $3, $4)`, [orgId, createdUsers[0], morningId, date]);
            // Bartender evening
            await client.query(`INSERT INTO user_schedules (organization_id, user_id, shift_id, date) VALUES ($1, $2, $3, $4)`, [orgId, createdUsers[1], eveningId, date]);
        }

        await client.query('COMMIT');
        console.log('✅ Floyds Organization successfully seeded!');
        console.log(`Users:`);
        for (const u of usersToCreate) {
            console.log(`${u.email} | password: password | PIN: 1234`);
        }

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Failed to seed Floyds:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
