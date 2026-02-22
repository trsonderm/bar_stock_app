const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/topshelf',
});

async function testDecimalAdjust() {
    try {
        console.log('--- Testing Decimal Stock Adjust ---');
        const orgId = 3; // Fosters
        const itemId = 355; // Titos
        const change = 0.5; // Decimal change
        const locationId = 5; // Known location

        // 1. Check permissions/setup (Simulated)
        // We will just invoke the DB LOGIC directly to see if PG rejects it.
        // OR we can fetch if server is running. 
        // Let's use fetch if possible, but no auth...

        // Let's test DB logic first.
        console.log(`Adjusting item ${itemId} by ${change} at loc ${locationId}`);

        // Update Inventory
        const updateRes = await pool.query(`
            UPDATE inventory 
            SET quantity = GREATEST(0, quantity + $1) 
            WHERE item_id = $2 AND location_id = $3 AND organization_id = $4
            RETURNING quantity
            `, [change, itemId, locationId, orgId]);

        console.log('Update Result:', updateRes.rows[0]);

        // Verify
        const finalRes = await pool.query('SELECT quantity FROM inventory WHERE item_id = $1 AND location_id = $2', [itemId, locationId]);
        console.log('Final Quantity:', finalRes.rows[0]);

    } catch (err) {
        console.error('Test Failed:', err);
    } finally {
        await pool.end();
    }
}

testDecimalAdjust();
