const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/topshelf',
});

// Mocking the NextRequest/NextResponse flow is hard in script, 
// so we will just invoke the DB LOGIC directly similar to the API
// OR we can use `fetch` if the server is running.
// Since the server is running (npm run dev), let's use fetch!
// But we need auth cookies. Getting a session is hard from script.
// So let's stick to DB logic simulation to see if DB constraints fail.

async function simulateDBUpdate() {
    try {
        console.log('--- Simulating DB Stock Update ---');
        const orgId = 3; // Fosters
        const itemId = 355; // Titos
        const quantity = 42; // Test Value

        // 1. Get Location
        const locationRes = await pool.query('SELECT id FROM locations WHERE organization_id = $1 LIMIT 1', [orgId]);
        const location = locationRes.rows[0];
        console.log('Location:', location);

        if (!location) throw new Error('No location');

        // 2. Check Item Owner
        const itemRes = await pool.query('SELECT id, name FROM items WHERE id = $1 AND organization_id = $2', [itemId, orgId]);
        const item = itemRes.rows[0];
        console.log('Item:', item);

        if (!item) throw new Error('Item not found/owned');

        // 3. Get Current Inv
        const invRes = await pool.query('SELECT quantity FROM inventory WHERE item_id = $1 AND location_id = $2', [itemId, location.id]);
        let current = invRes.rows[0];
        console.log('Current Inv:', current);

        if (!current) {
            console.log('Creating new inventory...');
            await pool.query(
                'INSERT INTO inventory (item_id, location_id, organization_id, quantity) VALUES ($1, $2, $3, 0) RETURNING quantity',
                [itemId, location.id, orgId]
            );
            current = { quantity: 0 };
        }

        // 4. Upsert
        console.log(`Upserting to ${quantity}...`);
        await pool.query(
            `INSERT INTO inventory(item_id, location_id, quantity, organization_id)
            VALUES($1, $2, $3, $4) 
             ON CONFLICT(item_id, location_id) DO UPDATE SET quantity = $3`,
            [itemId, location.id, quantity, orgId]
        );
        console.log('Upsert Complete.');

        // 5. Verify
        const finalRes = await pool.query('SELECT quantity FROM inventory WHERE item_id = $1 AND location_id = $2', [itemId, location.id]);
        console.log('Final Database State:', finalRes.rows[0]);

    } catch (err) {
        console.error('Simulation Failed:', err);
    } finally {
        await pool.end();
    }
}

simulateDBUpdate();
