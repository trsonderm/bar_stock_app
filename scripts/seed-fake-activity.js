const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/topshelf',
});

async function seedActivity() {
    const client = await pool.connect();
    try {
        console.log('Starting Fake Activity Seeder...');

        // 1. Get first 2 organizations
        const orgs = await client.query('SELECT id, name FROM organizations ORDER BY id LIMIT 2');
        if (orgs.rows.length === 0) {
            console.log('No organizations found.');
            return;
        }

        console.log(`Seeding activity for: ${orgs.rows.map(o => o.name).join(', ')}`);

        const now = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(now.getDate() - 30);

        for (const org of orgs.rows) {
            console.log(`Processing Org: ${org.name} (${org.id})`);

            // Get items and users for this org
            const items = await client.query('SELECT id, name, unit_cost FROM items WHERE organization_id = $1', [org.id]);
            const users = await client.query('SELECT id, first_name FROM users WHERE organization_id = $1', [org.id]);

            if (items.rows.length === 0 || users.rows.length === 0) {
                console.log(`Skipping ${org.name} (missing items or users)`);
                continue;
            }

            // Iterate 30 days
            for (let d = 0; d < 30; d++) {
                const day = new Date(thirtyDaysAgo);
                day.setDate(day.getDate() + d);

                // Random number of activities per day (5-15)
                const numActivities = Math.floor(Math.random() * 10) + 5;

                for (let i = 0; i < numActivities; i++) {
                    const item = items.rows[Math.floor(Math.random() * items.rows.length)];
                    const user = users.rows[Math.floor(Math.random() * users.rows.length)];

                    // 70% chance of usage (SUBTRACT), 30% restock (ADD)
                    const isUsage = Math.random() > 0.3;
                    const action = isUsage ? 'SUBTRACT_STOCK' : 'ADD_STOCK';
                    const qty = Math.floor(Math.random() * 5) + 1; // 1-5 items

                    // Random time between 10am and 2am (next day)
                    // Simplified: just random hour 10-23 for this "day"
                    const hour = Math.floor(Math.random() * 14) + 10; // 10 to 23
                    const minute = Math.floor(Math.random() * 60);

                    const timestamp = new Date(day);
                    timestamp.setHours(hour, minute, 0, 0);

                    const details = {
                        itemId: item.id,
                        itemName: item.name,
                        quantity: qty,
                        change: qty, // legacy support
                        reason: isUsage ? 'Sale/Usage' : 'Delivery',
                        unitCost: item.unit_cost
                    };

                    await client.query(`
                        INSERT INTO activity_logs (organization_id, user_id, action, details, timestamp)
                        VALUES ($1, $2, $3, $4, $5)
                    `, [org.id, user.id, action, JSON.stringify(details), timestamp]);
                }
            }
            console.log(`  - Seeded 30 days for ${org.name}`);
        }

        console.log('Seeding Complete.');
    } catch (e) {
        console.error('Seeding Failed:', e);
    } finally {
        client.release();
        pool.end();
    }
}

seedActivity();
