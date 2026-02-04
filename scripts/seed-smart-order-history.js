const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/topshelf',
});

async function main() {
    const client = await pool.connect();
    try {
        console.log('Seeding Smart Order Notification History...');

        // 1. Get Organization
        const orgRes = await client.query("SELECT id FROM organizations WHERE name = 'Downtown Bar' LIMIT 1");
        const orgId = orgRes.rows.length > 0 ? orgRes.rows[0].id : 3;

        // 2. Get User (for 'user_id' in notifications, usually system or admin)
        const userRes = await client.query('SELECT id FROM users WHERE organization_id = $1 LIMIT 1', [orgId]);
        const userId = userRes.rows[0]?.id;

        // 3. Find "ADD_STOCK" logs that were "Delivery" to simulate past orders
        // actually we can just fake it based on any ADD_STOCK
        const logs = await client.query(`
            SELECT * FROM activity_logs 
            WHERE organization_id = $1 
            AND action = 'ADD_STOCK'
            ORDER BY timestamp DESC
            LIMIT 10
        `, [orgId]);

        console.log(`Found ${logs.rowCount} recent stock additions. Generating emails for them...`);

        for (const log of logs.rows) {
            const date = new Date(log.timestamp);
            // Assume order was sent 2 days prior
            const sentDate = new Date(date);
            sentDate.setDate(date.getDate() - 2);
            sentDate.setHours(9, 30, 0); // Sent at 9:30 AM

            let details = log.details;
            if (typeof details === 'string') {
                try { details = JSON.parse(details); } catch (e) { details = {}; }
            }

            const itemName = details.itemName || details.item_name || 'Unknown Item';
            const qty = details.quantity || details.qty || 1;

            // Create Fake Email Notification
            await client.query(`
                INSERT INTO notifications (organization_id, user_id, type, title, message, created_at, is_read, data)
                VALUES ($1, $2, 'SMART_ORDER', 'Smart Order Sent', $3, $4, true, $5)
            `, [orgId, userId,
                `Automated order sent to Supplier for ${qty}x ${itemName}.`,
                sentDate,
                JSON.stringify({ channel: 'EMAIL', recipient: 'orders@supplier.com' })
            ]);

            // Create Fake SMS Notification
            await client.query(`
                INSERT INTO notifications (organization_id, user_id, type, title, message, created_at, is_read, data)
                VALUES ($1, $2, 'SMART_ORDER', 'SMS Order Confirmation', $3, $4, true, $5)
            `, [orgId, userId,
                `Order SMS sent for ${itemName}.`,
                sentDate,
                JSON.stringify({ channel: 'SMS', recipient: '555-0123' })
            ]);
        }

        console.log('History Seeded.');

    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}

main();
