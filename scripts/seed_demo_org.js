const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/topshelf',
});

async function run() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        console.log('Seeding Demo Organization...');

        // 1. Organization
        const orgName = `Demo Org ${Date.now()}`;
        const orgRes = await client.query(
            `INSERT INTO organizations (name, subdomain, trial_ends_at) VALUES ($1, $2, NOW() + INTERVAL '30 days') RETURNING id`,
            [orgName, `demo${Date.now()}`]
        );
        const orgId = orgRes.rows[0].id;
        console.log(`Created Organization: ${orgName} (ID: ${orgId})`);

        // 2. Locations
        const loc1Res = await client.query(`INSERT INTO locations (organization_id, name) VALUES ($1, 'Downtown Bar') RETURNING id`, [orgId]);
        const loc2Res = await client.query(`INSERT INTO locations (organization_id, name) VALUES ($1, 'Uptown Lounge') RETURNING id`, [orgId]);
        const loc1 = loc1Res.rows[0].id;
        const loc2 = loc2Res.rows[0].id;

        // 3. Users
        const pinHash = await bcrypt.hash('1234', 10);
        const passHash = await bcrypt.hash('password', 10);

        const usersToCreate = [
            { first: 'Alice', last: 'Admin', email: `alice.admin${Date.now()}@demo.com`, role: 'admin', perms: ['all'], locs: [loc1, loc2] },
            { first: 'Bob', last: 'Admin', email: `bob.admin${Date.now()}@demo.com`, role: 'admin', perms: ['all'], locs: [loc1, loc2] },
            { first: 'Charlie', last: 'Bartender', email: `charlie.bar${Date.now()}@demo.com`, role: 'user', perms: ['subtract_stock'], locs: [loc1] },
            { first: 'Dave', last: 'Manager', email: `dave.mgr${Date.now()}@demo.com`, role: 'user', perms: ['add_stock', 'subtract_stock'], locs: [loc1] },
            { first: 'Eve', last: 'Manager', email: `eve.mgr${Date.now()}@demo.com`, role: 'user', perms: ['add_stock', 'subtract_stock'], locs: [loc2] },
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
        console.log(`Created 5 users with Quick Login pin 1234.`);

        // 4. Suppliers
        const sup1Res = await client.query(`
            INSERT INTO suppliers (organization_id, name, delivery_days_json) VALUES ($1, 'City Beverages', '["Tuesday", "Friday"]') RETURNING id
        `, [orgId]);
        const sup2Res = await client.query(`
            INSERT INTO suppliers (organization_id, name, delivery_days_json) VALUES ($1, 'Liquor Distributors', '["Wednesday"]') RETURNING id
        `, [orgId]);
        const suppliers = [sup1Res.rows[0].id, sup2Res.rows[0].id];

        // 5. Products
        const beers = ['IPA', 'Lager', 'Stout', 'Pilsner', 'Pale Ale', 'Cider', 'Wheat Beer', 'Porter', 'Blonde Ale', 'Saison'];
        const liquors = ['Vodka', 'Whiskey', 'Rum', 'Tequila', 'Gin', 'Bourbon', 'Scotch', 'Brandy', 'Cognac', 'Mezcal'];
        const items = [];

        // Beer (starts at 240)
        for (let i = 0; i < 10; i++) {
            const res = await client.query(`INSERT INTO items (organization_id, name, type, unit_cost) VALUES ($1, $2, 'Beer', $3) RETURNING id, name, type`, [orgId, `Demo ${beers[i]}`, (Math.random() * 2 + 1).toFixed(2)]);
            items.push(res.rows[0]);
            await client.query(`INSERT INTO item_suppliers (item_id, supplier_id, is_preferred) VALUES ($1, $2, TRUE)`, [res.rows[0].id, suppliers[0]]);
        }
        // Liquor (starts at 20)
        for (let i = 0; i < 10; i++) {
            const res = await client.query(`INSERT INTO items (organization_id, name, type, unit_cost) VALUES ($1, $2, 'Liquor', $3) RETURNING id, name, type`, [orgId, `Demo ${liquors[i]}`, (Math.random() * 20 + 15).toFixed(2)]);
            items.push(res.rows[0]);
            await client.query(`INSERT INTO item_suppliers (item_id, supplier_id, is_preferred) VALUES ($1, $2, TRUE)`, [res.rows[0].id, suppliers[1]]);
        }

        // 6. Historical Data (60 Days)
        console.log('Generating 60 days of historical activity...');
        const DAYS = 60;

        // Tracking state
        // itemLocState[locId][itemId] = quantity
        const stockState = { [loc1]: {}, [loc2]: {} };
        for (const it of items) {
            stockState[loc1][it.id] = it.type === 'Beer' ? 240 : 20;
            stockState[loc2][it.id] = it.type === 'Beer' ? 240 : 20;
        }

        const adminId = createdUsers[0];
        const barUser = createdUsers[2];
        const today = new Date();
        today.setHours(12, 0, 0, 0);

        for (let d = DAYS; d >= 0; d--) {
            const date = new Date(today);
            date.setDate(date.getDate() - d);
            const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });

            // Usage Phase
            for (const loc of [loc1, loc2]) {
                for (const it of items) {
                    // Random usage
                    const isBeer = it.type === 'Beer';
                    let maxUsage = isBeer ? 20 : 3;
                    let usage = Math.floor(Math.random() * maxUsage) + 1;

                    // Cap usage to avoid going negative
                    if (usage > stockState[loc][it.id]) {
                        usage = stockState[loc][it.id];
                    }

                    if (usage > 0) {
                        stockState[loc][it.id] -= usage;
                        const logTime = new Date(date);
                        logTime.setHours(18 + Math.floor(Math.random() * 5));

                        await client.query(`
                            INSERT INTO activity_logs (organization_id, user_id, action, details, timestamp)
                            VALUES ($1, $2, 'SUBTRACT_STOCK', $3, $4)
                        `, [orgId, barUser, JSON.stringify({ itemId: it.id, itemName: it.name, quantity: usage, locationId: loc }), logTime]);
                    }
                }
            }

            // Restock Phase (Deliveries)
            const isDelivery1 = ["Tuesday", "Friday"].includes(dayOfWeek);
            const isDelivery2 = ["Wednesday"].includes(dayOfWeek);

            for (const loc of [loc1, loc2]) {
                for (const it of items) {
                    const isBeer = it.type === 'Beer';
                    const targetStock = isBeer ? 240 : 20;

                    if ((isBeer && isDelivery1) || (!isBeer && isDelivery2)) {
                        const current = stockState[loc][it.id];
                        if (current < targetStock * 0.8) { // Only restock if below 80% to avoid micro-deliveries
                            const amountToAdd = targetStock - current;
                            stockState[loc][it.id] += amountToAdd;

                            const logTime = new Date(date);
                            logTime.setHours(10 + Math.floor(Math.random() * 4));

                            await client.query(`
                                INSERT INTO activity_logs (organization_id, user_id, action, details, timestamp)
                                VALUES ($1, $2, 'ADD_STOCK', $3, $4)
                            `, [orgId, adminId, JSON.stringify({ itemId: it.id, itemName: it.name, quantity: amountToAdd, locationId: loc }), logTime]);
                        }
                    }
                }
            }
        }

        // Apply final state to inventory table
        for (const loc of [loc1, loc2]) {
            for (const it of items) {
                const finalQty = stockState[loc][it.id];
                await client.query(`
                    INSERT INTO inventory (organization_id, item_id, location_id, quantity)
                    VALUES ($1, $2, $3, $4)
                `, [orgId, it.id, loc, finalQty]);
            }
        }

        // 7. Scheduling
        console.log('Generating Schedule & Shifts...');
        const morningRes = await client.query(`INSERT INTO shifts (organization_id, label, start_time, end_time) VALUES ($1, 'Morning Shift', '10:00', '16:00') RETURNING id`, [orgId]);
        const eveningRes = await client.query(`INSERT INTO shifts (organization_id, label, start_time, end_time) VALUES ($1, 'Evening Shift', '16:00', '00:00') RETURNING id`, [orgId]);

        for (let d = 0; d < 7; d++) {
            const date = new Date(today);
            date.setDate(date.getDate() + d);

            // Assign Charlie to Morning
            await client.query(`INSERT INTO user_schedules (organization_id, user_id, shift_id, date) VALUES ($1, $2, $3, $4)`, [orgId, createdUsers[2], morningRes.rows[0].id, date]);
            // Assign Dave & Eve to Evening
            await client.query(`INSERT INTO user_schedules (organization_id, user_id, shift_id, date) VALUES ($1, $2, $3, $4)`, [orgId, createdUsers[3], eveningRes.rows[0].id, date]);
            await client.query(`INSERT INTO user_schedules (organization_id, user_id, shift_id, date) VALUES ($1, $2, $3, $4)`, [orgId, createdUsers[4], eveningRes.rows[0].id, date]);
        }

        await client.query('COMMIT');
        console.log('✅ Demo Organization completely seeded!');
        console.log(`\n==== LOGIN CREDENTIALS ====`);
        for (const u of usersToCreate) {
            console.log(`Email: ${u.email}  |  Password: password  |  PIN: 1234  |  Role: ${u.role}`);
        }
        console.log(`===========================\n`);

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Failed to seed DB:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
