require('dotenv').config({ path: '.env.local' });
const { db } = require('./src/lib/db');

async function test() {
    try {
        await db.execute('BEGIN');

        const itemId = 442; // Fireball
        const targetLocationId = 4;
        const organizationId = 3;
        const change = -1;

        console.log('Testing invExists...');
        const invExists = await db.one('SELECT id FROM inventory WHERE item_id = $1 AND location_id = $2', [itemId, targetLocationId]);
        console.log('invExists:', invExists);

        console.log('Testing update...');
        const updateRes = await db.one(`
            UPDATE inventory 
            SET quantity = GREATEST(0, quantity + $1) 
            WHERE item_id = $2 AND location_id = $3 AND organization_id = $4
            RETURNING quantity
        `, [change, itemId, targetLocationId, organizationId]);
        console.log('updateRes:', updateRes);

        console.log('Testing logs...');
        const logRes = await db.one(`
            INSERT INTO activity_logs (organization_id, user_id, action, details) 
            VALUES ($1, $2, $3, $4) 
            RETURNING id
        `, [organizationId, 20, 'SUBTRACT_STOCK', JSON.stringify({
            itemId,
            itemName: 'Fireball',
            change: Math.abs(change),
            quantity: Math.abs(change),
            quantityAfter: updateRes.quantity,
            locationId: targetLocationId,
            bottleLevel: 'Standard Replacement'
        })]);
        console.log('logRes:', logRes);

        console.log('Testing bottle logs...');
        const bLogRes = await db.execute(
            'INSERT INTO bottle_level_logs (activity_log_id, option_label, user_id) VALUES ($1, $2, $3)',
            [logRes.id, 'Standard Replacement', 20]
        );
        console.log('bLogRes:', !!bLogRes);

        await db.execute('ROLLBACK');
        console.log('Test successful');
    } catch (e) {
        console.error('TEST FAILED:', e);
        await db.execute('ROLLBACK');
    } finally {
        process.exit(0);
    }
}
test();
