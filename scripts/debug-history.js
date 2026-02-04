const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/topshelf'
});

async function checkHistory() {
    const client = await pool.connect();
    try {
        // 1. Get Items
        const items = await client.query('SELECT id, name FROM items');

        for (const item of items.rows) {
            // Get Current Stock
            const invRes = await client.query('SELECT SUM(quantity) as q FROM inventory WHERE item_id = $1', [item.id]);
            const currentStock = parseInt(invRes.rows[0].q || '0');

            // Get Logs
            const logs = await client.query(`
                SELECT timestamp, action, details 
                FROM activity_logs 
                WHERE (details->>'itemId')::int = $1 
                ORDER BY timestamp DESC
            `, [item.id]);

            let running = currentStock;
            let minStock = running;
            let minDate = 'Now';

            // Reverse Replay
            for (const log of logs.rows) {
                const d = log.details;
                let qty = d.quantity || 0;

                if (log.action === 'ADD_STOCK') {
                    running -= qty;
                } else if (log.action === 'SUBTRACT_STOCK') {
                    running += qty;
                }

                if (running < 0) {
                    console.log(`[ALERT] Negative History for ${item.name} (${item.id})!`);
                    console.log(`  Current: ${currentStock}`);
                    console.log(`  At Log: ${log.timestamp}, Action: ${log.action}, Qty: ${qty}`);
                    console.log(`  Resulting Historical Stock: ${running}`);
                    minStock = running;
                    minDate = log.timestamp;
                    // break; 
                }
            }

            if (minStock < 0) {
                console.log(`  Summary: ${item.name} dipped to ${minStock} at ${minDate}`);
            }
        }

    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        await pool.end();
    }
}

checkHistory();
